/**
 * ZEN Worker — runs the entire ZEN instance inside a worker_thread.
 *
 * ZEN's turn-queue processing can freeze an event loop for tens of seconds
 * (see the history of mitigations in zen.ts). By isolating it here, a frozen
 * ZEN loop only stalls this worker: the main thread keeps serving HTTP
 * (including /health), detects the stall via heartbeat timeouts, and respawns
 * the worker. The main thread must never import zen — only message this file.
 *
 * Protocol: { id, method, params } in → { id, ok, result | error } out.
 */
import { parentPort } from "worker_threads";
import { monitorEventLoopDelay } from "perf_hooks";
import { getZen, Zen } from "./zen.js";
// @ts-ignore
import { hwid } from "zen/lib/discover.js";

if (!parentPort) {
    throw new Error("zen.worker must be run as a worker thread");
}
const port = parentPort;

let zen: any = null;
let serverPair: any = null;

// ─── Diagnostics (worker-local loop lag — this is the loop ZEN can freeze) ──
function startDiagnostics() {
    const loopDelay = monitorEventLoopDelay({ resolution: 20 });
    loopDelay.enable();
    const interval = setInterval(() => {
        const used = process.memoryUsage();
        const root = zen?._ || zen?._graph?._;
        const nodeCount = root?.graph ? Object.keys(root.graph).length : 0;
        const lagMean = Math.round(loopDelay.mean / 1e6);
        const lagMax = Math.round(loopDelay.max / 1e6);
        loopDelay.reset();
        console.log(`[ZenWorker-Diag] HeapUsed: ${Math.round(used.heapUsed / 1e6)}MB | Ext: ${Math.round(used.external / 1e6)}MB | ArrayBuf: ${Math.round((used as any).arrayBuffers / 1e6)}MB | Peers: ${getPeerCount()} | nodes: ${nodeCount} | LoopLag: ${lagMean}ms avg / ${lagMax}ms max`);
    }, 30000);
    interval.unref();
}

// ─── Peer counting (needs zen internals, so it lives in the worker) ─────────
function getPeerCount(): number {
    if (!zen) return 0;
    try {
        const root = zen._ || zen._graph?._;
        if (!root) return 0;

        const opt = root.opt || {};
        const peers = opt.peers || {};
        const axePeers = root.axe?.up || {};
        const meshPeers = opt.mesh?.peers || {};

        const activePeers = new Set<any>();
        const isActive = (p: any) => {
            if (!p) return false;
            const conn = p.wire || p.socket || p.conn;
            if (!conn) return false;
            return conn.readyState === 1 || conn.readyState === 'open';
        };

        if (peers && typeof peers === 'object' && !Array.isArray(peers)) {
            Object.values(peers).forEach(p => { if (isActive(p)) activePeers.add(p); });
        }
        if (axePeers && typeof axePeers === 'object') {
            Object.values(axePeers).forEach(p => { if (isActive(p)) activePeers.add(p); });
        }
        if (meshPeers && typeof meshPeers === 'object') {
            Object.values(meshPeers).forEach(p => { if (isActive(p)) activePeers.add(p); });
        }
        return activePeers.size;
    } catch (e) {
        console.error("🚨 [ZenWorker] Error in getPeerCount:", e);
        return 0;
    }
}

// ─── RPC method implementations ──────────────────────────────────────────────

async function init(params: { peers: string[]; publicUrl?: string; pair?: any }): Promise<any> {
    // Derive a stable peer id from the hardware id
    let ppid: string | undefined;
    try {
        const hwidRaw = hwid();
        if (hwidRaw) {
            const seed = await (Zen as any).hash(hwidRaw, null, null, { encode: "base62" });
            const ppair = await (Zen as any).pair(null, { seed });
            ppid = ppair.pub;
            console.log(`🔑 ZEN Peer ID (stable): ${ppid!.slice(0, 9)}...`);
        }
    } catch (e: any) {
        console.warn(`⚠️ ZEN pid derivation failed: ${e.message}`);
    }

    zen = getZen({
        peers: params.peers,
        publicUrl: params.publicUrl,
        pid: ppid
    });

    // Diagnostic: warn if no peers connected after 15s
    setTimeout(() => {
        if (getPeerCount() === 0) {
            console.warn(`🕒 [ZenWorker] No peers connected after 15s. Targets:`, params.peers);
        }
    }, 15000).unref();

    // Validate / generate the server identity pair
    serverPair = params.pair || null;
    let generated = false;

    if (serverPair) {
        const isSecp256k1 = serverPair.curve === 'secp256k1';
        let isCorrupted = false;
        let isLegacy = false;

        if (isSecp256k1) {
            if (!serverPair.pub || !serverPair.priv) isCorrupted = true;
        } else {
            const missing = ['pub', 'priv', 'epub', 'epriv'].filter(k => !serverPair[k] || serverPair[k].length === 0);
            if (missing.length > 0) isCorrupted = true;
            isLegacy = true; // Non-secp256k1 keys are legacy
        }

        if (isCorrupted || isLegacy) {
            console.warn(`🚨 [ZenWorker] Server Identity is LEGACY or CORRUPTED! Generating new ZEN pair...`);
            serverPair = null;
        }
    }

    if (!serverPair) {
        console.log("🔐 Generating new ZEN Identity for this server...");
        serverPair = await (Zen as any).pair();
        generated = true;
    }

    await authPair(serverPair);
    startDiagnostics();
    console.log("🌐 [ZenWorker] ZEN initialized (signaling + identity + stats)");

    return { pair: serverPair, generated };
}

async function authPair(pair: any): Promise<void> {
    const user = zen.user();
    await new Promise<void>((resolve) => {
        user.auth(pair, (ack: any) => {
            if (ack.err) {
                console.error("❌ Failed to authenticate Zen user:", ack.err);
            } else {
                console.log(`🔐 Zen Authenticated as pubKey: ${pair.pub.slice(0, 8)}...`);
            }
            resolve();
        });
        setTimeout(() => resolve(), 10000);
    });
}

async function setPair(params: { pair: any }): Promise<boolean> {
    serverPair = params.pair;
    if (zen) {
        zen.user().leave();
        zen.user().auth(serverPair, (ack: any) => {
            if (!ack.err) console.log(`🔐 Identity Imported & Re-Authenticated: ${serverPair.pub.slice(0, 8)}...`);
        });
    }
    return true;
}

async function registerSite(params: { siteRecord: any; directoryRecord: any; siteId: string; contentPath: string; sitesPath: string }): Promise<boolean> {
    if (!zen || !serverPair) return false;

    return new Promise<boolean>(async (resolve) => {
        const signedSite = await (Zen as any).sign(params.siteRecord, serverPair);
        const contentRef = zen.get(params.contentPath).get("profile");

        contentRef.put(signedSite, (ack: any) => {
            if (ack.err) {
                console.warn("Failed to write to public content node:", ack.err);
                resolve(false);
                return;
            }

            console.log(`📝 Registering public reference for Site ID: ${params.siteId}`);
            zen.get(params.sitesPath).get(params.siteId).put(params.directoryRecord, (pubAck: any) => {
                if (pubAck.err) {
                    console.warn("Failed to register site in directory:", pubAck.err);
                    resolve(false);
                } else {
                    console.log(`✅ Server registered in Tunecamp Community - Site ID: ${params.siteId}`);
                    resolve(true);
                }
            });
        });

        setTimeout(() => resolve(true), 5000);
    });
}

async function listSites(params: { sitesPath: string; collectMs?: number; maxSites?: number; minLastSeen?: number }): Promise<any[]> {
    if (!zen) return [];
    const collectMs = params.collectMs ?? 3000;
    const maxSites = params.maxSites ?? 50;
    const minLastSeen = params.minLastSeen ?? 0;

    return new Promise((resolve) => {
        const sites: any[] = [];
        const processedIds = new Set<string>();
        let handlerActive = true;

        const handler = zen.get(params.sitesPath).map()
            .on((directoryData: any, siteId: string, _msg: any, ev: any) => {
                if (!handlerActive) return;

                if (ev && typeof ev.off === 'function') {
                    try { ev.off(); } catch (e) { }
                }

                if (!directoryData || siteId === "_") return;
                if (processedIds.has(siteId)) return;
                processedIds.add(siteId);
                if (sites.length >= maxSites) return;

                if (minLastSeen > 0 && directoryData.lastSeen && typeof directoryData.lastSeen === 'number') {
                    if (directoryData.lastSeen < minLastSeen) return;
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
                if (handler && typeof handler.off === 'function') {
                    handler.off();
                } else {
                    zen.get(params.sitesPath).off();
                }
            } catch (e) { }

            if (global.gc) global.gc();
            resolve(sites);
        }, collectMs);
    });
}

async function pruneSite(params: { sitesPath: string; siteId: string }): Promise<boolean> {
    if (!zen) return false;
    return new Promise((resolve) => {
        zen.get(params.sitesPath).get(params.siteId).put(null, () => resolve(true));
        setTimeout(() => resolve(true), 5000);
    });
}

/** Remove stale registrations belonging to this server (same pub, different siteId). */
async function cleanupOwnStale(params: { sitesPath: string; currentSiteId: string }): Promise<boolean> {
    if (!zen || !serverPair) return false;
    zen.get(params.sitesPath).map().once((siteData: any, siteId: string) => {
        if (!siteData || siteId === "_") return;
        if (siteData.pub === serverPair.pub && siteId !== params.currentSiteId) {
            console.log(`🧹 Removing stale site registration: ${siteId}`);
            zen.get(params.sitesPath).get(siteId).put(null);
        }
    });
    return true;
}

async function ping(): Promise<{ peerCount: number }> {
    return { peerCount: getPeerCount() };
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

const methods: Record<string, (params: any) => Promise<any>> = {
    init,
    setPair,
    registerSite,
    listSites,
    pruneSite,
    cleanupOwnStale,
    ping
};

port.on("message", async (msg: { id: number; method: string; params?: any }) => {
    const { id, method, params } = msg || ({} as any);
    const fn = methods[method];
    if (!fn) {
        port.postMessage({ id, ok: false, error: `Unknown method: ${method}` });
        return;
    }
    try {
        const result = await fn(params || {});
        port.postMessage({ id, ok: true, result });
    } catch (e: any) {
        port.postMessage({ id, ok: false, error: e?.message || String(e) });
    }
});
