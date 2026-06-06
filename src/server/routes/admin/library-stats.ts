import { Router } from "express";
import type { DatabaseService } from "../../core/database.js";
import { mapTrackDTO } from "../../modules/catalog/catalog.mappers.js";

import type { ServiceContainer } from "../../core/container.js";

export function createLibraryStatsRoutes(container: ServiceContainer): Router {
    const library: ServiceContainer['library'] = (container as any).library || (container as any);
    const social: ServiceContainer['social'] = (container as any).social || (container as any);
    const database: ServiceContainer['database'] = (container as any).database || (container as any);
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
            const track = library.getTrack(trackId);
            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            social.recordPlay(trackId);
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
            const plays = social.getRecentPlays(limit);
            res.json(plays);
        } catch (error) {
            console.error("Error getting recent plays:", error);
            res.status(500).json({ error: "Failed to get recent plays" });
        }
    });

    router.get("/top-tracks", async (req, res) => {
        try {
            const limit = parseInt(req.query.limit as string, 10) || 20;
            const days = parseInt(req.query.days as string, 10) || 30;
            const filter = (req.query.filter as 'all' | 'library' | 'releases') || 'all';
            const tracks = social.getTopTracks(limit, days, filter);
            const mappedTracks = tracks.map(track => {
                const dto = mapTrackDTO(track, database, (req as any).username);
                return {
                    ...dto,
                    playCount: (track as any).play_count
                };
            });
            res.json(mappedTracks);
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
            const artists = social.getTopArtists(limit, days, filter);
            const mappedArtists = artists.map(artist => ({
                ...artist,
                playCount: (artist as any).play_count
            }));
            res.json(mappedArtists);
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
            const stats = library.getListeningStats();
            // Also include basic library stats
            const libraryStats = await library.getStats();
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

