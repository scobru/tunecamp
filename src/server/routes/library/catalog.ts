import { Router } from "express";
import { CatalogService } from "../../modules/catalog/catalog.service.js";
import { DiscoveryService } from "../../modules/catalog/discovery.service.js";
import { UserRole } from "../../common/visibility.js";

import type { ServiceContainer } from "../../core/container.js";

/**
 * Catalog Routes — Handles public and private library discovery.
 * Refactored to separate Discovery (Read) from Catalog (Write).
 */
export function createCatalogRoutes(container: ServiceContainer): Router {
    const catalogService: ServiceContainer['catalogService'] = (container as any).catalogService || (container as any);
    const discoveryService: ServiceContainer['discoveryService'] = (container as any).discoveryService || (container as any);
    const identity: ServiceContainer['identity'] = (container as any).identity || (container as any);
    const peerService: ServiceContainer['peerService'] = (container as any).peerService;
    const router = Router();

    /**
     * Builds the list of currently-shared peer tracks to advertise to other
     * instances. Only populated when peer sharing AND peer federation are both
     * enabled; entries are ephemeral (they vanish when the daemon disconnects).
     * The remote side turns each entry into a public federated-stream URL.
     */
    const buildFederatedPeerTracks = () => {
        if (!peerService) return [];
        const peerEnabled = identity.getSetting("peerEnabled") === "true";
        const peerFederation = identity.getSetting("peerFederation") === "true";
        if (!peerEnabled || !peerFederation) return [];

        // Downloads (and thus cross-instance import) require the global toggle too.
        const allowDownloadsGlobal = identity.getSetting("peerAllowDownloads") !== "false";

        const out: any[] = [];
        for (const session of peerService.getSessions()) {
            const tracks = peerService.getTracksBySession(session.id);
            for (const t of tracks) {
                out.push({
                    sessionId: session.id,
                    id: t.id,
                    title: t.title,
                    artist: t.artist,
                    album: t.album,
                    duration: t.duration,
                    allowDownload: allowDownloadsGlobal && !!t.allow_download
                });
            }
        }
        return out;
    };

    /**
     * GET /api/catalog/overview
     * Returns statistics, latest albums, and releases
     */
    router.get(["/", "/overview"], async (req: any, res) => {
        try {
            const isAdmin = req.isAdmin || req.isSuperUser;
            const overview = await discoveryService.getOverview(isAdmin, req.username);
            res.json(overview);
        } catch (error) {
            console.error("Error getting catalog overview:", error);
            res.status(500).json({ error: "Failed to get overview" });
        }
    });

    /**
     * GET /api/catalog/full
     * Complete public catalog (all visible releases with tracks) for
     * instance-to-instance federation. Peers fetch this so their Network page
     * mirrors the full catalog instead of just the truncated overview.
     */
    router.get("/full", async (req: any, res) => {
        try {
            const isAdmin = req.isAdmin || req.isSuperUser;
            const catalog = discoveryService.getFederationCatalog(isAdmin, req.username);
            (catalog as any).peerTracks = buildFederatedPeerTracks();
            res.json(catalog);
        } catch (error) {
            console.error("Error getting full catalog:", error);
            res.status(500).json({ error: "Failed to get full catalog" });
        }
    });

    /**
     * GET /api/catalog/settings
     * Returns public site settings
     */
    router.get("/settings", (req: any, res) => {
        try {
            const settings = catalogService.getSettings();
            res.json(settings);
        } catch (error) {
            console.error("Error getting catalog settings:", error);
            res.status(500).json({ error: "Failed to fetch settings" });
        }
    });

    /**
     * GET /api/catalog/genres
     */
    router.get("/genres", (req: any, res) => {
        const isAdmin = req.isAdmin || req.isSuperUser;
        const genres = discoveryService.getGenres(isAdmin);
        res.json(genres);
    });

    /**
     * GET /api/catalog/search
     * Global search across artists, albums, and tracks
     */
    router.get("/search", async (req: any, res) => {
        const query = req.query.q as string;
        try {
            const isAdmin = req.isAdmin || req.isSuperUser;
            const results = await discoveryService.search(query, isAdmin, req.username);
            res.json(results);
        } catch (error) {
            console.error("Error searching catalog:", error);
            res.status(500).json({ error: "Search failed" });
        }
    });

    /**
     * GET /api/catalog/recommendations/:id
     */
    router.get("/recommendations/:id", async (req: any, res) => {
        const trackId = parseInt(req.params.id);
        const context = req.context || { role: UserRole.GUEST };
        try {
            const related = await discoveryService.getAiRecommendations(trackId, 5, context);
            res.json(related);
        } catch (error) {
            console.error("Error getting AI recommendations:", error);
            res.status(500).json({ error: "Failed to get recommendations" });
        }
    });

    /**
     * GET /api/catalog/tracks/:id/related
     * Alias for recommendations, matching common frontend naming
     */
    router.get("/tracks/:id/related", async (req: any, res) => {
        const trackId = parseInt(req.params.id);
        const limit = parseInt(req.query.limit as string) || 5;
        const context = req.context || { role: UserRole.GUEST };
        try {
            const related = await discoveryService.getAiRecommendations(trackId, limit, context);
            res.json(related);
        } catch (error) {
            console.error("Error getting related tracks:", error);
            res.status(500).json({ error: "Failed to get related tracks" });
        }
    });

    /**
     * GET /api/catalog/random
     * Returns random tracks for radio mode
     */
    router.get("/random", async (req: any, res) => {
        const limit = parseInt(req.query.limit as string) || 1;
        const isAdmin = req.isAdmin || req.isSuperUser;
        try {
            const tracks = await catalogService.getRandomTracks(limit, isAdmin);
            res.json(tracks);
        } catch (error) {
            console.error("Error getting random tracks:", error);
            res.status(500).json({ error: "Failed to get random tracks" });
        }
    });

    return router;
}
