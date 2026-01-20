import { Router } from "express";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export function createCatalogRoutes(database: DatabaseService) {
    const router = Router();

    /**
     * GET /api/catalog
     * Get catalog overview with stats
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            const stats = database.getStats();
            const recentAlbums = database
                .getAlbums(req.isAdmin !== true)
                .slice(0, 10);

            // For non-admin, calculate public tracks count
            let publicStats = stats;
            if (!req.isAdmin) {
                const publicAlbumIds = new Set(database.getAlbums(true).map(a => a.id));
                const allTracks = database.getTracks();
                const publicTracksCount = allTracks.filter(t => t.album_id !== null && publicAlbumIds.has(t.album_id)).length;
                publicStats = {
                    albums: stats.publicAlbums,
                    tracks: publicTracksCount,
                    artists: stats.artists,
                    publicAlbums: stats.publicAlbums
                };
            }

            res.json({
                stats: publicStats,
                recentAlbums,
            });
        } catch (error) {
            console.error("Error getting catalog:", error);
            res.status(500).json({ error: "Failed to get catalog" });
        }
    });

    /**
     * GET /api/catalog/search
     * Search across artists, albums, tracks
     */
    router.get("/search", (req: AuthenticatedRequest, res) => {
        try {
            const query = req.query.q as string;
            if (!query || query.length < 2) {
                return res.status(400).json({ error: "Query must be at least 2 characters" });
            }

            const results = database.search(query, req.isAdmin !== true);
            res.json(results);
        } catch (error) {
            console.error("Error searching:", error);
            res.status(500).json({ error: "Search failed" });
        }
    });

    return router;
}
