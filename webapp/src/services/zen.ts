import ZEN from 'zen';


// Remove redundant imports as ZEN includes everything needed
import { DEFAULT_ZEN_PEERS } from '../../../src/common/zen-config';
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
    localStorage: false, // Fix: disable localStorage to prevent QuotaExceededError and main-thread freezes when graph grows > 5MB
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

// ZenAuth removed (Phase 1). Use username+password JWT auth instead.
// Export kept as empty stub so old imports don't crash at runtime.
export const ZenAuth = {
    init: async () => null,
    isLoggedIn: () => false,
    getProfile: () => null,
    register: async (_u: string, _p: string) => {},
    login: async (_u: string, _p: string) => {},
    loginWithPair: async (_pair: any) => { throw new Error("Pair login removed"); },
    logout: () => {},
    sign: async (_data: any) => { throw new Error("ZenAuth removed"); },
    verify: async (_data: any, _pub: string) => false,
    updateAlias: async (_alias: string) => {},
    subscribeProfile: (_cb: any) => () => {},
    subscribeAlias: (_cb: any) => () => {},
    updateProfile: async (_data: any) => {},
};


// ============================================================
// Zen Social — Likes/Favorites
// ============================================================

export const ZenSocial = {
    /**
     * Toggle like status for a track
     */
    likeTrack: async (track: Track): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));
            const likedTrackData = {
                id: track.id,
                title: track.title,
                artistName: track.artistName || '',
                albumName: track.albumName || '',
                albumId: track.albumId || '',
                duration: track.duration || 0,
                likedAt: Date.now()
            };
            user.get('likes').get(String(track.id)).put(likedTrackData, (ack: any) => {
                if (ack.err) reject(new Error(ack.err));
                else resolve();
            });
        });
    },

    unlikeTrack: async (trackId: string | number): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (!user.is) return reject(new Error('Not logged in'));
            user.get('likes').get(String(trackId)).put(null as any, (ack: any) => {
                if (ack.err) reject(new Error(ack.err));
                else resolve();
            });
        });
    },

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


