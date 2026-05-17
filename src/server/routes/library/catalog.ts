import { Router } from "express";
import { CatalogService } from "../../modules/catalog/catalog.service.js";
import { DiscoveryService } from "../../modules/catalog/discovery.service.js";

/**
 * Catalog Routes — Handles public and private library discovery.
 * Refactored to separate Discovery (Read) from Catalog (Write).
 */
export function createCatalogRoutes(catalogService: CatalogService, discoveryService: DiscoveryService): Router {
    const router = Router();

    /**
     * GET /api/catalog/overview
     * Returns statistics, latest albums, and releases
     */
    router.get("/overview", async (req: any, res) => {
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
    router.get("/recommendations/:id", async (req, res) => {
        const trackId = parseInt(req.params.id);
        try {
            const related = await discoveryService.getAiRecommendations(trackId);
            res.json(related);
        } catch (error) {
            console.error("Error getting AI recommendations:", error);
            res.status(500).json({ error: "Failed to get recommendations" });
        }
    });

    return router;
}
