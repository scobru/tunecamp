import { Router } from "express";
import type { ZenDBService } from "../../modules/network/zendb.service.js";
import type { DatabaseService } from "../../core/database.js";
import { VisibilityProfile } from "../../common/visibility.js";
import type { ServerConfig } from "../../core/config.js";
import { createCatalogCacheService } from "../../modules/network/catalog-cache.service.js";
import { getSiteHandle } from "../../core/site-actor.js";

import type { ServiceContainer } from "../../core/container.js";

export function createStatsRoutes(container: ServiceContainer): Router {
    const zendbService: ServiceContainer['zendbService'] = (container as any).zendbService || (container as any);
    const dbService: ServiceContainer['database'] = (container as any).database || (container as any);
    const config: ServiceContainer['config'] = (container as any).config || (container as any);
    const catalogCache = createCatalogCacheService(dbService.db);
    const router = Router();

    /**
     * GET /api/stats/release/:slug
     * Get download count for a release (local SQLite)
     */
    router.get("/release/:slug", (req, res) => {
        try {
            const slug = req.params.slug;
            const count = dbService.getReleaseDownloadCount(slug);
            res.json({ slug, downloads: count });
        } catch (error) {
            console.error("Error getting download count:", error);
            res.status(500).json({ error: "Failed to get download count" });
        }
    });

    /**
     * POST /api/stats/release/:slug/download
     * Increment download count for a release (local SQLite)
     */
    router.post("/release/:slug/download", (req, res) => {
        try {
            const slug = req.params.slug;
            const count = dbService.incrementReleaseDownloadCount(slug);
            res.json({ slug, downloads: count });
        } catch (error) {
            console.error("Error incrementing download count:", error);
            res.status(500).json({ error: "Failed to increment download count" });
        }
    });

    /**
     * GET /api/stats/track/:releaseSlug/:trackId
     * Get download count for a specific track (local SQLite, releaseSlug ignored)
     */
    router.get("/track/:releaseSlug/:trackId", (req, res) => {
        try {
            const { releaseSlug, trackId } = req.params;
            const count = dbService.getTrackDownloadCount(Number(trackId));
            res.json({ releaseSlug, trackId, downloads: count });
        } catch (error) {
            console.error("Error getting track download count:", error);
            res.status(500).json({ error: "Failed to get track download count" });
        }
    });

    /**
     * POST /api/stats/track/:releaseSlug/:trackId/download
     * Increment download count for a specific track (local SQLite, releaseSlug ignored)
     */
    router.post("/track/:releaseSlug/:trackId/download", (req, res) => {
        try {
            const { releaseSlug, trackId } = req.params;
            const count = dbService.incrementTrackDownloadCount(Number(trackId));
            res.json({ releaseSlug, trackId, downloads: count });
        } catch (error) {
            console.error("Error incrementing track download count:", error);
            res.status(500).json({ error: "Failed to increment track download count" });
        }
    });

    /**
     * GET /api/stats/track/:releaseSlug/:trackId/plays
     * Get play count for a specific track (local SQLite, releaseSlug ignored)
     */
    router.get("/track/:releaseSlug/:trackId/plays", (req, res) => {
        try {
            const { releaseSlug, trackId } = req.params;
            const count = dbService.getTrackPlayCount(Number(trackId));
            res.json({ releaseSlug, trackId, plays: count });
        } catch (error) {
            console.error("Error getting track play count:", error);
            res.status(500).json({ error: "Failed to get track play count" });
        }
    });

    /**
     * POST /api/stats/track/:releaseSlug/:trackId/play
     * Increment play count for a specific track (local SQLite, releaseSlug ignored)
     */
    router.post("/track/:releaseSlug/:trackId/play", (req, res) => {
        try {
            const { releaseSlug, trackId } = req.params;
            const count = dbService.incrementTrackPlayCount(Number(trackId));
            res.json({ releaseSlug, trackId, plays: count });
        } catch (error) {
            console.error("Error incrementing track play count:", error);
            res.status(500).json({ error: "Failed to increment track play count" });
        }
    });

    /**
     * GET /api/stats/network/sites
     * Get all TuneCamp instances registered in the community (Zen signaling + AP Actors + Local)
     */
    router.get("/network/sites", async (req, res) => {
        try {
            const publicUrl = dbService.getSetting("publicUrl") || config.publicUrl || `http://localhost:${config.port}`;
            
            // 1. Get sites from Zen (signaling — just URLs and basic metadata)
            const gunSites = await zendbService.getCommunitySites();
            const formattedGunSites = gunSites.map(s => ({
                url: s.url,
                name: s.name || s.title || "Untitled",
                description: s.description || "",
                version: s.version || "2.0",
                lastSeen: s.lastSeen,
                coverImage: s.coverImage || null,
                communityLink: s.communityLink || null,
                federation: "zen"
            }));

            // 2. Get actors from ActivityPub (Local DB of remote actors)
            const apActors = dbService.getFollowedActors().filter(a => a.username === 'site' || a.username === getSiteHandle(dbService));
            const formattedApSites = apActors.map(a => ({
                url: a.uri,
                name: a.name || a.username || "AP Actor",
                description: a.summary || "",
                version: "ActivityPub",
                lastSeen: a.last_seen || new Date().toISOString(),
                coverImage: a.icon_url || null,
                federation: "activitypub"
            }));

            // 3. Include local site
            const localSite = {
                url: publicUrl,
                name: dbService.getSetting("siteName") || "Local Instance",
                description: dbService.getSetting("siteDescription") || "My TuneCamp Server",
                version: "2.0 (Local)",
                lastSeen: new Date().toISOString(),
                coverImage: dbService.getSetting("coverImage") || null,
                communityLink: dbService.getSetting("communityLink") || null,
                federation: "local"
            };

            res.json([localSite, ...formattedGunSites, ...formattedApSites]);
        } catch (error) {
            console.error("Error getting community sites:", error);
            res.status(500).json({ error: "Failed to get community sites" });
        }
    });

    router.get("/network/tracks", async (req, res) => {
        try {
            const publicUrl = dbService.getSetting("publicUrl") || config.publicUrl || `http://localhost:${config.port}`;
            const baseUrl = publicUrl.replace(/\/$/, "");

            // 1. Get remote catalogs via HTTP from discovered Zen instances and followed AP site actors
            const gunSites = await zendbService.getCommunitySites();
            
            // Get followed TuneCamp site actors
            const apActors = dbService.getFollowedActors().filter(a => a.username === 'site' || a.username === getSiteHandle(dbService));
            const followedSites = apActors.map(a => {
                try {
                    const origin = new URL(a.uri).origin;
                    return {
                        url: origin,
                        name: a.name || a.username || "Followed Instance",
                        description: a.summary || ""
                    };
                } catch {
                    return null;
                }
            }).filter(Boolean) as any[];

            const myUrl = baseUrl.replace(/\/$/, "");
            const combinedSitesMap = new Map<string, { url: string; name: string; description: string }>();

            const addSite = (site: any) => {
                if (!site.url) return;
                // Allow http or https urls
                if (!site.url.startsWith("https://") && !site.url.startsWith("http://")) return;
                const siteUrl = site.url.replace(/\/$/, "");

                // Allow local development bypass for private IPs
                const allowPrivate = process.env.TUNECAMP_ALLOW_PRIVATE_IP === 'true' || 
                                     (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test');

                if (siteUrl !== myUrl) {
                    if (allowPrivate || (!siteUrl.includes("localhost") && !siteUrl.includes("127.0.0.1"))) {
                        combinedSitesMap.set(siteUrl, {
                            url: siteUrl,
                            name: site.name || site.title || "Untitled",
                            description: site.description || ""
                        });
                    }
                }
            };

            gunSites.forEach(addSite);
            followedSites.forEach(addSite);

            const remoteSites = Array.from(combinedSitesMap.values());
            const httpTracks = await catalogCache.getTracks(remoteSites);

            // 2. Get tracks from ActivityPub (Standard Federation - Remote)
            const remoteApTracks = dbService.getRemoteTracks();
            const apTracks = remoteApTracks.map(content => ({
                slug: content.ap_id,
                title: content.title || "Untitled",
                artistName: content.artist_name || "Unknown Artist",
                releaseTitle: content.album_name || "Unknown Album",
                coverUrl: content.cover_url || null,
                audioUrl: content.stream_url || null,
                duration: content.duration || 0,
                siteUrl: content.url || null,
                pubKey: content.actor_uri,
                federation: (content as any).actor_type === "rss" ? "rss" : "activitypub",
                type: "release"
            }));

            // 3. Get posts from ActivityPub (Standard Federation - Remote)
            const communityDomains = new Set<string>();
            for (const s of gunSites) {
                if (s.url) {
                    try {
                        const hostname = new URL(s.url).hostname;
                        if (hostname) communityDomains.add(hostname);
                    } catch {}
                }
            }

            const actorsWithReleases = new Set(remoteApTracks.map(t => t.actor_uri));
            const remoteActors = dbService.getRemoteActors?.() || [];
            const actorsMap = new Map(remoteActors.map(a => [a.uri, a]));

            const remoteApPosts = dbService.getRemotePosts();
            const filteredApPosts = remoteApPosts.filter(content => {
                const actor = actorsMap.get(content.actor_uri);
                if (!actor) return false;
                
                // 1. Site actors are allowed
                if (actor.username === 'site' || actor.username === getSiteHandle(dbService)) return true;

                // 1b. Followed RSS feeds (podcasts/blogs) are allowed
                if (actor.type === 'rss') return true;

                // 2. Music artists (with releases) are allowed
                if (actorsWithReleases.has(content.actor_uri)) return true;
                
                // 3. Actors belonging to community instance domains are allowed
                try {
                    const hostname = new URL(content.actor_uri).hostname;
                    if (communityDomains.has(hostname)) return true;
                } catch {}
                
                return false;
            });

            const apPosts = filteredApPosts.map(content => ({
                slug: content.ap_id,
                title: content.title || "Untitled Post",
                artistName: content.artist_name || "Unknown Artist",
                content: content.content || "",
                coverUrl: content.cover_url || null,
                siteUrl: content.url || null,
                pubKey: content.actor_uri,
                published_at: content.published_at,
                federation: (content as any).actor_type === "rss" ? "rss" : "activitypub",
                type: "post"
            }));

            // 4. Get local public releases
            const localReleases = dbService.getReleases(VisibilityProfile.PUBLIC_STAGE);
            const formattedLocalReleases = localReleases.map(r => {
                const tracks = dbService.getTracksByReleaseId(r.id);
                const firstTrack = tracks[0];
                return {
                    slug: r.slug,
                    title: r.title,
                    artistName: r.artist_name || "Local Artist",
                    releaseTitle: r.title,
                    coverUrl: r.cover_path ? `${baseUrl}/api/albums/${r.slug}/cover` : null,
                    audioUrl: firstTrack ? `${baseUrl}/api/tracks/${firstTrack.id}/stream` : null,
                    duration: firstTrack?.duration || 0,
                    siteUrl: `${baseUrl}/albums/${r.slug}`,
                    federation: "local",
                    type: "release"
                };
            });

            // 5. Get local public posts
            const publicPosts = dbService.getPublicPosts();
            const localPosts = publicPosts.map(p => ({
                slug: p.slug,
                title: p.content.replace(/<[^>]*>?/gm, '').substring(0, 50),
                artistName: p.artist_name || "Unknown Artist",
                content: p.content,
                coverUrl: p.artist_photo ? `${baseUrl}/api/artists/${p.artist_slug}/cover` : null,
                siteUrl: `${baseUrl}/@${p.artist_slug}?post=${p.slug}`,
                published_at: p.published_at || p.created_at,
                federation: "local",
                type: "post"
            }));

            // Merge results
            const allItems = [
                ...httpTracks,
                ...apTracks, 
                ...apPosts,
                ...formattedLocalReleases,
                ...localPosts
            ];
            
            res.json(allItems);
        } catch (error) {
            console.error("Error getting community content:", error);
            res.status(500).json({ error: "Failed to get community content" });
        }
    });

    /**
     * GET /api/stats/network/status
     * Get summary stats for the community network
     */
    router.get("/network/status", async (req, res) => {
        try {
            const gunSites = await zendbService.getCommunitySites();
            const apActors = dbService.getFollowedActors().filter(a => a.username === 'site' || a.username === getSiteHandle(dbService));
            const apTracks = dbService.getRemoteTracks();
            const localReleases = dbService.getReleases(VisibilityProfile.PUBLIC_STAGE);

            const publicUrl = dbService.getSetting("publicUrl") || config.publicUrl;
            const apEnabled = !!publicUrl;

            res.json({
                sites: gunSites.length + apActors.length + 1, // +1 for local
                tracks: apTracks.length + localReleases.length,
                lastUpdate: new Date().toISOString(),
                zen: {
                    connected: zendbService.getPeerCount() > 0,
                    peers: zendbService.getPeerCount()
                },
                activitypub: {
                    enabled: apEnabled
                }
            });
        } catch (error) {
            console.error("Error getting network status:", error);
            res.status(500).json({ error: "Failed to get network status" });
        }
    });

    return router;
}

