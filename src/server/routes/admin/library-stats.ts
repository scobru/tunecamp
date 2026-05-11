import { Router } from "express";
import type { DatabaseService } from "../../database.js";

export function createLibraryStatsRoutes(database: DatabaseService): Router {
    const router = Router();

    /**
     * POST /api/stats/library/play/:trackId
     * Record a track play
     */
    router.post("/play/:trackId", async (req, res) => {
        try {
            const trackId = parseInt(req.params.trackId as string, 10);
            if (isNaN(trackId)) {
                return res.status(400).json({ error: "Invalid track ID" });
            }

            // Verify track exists
            const track = database.getTrack(trackId);
            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            database.recordPlay(trackId);
            res.json({ success: true, trackId });
        } catch (error) {
            console.error("Error recording play:", error);
            res.status(500).json({ error: "Failed to record play" });
        }
    });

    /**
     * GET /api/stats/library/recent
     * Get recent play history
     */
    router.get("/recent", async (req, res) => {
        try {
            const limit = parseInt(req.query.limit as string, 10) || 50;
            const plays = database.getRecentPlays(limit);
            res.json(plays);
        } catch (error) {
            console.error("Error getting recent plays:", error);
            res.status(500).json({ error: "Failed to get recent plays" });
        }
    });

    /**
     * GET /api/stats/library/top-tracks
     * Get most played tracks
     */
    router.get("/top-tracks", async (req, res) => {
        try {
            const limit = parseInt(req.query.limit as string, 10) || 20;
            const days = parseInt(req.query.days as string, 10) || 30;
            const filter = (req.query.filter as 'all' | 'library' | 'releases') || 'all';
            const tracks = database.getTopTracks(limit, days, filter);
            res.json(tracks);
        } catch (error) {
            console.error("Error getting top tracks:", error);
            res.status(500).json({ error: "Failed to get top tracks" });
        }
    });

    /**
     * GET /api/stats/library/top-artists
     * Get most played artists
     */
    router.get("/top-artists", async (req, res) => {
        try {
            const limit = parseInt(req.query.limit as string, 10) || 10;
            const days = parseInt(req.query.days as string, 10) || 30;
            const filter = (req.query.filter as 'all' | 'library' | 'releases') || 'all';
            const artists = database.getTopArtists(limit, days, filter);
            res.json(artists);
        } catch (error) {
            console.error("Error getting top artists:", error);
            res.status(500).json({ error: "Failed to get top artists" });
        }
    });

    /**
     * GET /api/stats/library/overview
     * Get overall listening statistics
     */
    router.get("/overview", async (req, res) => {
        try {
            const stats = database.getListeningStats();
            // Also include basic library stats
            const libraryStats = await database.getStats();
            res.json({
                ...stats,
                library: libraryStats,
            });
        } catch (error) {
            console.error("Error getting listening stats:", error);
            res.status(500).json({ error: "Failed to get listening stats" });
        }
    });

    return router;
}

