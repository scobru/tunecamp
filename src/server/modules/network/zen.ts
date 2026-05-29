// @ts-ignore
import ZEN from 'zen';
// @ts-ignore
import 'zen/lib/yson.js'; // Fix: JSON blocking CPU warning
import 'zen/lib/multicast.js';
import 'zen/lib/evict.js'; // Enable automatic memory eviction to prevent OOM
import { DEFAULT_ZEN_PEERS, ZEN_CONFIG_DEFAULTS } from '../../../common/zen-config.js';
import v8 from 'v8';

let zenInstance: any = null;

// Memory budget for ZEN graph (MB). The built-in evictor uses 80% of this as threshold.
const ZEN_MEMORY_LIMIT_MB = parseInt(process.env.TUNECAMP_ZEN_MEMORY_LIMIT || '128', 10);

// Real v8 heap limit (from --max-old-space-size). Used for throttle/evictor thresholds.
const V8_HEAP_LIMIT_MB = Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024);

/** Souls that must never be evicted from graph, next, or dup */
function isProtectedSoul(soul: string): boolean {
    return soul.startsWith('~') || soul === 'shogun' || soul.includes('tunecamp');
}


interface ZenOptions {
    peers?: string[];
    web?: any;
    radisk?: boolean;
    localStorage?: boolean;
    file?: string;
    publicUrl?: string; // New: to filter out self from peers
    pid?: string;
}

/**
 * ServerZenUser: A compatibility shim for the legacy Gun.user() API.
 * Uses ZEN's stateless External Authenticator pattern under the hood.
 */
class ServerZenUser {
    private _zen: any;
    private _pair: any = null;
    public is: { pub?: string; epub?: string } | null = null;
    public _: any = { sea: null }; // Legacy internal state accessor for compatibility

    constructor(zen: any) {
        this._zen = zen;
    }

    /**
     * Authenticate using a ZEN key pair.
     */
    auth(pair: any, cb?: (ack: any) => void) {
        if (!pair || !pair.pub || !pair.priv) {
            console.error("🚨 [ServerZenUser] Invalid pair provided to auth()");
            if (cb) cb({ err: 'Invalid pair' });
            return this;
        }

        this._pair = pair;
        this.is = {
            pub: pair.pub,
            epub: pair.epub
        };
        this._.sea = pair;

        if (cb) cb({ ok: 1 });
        return this;
    }

    /**
     * Clear the current session.
     */
    leave() {
        this._pair = null;
        this.is = null;
        this._.sea = null;
        return this;
    }

    /**
     * Get a chain starting from the user's namespace (~pub).
     * Automatically wraps the chain to inject the authenticator into .put() calls.
     */
    get(path: string) {
        if (!this._zen) return null as any;

        if (!this.is || !this._pair) {
            // If not logged in, return a regular graph chain (read-only for user-space)
            const chain = this._zen.get(path);
            return chain ? this._wrapChain(chain) : chain;
        }

        const userRoot = this._zen.get('~' + this.is.pub);
        if (!userRoot) return this._zen.get(path);

        const chain = userRoot.get(path);
        return chain ? this._wrapChain(chain) : chain;
    }

    /**
     * Overrides .put() on a chain to automatically include the authenticator.
     */
    private _wrapChain(chain: any) {
        if (!chain || chain._isZenWrapped) return chain;
        if (typeof chain.put !== 'function' || typeof chain.get !== 'function') {
            return chain;
        }

        const originalPut = chain.put.bind(chain);
        const originalGet = chain.get.bind(chain);
        const self = this;

        chain._isZenWrapped = true;

        chain.put = (data: any, opt: any, cb: any) => {
            if (typeof opt === 'function') {
                cb = opt;
                opt = {};
            }
            opt = opt || {};
            // Inject authenticator for ZEN stateless signing
            opt.authenticator = self._pair;
            return originalPut(data, opt, cb);
        };

        // Recursively wrap children
        chain.get = (path: string) => {
            const nextChain = originalGet(path);
            return nextChain ? self._wrapChain(nextChain) : nextChain;
        };

        return chain;
    }
}

/**
 * Aggressive memory evictor for ZEN.
 * 
 * The previous evictor only targeted root.graph nodes, which were nearly empty
 * (0-5 nodes). The real memory leak comes from:
 *   1. root.next — listener/subscription tracking objects (grow per incoming soul)
 *   2. root.dup.s — dedup tracker Map holding msg context references
 *   3. Closure retention via msg._ context chains in the GunDB event pipeline
 *   4. WebSocket send buffers on outbound peer connections
 *
 * This rewrite targets ALL of these, using the real v8 heap limit (from
 * --max-old-space-size) as the reference instead of the arbitrary 128MB ZEN budget.
 */
function startAggressiveEvictor(zen: any, memoryLimitMB: number) {
    // Use real v8 heap limit for thresholds, not the ZEN graph budget
    const heapLimitMB = V8_HEAP_LIMIT_MB;
    const thresholdBytes = heapLimitMB * 0.50 * 1024 * 1024; // 50% of real heap limit
    const emergencyBytes = heapLimitMB * 0.75 * 1024 * 1024; // 75% — well before OOM
    let evicting = false;

    const interval = setInterval(() => {
        if (evicting) return;
        const heapUsed = v8.getHeapStatistics().used_heap_size;
        if (heapUsed < thresholdBytes) return;

        evicting = true;
        const root = zen._ || (zen as any)._graph?._;
        if (!root) {
            evicting = false;
            return;
        }

        const graph = root.graph || {};
        const next = root.next || {};
        const graphSouls = Object.keys(graph);
        const nextSouls = Object.keys(next);
        const isEmergency = heapUsed >= emergencyBytes;

        if (isEmergency) {
            console.warn(`🚨 [ZEN-Evictor] EMERGENCY at ${Math.round(heapUsed / 1e6)}MB / ${heapLimitMB}MB | graph: ${graphSouls.length}, next: ${nextSouls.length}`);
        }

        // ── 1. Evict root.graph nodes (the original target) ────────────────
        let graphDropped = 0;
        for (const soul of graphSouls) {
            if (isProtectedSoul(soul)) continue;
            try {
                delete graph[soul];
                graphDropped++;
            } catch (e) {}
        }

        // ── 2. Evict root.next listener chains (PRIMARY leak source) ──────
        // Each incoming soul creates a root.next[soul] entry with .on() listeners.
        // These accumulate unboundedly and hold references to message contexts.
        let nextDropped = 0;
        for (const soul of nextSouls) {
            if (isProtectedSoul(soul)) continue;
            try {
                // Call .off() on the chain to detach listeners if available
                const entry = next[soul];
                if (entry && entry.$ && typeof entry.$.off === 'function') {
                    entry.$.off();
                }
                delete next[soul];
                nextDropped++;
            } catch (e) {}
        }

        // ── 3. Purge the dedup tracker ────────────────────────────────────
        // The dup.s Map holds {id → {was, '#'}} entries with references to
        // msg contexts. Even with max:999, the drop() timer may lag behind
        // the incoming message rate. Force-clear it.
        let dupCleared = 0;
        if (root.dup && root.dup.s) {
            try {
                if (root.dup.s instanceof Map) {
                    dupCleared = root.dup.s.size;
                    root.dup.s.clear();
                } else {
                    const keys = Object.keys(root.dup.s);
                    dupCleared = keys.length;
                    for (const k of keys) {
                        delete root.dup.s[k];
                    }
                }
                // Clear the pending drop timer so it doesn't reference stale entries
                if (root.dup.to) {
                    clearTimeout(root.dup.to);
                    root.dup.to = null;
                }
            } catch (e) {}
        }

        // ── 4. Emergency: disconnect all peers to stop the flood ──────────
        if (isEmergency) {
            try {
                const opt = root.opt || {};
                const peers = opt.peers || {};
                const axePeers = root.axe?.up || {};
                const meshPeers = opt.mesh?.peers || {};

                const closePeer = (p: any) => {
                    if (!p) return;
                    const conn = p.wire || p.socket || p.conn;
                    if (conn && typeof conn.close === 'function') {
                        try { conn.close(); } catch (e) {}
                    }
                    if (p && typeof p.close === 'function') {
                        try { p.close(); } catch (e) {}
                    }
                };

                Object.values(peers).forEach(closePeer);
                Object.values(axePeers).forEach(closePeer);
                Object.values(meshPeers).forEach(closePeer);
                console.warn("🚨 [ZEN-Evictor] All peer connections closed to stop flood.");
            } catch (e: any) {
                console.error("🚨 [ZEN-Evictor] Peer disconnect error:", e.message);
            }
        }

        // ── 5. Force GC if available ──────────────────────────────────────
        if (global.gc) global.gc();

        const heapAfter = v8.getHeapStatistics().used_heap_size;
        const tag = isEmergency ? '🚨' : '🧹';
        console.warn(`${tag} [ZEN-Evictor] graph:-${graphDropped} next:-${nextDropped} dup:-${dupCleared} | Heap: ${Math.round(heapUsed / 1e6)}MB → ${Math.round(heapAfter / 1e6)}MB (limit: ${heapLimitMB}MB)`);
        evicting = false;
    }, 1000);

    interval.unref();
    console.log(`🛡️ [ZEN-Evictor] Started (threshold: ${Math.round(thresholdBytes / 1e6)}MB, emergency: ${Math.round(emergencyBytes / 1e6)}MB, v8 limit: ${heapLimitMB}MB, zen budget: ${memoryLimitMB}MB)`);
}


/**
 * Shared Zen instance for the server
 */
export function getZen(options?: ZenOptions): any {
    if (!zenInstance) {
        // Filter out self-peer to avoid loopback non-101 errors (proxy limitation)
        let filteredPeers = options?.peers || DEFAULT_ZEN_PEERS;
        if (options?.publicUrl) {
            const selfHost = new URL(options.publicUrl).hostname;
            filteredPeers = filteredPeers.filter(p => !p.includes(selfHost));
            console.log(`🛡️ [ZEN] Filtered self-peer (${selfHost}) from initialization peers.`);
        }

        const initializationOptions = {
            peers: filteredPeers,
            radisk: options?.radisk !== undefined ? options.radisk : ZEN_CONFIG_DEFAULTS.radisk,
            localStorage: false, // Ensure localStorage is always disabled on server
            file: options?.file || ZEN_CONFIG_DEFAULTS.file,
            axe: false, // Disable AXE mesh routing as a client
            super: false, // Identify as a ZEN client node, not a Relay node
            pid: options?.pid,
            stats: false, // Prevent writing to /root/.local/state/zen/
            memory: ZEN_MEMORY_LIMIT_MB // Memory budget for built-in evictor (evict.js)
        };

        console.log(`📡 [ZEN] Initializing shared singleton with ${initializationOptions.peers.length} peers (memory limit: ${ZEN_MEMORY_LIMIT_MB}MB)...`);
        zenInstance = new ZEN(initializationOptions);
        
        // Rate-limit incoming messages to throttle inbound traffic.
        // Thresholds are based on the REAL v8 heap limit, not the 128MB ZEN budget.
        const heapLimitBytes = V8_HEAP_LIMIT_MB * 1024 * 1024;
        const throttleThreshold = heapLimitBytes * 0.40; // Start throttling at 40% of real limit
        const hardDropThreshold = heapLimitBytes * 0.60;  // Drop ALL non-protected at 60%
        let incomingCount = 0;
        let droppedCount = 0;
        
        setInterval(() => {
            if (incomingCount > 0 || droppedCount > 0) {
                console.log(`📊 [ZEN-Traffic] Incoming: ${incomingCount}/5s | Dropped: ${droppedCount}/5s | Heap: ${Math.round(v8.getHeapStatistics().used_heap_size / 1e6)}MB/${V8_HEAP_LIMIT_MB}MB`);
                incomingCount = 0;
                droppedCount = 0;
            }
        }, 5000).unref();

        zenInstance.on('in', function(this: any, msg: any) {
            incomingCount++;
            
            if (msg && msg.put) {
                const heapUsed = v8.getHeapStatistics().used_heap_size;
                
                // Hard drop: above 60% of real heap limit, drop everything non-protected
                if (heapUsed > hardDropThreshold) {
                    let hasProtectedKey = false;
                    for (const soul of Object.keys(msg.put)) {
                        if (isProtectedSoul(soul)) {
                            hasProtectedKey = true;
                            break;
                        }
                    }
                    if (!hasProtectedKey) {
                        droppedCount++;
                        return;
                    }
                }
                // Soft throttle: above 40% of real heap limit OR rate > 50/s
                else if (heapUsed > throttleThreshold || incomingCount > 250) {
                    let hasProtectedKey = false;
                    for (const soul of Object.keys(msg.put)) {
                        if (isProtectedSoul(soul)) {
                            hasProtectedKey = true;
                            break;
                        }
                    }
                    if (!hasProtectedKey) {
                        droppedCount++;
                        return;
                    }
                }
            }
            
            this.to.next(msg);
        });

        // Start our aggressive evictor as a safety net on top of the built-in one
        startAggressiveEvictor(zenInstance, ZEN_MEMORY_LIMIT_MB);


        // --- COMPATIBILITY SHIM ---
        // ZEN does not have a native .user() instance like GunDB. 
        // We attach this shim to provide compatibility with Tunecamp's existing 
        // authentication and user-space data patterns (e.g., zen.user().auth()).
        const userShim = new ServerZenUser(zenInstance);
        
        Object.defineProperty(zenInstance, 'user', {
            value: function(pub?: string) {
                // If a pubkey is provided, return the public namespace node
                if (pub) return (zenInstance as any).get('~' + pub);
                // Otherwise return the authenticated user shim
                return userShim;
            },
            writable: true,
            configurable: true
        });

        // Initialize internal graph state
        (zenInstance as any)._graph; 
    } else if (options?.peers) {
        // Update existing instance if new options provided (peers)
        if (options.peers) {
            let filteredPeers = options.peers;
            if (options.publicUrl) {
                const selfHost = new URL(options.publicUrl).hostname;
                filteredPeers = filteredPeers.filter(p => !p.includes(selfHost));
            }
            console.log(`📡 [ZEN] Shared singleton adding ${filteredPeers.length} peers...`);
            zenInstance.opt({ peers: filteredPeers });
        }
    }

    // DIAGNOSTIC: Ensure .user is a function before returning
    if (typeof zenInstance.user !== 'function') {
        console.error("🚨 [ZEN] FATAL: zenInstance.user is STILL not a function after initialization!");
    }
    
    return zenInstance;
}

/**
 * Re-exports from ZEN for convenience
 */
export const Zen = ZEN;
