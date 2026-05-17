import ZEN from 'zen';


// Remove redundant imports as ZEN includes everything needed
import { DEFAULT_ZEN_PEERS } from '../../../src/common/zen-config';
import API from './api';
import type { UserPlaylist, UserPlaylistTrack, Track } from '../types';

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    if (!DEFAULT_ZEN_PEERS.includes("ws://localhost:1970/zen")) {
        DEFAULT_ZEN_PEERS.push("ws://localhost:1970/zen");
    }
}

const envPeers = (window as any).TUNECAMP_CONFIG?.zenPeers || (window as any).TUNECAMP_CONFIG?.gunPeers;
let PEERS = [...DEFAULT_ZEN_PEERS];

if (envPeers && typeof envPeers === 'string' && envPeers.trim().length > 0) {
    // Robustly split and normalize peers (handle commas and/or whitespace)
    PEERS = envPeers
        .split(/[,\s]+/)
        .map(p => p.trim())
        .filter(p => p.length > 0 && (p.startsWith('ws://') || p.startsWith('wss://') || p.startsWith('http://') || p.startsWith('https://')));

    console.log(`📡 ZEN Relay initialized with ${PEERS.length} custom peers from config:`, PEERS);
} else {
    console.log(`📡 ZEN Relay initialized with default peers:`, PEERS);
}

// Initialize Zen
const zen = new ZEN({
    peers: PEERS,
    port: 1970,
    localStorage: true,
    radisk: true,
    axe: true
});

/**
 * ZenUser: A compatibility shim for the legacy Gun.user() API.
 * Uses ZEN's stateless External Authenticator pattern under the hood.
 */
class ZenUser {
    private _gun: any;
    private _pair: any = null;
    public is: { pub?: string; alias?: string; epub?: string } | null = null;
    public _: any = { sea: null }; // Legacy internal state accessor

    constructor(gun: any) {
        this._gun = gun;
    }

    /**
     * Recall a previously saved session from localStorage.
     */
    async recall(_opt: any, cb?: (ack: any) => void) {
        try {
            const saved = localStorage.getItem('tunecamp_auth_pair');
            if (saved) {
                const pair = JSON.parse(saved);
                const alias = localStorage.getItem('tunecamp_auth_alias');
                this._setSession(pair, alias || '');
                if (cb) cb({ ok: 1 });
                return this;
            }
        } catch (e) {
            console.error("ZenUser recall failed:", e);
        }
        if (cb) cb({ err: 'No session' });
        return this;
    }

    /**
     * Create a new user identity.
     */
    async create(alias: string, pass: string, cb?: (ack: any) => void) {
        if (!alias || !pass) {
            const err = "Username and password are required for registration";
            if (cb) cb({ err });
            throw new Error(err);
        }

        try {
            // HIGH SECURITY: Combine alias + pass as seed to ensure unique identity
            // even if two users choose the same password.
            const seed = alias + pass;
            const pair = await (ZEN as any).pair(null, { seed });

            if (!pair || !pair.pub) throw new Error("Failed to generate valid key pair");

            // Set initial profile data in the user's namespace
            // We use a flat put first to ensure the node exists
            const userNode = this._gun.get('~' + pair.pub);
            await userNode.put({
                alias: alias,
                pub: pair.pub,
                epub: pair.epub,
                created: Date.now()
            }, { authenticator: pair }).then();

            // Register alias -> pub mapping for discovery
            // This is equivalent to Gun's internal alias system
            try {
                const aliasNode = this._gun.get('~@' + alias);
                if (aliasNode && typeof aliasNode.put === 'function') {
                    await aliasNode.put({ '#': '~' + pair.pub }, { authenticator: pair }).then();
                }
            } catch (aliasErr) {
                console.warn("⚠️ [ZenUser] Alias mapping failed (discovery might be limited):", aliasErr);
            }

            if (cb) cb({ ok: 1, pub: pair.pub });
            return pair;
        } catch (e: any) {
            console.error("❌ ZenUser.create failed:", e);
            const errMsg = e.message || String(e);
            if (cb) cb({ err: errMsg });
            throw e;
        }
    }

    /**
     * Authenticate an existing user.
     */
    async auth(alias: any, pass?: string | ((ack: any) => void), cb?: (ack: any) => void, explicitAlias?: string) {
        // Handle login-with-pair vs login-with-credentials
        if (typeof pass === 'function') {
            cb = pass;
            pass = undefined;
        }

        let pair = alias;
        let actualAlias = explicitAlias || (typeof alias === 'string' ? alias : '');

        try {
            if (pass !== undefined) {
                // Generate pair from combined username + password seed
                const seed = actualAlias + pass;
                pair = await (ZEN as any).pair(null, { seed });
            } else if (typeof alias === 'object' && alias.pub) {
                pair = alias;
            }

            this._setSession(pair, actualAlias);

            // Persist for recall
            localStorage.setItem('tunecamp_auth_pair', JSON.stringify(pair));
            localStorage.setItem('tunecamp_auth_alias', actualAlias);

            if (cb) cb({ ok: 1 });
            return this;
        } catch (e: any) {
            if (cb) cb({ err: e.message || e });
            throw e;
        }
    }

    /**
     * Logout and clear session.
     */
    leave() {
        this._pair = null;
        this.is = null;
        this._.sea = null;
        localStorage.removeItem('tunecamp_auth_pair');
        localStorage.removeItem('tunecamp_auth_alias');
    }

    /**
     * Get a chain starting from the user's namespace (~pub).
     * Automatically wraps the chain to inject the authenticator into .put() calls.
     */
    get(path: string) {
        if (!this._gun) return null as any;

        if (!this.is || !this._pair) {
            // If not logged in, return a regular graph chain (read-only for user-space)
            const chain = this._gun.get(path);
            return chain ? this._wrapChain(chain) : chain;
        }

        const userRoot = this._gun.get('~' + this.is.pub);
        if (!userRoot) return this._gun.get(path);
        
        const chain = userRoot.get(path);
        return chain ? this._wrapChain(chain) : chain;
    }

    private _setSession(pair: any, alias: string) {
        this._pair = pair;
        this._.sea = pair;
        this.is = {
            pub: pair.pub,
            epub: pair.epub,
            alias: alias
        };
    }

    /**
     * Overrides .put() on a chain to automatically include the authenticator.
     */
    private _wrapChain(chain: any) {
        if (!chain || chain._isZenWrapped) return chain;
        if (typeof chain.put !== 'function' || typeof chain.get !== 'function') {
            console.warn("⚠️ [ZenUser] Attempted to wrap an invalid chain object:", chain);
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

// Initialize the shim
const user = new ZenUser(zen);

// Helper interface for Zen User Profile
export interface ZenProfile {
    pub: string;
    alias: string;
    epub: string;
    profile?: {
        avatar?: string;
        bio?: string;
    };
}

export const ZenAuth = {
    zen,
    user,

    // Initialize/Recall session
    init: async (): Promise<ZenProfile | null> => {
        // Wait for ZEN WASM and crypto primitives to be ready
        await (ZEN as any).ready;

        // Fetch and add additional peers from settings
        try {
            const settings = await API.getSiteSettings();
            const storedPeers = settings.zenPeers || settings.gunPeers;
            if (storedPeers) {
                const settingPeers = storedPeers.split(/[,\s]+/).map((p: string) => p.trim()).filter((p: string) => p.length > 0);
                if (settingPeers.length > 0) {
                    console.log(`🌐 Adding ${settingPeers.length} ZEN peers from site settings:`, settingPeers);
                    if (typeof (zen as any).opt === 'function') {
                        (zen as any).opt({ peers: settingPeers });
                    }
                }
            }
        } catch (e) {
            console.warn("Failed to fetch Zen peers from settings:", e);
        }

        return new Promise((resolve) => {
            // Attempt to recall session
            user.recall({ localStorage: true }, (_ack: any) => {
                if (user.is) {
                    const profile = {
                        pub: user.is.pub as string,
                        alias: user.is.alias as string,
                        epub: (user.is as any).epub as string
                    };
                    // Sync with backend (fire and forget/non-blocking)
                    API.syncGunUser(profile.pub, profile.epub, profile.alias).catch(console.error);
                    resolve(profile);
                } else {
                    resolve(null);
                }
            });
        });
    },

    isLoggedIn: () => {
        return !!(user.is && user.is.pub);
    },

    getProfile: (): ZenProfile | null => {
        if (!user.is) return null;
        return {
            pub: user.is.pub as string,
            alias: user.is.alias as string,
            epub: (user.is as any).epub as string
        };
    },

    register: (username: string, pass: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Zen Registration Timeout: Could not reach peers"));
            }, 20000);

            const connectedPeers = Object.keys((zen as any)?._?.opt?.peers || {}).filter(k => {
                const p = (zen as any)._?.opt?.peers[k];
                const conn = p?.wire || p?.socket || p?.conn;
                return conn && (conn.readyState === 1 || conn.readyState === 'open');
            }).length;
            console.log(`📡 ZEN Register attempt. Connected peers: ${connectedPeers}`);

            user.create(username, pass, (ack: any) => {
                clearTimeout(timeout);
                if (ack.err) {
                    // "User already created!" means the Zen identity exists (e.g. from a
                    // prior partial registration). Fall back to login so the caller can still
                    // generate a proof and complete the backend registration step.
                    if (typeof ack.err === 'string' && ack.err.toLowerCase().includes('already created')) {
                        console.warn(`⚠️ Zen user already exists, falling back to login for ${username}`);
                        ZenAuth.login(username, pass).then(() => resolve()).catch(reject);
                    } else {
                        reject(new Error(ack.err));
                    }
                } else {
                    // Auto login after successful creation
                    ZenAuth.login(username, pass).then(() => resolve()).catch(reject);
                }
            });
        });
    },

    login: (username: string, pass: string): Promise<ZenProfile> => {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Zen Login Timeout: Could not reach peers"));
            }, 20000);

            const peerKeys = Object.keys((zen as any)?._?.opt?.peers || {});
            const connectedPeers = peerKeys.filter(k => {
                const p = (zen as any)._?.opt?.peers[k];
                const conn = p?.wire || p?.socket || p?.conn;
                return conn && (conn.readyState === 1 || conn.readyState === 'open');
            }).length;
            
            console.log(`📡 ZEN Login attempt. Connected peers: ${connectedPeers} total, ${peerKeys.length} known.`);
            if (connectedPeers === 0 && peerKeys.length > 0) {
                console.warn("⚠️  ZEN Relay: No peers are connected despite being configured. Peer list:", peerKeys);
            }

            user.auth(username, pass, (ack: any) => {
                clearTimeout(timeout);
                if (ack.err) {
                    reject(new Error(ack.err));
                } else {
                    const profile = {
                        pub: user.is!.pub as string,
                        alias: user.is!.alias as string,
                        epub: (user.is as any).epub as string
                    };
                    // Sync with backend
                    console.log(`📡 Syncing user with backend: ${profile.alias} (${profile.pub})`);
                    if (!profile.pub || !profile.epub) {
                        console.error("❌ Zen Sync failed: Missing core cryptographic fields!", profile);
                        return reject(new Error("Missing core cryptographic fields"));
                    }
                    if (!profile.alias) {
                        console.warn("⚠️ Zen Sync: Alias is missing (peers might not be connected yet). Using default.");
                    }

                    API.syncGunUser(profile.pub, profile.epub, profile.alias).catch(e => {
                        console.error("❌ Backend sync failed:", e);
                    });
                    resolve(profile);
                }
            });
        });
    },

    loginWithPair: (pair: any, alias?: string): Promise<ZenProfile> => {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Zen Re-authentication Timeout: Could not reach peers"));
            }, 20000);

            const peerKeys = Object.keys((zen as any)?._?.opt?.peers || {});
            const connectedPeers = peerKeys.filter(k => {
                const p = (zen as any)._?.opt?.peers[k];
                const conn = p?.wire || p?.socket || p?.conn;
                return conn && (conn.readyState === 1 || conn.readyState === 'open');
            }).length;
            
            console.log(`📡 Zen Pair-Auth attempt. Connected peers: ${connectedPeers} total, ${peerKeys.length} known.`);

            // Pass explicit alias if available to avoid losing it in ZenUser.auth
            (user.auth as any)(pair, null, (ack: any) => {
                clearTimeout(timeout);
                if (ack.err) {
                    reject(new Error(ack.err));
                } else {
                    const profile = {
                        pub: user.is!.pub as string,
                        alias: user.is!.alias as string,
                        epub: (user.is as any).epub as string
                    };
                    // Sync with backend
                    console.log(`📡 Syncing (pair) user with backend: ${profile.alias} (${profile.pub})`);
                    if (!profile.pub || !profile.epub) {
                        console.error("❌ Zen Sync failed: Missing core cryptographic fields!", profile);
                        return reject(new Error("Missing core cryptographic fields"));
                    }
                    if (!profile.alias) {
                        console.warn("⚠️ Zen Sync: Alias is missing (peers might not be connected yet). Using default.");
                    }

                    API.syncGunUser(profile.pub, profile.epub, profile.alias).catch(e => {
                        console.error("❌ Backend (pair) sync failed:", e);
                    });
                    resolve(profile);
                }
            }, alias);
        });
    },

    logout: () => {
        user.leave();
    },

    // Example crypto helpers (signing)
    sign: async (data: any) => {
        if (!user.is) throw new Error("Not logged in");
        // Use static ZEN methods directly
        return await (ZEN as any).sign(data, (user as any)._pair);
    },

    verify: async (data: any, pub: string) => {
        return await (ZEN as any).verify(data, pub);
    },

    /**
     * Update the user's alias/username
     */
    updateAlias: async (newAlias: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));
            user.get('alias').put(newAlias, (ack: any) => {
                if (ack.err) reject(new Error(ack.err));
                else {
                    const profile = ZenAuth.getProfile();
                    if (profile) {
                        API.syncGunUser(profile.pub, profile.epub, newAlias).catch(console.error);
                    }
                    resolve();
                }
            });
        });
    },

    /**
     * Subscribe to profile changes
     */
    subscribeProfile: (cb: (profile: any) => void): (() => void) => {
        if (!user.is) return () => { };
        const chain = user.get('profile');
        if (!chain || typeof chain.on !== 'function') {
            console.warn("⚠️ [ZenAuth] Could not subscribe to profile: chain is invalid");
            return () => { };
        }
        const ref = chain.on((data: any) => {
            cb(data);
        });
        return () => {
            if (ref && (ref as any).off) (ref as any).off();
        };
    },

    /**
     * Subscribe to mutable alias changes
     */
    subscribeAlias: (cb: (alias: string) => void): (() => void) => {
        if (!user.is) return () => { };
        const chain = user.get('alias');
        if (!chain || typeof chain.on !== 'function') {
            console.warn("⚠️ [ZenAuth] Could not subscribe to alias: chain is invalid");
            return () => { };
        }
        const ref = chain.on((data: any) => {
            if (typeof data === 'string') {
                cb(data);
            }
        });
        return () => {
            if (ref && (ref as any).off) (ref as any).off();
        };
    },

    /**
     * Update extra profile data (avatar, bio)
     */
    updateProfile: async (data: { avatar?: string; bio?: string }): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            // Validate data size for Zen (avatars can be large)
            if (data.avatar && data.avatar.length > 1024 * 1024) {
                return reject(new Error('Avatar image is too large (max 1MB)'));
            }

            user.get('profile').put(data, (ack: any) => {
                if (ack.err) {
                    console.error("Zen profile update error:", ack.err);
                    reject(new Error(ack.err));
                } else {
                    resolve();
                }
            });
        });
    }
};

// ============================================================
// Zen Social — Likes/Favorites
// ============================================================

export const ZenSocial = {
    /**
     * Toggle like status for a track
     */
    toggleLikeTrack: async (track: Track): Promise<boolean> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            const likeNode = user.get('likes').get(track.id);
            likeNode.once((data: any) => {
                if (data) {
                    // Already liked, so remove it
                    likeNode.put(null as any, (ack: any) => {
                        if (ack.err) reject(new Error(ack.err));
                        else resolve(false);
                    });
                } else {
                    // Not liked, add it
                    const likedTrackData = {
                        id: track.id,
                        title: track.title,
                        artistName: track.artistName || '',
                        albumName: track.albumName || '',
                        albumId: track.albumId || '',
                        duration: track.duration || 0,
                        likedAt: Date.now()
                    };
                    likeNode.put(likedTrackData, (ack: any) => {
                        if (ack.err) reject(new Error(ack.err));
                        else resolve(true);
                    });
                }
            });
        });
    },

    /**
     * Check if a track is liked
     */
    isLiked: (trackId: string): Promise<boolean> => {
        return new Promise((resolve) => {
            if (!user.is) return resolve(false);
            user.get('likes').get(trackId).once((data: any) => {
                resolve(!!data);
            });
        });
    },

    /**
     * Get all tracks liked by the user
     */
    getLikedTracks: (): Promise<any[]> => {
        return new Promise((resolve) => {
            if (!user.is) return resolve([]);
            const liked: any[] = [];
            user.get('likes').map().once((data: any, id: string) => {
                if (data && id) {
                    liked.push(data);
                }
            });
            setTimeout(() => {
                liked.sort((a, b) => b.likedAt - a.likedAt);
                resolve(liked);
            }, 1000);
        });
    }
};

// ============================================================
// Zen Playlists Service — User playlists stored in Zen
// ============================================================

const PLAYLISTS_NODE = 'tunecamp-playlists';

function generateId(): string {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Local cache for recently created/updated playlists to avoid Zen latency
const playlistCache: Record<string, UserPlaylist> = {};

export const ZenPlaylists = {

    /**
     * Create a new playlist
     */
    createPlaylist: (name: string, description?: string, isPublic: boolean = false, coverUrl?: string): Promise<UserPlaylist> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            const id = generateId();
            const now = Date.now();
            const playlist = {
                id,
                name,
                description: description || '',
                coverUrl: coverUrl || '',
                ownerPub: user.is.pub as string,
                ownerAlias: user.is.alias as string,
                isPublic,
                createdAt: now,
                updatedAt: now,
                tracksJson: '[]' // Store tracks as JSON string for Zen compatibility
            };

            let resolved = false;
            const playlistNode = user.get(PLAYLISTS_NODE).get(id);
            const fullPlaylist = { ...playlist, tracks: [], trackCount: 0 };
            
            // Cache immediately for instant navigation
            playlistCache[id] = fullPlaylist;

            playlistNode.put(playlist, (ack: any) => {
                if (resolved) return;
                if (ack.err) {
                    console.warn("Zen createPlaylist ack error (ignoring):", ack.err);
                } else {
                    resolved = true;
                    if (isPublic) {
                        zen.get('tunecamp-public-playlists').get(id).put(playlistNode);
                    }
                    resolve(fullPlaylist);
                }
            });
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    if (isPublic) {
                        zen.get('tunecamp-public-playlists').get(id).put(playlistNode);
                    }
                    resolve(fullPlaylist);
                }
            }, 3000);
        });
    },

    /**
     * Get all playlists for the current user
     */
    getMyPlaylists: (): Promise<UserPlaylist[]> => {
        return new Promise((resolve) => {
            if (!user.is) return resolve([]);

            const playlists: UserPlaylist[] = [];
            const seen = new Set<string>();

            user.get(PLAYLISTS_NODE).map().once((data: any, key: string) => {
                if (!data || !data.id || seen.has(key)) return;
                seen.add(key);

                let tracks: UserPlaylistTrack[] = [];
                try {
                    if (data.tracksJson && typeof data.tracksJson === 'string') {
                        tracks = JSON.parse(data.tracksJson);
                    }
                } catch { /* ignore parse errors */ }

                playlists.push({
                    id: data.id,
                    name: data.name || 'Untitled',
                    description: data.description || '',
                    coverUrl: data.coverUrl || '',
                    ownerPub: data.ownerPub || '',
                    ownerAlias: data.ownerAlias || '',
                    isPublic: data.isPublic || false,
                    createdAt: data.createdAt || 0,
                    updatedAt: data.updatedAt || 0,
                    tracks,
                    trackCount: tracks.length
                });
            });

            // Zen's .map().once() is async; wait a bit then resolve
            setTimeout(() => {
                playlists.sort((a, b) => b.updatedAt - a.updatedAt);
                resolve(playlists);
            }, 1500);
        });
    },

    /**
     * Get all public playlists from the community
     */
    getPublicPlaylists: (): Promise<UserPlaylist[]> => {
        return new Promise((resolve) => {
            const playlists: UserPlaylist[] = [];
            const seen = new Set<string>();

            zen.get('tunecamp-public-playlists').map().once((data: any, key: string) => {
                if (!data || !data.id || seen.has(key)) return;
                seen.add(key);

                let tracks: UserPlaylistTrack[] = [];
                try {
                    if (data.tracksJson && typeof data.tracksJson === 'string') {
                        tracks = JSON.parse(data.tracksJson);
                    }
                } catch { /* ignore parse errors */ }

                playlists.push({
                    id: data.id,
                    name: data.name || 'Untitled',
                    description: data.description || '',
                    coverUrl: data.coverUrl || '',
                    ownerPub: data.ownerPub || '',
                    ownerAlias: data.ownerAlias || '',
                    isPublic: true,
                    createdAt: data.createdAt || 0,
                    updatedAt: data.updatedAt || 0,
                    tracks,
                    trackCount: tracks.length
                });
            });

            setTimeout(() => {
                playlists.sort((a, b) => b.updatedAt - a.updatedAt);
                resolve(playlists);
            }, 1500);
        });
    },

    /**
     * Get a single playlist by ID
     */
    getPlaylist: (id: string): Promise<UserPlaylist | null> => {
        // Return from cache if we just created/updated it
        if (playlistCache[id]) {
            console.log(`[Playlist] Returning ${id} from local cache`);
            return Promise.resolve(playlistCache[id]);
        }

        return new Promise((resolve) => {
            let timeoutId: any;
            let bestData: any = null;
            let resolved = false;
            const listeners: any[] = [];

            const processData = (data: any) => {
                if (resolved) return;
                resolved = true;

                if (timeoutId) clearTimeout(timeoutId);
                // Clean up listeners
                listeners.forEach(ev => {
                    if (typeof ev === 'function') ev(); // Some ZEN events are functions
                    else if (ev && ev.off) ev.off();
                });

                let tracks: UserPlaylistTrack[] = [];
                try {
                    if (data.tracksJson && typeof data.tracksJson === 'string') {
                        tracks = JSON.parse(data.tracksJson);
                    }
                } catch { /* ignore */ }

                const result: UserPlaylist = {
                    id: data.id || id,
                    name: data.name || 'Untitled',
                    description: data.description || '',
                    coverUrl: data.coverUrl || '',
                    ownerPub: data.ownerPub || '',
                    ownerAlias: data.ownerAlias || '',
                    isPublic: data.isPublic || false,
                    createdAt: data.createdAt || Date.now(),
                    updatedAt: data.updatedAt || Date.now(),
                    tracks,
                    trackCount: tracks.length
                };

                // Store in cache for next time
                playlistCache[id] = result;
                resolve(result);
            };

            const handleData = (data: any, ev: any) => {
                if (!data || resolved) return;
                if (ev && !listeners.includes(ev)) listeners.push(ev);

                // Merge data fields since Zen might emit them separately
                bestData = { ...bestData, ...data };

                // Only resolve early if it feels complete enough (has name)
                // We've relaxed this check: id or name is enough to identify a playlist node
                if (bestData.id && bestData.name) {
                    processData(bestData);
                }
            };

            // 0) Try a ONE-SHOT local lookup first
            if (user.is) {
                user.get(PLAYLISTS_NODE).get(id).once((d: any) => {
                    if (d && d.id && d.name) handleData(d, null);
                });
            }

            // 1) Try fetching from the global public edge index
            zen.get('tunecamp-public-playlists').get(id).on((data: any, _key: any, _msg: any, ev: any) => {
                handleData(data, ev);
            });

            // 2) Fallback: if user is logged in, fetch from personal graph concurrently
            if (user.is) {
                user.get(PLAYLISTS_NODE).get(id).on((personalData: any, _key: any, _msg: any, ev: any) => {
                    handleData(personalData, ev);
                });
            }

            // Timeout fallback
            timeoutId = setTimeout(() => {
                if (!resolved) {
                    if (bestData && (bestData.id || bestData.name)) {
                        console.log(`[Playlist] Timer expired for ${id}, resolving with partial data`);
                        processData(bestData);
                    } else {
                        console.warn(`[Playlist] Resolution timeout for ${id}`);
                        resolved = true;
                        listeners.forEach(ev => {
                            if (typeof ev === 'function') ev();
                            else if (ev && ev.off) ev.off();
                        });
                        resolve(null);
                    }
                }
            }, 5000);
        });
    },

    /**
     * Update playlist metadata
     */
    updatePlaylist: (id: string, updates: { name?: string; description?: string; isPublic?: boolean; coverUrl?: string }): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            const updateData: any = { updatedAt: Date.now() };
            if (updates.name !== undefined) updateData.name = updates.name;
            if (updates.description !== undefined) updateData.description = updates.description;
            if (updates.isPublic !== undefined) updateData.isPublic = updates.isPublic;
            if (updates.coverUrl !== undefined) updateData.coverUrl = updates.coverUrl;

            let resolved = false;
            const playlistNode = user.get(PLAYLISTS_NODE).get(id);
            playlistNode.put(updateData, (ack: any) => {
                if (resolved) return;
                if (ack.err) {
                    console.warn("Zen updatePlaylist ack error (ignoring):", ack.err);
                } else {
                    resolved = true;
                    if (updates.isPublic !== undefined) {
                        if (updates.isPublic) {
                            zen.get('tunecamp-public-playlists').get(id).put(playlistNode);
                        } else {
                            // To remove an edge in Zen, you set it to null
                            zen.get('tunecamp-public-playlists').get(id).put(null as any);
                        }
                    }
                    resolve();
                }
            });
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    if (updates.isPublic !== undefined) {
                        if (updates.isPublic) {
                            zen.get('tunecamp-public-playlists').get(id).put(playlistNode);
                        } else {
                            zen.get('tunecamp-public-playlists').get(id).put(null as any);
                        }
                    }
                    resolve();
                }
            }, 3000);
        });
    },

    /**
     * Delete a playlist
     */
    deletePlaylist: (id: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            let resolved = false;
            user.get(PLAYLISTS_NODE).get(id).put(null, (ack: any) => {
                if (resolved) return;
                if (ack.err) {
                    console.warn("Zen deletePlaylist ack error (ignoring):", ack.err);
                } else {
                    resolved = true;
                    resolve();
                }
            });
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            }, 3000);
        });
    },

    /**
     * Add a track to a playlist
     */
    addTrackToPlaylist: (playlistId: string, track: UserPlaylistTrack): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            user.get(PLAYLISTS_NODE).get(playlistId).once((data: any) => {
                if (!data || !data.id) return reject(new Error('Playlist not found'));

                let tracks: UserPlaylistTrack[] = [];
                try {
                    if (data.tracksJson && typeof data.tracksJson === 'string') {
                        tracks = JSON.parse(data.tracksJson);
                    }
                } catch { /* ignore */ }

                // Ensure the track has an ID
                if (!track.id) track.id = generateId();
                track.addedAt = Date.now();

                tracks.push(track);

                let resolved = false;
                user.get(PLAYLISTS_NODE).get(playlistId).put({
                    tracksJson: JSON.stringify(tracks),
                    updatedAt: Date.now()
                }, (ack: any) => {
                    if (resolved) return;
                    if (ack.err) {
                        console.warn("Zen addTrack ack error (ignoring):", ack.err);
                    } else {
                        resolved = true;
                        resolve();
                    }
                });
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                }, 3000);
            });
        });
    },

    /**
     * Remove a track from a playlist
     */
    removeTrackFromPlaylist: (playlistId: string, trackId: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));

            user.get(PLAYLISTS_NODE).get(playlistId).once((data: any) => {
                if (!data || !data.id) return reject(new Error('Playlist not found'));

                let tracks: UserPlaylistTrack[] = [];
                try {
                    if (data.tracksJson && typeof data.tracksJson === 'string') {
                        tracks = JSON.parse(data.tracksJson);
                    }
                } catch { /* ignore */ }

                tracks = tracks.filter(t => t.id !== trackId);

                let resolved = false;
                user.get(PLAYLISTS_NODE).get(playlistId).put({
                    tracksJson: JSON.stringify(tracks),
                    updatedAt: Date.now()
                }, (ack: any) => {
                    if (resolved) return;
                    if (ack.err) {
                        console.warn("Zen removeTrack ack error (ignoring):", ack.err);
                    } else {
                        resolved = true;
                        resolve();
                    }
                });
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                }, 3000);
            });
        });
    }
};

