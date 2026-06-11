// @ts-ignore
import ZEN from 'zen/zen.js';
// @ts-ignore
import 'zen/lib/yson.js'; // Fix: JSON blocking CPU warning
// NOTE: 'zen/lib/evict.js' is intentionally NOT imported. Its memory check compares
// process RSS against 80% of the ZEN `memory` budget (128MB → 102MB); a Node server's
// RSS sits at 200MB+ at idle, so the check never passes and its GC() runs every single
// second forever — killing one live subscription per tick and rescanning the dup tracker.
// startAggressiveEvictor() below covers eviction with thresholds based on real heap/ext usage.
import { DEFAULT_ZEN_PEERS, ZEN_CONFIG_DEFAULTS } from '../../../common/zen-config.js';
import v8 from 'v8';

let zenInstance: any = null;

// Memory budget for ZEN graph (MB). The built-in evictor uses 80% of this as threshold.
const ZEN_MEMORY_LIMIT_MB = parseInt(process.env.TUNECAMP_ZEN_MEMORY_LIMIT || '128', 10);

// Real v8 heap limit (from --max-old-space-size). Used for throttle/evictor thresholds.
const V8_HEAP_LIMIT_MB = Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024);

/** Souls that must never be evicted from graph, next, or dup */
function isProtectedSoul(soul: string): boolean {
    // Protect tunecamp root
    if (soul === 'tunecamp') return true;

    // Protect user profiles/namespaces (must start with ~ and not contain slashes/subpaths)
    if (soul.startsWith('~') && !soul.includes('/')) return true;

    // Protect explicit system nodes we use
    if (soul === 'tunecamp-playlists' || soul === 'tunecamp-public-playlists') return true;

    return false;
}


interface ZenOptions {
    peers?: string[];
    radisk?: boolean;
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
function startAggressiveEvictor(zen: any) {
    // Use real v8 heap limit for thresholds, not the ZEN graph budget
    const heapLimitMB = V8_HEAP_LIMIT_MB;
    const thresholdBytes = heapLimitMB * 0.50 * 1024 * 1024; // 50% of real heap limit
    const emergencyBytes = heapLimitMB * 0.75 * 1024 * 1024; // 75% — well before OOM

    // External/ArrayBuffer thresholds (off-heap — the actual crash driver).
    // Baseline is ~16MB at startup; crashes occur around 52MB.
    // 30MB = early warning, 45MB = emergency (disconnect peers).
    const extThresholdBytes = parseInt(process.env.TUNECAMP_ZEN_EXT_THRESHOLD_MB || '30', 10) * 1024 * 1024;
    const extEmergencyBytes = parseInt(process.env.TUNECAMP_ZEN_EXT_EMERGENCY_MB || '45', 10) * 1024 * 1024;

    let evicting = false;
    // Manual global.gc() is a stop-the-world full GC. The evictor body can run every second
    // (whenever ext sits above its threshold), so calling gc() every tick stalls the event
    // loop almost continuously. Throttle forced GC to an occasional sweep; V8 still GCs on its
    // own, and the cheap reference-clearing below runs every tick to keep off-heap memory falling.
    let lastForcedGc = 0;
    const GC_MIN_INTERVAL_MS = 20_000;
    // Even during an emergency we must NOT gc() every tick: a full stop-the-world GC on a
    // 200MB+ external heap takes hundreds of ms to seconds, and a sustained inbound flood keeps
    // the emergency latched for many seconds — so an unthrottled emergency gc() freezes the event
    // loop for tens of seconds (→ nginx 504). Allow aggressive-but-throttled GC under emergency.
    const EMERGENCY_GC_MIN_INTERVAL_MS = 5_000;

    const interval = setInterval(() => {
        if (evicting) return;
        const heapUsed = v8.getHeapStatistics().used_heap_size;
        const { external: extUsed } = process.memoryUsage();
        if (heapUsed < thresholdBytes && extUsed < extThresholdBytes) return;

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
        const isEmergency = heapUsed >= emergencyBytes || extUsed >= extEmergencyBytes;

        if (isEmergency) {
            console.warn(`🚨 [ZEN-Evictor] EMERGENCY — Heap: ${Math.round(heapUsed / 1e6)}MB / ${heapLimitMB}MB | Ext: ${Math.round(extUsed / 1e6)}MB / ${Math.round(extEmergencyBytes / 1e6)}MB | graph: ${graphSouls.length}, next: ${nextSouls.length}`);
        }

        // ── 1. Evict root.graph nodes (the original target) ────────────────
        let graphDropped = 0;
        for (const soul of graphSouls) {
            if (isProtectedSoul(soul)) continue;
            try {
                delete graph[soul];
                graphDropped++;
            } catch (e) { }
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
            } catch (e) { }
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
            } catch (e) { }
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
                        try { conn.close(); } catch (e) { }
                    }
                    if (p && typeof p.close === 'function') {
                        try { p.close(); } catch (e) { }
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

        // ── 5. Force GC if available (throttled — full GC is stop-the-world) ──
        // Throttle in BOTH paths so the loop isn't frozen by back-to-back full GCs. Emergencies
        // use a shorter interval (reclaim faster) but are still rate-limited, because a flood can
        // keep us latched in emergency for many seconds — gc()-per-tick there was the 504 driver.
        const nowTs = Date.now();
        const gcMinInterval = isEmergency ? EMERGENCY_GC_MIN_INTERVAL_MS : GC_MIN_INTERVAL_MS;
        if (global.gc && nowTs - lastForcedGc >= gcMinInterval) {
            global.gc();
            lastForcedGc = nowTs;
        }

        const heapAfter = v8.getHeapStatistics().used_heap_size;
        const extAfter = process.memoryUsage().external;
        const tag = isEmergency ? '🚨' : '🧹';
        console.warn(`${tag} [ZEN-Evictor] graph:-${graphDropped} next:-${nextDropped} dup:-${dupCleared} | Heap: ${Math.round(heapUsed / 1e6)}MB → ${Math.round(heapAfter / 1e6)}MB | Ext: ${Math.round(extUsed / 1e6)}MB → ${Math.round(extAfter / 1e6)}MB`);
        evicting = false;
    }, 1000);

    interval.unref();
    console.log(`🛡️ [ZEN-Evictor] Started (heap threshold: ${Math.round(thresholdBytes / 1e6)}MB, ext threshold: ${Math.round(extThresholdBytes / 1e6)}MB, emergency heap: ${Math.round(emergencyBytes / 1e6)}MB, emergency ext: ${Math.round(extEmergencyBytes / 1e6)}MB, v8 limit: ${heapLimitMB}MB)`);
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
            memory: ZEN_MEMORY_LIMIT_MB, // Memory budget for built-in evictor (evict.js)
            // Cap inbound/outbound frame size. ZEN's default derives from `memory`
            // (128MB → ~38MB max), so a relay's full-graph dump is accepted, buffered off-heap,
            // and parsed before our on('in') soul-filter ever runs — that off-heap spike is what
            // tips the evictor into emergency. Tunecamp (signaling-only client) never legitimately
            // sends/receives frames near this size, so reject oversized frames at the wire.
            max: parseInt(process.env.TUNECAMP_ZEN_MAX_MSG_MB || '8', 10) * 1024 * 1024
        };

        console.log(`📡 [ZEN] Initializing shared singleton with ${initializationOptions.peers.length} peers (memory limit: ${ZEN_MEMORY_LIMIT_MB}MB)...`);
        zenInstance = new ZEN(initializationOptions);

        // ── Inbound message filter ──────────────────────────────────────────
        // The relay sends its ENTIRE graph state (hundreds of souls per message)
        // when a peer connects. 39 such messages in 5 seconds = 400MB+ of retained
        // memory from root.next chains, dup tracker, and closure contexts.
        //
        // Heap-based throttling FAILED because ZEN processes message payloads
        // asynchronously via its turn queue — the heap is still low at receipt time,
        // but explodes during async expansion.
        //
        // Fix: filter by PAYLOAD SIZE, not heap pressure. Only let through souls
        // that Tunecamp actually uses. Everything else is relay gossip noise.
        const MAX_UNPROTECTED_SOULS = 3; // Max non-protected souls per message before stripping
        // HAM future-state guard. zen.js defers any key whose state is ahead of our clock via
        // setTimeout(ham, state - now), pinning the whole message context until the timer fires.
        // A peer with a skewed clock (e.g. a host with broken NTP, minutes ahead) makes every one
        // of its puts re-fire in a single burst N minutes after we receive them — the resulting
        // put/ack turn-queue storm freezes the event loop for tens of seconds (nginx 504s, then
        // the Docker healthcheck kills the container). Legit skew is sub-second, so anything
        // beyond the tolerance is clamped to our local clock at receipt time.
        const FUTURE_STATE_TOLERANCE_MS = parseInt(process.env.TUNECAMP_ZEN_FUTURE_TOLERANCE_MS || '5000', 10);
        let incomingCount = 0;
        let droppedCount = 0;
        let strippedCount = 0;
        let clampedCount = 0;

        setInterval(() => {
            if (incomingCount > 0 || droppedCount > 0 || strippedCount > 0 || clampedCount > 0) {
                const heap = Math.round(v8.getHeapStatistics().used_heap_size / 1e6);
                console.log(`📊 [ZEN-Traffic] In: ${incomingCount}/5s | Dropped: ${droppedCount}/5s | Stripped: ${strippedCount}/5s | Clamped: ${clampedCount}/5s | Heap: ${heap}MB/${V8_HEAP_LIMIT_MB}MB`);
                incomingCount = 0;
                droppedCount = 0;
                strippedCount = 0;
                clampedCount = 0;
            }
        }, 5000).unref();

        zenInstance.on('in', function (this: any, msg: any) {
            incomingCount++;

            if (msg && msg.put) {
                const root = zenInstance._ || zenInstance._graph?._;
                const next = root ? root.next || {} : {};
                const subscribedSouls = Object.keys(next);

                const souls = Object.keys(msg.put);
                for (const soul of souls) {
                    // We keep the soul if:
                    // 1. It is explicitly in isProtectedSoul (shogun root, local user profile keys)
                    // 2. We have an active subscription for it in root.next
                    // 3. Or it is a child of an active subscription (starts with subscribed soul + '/')
                    let keep = isProtectedSoul(soul) || !!next[soul];

                    if (!keep) {
                        for (const sub of subscribedSouls) {
                            // Ignore broad root / top-level categories (e.g. 'shogun' or 'shogun/tunecamp-community')
                            // to prevent matching everything under the sun and flooding the memory.
                            // Only allow specific leaf subscriptions (>= 3 segments) as wildcard prefixes.
                            if (sub.split('/').length < 3) continue;

                            if (soul.startsWith(sub + '/')) {
                                keep = true;
                                break;
                            }
                        }
                    }

                    if (!keep) {
                        delete msg.put[soul];
                        strippedCount++;
                    }
                }

                // If nothing left after stripping, drop entirely
                if (Object.keys(msg.put).length === 0) {
                    droppedCount++;
                    return;
                }

                // Clamp future HAM states on the souls we kept, so zen.js never schedules
                // a deferred ham() re-fire for them (see FUTURE_STATE_TOLERANCE_MS above).
                const nowMs = Date.now();
                const maxState = nowMs + FUTURE_STATE_TOLERANCE_MS;
                for (const soul of Object.keys(msg.put)) {
                    const states = msg.put[soul]?._?.['>'];
                    if (!states) continue;
                    for (const key of Object.keys(states)) {
                        const state = states[key];
                        if (typeof state === 'number' && state > maxState) {
                            if (clampedCount < 3) {
                                console.warn(`⏰ [ZEN] Clamped future state on '${soul}'.'${key}': +${Math.round((state - nowMs) / 1000)}s ahead (peer clock skew?)`);
                            }
                            states[key] = nowMs;
                            clampedCount++;
                        }
                    }
                }

                // Emergency heap check: if we are extremely low on memory, drop everything non-critical
                const heapUsed = v8.getHeapStatistics().used_heap_size;
                const emergencyBytes = V8_HEAP_LIMIT_MB * 0.75 * 1024 * 1024;
                if (heapUsed > emergencyBytes) {
                    // Under extreme heap pressure, drop any incoming message that isn't a critical local user profile
                    let hasCritical = false;
                    for (const soul of Object.keys(msg.put)) {
                        if (soul.startsWith('~') && !soul.includes('/')) {
                            hasCritical = true;
                            break;
                        }
                    }
                    if (!hasCritical) {
                        droppedCount++;
                        return;
                    }
                }
            }

            this.to.next(msg);
        });

        // Start our aggressive evictor as a safety net on top of the built-in one
        startAggressiveEvictor(zenInstance);

        // --- COMPATIBILITY SHIM ---
        // ZEN does not have a native .user() instance like GunDB. 
        // We attach this shim to provide compatibility with Tunecamp's existing 
        // authentication and user-space data patterns (e.g., zen.user().auth()).
        const userShim = new ServerZenUser(zenInstance);

        Object.defineProperty(zenInstance, 'user', {
            value: function (pub?: string) {
                // If a pubkey is provided, return the public namespace node
                if (pub) return (zenInstance as any).get('~' + pub);
                // Otherwise return the authenticated user shim
                return userShim;
            },
            writable: true,
            configurable: true
        });
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

    return zenInstance;
}

/**
 * Re-exports from ZEN for convenience
 */
export const Zen = ZEN;
