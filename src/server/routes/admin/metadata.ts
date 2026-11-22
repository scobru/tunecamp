import { Router, json } from "express";
import { isSafeUrl } from "../../../utils/networkUtils.js";
import { metadataService } from "../../modules/catalog/metadata.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import type { ServiceContainer } from "../../core/container.js";

export function createMetadataRoutes(container: ServiceContainer): Router {
    const maintenance = container.maintenanceService;
    const catalogService = container.catalogService;
    const library = container.library;
    const router = Router();
    router.use(json());

    router.get("/search", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && req.userId === undefined) return res.status(401).json({ error: "Unauthorized" });

        const query = req.query.q as string;
        if (!query) return res.status(400).json({ error: "Query required" });

        const results = await metadataService.searchRelease(query);
        res.json(results);
    });

    /**
     * GET /api/metadata/artist-search
     * Search for artist metadata
     */
    router.get("/artist-search", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && req.userId === undefined) return res.status(401).json({ error: "Unauthorized" });

        const query = req.query.q as string;
        if (!query) return res.status(400).json({ error: "Query required" });

        const results = await metadataService.searchArtist(query);
        res.json(results);
    });

    /**
     * POST /api/metadata/apply
     * Apply metadata to an album (download cover, update info)
     */
    router.post("/apply", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && req.userId === undefined) return res.status(401).json({ error: "Unauthorized" });

        const { albumId, mbid, title, artist, date, coverUrl } = req.body;

        try {
            const album = library.getAlbum(albumId) || library.getRelease(albumId);
            if (!album) return res.status(404).json({ error: "Album not found" });

            // Permission Check: Artist can only apply metadata to their own albums
            if (!req.isAdmin && album.owner_id !== req.userId) {
                return res.status(403).json({ error: "Access denied" });
            }

            if (coverUrl && !(await isSafeUrl(coverUrl))) {
                return res.status(400).json({ error: "Invalid or unsafe cover URL" });
            }

            const year = date ? parseInt(date.substring(0, 4)) : undefined;
            await catalogService.updateAlbum(albumId, {
                external_id: mbid,
                title,
                artist,
                date,
                year,
                cover_path: coverUrl
            });

            const updatedAlbum = library.getAlbum(albumId) || library.getRelease(albumId);
            await maintenance.propagateAlbumMetadataToTracks(albumId, {
                genre: updatedAlbum?.genre ?? null,
                year: (typeof updatedAlbum?.year === 'number' ? updatedAlbum.year : null) ?? year ?? null
            });

            res.json({ success: true, message: "Metadata applied and synced" });

        } catch (error) {
            console.error("Error applying metadata:", error);
            res.status(500).json({ error: "Failed to apply metadata" });
        }
    });

    /**
     * GET /api/metadata/lyrics
     * Fetch lyrics for a track
     */
    router.get("/lyrics", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && req.userId === undefined) return res.status(401).json({ error: "Unauthorized" });

        const artist = req.query.artist as string;
        const title = req.query.title as string;

        if (!artist || !title) return res.status(400).json({ error: "Artist and title required" });

        try {
            const result = await metadataService.getLyrics(artist, title);
            if (result) {
                res.json(result);
            } else {
                res.status(404).json({ error: "Lyrics not found" });
            }
        } catch (error) {
            console.error("Error fetching lyrics route:", error);
            res.status(500).json({ error: "Failed to fetch lyrics" });
        }
    });

    return router;
}
