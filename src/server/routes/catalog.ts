import { Router } from "express";
import { CatalogService } from "../modules/catalog/catalog.service.js";

export function createCatalogRoutes(catalogService: CatalogService): Router {
    const router = Router();

    /**
     * GET /api/catalog
     * Get catalog overview with stats
     */
    router.get("/", async (req: any, res) => {
        try {
            const results = await catalogService.getOverview(req.isAdmin || req.isSuperUser);
            res.json(results);
        } catch (error) {
            console.error("Error getting catalog:", error);
            res.status(500).json({ error: "Failed to get catalog" });
        }
    });
    
    /**
     * GET /api/catalog/genres
     * Get list of all unique genres
     */
    router.get("/genres", (req: any, res) => {
        try {
            const genres = catalogService.getGenres(req.isAdmin || req.isSuperUser);
            res.json(genres);
        } catch (error) {
            res.status(500).json({ error: "Failed to get genres" });
        }
    });


    /**
     * GET /api/catalog/random
     * Get random tracks for radio mode
     */
    router.get("/random", async (req: any, res) => {
        try {
            const limit = parseInt(req.query.limit as string) || 1;
            const tracks = catalogService.getRandomTracks(limit, req.isAdmin || req.isSuperUser);
            res.json(tracks);
        } catch (error) {
            console.error("Error getting random tracks:", error);
            res.status(500).json({ error: "Failed to get random tracks" });
        }
    });

    /**
     * GET /api/catalog/search
     * Global search for artists, albums, tracks
     */
    router.get("/search", async (req: any, res) => {
        try {
            const query = req.query.q as string;
            const results = await catalogService.search(query, req.isAdmin || req.isSuperUser);
            res.json(results);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * GET /api/catalog/settings
     * Get public site settings
     */
    router.get("/settings", (req, res) => {
        try {
            const settings = catalogService.getSettings();
            res.json(settings);
        } catch (error) {
            console.error("Error getting settings:", error);
            res.status(500).json({ error: "Failed to get settings" });
        }
    });

    /**
     * GET /api/catalog/remote/tracks
     * Get tracks from other federated sites
     */
    router.get("/remote/tracks", (req, res) => {
        try {
            const tracks = catalogService.getRemoteTracks();
            res.json(tracks);
        } catch (error) {
            console.error("Error getting remote tracks:", error);
            res.status(500).json({ error: "Failed to get remote tracks" });
        }
    });

    /**
     * GET /api/catalog/remote/posts
     * Get posts from other federated sites
     */
    router.get("/remote/posts", (req, res) => {
        try {
            const posts = catalogService.getRemotePosts();
            res.json(posts);
        } catch (error) {
            console.error("Error getting remote posts:", error);
            res.status(500).json({ error: "Failed to get remote posts" });
        }
    });

    return router;
}
