// @ts-ignore
import ZEN from 'zen';
// @ts-ignore
import 'zen/lib/yson.js'; // Fix: JSON blocking CPU warning
import 'zen/lib/multicast.js';
import { DEFAULT_ZEN_PEERS, ZEN_CONFIG_DEFAULTS } from '../../../common/zen-config.js';

let zenInstance: any = null;

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
            web: options?.web,
            port: 1970, // Explicitly use port 1970 for ZEN relay as requested
            ws: { path: '/zen' }, // Explicit path for ZEN wire to match shogun-relay pattern
            radisk: options?.radisk !== undefined ? options.radisk : ZEN_CONFIG_DEFAULTS.radisk,
            localStorage: false, // Ensure localStorage is always disabled on server
            file: options?.file || ZEN_CONFIG_DEFAULTS.file,
            axe: true, // Enable AXE mesh (PEX + routing)
            super: true, // Identify as a ZEN Relay node
            pid: options?.pid,
            stats: false // Prevent writing to /root/.local/state/zen/
        };

        console.log(`📡 [ZEN] Initializing shared singleton with ${initializationOptions.peers.length} peers...`);
        zenInstance = new ZEN(initializationOptions);
        
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
    } else if (options?.peers || options?.web) {
        // Update existing instance if new options provided (peers/server)
        if (options.peers) {
            let filteredPeers = options.peers;
            if (options.publicUrl) {
                const selfHost = new URL(options.publicUrl).hostname;
                filteredPeers = filteredPeers.filter(p => !p.includes(selfHost));
            }
            console.log(`📡 [ZEN] Shared singleton adding ${filteredPeers.length} peers...`);
            zenInstance.opt({ peers: filteredPeers });
        }
        if (options.web) {
            zenInstance.opt({ web: options.web });
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
export default zenInstance;
