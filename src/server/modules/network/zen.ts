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
 * Aggressive memory evictor for ZEN graph.
 * The built-in evict.js only removes 1% of nodes per check — too slow when
 * public relays flood us with ~2GB in 80 seconds. This evictor runs every 1s,
 * triggers at 50% of memory budget, and has an emergency 90% threshold that 
 * wipes the graph (except protected keys) and disconnects peers.
 */
function startAggressiveEvictor(zen: any, memoryLimitMB: number) {
    const thresholdBytes = memoryLimitMB * 0.5 * 1024 * 1024; // 50% of budget
    const emergencyBytes = memoryLimitMB * 0.9 * 1024 * 1024; // 90% of budget
    let evicting = false;

    const interval = setInterval(() => {
        if (evicting) return;
        const heapUsed = v8.getHeapStatistics().used_heap_size;
        if (heapUsed < thresholdBytes) return;

        evicting = true;
        const root = zen._ || (zen as any)._graph?._;
        if (!root || !root.graph) {
            evicting = false;
            return;
        }

        const souls = Object.keys(root.graph);
        const nodeCount = souls.length;

        // Check if we hit the emergency memory ceiling (90%+)
        if (heapUsed >= emergencyBytes) {
            console.warn(`🚨 [ZEN-Evictor] EMERGENCY PURGE TRIGGERED | Heap: ${Math.round(heapUsed / 1e6)}MB (limit: ${memoryLimitMB}MB, nodes: ${nodeCount})`);
            
            // 1. Temporarily disconnect peers to stop the incoming flood
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

            // 2. Wipe the entire graph except protected keys
            let wipedCount = 0;
            for (let i = 0; i < souls.length; i++) {
                const soul = souls[i];
                if (soul.startsWith('~') || soul === 'shogun' || soul.includes('tunecamp')) continue;
                try {
                    delete root.graph[soul];
                    if (root.next && root.next[soul]) {
                        delete root.next[soul];
                    }
                    wipedCount++;
                } catch (e) {}
            }

            // Clean up dedup tracker
            if (root.dup && root.dup.s) {
                try {
                    if (root.dup.s instanceof Map) {
                        root.dup.s.clear();
                    } else {
                        const keys = Object.keys(root.dup.s);
                        for (const k of keys) {
                            delete root.dup.s[k];
                        }
                    }
                } catch (e) {}
            }

            if (global.gc) global.gc();
            
            const heapAfter = v8.getHeapStatistics().used_heap_size;
            console.warn(`🚨 [ZEN-Evictor] Wiped ${wipedCount}/${nodeCount} nodes. Heap: ${Math.round(heapUsed / 1e6)}MB → ${Math.round(heapAfter / 1e6)}MB`);
            evicting = false;
            return;
        }

        // Standard Aggressive Eviction (heap > 50% budget)
        // Drop 50% of nodes — much more aggressive than 20%
        const toDrop = Math.max(Math.ceil(nodeCount * 0.50), 100);
        let dropped = 0;

        for (let i = 0; i < souls.length && dropped < toDrop; i++) {
            const soul = souls[i];
            // Never evict our own user-space or registry keys we actively use
            if (soul.startsWith('~') || soul === 'shogun' || soul.includes('tunecamp')) continue;
            try {
                delete root.graph[soul];
                // Also clean up the "next" tracking object if it exists
                if (root.next && root.next[soul]) {
                    delete root.next[soul];
                }
                dropped++;
            } catch (e) { /* ignore */ }
        }

        // Also clean up the dedup tracker
        if (root.dup && root.dup.s) {
            try {
                if (root.dup.s instanceof Map) {
                    root.dup.s.clear();
                } else {
                    const keys = Object.keys(root.dup.s);
                    for (const k of keys) {
                        delete root.dup.s[k];
                    }
                }
            } catch (e) { /* ignore */ }
        }

        if (global.gc) global.gc();

        const heapAfter = v8.getHeapStatistics().used_heap_size;
        console.warn(`🧹 [ZEN-Evictor] Dropped ${dropped}/${nodeCount} nodes | Heap: ${Math.round(heapUsed / 1e6)}MB → ${Math.round(heapAfter / 1e6)}MB (limit: ${memoryLimitMB}MB)`);
        evicting = false;
    }, 1000); // Check every 1 second

    interval.unref();
    console.log(`🛡️ [ZEN-Evictor] Redesigned aggressive evictor started (threshold: ${Math.round(thresholdBytes / 1e6)}MB, emergency: ${Math.round(emergencyBytes / 1e6)}MB, limit: ${memoryLimitMB}MB)`);
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
        
        // Rate-limit incoming messages to throttle inbound traffic if it exceeds a certain threshold
        let incomingCount = 0;
        let droppedCount = 0;
        
        setInterval(() => {
            if (incomingCount > 0 || droppedCount > 0) {
                console.log(`📊 [ZEN-Traffic] Incoming: ${incomingCount}/5s | Dropped (throttled): ${droppedCount}/5s`);
                incomingCount = 0;
                droppedCount = 0;
            }
        }, 5000).unref();

        zenInstance.on('in', function(this: any, msg: any) {
            incomingCount++;
            
            if (msg && msg.put) {
                const heapUsed = v8.getHeapStatistics().used_heap_size;
                const limitBytes = ZEN_MEMORY_LIMIT_MB * 1024 * 1024;
                
                // Throttling: if heap is above 65% of budget, or we are flooded (incoming count > 250 in 5s, i.e. 50/s)
                const isCongested = heapUsed > (limitBytes * 0.65) || incomingCount > 250;
                
                if (isCongested) {
                    let hasProtectedKey = false;
                    for (const soul of Object.keys(msg.put)) {
                        if (soul.startsWith('~') || soul === 'shogun' || soul.includes('tunecamp')) {
                            hasProtectedKey = true;
                            break;
                        }
                    }
                    
                    if (!hasProtectedKey) {
                        droppedCount++;
                        // Throttle/drop the message by bypassing the rest of the Gun/Zen event chain
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
