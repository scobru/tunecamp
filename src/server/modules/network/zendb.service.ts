import { getZen, Zen } from "./zen.js";
import fetch from "node-fetch";
import { drainResponse } from "../../common/network.js";
import { getHardwarePeerId, kprs } from "./zen-network.js";

import type { DatabaseService } from "../../core/database.js";
import { slugify } from "../../../utils/audioUtils.js";
import { isSafeUrl } from "../../../utils/networkUtils.js";
import fs from "fs-extra";
import path from "path";
import { monitorEventLoopDelay } from "perf_hooks";

// Public Zen peers for the community registry
const REGISTRY_PEERS = [
    "wss://delay.scobrudot.dev/zen"
];

const REGISTRY_ROOT = "tunecamp";
const REGISTRY_NAMESPACE = "tunecamp-community";
const REGISTRY_VERSION = "2.0"; 

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
    let zen: any = null;
    let initialized = false;
    let serverPair: any = null;

    // Use provided peers or fallback to defaults
    const activePeers = peers && peers.length > 0 ? peers : REGISTRY_PEERS;

    // Cache for community data to prevent CPU starvation on frequent requests
    const cache = {
        sites: { data: [] as any[], timestamp: 0 },
        itemsTTL: 10 * 60 * 1000 // 10 minutes
    };

    let isRefreshingSites = false;
    let firstStart = true;

    function invalidateCache() {
        cache.sites = { data: [], timestamp: 0 };
        console.log("🧹 Zen Community Cache invalidated.");
    }

    async function init(): Promise<boolean> {
        try {
            // Load peers from settings if not provided in constructor
            let initializationPeers = activePeers;
            const storedPeers = database.getSetting("zenPeers") || database.getSetting("gunPeers");
            if (storedPeers && Array.isArray(storedPeers)) {
                initializationPeers.push(...storedPeers);
            }

            console.log(`📡 [ZenDB] Initializing with peers: ${initializationPeers.join(', ')}`);
            
            const nonZenPeers = initializationPeers.filter(p => !p.includes('/zen'));
            if (nonZenPeers.length > 0) {
                console.warn(`⚠️  [ZEN] Some peers do NOT use /zen path:`, nonZenPeers);
            }

            const hwidRaw = getHardwarePeerId();
            let ppid = null;
            if (hwidRaw) {
                try {
                    const seed = await (Zen as any).hash(hwidRaw, null, null, { encode: "base62" });
                    const ppair = await (Zen as any).pair(null, { seed });
                    ppid = ppair.pub;
                    console.log(`🔑 ZEN Peer ID (stable): ${ppid.slice(0, 9)}...`);
                } catch (e: any) {
                    console.warn(`⚠️ ZEN pid derivation failed: ${e.message}`);
                }
            }

            zen = getZen({
                peers: initializationPeers,
                publicUrl: publicUrl,
                pid: ppid || undefined
            });

            // Populate the backward-compatibility kprs set with configured peers
            initializationPeers.forEach(p => kprs.add(p));

            console.log(`📡 [ZenDB] Shared instance acquired.`);

            // Diagnostic: warn if no peers connected after 15s
            setTimeout(() => {
                const connectedCount = getPeerCount();
                if (connectedCount === 0) {
                    console.warn(`🕒 [ZEN] No peers connected after 15s. Targets:`, initializationPeers);
                }
            }, 15000);

            if (typeof zen.user !== 'function') {
                console.error("🚨 [ZenDB] ERROR: zen.user is not a function!");
            }

            // Initialize User Auth
            const storedPairStr = database.getSetting("zenPair") || database.getSetting("gunPair");
            if (storedPairStr) {
                try {
                    serverPair = JSON.parse(storedPairStr);
                } catch (e) {
                    console.error("Invalid stored Zen identity pair, generating new one");
                }
            }

            if (!serverPair) {
                console.log("🔐 Generating new ZEN Identity for this server...");
                serverPair = await (Zen as any).pair();
                database.setSetting("zenPair", JSON.stringify(serverPair));
            }

            const user = zen.user();

            if (serverPair) {
                const isSecp256k1 = serverPair.curve === 'secp256k1';
                let isCorrupted = false;
                let isLegacy = false;

                if (isSecp256k1) {
                    if (!serverPair.pub || !serverPair.priv) {
                        isCorrupted = true;
                    }
                } else {
                    const missing = ['pub', 'priv', 'epub', 'epriv'].filter(k => !serverPair[k] || serverPair[k].length === 0);
                    if (missing.length > 0) {
                        isCorrupted = true;
                    }
                    isLegacy = true; // Non-secp256k1 keys are legacy
                }

                if (isCorrupted || isLegacy) {
                    console.warn(`🚨 [ZenDB] Server Identity is LEGACY or CORRUPTED! Generating new ZEN pair...`);
                    serverPair = await (Zen as any).pair();
                    database.setSetting("zenPair", JSON.stringify(serverPair));
                }
            }

            const authPromise = new Promise<void>((resolve, reject) => {
                user.auth(serverPair, (ack: any) => {
                    if (ack.err) {
                        console.error("❌ Failed to authenticate Zen user:", ack.err);
                        reject(new Error(ack.err));
                    } else {
                        console.log(`🔐 Zen Authenticated as pubKey: ${serverPair.pub.slice(0, 8)}...`);
                        resolve();
                    }
                });
                setTimeout(() => resolve(), 10000);
            });

            try {
                await authPromise;
            } catch (e) {
                console.warn("⚠️ Zen Authentication had errors, but continuing initialization.");
            }

            initialized = true;
            console.log("🌐 ZEN Relay initialized (signaling + identity + stats)");

            // Track event-loop delay so we can see the loop stalling before a
            // health-check failure / Swarm restart (manual full GC removed: it was a
            // stop-the-world freeze every 30s; let V8 manage GC itself).
            const loopDelay = monitorEventLoopDelay({ resolution: 20 });
            loopDelay.enable();

            setInterval(() => {
                const used = process.memoryUsage();
                const peerCount = getPeerCount();
                const root = zen._ || (zen as any)._graph?._;
                const nodeCount = root?.graph ? Object.keys(root.graph).length : 0;
                const lagMean = Math.round(loopDelay.mean / 1e6);
                const lagMax = Math.round(loopDelay.max / 1e6);
                loopDelay.reset();
                console.log(`[Diag] RSS: ${Math.round(used.rss / 1e6)}MB | HeapTotal: ${Math.round(used.heapTotal / 1e6)}MB | HeapUsed: ${Math.round(used.heapUsed / 1e6)}MB | Ext: ${Math.round(used.external / 1e6)}MB | ArrayBuf: ${Math.round((used as any).arrayBuffers / 1e6)}MB | ZEN Peers: ${peerCount} | nodes: ${nodeCount} | LoopLag: ${lagMean}ms avg / ${lagMax}ms max`);
            }, 30000);

            return true;
        } catch (error) {
            console.error("Failed to initialize ZenDB:", error);
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

            if (zen) {
                zen.user().leave();
                zen.user().auth(serverPair, (ack: any) => {
                    if (!ack.err) console.log(`🔐 Identity Imported & Re-Authenticated: ${serverPair.pub.slice(0, 8)}...`);
                });
            }
            return true;
        } catch (e) {
            console.error("Error setting identity pair:", e);
            return false;
        }
    }

    async function clearRadata() {
        const radataPath = path.join(process.cwd(), 'radata');
        try {
            console.warn(`⚠️ Attempting to clear Zen radata directory at ${radataPath}...`);
            await fs.emptyDir(radataPath);
            console.log("✅ Zen radata cleared successfully.");
        } catch (error) {
            console.error("❌ Failed to clear Zen radata:", error);
        }
    }

    // ─── Instance Signaling ─────────────────────────────────────────────────────

    async function registerSite(siteInfo: SiteInfo): Promise<boolean> {
        if (!initialized || !zen || !serverPair) {
            console.warn("ZenDB not initialized or no keys");
            return false;
        }

        if (siteInfo.url && !siteInfo.url.startsWith("https://")) {
            console.log("📍 Skipping community registration (not HTTPS - local/dev mode)");
            return false;
        }

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

        const attemptRegistration = async (retryCount = 0): Promise<boolean> => {
            return new Promise(async (resolve) => {
                const signedSite = await (Zen as any).sign(siteRecord, serverPair);

                const contentRef = zen.get(`${REGISTRY_ROOT}/${REGISTRY_NAMESPACE}/content/${serverPair.pub}`).get("profile");

                contentRef.put(signedSite, async (ack: any) => {
                    if (ack.err) {
                        console.warn("Failed to write to public content node:", ack.err);
                        resolve(false);
                        return;
                    }

                    console.log(`📝 Registering public reference for Site ID: ${siteId}`);
                    zen
                        .get(`${REGISTRY_ROOT}/${REGISTRY_NAMESPACE}/sites`)
                        .get(siteId)
                        .put({
                            id: siteId,
                            pub: serverPair.pub,
                            lastSeen: now,
                            url: siteInfo.url,
                            title: siteInfo.title,
                            artistName: siteInfo.artistName,
                            coverImage: siteInfo.coverImage || "",
                            communityLink: siteInfo.communityLink || ""
                        }, async (pubAck: any) => {
                            if (pubAck.err) {
                                console.warn("Failed to register site in directory:", pubAck.err);
                                resolve(false);
                            } else {
                                console.log(`✅ Server registered in Tunecamp Community - Site ID: ${siteId}`);
                                invalidateCache();
                                resolve(true);
                            }
                        });
                });

                setTimeout(() => resolve(true), 5000);
            });
        };

        return attemptRegistration();
    }

    // ─── Community Site Discovery ────────────────────────────────────────────────

    async function getCommunitySites(): Promise<any[]> {
        if (!initialized || !zen) return [];

        const CACHE_KEY = "community_sites";
        const TTL = 60 * 60; 

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

        return new Promise((resolve) => {
            const sites: any[] = [];
            const processedIds = new Set();

            let handlerActive = true;

            const handler = zen
                .get(`${REGISTRY_ROOT}/${REGISTRY_NAMESPACE}/sites`)
                .map()
                .on((directoryData: any, siteId: string, _msg: any, ev: any) => {
                    if (!handlerActive) return; 

                    if (ev && typeof ev.off === 'function') {
                        try { ev.off(); } catch (e) { }
                    }

                    if (!directoryData || siteId === "_") return;
                    if (processedIds.has(siteId)) return;
                    processedIds.add(siteId);

                    const MAX_SITES_PER_RUN = 50;
                    if (sites.length >= MAX_SITES_PER_RUN) {
                        return; 
                    }

                    if (directoryData.lastSeen && typeof directoryData.lastSeen === 'number') {
                        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                        if (directoryData.lastSeen < sevenDaysAgo) {
                            return;
                        }
                    }

                    if (directoryData.url) {
                        sites.push({
                            id: siteId,
                            url: directoryData.url,
                            title: directoryData.title || "Untitled",
                            artistName: directoryData.artistName || "",
                            coverImage: directoryData.coverImage || "",
                            communityLink: directoryData.communityLink || "",
                            name: directoryData.title || "Untitled",
                            lastSeen: directoryData.lastSeen || Date.now(),
                            pub: directoryData.pub || "",
                            _secure: true,
                            _verified: true
                        });
                    }
                });

            setTimeout(() => {
                handlerActive = false;

                try {
                    if (handler && typeof (handler as any).off === 'function') {
                        (handler as any).off();
                    } else {
                        zen.get(`${REGISTRY_ROOT}/${REGISTRY_NAMESPACE}/sites`).off();
                    }
                } catch (e) { }

                isRefreshingSites = false;

                if (sites.length > 0) {
                    console.log(`⏱️ Discovery: Found ${sites.length} sites. Updating cache.`);
                    database.setGunCache(CACHE_KEY, JSON.stringify(sites), "sites", TTL);
                    cache.sites = { data: sites, timestamp: Date.now() };
                }

                if (global.gc) {
                    global.gc();
                }

                resolve(sites);
            }, 3000); 
        });
    }

    // ─── Network Cleanup ─────────────────────────────────────────────────────────

    async function cleanupNetwork() {
        if (!initialized || !zen || !serverPair) return;

        try {
            const publicUrl = database.getSetting("publicUrl");
            if (!publicUrl) return;

            const siteName = database.getSetting("siteName") || "TuneCamp Server";
            const artistName = database.getSetting("artistName") || "";
            const siteInfo = { url: publicUrl, title: siteName, artistName };
            const currentSiteId = await getPersistentSiteId(siteInfo);

            console.log(`🧹 Starting network cleanup (Site ID: ${currentSiteId})...`);

            zen.get(`${REGISTRY_ROOT}/${REGISTRY_NAMESPACE}/sites`)
                .map()
                .once((siteData: any, siteId: string) => {
                    if (!siteData || siteId === "_") return;
                    if (siteData.pub === serverPair.pub && siteId !== currentSiteId) {
                        console.log(`🧹 Removing stale site registration: ${siteId}`);
                        zen.get(`${REGISTRY_ROOT}/${REGISTRY_NAMESPACE}/sites`).get(siteId).put(null);
                    }
                });

        } catch (error) {
            console.error("Error in network cleanup:", error);
        } finally {
            invalidateCache();
        }
    }

    async function cleanupGlobalNetwork() {
        if (!initialized || !zen) return;

        console.log("🧹 Starting GLOBAL network cleanup...");

        return new Promise<void>((resolve) => {
            let total = 0;
            let checked = 0;
            let removed = 0;

            const sitesRef = zen.get(`${REGISTRY_ROOT}/${REGISTRY_NAMESPACE}/sites`);

            sitesRef.once((sites: any) => {
                if (!sites) {
                    resolve();
                    return;
                }

                const siteIds = Object.keys(sites).filter(id => id !== "_" && id !== "undefined" && id !== "null");
                total = siteIds.length;

                if (total === 0) {
                    resolve();
                    return;
                }

                siteIds.forEach(siteId => {
                    sitesRef.get(siteId).once(async (siteData: any) => {
                        try {
                            if (!siteData || !siteData.url) {
                                checked++;
                                if (checked >= total) resolve();
                                return;
                            }

                            const isReachable = await checkSiteReachability(siteData.url);
                            if (!isReachable) {
                                sitesRef.get(siteId).put(null);
                                removed++;
                            }
                        } catch (err) {
                            console.error(`Error checking site ${siteId}:`, err);
                        } finally {
                            checked++;
                            if (checked >= total) {
                                console.log(`✅ Global cleanup complete. Checked ${checked} sites, removed ${removed}.`);
                                invalidateCache();
                                resolve();
                            }
                        }
                    });
                });
            });

            setTimeout(() => {
                if (checked < total) {
                    invalidateCache();
                    resolve();
                }
            }, 60000);
        });
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
        return new Promise((resolve) => {
            if (!zen) return resolve();
            zen.get(`${REGISTRY_ROOT}/${REGISTRY_NAMESPACE}/sites`).get(siteId)
                .put(null, (ack: any) => {
                    resolve();
                });
        });
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
        getPeerCount: () => {
            return getPeerCount();
        },
        cleanupRegistry
    };

    function getPeerCount(): number {
        if (!zen) return 0;
        try {
            // Robustly find the root internal state object. 
            // In Zen v1.0.8, it's often at ._ or ._graph._
            const root = zen._ || (zen as any)._graph?._;
            if (!root) return 0;
            
            const opt = root.opt || {};
            const peers = opt.peers || {};
            const axePeers = root.axe?.up || {};
            const meshPeers = opt.mesh?.peers || {};
            
            // Collect all unique active peer objects/URLs
            const activePeers = new Set<any>();
            
            // Helper to check if a peer connection is active
            const isActive = (p: any) => {
                if (!p) return false;
                const conn = p.wire || p.socket || p.conn;
                if (!conn) return false;
                return conn.readyState === 1 || conn.readyState === 'open';
            };
            
            // 1. Check root.opt.peers (standard Gun/Zen peer tracking)
            if (peers && typeof peers === 'object') {
                if (Array.isArray(peers)) {
                    // If it's still an array of strings, it's not connected yet
                } else {
                    Object.values(peers).forEach(p => {
                        if (isActive(p)) activePeers.add(p);
                    });
                }
            }
            
            // 2. Check root.axe.up (AXE mesh upstream connections - critical for Zen v1.0.8+)
            if (axePeers && typeof axePeers === 'object') {
                Object.values(axePeers).forEach(p => {
                    if (isActive(p)) activePeers.add(p);
                });
            }
            
            // 3. Check root.opt.mesh.peers (lower-level DAM connections)
            if (meshPeers && typeof meshPeers === 'object') {
                Object.values(meshPeers).forEach(p => {
                    if (isActive(p)) activePeers.add(p);
                });
            }
            
            return activePeers.size;
        } catch (e) {
            console.error("🚨 [ZenDB] Error in getPeerCount:", e);
            return 0;
        }
    }
}
