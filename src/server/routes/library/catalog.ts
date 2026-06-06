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
    const router = Router();

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

    return router;
}
