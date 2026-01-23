import Gun from "gun";
import type { DatabaseService, Album, Track } from "./database.js";

// Public GunDB peers for the community registry
const REGISTRY_PEERS = [
    "https://gun.defucc.me/gun",
    "https://gun.o8.is/gun",
    "https://shogun-relay.scobrudot.dev/gun",
    "https://relay.peer.ooo/gun",
];

const REGISTRY_ROOT = "shogun";
const REGISTRY_NAMESPACE = "tunecamp-community";
const REGISTRY_VERSION = "1.0";

export interface SiteInfo {
    url: string;
    title: string;
    description?: string;
    artistName?: string;
    coverImage?: string;
}

export interface UserProfile {
    pubKey: string;
    username: string;
    createdAt: number;
    avatar?: string;
}

export interface Comment {
    id: string;
    trackId: number;
    pubKey: string;
    username: string;
    text: string;
    signature?: string;
    createdAt: number;
}

export interface GunDBService {
    init(): Promise<boolean>;
    registerSite(siteInfo: SiteInfo): Promise<boolean>;
    registerTracks(siteInfo: SiteInfo, album: Album, tracks: Track[]): Promise<boolean>;
    unregisterTracks(siteInfo: SiteInfo, album: Album): Promise<boolean>;
    // Download stats
    getDownloadCount(releaseSlug: string): Promise<number>;
    incrementDownloadCount(releaseSlug: string): Promise<number>;
    getTrackDownloadCount(releaseSlug: string, trackId: string): Promise<number>;
    incrementTrackDownloadCount(releaseSlug: string, trackId: string): Promise<number>;
    // Community exploration
    getCommunitySites(): Promise<any[]>;
    getCommunityTracks(): Promise<any[]>;
    // User profiles
    registerUser(pubKey: string, username: string): Promise<boolean>;
    getUser(pubKey: string): Promise<UserProfile | null>;
    getUserByUsername(username: string): Promise<UserProfile | null>;
    // Comments
    addComment(trackId: number, data: { pubKey: string; username: string; text: string; signature?: string }): Promise<Comment | null>;
    getComments(trackId: number): Promise<Comment[]>;
    deleteComment(commentId: string, pubKey: string): Promise<boolean>;
}

/**
 * Generate a unique site ID from title + artist (content-based)
 */
// Replaced by persistent ID logic in createGunDBService


/**
 * Generate a slug for track identification
 */
function generateTrackSlug(albumTitle: string, trackTitle: string): string {
    return (albumTitle + "-" + (trackTitle || "untitled"))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

export function createGunDBService(database: DatabaseService): GunDBService {
    let gun: any = null;
    let initialized = false;

    async function init(): Promise<boolean> {
        try {
            gun = Gun({
                peers: REGISTRY_PEERS,
                radisk: false, // Disable radisk for server
            });

            initialized = true;
            console.log("🌐 GunDB Community Registry initialized");

            // Start background cleanup task (every 12 hours)
            setInterval(cleanupNetwork, 12 * 60 * 60 * 1000);

            return true;
        } catch (error) {
            console.error("Failed to initialize GunDB:", error);
            return false;
        }
    }

    async function registerSite(siteInfo: SiteInfo): Promise<boolean> {
        if (!initialized || !gun) {
            console.warn("GunDB not initialized");
            return false;
        }

        // Skip non-HTTPS URLs in production
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
            registeredAt: now,
            lastSeen: now,
            version: REGISTRY_VERSION,
            type: "server", // Indicate this is a server instance
        };

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(REGISTRY_NAMESPACE)
                .get("sites")
                .get(siteId)
                .put(siteRecord, (ack: any) => {
                    if (ack.err) {
                        console.warn("Failed to register site:", ack.err);
                        resolve(false);
                    } else {
                        console.log("✅ Server registered in Tunecamp Community");
                        resolve(true);
                    }
                });

            // Timeout fallback
            setTimeout(() => resolve(true), 3000);
        });
    }

    async function registerTracks(
        siteInfo: SiteInfo,
        album: Album,
        tracks: Track[]
    ): Promise<boolean> {
        if (!initialized || !gun || !tracks || tracks.length === 0) {
            return false;
        }

        const siteId = await getPersistentSiteId(siteInfo);
        const baseUrl = siteInfo.url;
        const now = Date.now();

        const tracksRef = gun
            .get(REGISTRY_ROOT)
            .get(REGISTRY_NAMESPACE)
            .get("sites")
            .get(siteId)
            .get("tracks");

        // Get artist name
        const artistName = album.artist_name || siteInfo.artistName || "";

        // Register each track
        for (const track of tracks) {
            const trackSlug = generateTrackSlug(album.title, track.title);

            // Build streaming URL - ensure no double slashes
            const cleanBaseUrl = baseUrl.replace(/\/$/, "");
            const audioUrl = `${cleanBaseUrl}/api/tracks/${track.id}/stream`;

            // Build cover URL
            const coverUrl = album.id ? `${cleanBaseUrl}/api/albums/${album.id}/cover` : "";

            const trackData = {
                title: track.title || "Untitled",
                audioUrl: audioUrl,
                duration: track.duration || 0,
                releaseTitle: album.title || "Unknown Release",
                artistName: artistName,
                coverUrl: coverUrl,
                siteUrl: cleanBaseUrl,
                addedAt: now,
            };

            tracksRef.get(trackSlug).put(trackData);
        }

        console.log(`🎵 Registered ${tracks.length} tracks from "${album.title}" to community`);
        return true;
    }

    async function unregisterTracks(
        siteInfo: SiteInfo,
        album: Album
    ): Promise<boolean> {
        if (!initialized || !gun) {
            return false;
        }

        const siteId = await getPersistentSiteId(siteInfo);
        const tracks = database.getTracks(album.id);

        const tracksRef = gun
            .get(REGISTRY_ROOT)
            .get(REGISTRY_NAMESPACE)
            .get("sites")
            .get(siteId)
            .get("tracks");

        // Remove each track
        for (const track of tracks) {
            const trackSlug = generateTrackSlug(album.title, track.title);
            tracksRef.get(trackSlug).put(null);
        }

        console.log(`🗑️ Unregistered tracks from "${album.title}" from community`);
        return true;
    }

    // Download Stats namespace
    const STATS_NAMESPACE = "tunecamp-stats";

    async function getDownloadCount(releaseSlug: string): Promise<number> {
        if (!initialized || !gun) return 0;

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(STATS_NAMESPACE)
                .get("releases")
                .get(releaseSlug)
                .get("downloads")
                .once((data: any) => {
                    resolve(data ? parseInt(data, 10) || 0 : 0);
                });

            // Timeout fallback
            setTimeout(() => resolve(0), 3000);
        });
    }

    async function incrementDownloadCount(releaseSlug: string): Promise<number> {
        if (!initialized || !gun) return 0;

        const currentCount = await getDownloadCount(releaseSlug);
        const newCount = currentCount + 1;

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(STATS_NAMESPACE)
                .get("releases")
                .get(releaseSlug)
                .get("downloads")
                .put(newCount, (ack: any) => {
                    if (ack.err) {
                        console.error("Error incrementing download count:", ack.err);
                        resolve(currentCount);
                    } else {
                        resolve(newCount);
                    }
                });

            // Timeout fallback
            setTimeout(() => resolve(newCount), 2000);
        });
    }

    async function getTrackDownloadCount(releaseSlug: string, trackId: string): Promise<number> {
        if (!initialized || !gun) return 0;

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(STATS_NAMESPACE)
                .get("releases")
                .get(releaseSlug)
                .get("tracks")
                .get(trackId)
                .get("downloads")
                .once((data: any) => {
                    resolve(data ? parseInt(data, 10) || 0 : 0);
                });

            // Timeout fallback
            setTimeout(() => resolve(0), 3000);
        });
    }

    async function incrementTrackDownloadCount(releaseSlug: string, trackId: string): Promise<number> {
        if (!initialized || !gun) return 0;

        const currentCount = await getTrackDownloadCount(releaseSlug, trackId);
        const newCount = currentCount + 1;

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(STATS_NAMESPACE)
                .get("releases")
                .get(releaseSlug)
                .get("tracks")
                .get(trackId)
                .get("downloads")
                .put(newCount, (ack: any) => {
                    if (ack.err) {
                        console.error("Error incrementing track download count:", ack.err);
                        resolve(currentCount);
                    } else {
                        resolve(newCount);
                    }
                });

            // Timeout fallback
            setTimeout(() => resolve(newCount), 2000);
        });
    }

    async function getCommunitySites(): Promise<any[]> {
        if (!initialized || !gun) return [];

        return new Promise((resolve) => {
            const sites: any[] = [];

            gun
                .get(REGISTRY_ROOT)
                .get(REGISTRY_NAMESPACE)
                .get("sites")
                .map()
                .once((siteData: any, siteId: string) => {
                    if (siteData && siteData.url && siteId !== "_") {
                        sites.push({
                            id: siteId,
                            ...siteData
                        });
                    }
                });

            // Wait for data to collect
            setTimeout(() => resolve(sites), 3000);
        });
    }

    async function getCommunityTracks(): Promise<any[]> {
        if (!initialized || !gun) return [];

        return new Promise((resolve) => {
            const tracks: any[] = [];

            // Iterate through all sites and their tracks
            gun
                .get(REGISTRY_ROOT)
                .get(REGISTRY_NAMESPACE)
                .get("sites")
                .map()
                .get("tracks")
                .map()
                .once((trackData: any, trackSlug: string) => {
                    if (trackData && trackData.audioUrl && trackSlug !== "_") {
                        tracks.push({
                            slug: trackSlug,
                            ...trackData
                        });
                    }
                });

            // Wait for data to collect
            setTimeout(() => resolve(tracks), 4000);
        });
    }

    // User profiles namespace
    const USERS_NAMESPACE = "tunecamp-users";

    async function registerUser(pubKey: string, username: string): Promise<boolean> {
        if (!initialized || !gun) return false;

        const now = Date.now();
        const userRecord: UserProfile = {
            pubKey,
            username,
            createdAt: now,
        };

        return new Promise((resolve) => {
            // Store user by pubKey
            gun
                .get(REGISTRY_ROOT)
                .get(USERS_NAMESPACE)
                .get("byPubKey")
                .get(pubKey)
                .put(userRecord, (ack: any) => {
                    if (ack.err) {
                        console.warn("Failed to register user:", ack.err);
                        resolve(false);
                    }
                });

            // Also store username -> pubKey mapping
            gun
                .get(REGISTRY_ROOT)
                .get(USERS_NAMESPACE)
                .get("byUsername")
                .get(username.toLowerCase())
                .put({ pubKey, username }, (ack: any) => {
                    if (ack.err) {
                        resolve(false);
                    } else {
                        console.log(`👤 User registered: ${username}`);
                        resolve(true);
                    }
                });

            // Timeout fallback
            setTimeout(() => resolve(true), 3000);
        });
    }

    async function getUser(pubKey: string): Promise<UserProfile | null> {
        if (!initialized || !gun) return null;

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(USERS_NAMESPACE)
                .get("byPubKey")
                .get(pubKey)
                .once((data: any) => {
                    if (data && data.username) {
                        resolve({
                            pubKey: data.pubKey || pubKey,
                            username: data.username,
                            createdAt: data.createdAt || 0,
                            avatar: data.avatar,
                        });
                    } else {
                        resolve(null);
                    }
                });

            setTimeout(() => resolve(null), 3000);
        });
    }

    async function getUserByUsername(username: string): Promise<UserProfile | null> {
        if (!initialized || !gun) return null;

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(USERS_NAMESPACE)
                .get("byUsername")
                .get(username.toLowerCase())
                .once(async (data: any) => {
                    if (data && data.pubKey) {
                        const user = await getUser(data.pubKey);
                        resolve(user);
                    } else {
                        resolve(null);
                    }
                });

            setTimeout(() => resolve(null), 3000);
        });
    }

    // Comments namespace
    const COMMENTS_NAMESPACE = "tunecamp-comments";

    async function addComment(
        trackId: number,
        data: { pubKey: string; username: string; text: string; signature?: string }
    ): Promise<Comment | null> {
        if (!initialized || !gun) return null;

        const commentId = `${trackId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();

        // GunDB doesn't accept undefined values, so use empty string for optional fields
        const comment: Comment = {
            id: commentId,
            trackId,
            pubKey: data.pubKey || "",
            username: data.username || "Anonymous",
            text: data.text,
            signature: data.signature || "",
            createdAt: now,
        };

        return new Promise((resolve) => {
            gun
                .get(REGISTRY_ROOT)
                .get(COMMENTS_NAMESPACE)
                .get(`track-${trackId}`)
                .get(commentId)
                .put(comment, (ack: any) => {
                    if (ack.err) {
                        console.warn("Failed to add comment:", ack.err);
                        resolve(null);
                    } else {
                        console.log(`💬 Comment added on track ${trackId}`);
                        resolve(comment);
                    }
                });

            setTimeout(() => resolve(comment), 2000);
        });
    }

    async function getComments(trackId: number): Promise<Comment[]> {
        if (!initialized || !gun) return [];

        return new Promise((resolve) => {
            const comments: Comment[] = [];

            gun
                .get(REGISTRY_ROOT)
                .get(COMMENTS_NAMESPACE)
                .get(`track-${trackId}`)
                .map()
                .once((data: any, id: string) => {
                    if (data && data.text && id !== "_") {
                        comments.push({
                            id: data.id || id,
                            trackId: data.trackId || trackId,
                            pubKey: data.pubKey || "",
                            username: data.username || "Anonymous",
                            text: data.text,
                            signature: data.signature,
                            createdAt: data.createdAt || 0,
                        });
                    }
                });

            // Wait for data to collect, then sort by time
            setTimeout(() => {
                comments.sort((a, b) => b.createdAt - a.createdAt);
                resolve(comments);
            }, 2000);
        });
    }

    async function deleteComment(commentId: string, pubKey: string): Promise<boolean> {
        if (!initialized || !gun) return false;

        // Extract trackId from commentId
        const parts = commentId.split("-");
        const trackId = parts[0];

        return new Promise((resolve) => {
            // First check ownership
            gun
                .get(REGISTRY_ROOT)
                .get(COMMENTS_NAMESPACE)
                .get(`track-${trackId}`)
                .get(commentId)
                .once((data: any) => {
                    if (!data || data.pubKey !== pubKey) {
                        resolve(false);
                        return;
                    }

                    // Delete by setting to null
                    gun
                        .get(REGISTRY_ROOT)
                        .get(COMMENTS_NAMESPACE)
                        .get(`track-${trackId}`)
                        .get(commentId)
                        .put(null, (ack: any) => {
                            if (ack.err) {
                                resolve(false);
                            } else {
                                console.log(`🗑️ Comment deleted: ${commentId}`);
                                resolve(true);
                            }
                        });
                });

            setTimeout(() => resolve(false), 3000);
        });
    }

    return {
        init,
        registerSite,
        registerTracks,
        unregisterTracks,
        getDownloadCount,
        incrementDownloadCount,
        getTrackDownloadCount,
        incrementTrackDownloadCount,
        getCommunitySites,
        getCommunityTracks,
        // User profiles
        registerUser,
        getUser,
        getUserByUsername,
        // Comments
        addComment,
        getComments,
        deleteComment,
    };

    /**
     * Get or create a persistent Site ID
     */
    async function getPersistentSiteId(siteInfo: SiteInfo): Promise<string> {
        // Try to get from settings
        const storedId = database.getSetting("siteId");
        if (storedId) return storedId;

        // Generate new one (compatible with old logic if possible, or just random)
        // usage of old logic for migration if title/artist match? 
        // Better to just generate a robust one now.
        const identifier = `${(siteInfo.title || "untitled").toLowerCase().trim()}::${(siteInfo.artistName || "unknown").toLowerCase().trim()}::${Date.now()}`;
        let hash = 0;
        for (let i = 0; i < identifier.length; i++) {
            const char = identifier.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        const newId = Math.abs(hash).toString(36) + Math.random().toString(36).substr(2, 5);

        // Save it
        database.setSetting("siteId", newId);
        console.log(`🆔 Generated new persistent Site ID: ${newId}`);
        return newId;
    }

    /**
     * Background task to clean up invalid tracks from the network
     * This compares what we are advertising on GunDB with what is actually in our database (public)
     */
    async function cleanupNetwork() {
        if (!initialized || !gun) return;

        try {
            // we need site id, but we might not have siteInfo handy here. 
            // We can reconstruct minimal siteInfo from settings
            const publicUrl = database.getSetting("publicUrl");
            if (!publicUrl) return; // Not public, nothing to clean (or should we clean everything?)

            const siteName = database.getSetting("siteName") || "TuneCamp Server";
            const artistName = database.getSetting("artistName") || "";

            const siteInfo = { url: publicUrl, title: siteName, artistName };
            const siteId = await getPersistentSiteId(siteInfo);

            console.log("🧹 Starting network cleanup check...");

            // Get all public tracks from our DB
            const publicAlbums = database.getAlbums(true);
            const validTrackSlugs = new Set<string>();

            for (const album of publicAlbums) {
                const tracks = database.getTracks(album.id);
                for (const track of tracks) {
                    validTrackSlugs.add(generateTrackSlug(album.title, track.title));
                }
            }

            // Check GunDB
            const tracksRef = gun
                .get(REGISTRY_ROOT)
                .get(REGISTRY_NAMESPACE)
                .get("sites")
                .get(siteId)
                .get("tracks");

            tracksRef.map().once((data: any, key: string) => {
                if (key === '_' || !data) return;

                // If this track key is NOT in our valid list, remove it
                if (!validTrackSlugs.has(key)) {
                    console.log(`🧹 Removing orphaned track from network: ${key}`);
                    tracksRef.get(key).put(null);
                }
            });

        } catch (error) {
            console.error("Error in network cleanup:", error);
        }
    }
}
