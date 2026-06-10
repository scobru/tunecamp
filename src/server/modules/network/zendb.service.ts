import { Worker } from "worker_threads";
import fetch from "node-fetch";
import { drainResponse } from "../../common/network.js";
import { kprs } from "./zen-network.js";

import type { DatabaseService } from "../../core/database.js";
import { isSafeUrl } from "../../../utils/networkUtils.js";

// Public Zen peers for the community registry
const REGISTRY_PEERS = [
    "wss://delay.scobrudot.dev/zen"
];

const REGISTRY_ROOT = "tunecamp";
const REGISTRY_NAMESPACE = "tunecamp-community";
const REGISTRY_VERSION = "2.0";
const SITES_PATH = `${REGISTRY_ROOT}/${REGISTRY_NAMESPACE}/sites`;

// ─── Worker supervision tuning ──────────────────────────────────────────────
// ZEN runs in a worker_thread (see zen.worker.ts) so that its event-loop
// freezes can't take down the HTTP server. The main thread heartbeats the
// worker; if the worker loop is frozen (heartbeats time out) or the worker
// crashes, it gets terminated and respawned with backoff.
const RPC_DEFAULT_TIMEOUT_MS = 15_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const HEARTBEAT_MAX_MISSES = 3;
const RESPAWN_BACKOFF_MS = [1_000, 5_000, 15_000, 60_000];

export interface SiteInfo {
    url: string;
    title: string;
    description?: string;
    artistName?: string;
    coverImage?: string;
    communityLink?: string;
}


export interface ZenDBService {
    init(): Promise<boolean>;
    // Instance signaling (discovery)
    registerSite(siteInfo: SiteInfo): Promise<boolean>;
    getCommunitySites(): Promise<any[]>;
    // Key Management
    getIdentityKeyPair(): Promise<any>;
    setIdentityKeyPair(pair: any): Promise<boolean>;
    syncNetwork(): Promise<void>;
    cleanupGlobalNetwork(): Promise<void>;
    invalidateCache(): void;
    getPeerCount(): number;
    // Registry Maintenance
    cleanupRegistry(): Promise<void>;
}

export function createZenDBService(database: DatabaseService, server?: any, peers?: string[], publicUrl?: string): ZenDBService {
    let initialized = false;
    let serverPair: any = null;

    // Use provided peers or fallback to defaults
    const activePeers = peers && peers.length > 0 ? peers : REGISTRY_PEERS;
    let initializationPeers: string[] = [];

    // Cache for community data to prevent CPU starvation on frequent requests
    const cache = {
        sites: { data: [] as any[], timestamp: 0 },
        itemsTTL: 10 * 60 * 1000 // 10 minutes
    };

    let isRefreshingSites = false;
    let firstStart = true;

    // ─── Worker RPC client + supervisor ──────────────────────────────────────

    let worker: Worker | null = null;
    let workerReady = false;
    let shuttingDown = false;
    let respawnCount = 0;
    let rpcSeq = 0;
    let heartbeatMisses = 0;
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let lastPeerCount = 0;
    let lastSiteInfo: SiteInfo | null = null;
    const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

    function rejectAllPending(reason: string) {
        for (const [, entry] of pending) {
            clearTimeout(entry.timer);
            entry.reject(new Error(reason));
        }
        pending.clear();
    }

    function rpc(method: string, params?: any, timeoutMs: number = RPC_DEFAULT_TIMEOUT_MS): Promise<any> {
        if (!worker || !workerReady && method !== 'init') {
            return Promise.reject(new Error(`[ZenDB] Worker not available for '${method}'`));
        }
        const id = ++rpcSeq;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`[ZenDB] RPC '${method}' timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            pending.set(id, { resolve, reject, timer });
            worker!.postMessage({ id, method, params });
        });
    }

    function spawnWorker(): Worker {
        const w = new Worker(new URL("./zen.worker.js", import.meta.url));

        w.on("message", (msg: { id: number; ok: boolean; result?: any; error?: string }) => {
            const entry = pending.get(msg.id);
            if (!entry) return;
            pending.delete(msg.id);
            clearTimeout(entry.timer);
            if (msg.ok) entry.resolve(msg.result);
            else entry.reject(new Error(msg.error || "Unknown worker error"));
        });

        w.on("error", (err) => {
            console.error("🚨 [ZenDB] Worker error:", err);
        });

        w.on("exit", (code) => {
            workerReady = false;
            rejectAllPending(`[ZenDB] Worker exited (code ${code})`);
            if (shuttingDown) return;

            const backoff = RESPAWN_BACKOFF_MS[Math.min(respawnCount, RESPAWN_BACKOFF_MS.length - 1)];
            respawnCount++;
            console.warn(`♻️ [ZenDB] Worker died (code ${code}). Respawning in ${backoff / 1000}s (attempt ${respawnCount})...`);
            setTimeout(() => {
                worker = spawnWorker();
                initWorker().catch(e => console.error("🚨 [ZenDB] Worker re-init failed:", e.message));
            }, backoff).unref();
        });

        return w;
    }

    async function initWorker(): Promise<void> {
        const result = await rpc("init", {
            peers: initializationPeers,
            publicUrl: publicUrl,
            pair: serverPair
        }, 60_000);

        if (result?.pair) {
            serverPair = result.pair;
            if (result.generated) {
                database.setSetting("zenPair", JSON.stringify(serverPair));
            }
        }
        workerReady = true;
        heartbeatMisses = 0;

        // Re-register this site after a respawn so the registry heals itself
        if (lastSiteInfo) {
            registerSite(lastSiteInfo).catch(() => { });
        }
    }

    function startHeartbeat() {
        if (heartbeatTimer) return;
        heartbeatTimer = setInterval(async () => {
            if (!workerReady || shuttingDown) return;
            try {
                const res = await rpc("ping", {}, HEARTBEAT_TIMEOUT_MS);
                lastPeerCount = res?.peerCount ?? 0;
                heartbeatMisses = 0;
                respawnCount = 0; // healthy again — reset backoff
            } catch (e) {
                heartbeatMisses++;
                console.warn(`💔 [ZenDB] Worker heartbeat missed (${heartbeatMisses}/${HEARTBEAT_MAX_MISSES})`);
                if (heartbeatMisses >= HEARTBEAT_MAX_MISSES && worker) {
                    console.error("🚨 [ZenDB] Worker loop is frozen. Terminating for respawn...");
                    heartbeatMisses = 0;
                    workerReady = false;
                    try { await worker.terminate(); } catch (err) { }
                    // The 'exit' handler takes care of the respawn
                }
            }
        }, HEARTBEAT_INTERVAL_MS);
        heartbeatTimer.unref();
    }

    function invalidateCache() {
        cache.sites = { data: [], timestamp: 0 };
        console.log("🧹 Zen Community Cache invalidated.");
    }

    async function init(): Promise<boolean> {
        try {
            // Load peers from settings if not provided in constructor
            initializationPeers = [...activePeers];
            const storedPeers = database.getSetting("zenPeers") || database.getSetting("gunPeers");
            if (storedPeers && Array.isArray(storedPeers)) {
                initializationPeers.push(...storedPeers);
            }

            console.log(`📡 [ZenDB] Initializing worker with peers: ${initializationPeers.join(', ')}`);

            const nonZenPeers = initializationPeers.filter(p => !p.includes('/zen'));
            if (nonZenPeers.length > 0) {
                console.warn(`⚠️  [ZEN] Some peers do NOT use /zen path:`, nonZenPeers);
            }

            // Load stored identity (validation/generation happens in the worker)
            const storedPairStr = database.getSetting("zenPair") || database.getSetting("gunPair");
            if (storedPairStr) {
                try {
                    serverPair = JSON.parse(storedPairStr);
                } catch (e) {
                    console.error("Invalid stored Zen identity pair, generating new one");
                }
            }

            // Populate the backward-compatibility kprs set with configured peers
            initializationPeers.forEach(p => kprs.add(p));

            worker = spawnWorker();
            await initWorker();
            startHeartbeat();

            initialized = true;
            console.log("🌐 ZEN worker initialized (signaling + identity + stats, isolated thread)");
            return true;
        } catch (error) {
            console.error("Failed to initialize ZenDB:", error);
            // Worker may still come up via respawn; mark service initialized so
            // calls degrade gracefully instead of being dropped forever.
            return false;
        }
    }

    async function getIdentityKeyPair(): Promise<any> {
        return serverPair;
    }

    async function setIdentityKeyPair(pair: any): Promise<boolean> {
        try {
            if (!pair || !pair.pub || !pair.priv || !pair.epub || !pair.epriv) {
                return false;
            }
            if (typeof pair.pub !== 'string' || typeof pair.priv !== 'string') return false;

            serverPair = pair;
            database.setSetting("zenPair", JSON.stringify(serverPair));

            try {
                await rpc("setPair", { pair });
            } catch (e: any) {
                console.warn("⚠️ [ZenDB] Worker re-auth failed (will re-auth on respawn):", e.message);
            }
            return true;
        } catch (e) {
            console.error("Error setting identity pair:", e);
            return false;
        }
    }

    // ─── Instance Signaling ─────────────────────────────────────────────────────

    async function registerSite(siteInfo: SiteInfo): Promise<boolean> {
        if (!initialized || !serverPair) {
            console.warn("ZenDB not initialized or no keys");
            return false;
        }

        if (siteInfo.url && !siteInfo.url.startsWith("https://")) {
            console.log("📍 Skipping community registration (not HTTPS - local/dev mode)");
            return false;
        }

        lastSiteInfo = siteInfo;
        const siteId = await getPersistentSiteId(siteInfo);
        const now = Date.now();

        const siteRecord = {
            id: siteId,
            url: siteInfo.url,
            title: siteInfo.title || "Untitled",
            description: siteInfo.description || "",
            artistName: siteInfo.artistName || "",
            coverImage: siteInfo.coverImage || "",
            communityLink: siteInfo.communityLink || "",
            registeredAt: now,
            lastSeen: now,
            version: REGISTRY_VERSION,
            type: "tunecamp-site",
            pub: serverPair.pub
        };

        const directoryRecord = {
            id: siteId,
            pub: serverPair.pub,
            lastSeen: now,
            url: siteInfo.url,
            title: siteInfo.title,
            artistName: siteInfo.artistName,
            coverImage: siteInfo.coverImage || "",
            communityLink: siteInfo.communityLink || ""
        };

        try {
            const ok = await rpc("registerSite", {
                siteRecord,
                directoryRecord,
                siteId,
                contentPath: `${REGISTRY_ROOT}/${REGISTRY_NAMESPACE}/content/${serverPair.pub}`,
                sitesPath: SITES_PATH
            }, 20_000);
            if (ok) invalidateCache();
            return !!ok;
        } catch (e: any) {
            console.warn("⚠️ [ZenDB] registerSite failed:", e.message);
            return false;
        }
    }

    // ─── Community Site Discovery ────────────────────────────────────────────────

    async function getCommunitySites(): Promise<any[]> {
        if (!initialized) return [];

        const CACHE_KEY = "community_sites";

        const cached = database.getGunCache(CACHE_KEY); // Keep cache method name for now
        if (cached) {
            try {
                const sites = JSON.parse(cached.value);
                if (Date.now() - cache.sites.timestamp > cache.itemsTTL) {
                    refreshCommunitySitesInBackground();
                }
                return sites;
            } catch (e) {
                console.error("Failed to parse cached sites:", e);
            }
        }

        if (firstStart) {
            console.log("⏱️  Zen Community Discovery scheduled for 30s delay...");
            return new Promise(resolve => {
                setTimeout(async () => {
                    firstStart = false;
                    resolve(await refreshCommunitySitesInBackground());
                }, 30000);
            });
        }

        return refreshCommunitySitesInBackground();
    }

    async function refreshCommunitySitesInBackground(): Promise<any[]> {
        if (isRefreshingSites) return cache.sites.data;
        isRefreshingSites = true;

        const CACHE_KEY = "community_sites";
        const TTL = 60 * 60;

        try {
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            const sites: any[] = await rpc("listSites", {
                sitesPath: SITES_PATH,
                collectMs: 3000,
                maxSites: 50,
                minLastSeen: sevenDaysAgo
            }, 10_000);

            if (sites.length > 0) {
                console.log(`⏱️ Discovery: Found ${sites.length} sites. Updating cache.`);
                database.setGunCache(CACHE_KEY, JSON.stringify(sites), "sites", TTL);
                cache.sites = { data: sites, timestamp: Date.now() };
            }
            return sites;
        } catch (e: any) {
            console.warn("⚠️ [ZenDB] Site discovery failed:", e.message);
            return cache.sites.data;
        } finally {
            isRefreshingSites = false;
        }
    }

    // ─── Network Cleanup ─────────────────────────────────────────────────────────

    async function cleanupNetwork() {
        if (!initialized || !serverPair) return;

        try {
            const publicUrl = database.getSetting("publicUrl");
            if (!publicUrl) return;

            const siteName = database.getSetting("siteName") || "TuneCamp Server";
            const artistName = database.getSetting("artistName") || "";
            const siteInfo = { url: publicUrl, title: siteName, artistName };
            const currentSiteId = await getPersistentSiteId(siteInfo);

            console.log(`🧹 Starting network cleanup (Site ID: ${currentSiteId})...`);
            await rpc("cleanupOwnStale", { sitesPath: SITES_PATH, currentSiteId });
        } catch (error) {
            console.error("Error in network cleanup:", error);
        } finally {
            invalidateCache();
        }
    }

    async function cleanupGlobalNetwork() {
        if (!initialized) return;

        console.log("🧹 Starting GLOBAL network cleanup...");
        try {
            const sites: any[] = await rpc("listSites", {
                sitesPath: SITES_PATH,
                collectMs: 3000,
                maxSites: 200,
                minLastSeen: 0
            }, 10_000);

            let removed = 0;
            for (const site of sites) {
                if (!site.url) continue;
                const isReachable = await checkSiteReachability(site.url);
                if (!isReachable) {
                    await pruneSite(site.id);
                    removed++;
                }
            }
            console.log(`✅ Global cleanup complete. Checked ${sites.length} sites, removed ${removed}.`);
        } catch (e: any) {
            console.warn("⚠️ [ZenDB] Global cleanup failed:", e.message);
        } finally {
            invalidateCache();
        }
    }

    async function checkSiteReachability(url: string): Promise<boolean> {
        try {
            if (!(await isSafeUrl(url))) {
                return false;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                headers: { 'User-Agent': 'TuneCamp-HealthCheck/2.0' }
            });

            clearTimeout(timeoutId);
            const ok = response.ok;
            await drainResponse(response);
            return ok;
        } catch (error) {
            return false;
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    async function getPersistentSiteId(siteInfo: SiteInfo): Promise<string> {
        const storedId = database.getSetting("siteId");
        if (storedId) return storedId;

        const identifier = `${(siteInfo.title || "untitled").toLowerCase().trim()}::${(siteInfo.artistName || "unknown").toLowerCase().trim()}::${Date.now()}`;
        let hash = 0;
        for (let i = 0; i < identifier.length; i++) {
            const char = identifier.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        const newId = Math.abs(hash).toString(36) + Math.random().toString(36).substr(2, 5);

        database.setSetting("siteId", newId);
        return newId;
    }

    async function cleanupRegistry(): Promise<void> {
        console.log("🧹 [ZenDB] Starting registry cleanup health-check...");
        // Get all sites without the 7-day filter to identify even older dead sites
        const sites = await getCommunitySites();
        let pruned = 0;

        for (const site of sites) {
            if (!site.url) continue;

            // Skip checking local/private addresses
            if (site.url.includes("localhost") || site.url.includes("127.0.0.1") || site.url.includes("192.168.")) {
                continue;
            }

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout for remote health check

                // Try to HEAD the site first
                const res = await fetch(site.url, {
                    method: 'HEAD',
                    signal: controller.signal
                }).catch(() => null);

                if (!res) {
                    // Try a GET if HEAD fails (some servers block HEAD)
                    const getRes = await fetch(site.url, {
                        method: 'GET',
                        signal: controller.signal
                    }).catch(() => null);

                    if (!getRes || getRes.status >= 500) {
                        throw new Error("Unreachable");
                    }

                    if (getRes.status === 404) {
                        console.log(`❌ [ZenDB] Site ${site.url} returned 404. Pruning from registry...`);
                        await pruneSite(site.id);
                        pruned++;
                        continue;
                    }
                } else if (res.status === 404) {
                    console.log(`❌ [ZenDB] Site ${site.url} returned 404. Pruning from registry...`);
                    await pruneSite(site.id);
                    pruned++;
                }

                clearTimeout(timeoutId);
            } catch (err) {
                console.log(`❌ [ZenDB] Site ${site.url} is unreachable. Pruning from registry...`);
                await pruneSite(site.id);
                pruned++;
            }
        }

        if (pruned > 0) {
            console.log(`✅ [ZenDB] Registry cleanup complete. Pruned ${pruned} dead sites.`);
            invalidateCache();
        } else {
            console.log(`✨ [ZenDB] Registry cleanup complete. No dead sites found.`);
        }
    }

    async function pruneSite(siteId: string): Promise<void> {
        try {
            await rpc("pruneSite", { sitesPath: SITES_PATH, siteId });
        } catch (e: any) {
            console.warn(`⚠️ [ZenDB] pruneSite(${siteId}) failed:`, e.message);
        }
    }

    return {
        init,
        registerSite,
        getCommunitySites,
        // Key Management
        getIdentityKeyPair,
        setIdentityKeyPair,
        syncNetwork: cleanupNetwork,
        cleanupGlobalNetwork,
        invalidateCache,
        getPeerCount: () => lastPeerCount,
        cleanupRegistry
    };
}
