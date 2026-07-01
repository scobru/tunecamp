import { Router, json } from "express";
import fs from "fs-extra";
import path from "path";
import { isSafeUrl } from "../../../utils/networkUtils.js";
import { drainResponse } from "../../common/network.js";
import { metadataService } from "../../modules/catalog/metadata.service.js";
import type { DatabaseService } from "../../core/database.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import type { MaintenanceService } from "../../modules/catalog/maintenance.service.js";
import type { CatalogService } from "../../modules/catalog/catalog.service.js";
import { taskManager } from "../../modules/workers/task-manager.js";

import type { ServiceContainer } from "../../core/container.js";

export function createMetadataRoutes(container: ServiceContainer): Router {
    const musicDir = container.musicDir;
    const maintenance = container.maintenanceService;
    const catalogService = container.catalogService;
    const library = container.library;
    const database = container.database;
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
     * GET /api/metadata/maintenance/missing
     * List tracks with missing metadata
     */
    router.get("/maintenance/missing", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        const filter = (req.query.filter as 'genre' | 'year' | 'cover' | 'description' | 'album' | 'artist') || 'genre';
        const tracks = maintenance.getTracksWithMissingMetadata(filter);
        res.json(tracks);
    });

    /**
     * GET /api/metadata/maintenance/albums/missing
     * List albums with missing metadata
     */
    router.get("/maintenance/albums/missing", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        const filter = (req.query.filter as 'genre' | 'year' | 'cover' | 'description' | 'artist') || 'genre';
        const albums = maintenance.getAlbumsWithMissingMetadata(filter);
        res.json(albums);
    });

    /**
     * POST /api/metadata/maintenance/autofill
     * Autofill metadata for selected tracks
     */
    router.post("/maintenance/autofill", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        const { trackIds, fields, force } = req.body;
        if (!Array.isArray(trackIds)) return res.status(400).json({ error: "trackIds array required" });

        const results = await maintenance.autofillMetadata(trackIds, {
            fields: fields || ['genre', 'year'],
            force: !!force
        });

        res.json(results);
    });

    /**
     * POST /api/metadata/maintenance/ai-autofill
     * Autofill metadata for selected tracks using AI (OpenRouter)
     */
    router.post("/maintenance/ai-autofill", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        const { trackIds, force } = req.body;
        if (!Array.isArray(trackIds)) return res.status(400).json({ error: "trackIds array required" });

        const results = await maintenance.aiAutofillMetadata(trackIds, {
            force: !!force
        });

        res.json(results);
    });

    /**
     * POST /api/metadata/maintenance/albums/autofill
     */
    router.post("/maintenance/albums/autofill", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        const { albumIds, fields, force } = req.body;
        if (!Array.isArray(albumIds)) return res.status(400).json({ error: "albumIds array required" });

        const results = await maintenance.autofillAlbumMetadata(albumIds, {
            fields: fields || ['genre', 'year', 'cover'],
            force: !!force
        });

        res.json(results);
    });

    /**
     * POST /api/metadata/maintenance/albums/ai-autofill
     */
    router.post("/maintenance/albums/ai-autofill", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        const { albumIds, force } = req.body;
        if (!Array.isArray(albumIds)) return res.status(400).json({ error: "albumIds array required" });

        const results = await maintenance.aiAutofillAlbumsMetadata(albumIds, {
            force: !!force
        });

        res.json(results);
    });

    /**
     * GET /api/metadata/maintenance/candidates/:trackId
     * Get metadata candidates for manual selection
     */
    router.get("/maintenance/candidates/:trackId", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        const trackId = parseInt(req.params.trackId);
        try {
            const candidates = await maintenance.getMetadataCandidates(trackId);
            res.json(candidates);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    /**
     * GET /api/metadata/maintenance/albums/candidates/:albumId
     */
    router.get("/maintenance/albums/candidates/:albumId", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        const albumId = parseInt(req.params.albumId);
        try {
            const candidates = await maintenance.getAlbumMetadataCandidates(albumId);
            res.json(candidates);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    /**
     * POST /api/metadata/maintenance/apply-track
     * Apply specific metadata to a track
     */
    router.post("/maintenance/apply-track", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        const { trackId, metadata } = req.body;
        if (!trackId || !metadata) return res.status(400).json({ error: "trackId and metadata required" });

        try {
            await maintenance.applyMetadataToTrack(trackId, metadata);
            res.json({ success: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    /**
     * POST /api/metadata/maintenance/albums/apply
     */
    router.post("/maintenance/albums/apply", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        const { albumId, metadata } = req.body;
        if (!albumId || !metadata) return res.status(400).json({ error: "albumId and metadata required" });

        try {
            await maintenance.applyMetadataToAlbum(albumId, metadata);
            res.json({ success: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
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

    /**
     * Helper to download an image from a URL
     */
    async function downloadImage(url: string, dest: string): Promise<boolean> {
        if (!(await isSafeUrl(url))) return false;

        let currentUrl = url;
        let response: any = null;

        for (let i = 0; i <= 3; i++) {
            response = await fetch(currentUrl, {
                redirect: 'manual'
            });

            if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
                const location = response.headers.get('location');
                if (!location) break;
                currentUrl = new URL(location, currentUrl).toString();
                await drainResponse(response);
                if (!(await isSafeUrl(currentUrl))) return false;
                continue;
            }
            break;
        }

        if (response && response.ok) {
            // ponytail: header-trust 10MB cap (global fetch has no node-fetch `size`);
            // isSafeUrl above is the real boundary.
            if (Number(response.headers.get('content-length') || 0) > 10 * 1024 * 1024) {
                await drainResponse(response);
                return false;
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            await fs.writeFile(dest, buffer);
            return true;
        } else if (response) {
            await drainResponse(response);
        }
        return false;
    }

    /**
     * GET /api/metadata/maintenance/artists/missing
     */
    router.get("/maintenance/artists/missing", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        const artists = await maintenance.getArtistsWithMissingPhotos();
        res.json(artists);
    });

    /**
     * GET /api/metadata/maintenance/artists/candidates/:artistId
     */
    router.get("/maintenance/artists/candidates/:artistId", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        const artistId = parseInt(req.params.artistId);
        try {
            const candidates = await maintenance.getArtistPhotoCandidates(artistId);
            res.json(candidates);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    /**
     * POST /api/metadata/maintenance/artists/apply
     */
    router.post("/maintenance/artists/apply", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        const { artistId, metadata } = req.body;
        if (!artistId || !metadata) return res.status(400).json({ error: "artistId and metadata required" });

        try {
            const artist = library.getArtist(artistId);
            if (!artist) return res.status(404).json({ error: "Artist not found" });

            let photoPath = artist.photo_path;

            // Download photo if URL provided
            if (metadata.avatarUrl) {
                const artistAssetsDir = path.join(musicDir, "artists", artist.slug || String(artistId));
                await fs.ensureDir(artistAssetsDir);
                
                const ext = path.extname(new URL(metadata.avatarUrl).pathname) || ".jpg";
                const dest = path.join(artistAssetsDir, `photo-${Date.now()}${ext}`);
                
                const success = await downloadImage(metadata.avatarUrl, dest);
                if (success) {
                    photoPath = path.relative(musicDir, dest).replace(/\\/g, "/");
                }
            }

            // Update Database
            library.updateArtist(
                artistId,
                metadata.name || undefined,
                metadata.bio || undefined,
                photoPath || undefined,
                metadata.links || undefined
            );

            res.json({ success: true, photoPath });
        } catch (e: any) {
            console.error("Error applying artist metadata:", e);
            res.status(500).json({ error: e.message });
        }
    });

    /**
     * POST /api/metadata/maintenance/artists/autofill
     */
    router.post("/maintenance/artists/autofill", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        const { artistIds, force } = req.body;
        if (!Array.isArray(artistIds)) return res.status(400).json({ error: "artistIds array required" });

        const results = { success: 0, failed: 0, skipped: 0, errors: [] as string[] };

        for (const artistId of artistIds) {
            try {
                const artist = library.getArtist(artistId);
                if (!artist) {
                    results.skipped++;
                    continue;
                }

                // If not forcing and artist already has bio/photo, skip
                if (!force && artist.photo_path && artist.bio) {
                    results.skipped++;
                    continue;
                }

                const candidates = await maintenance.getArtistPhotoCandidates(artistId);
                const bestMatch = candidates[0];

                if (!bestMatch) {
                    results.skipped++;
                    continue;
                }

                let photoPath = artist.photo_path;

                // Download photo if URL provided and we don't have one (or force is true)
                if (bestMatch.avatarUrl && (!photoPath || force)) {
                    const artistAssetsDir = path.join(musicDir, "artists", artist.slug || String(artistId));
                    await fs.ensureDir(artistAssetsDir);
                    
                    const ext = path.extname(new URL(bestMatch.avatarUrl).pathname) || ".jpg";
                    const dest = path.join(artistAssetsDir, `photo-${Date.now()}${ext}`);
                    
                    const success = await downloadImage(bestMatch.avatarUrl, dest);
                    if (success) {
                        photoPath = path.relative(musicDir, dest).replace(/\\/g, "/");
                    }
                }

                // Update Database
                library.updateArtist(
                    artistId,
                    bestMatch.name || undefined,
                    (force || !artist.bio) ? (bestMatch.aiBio || bestMatch.bio || undefined) : undefined,
                    photoPath || undefined,
                    bestMatch.links ? (typeof bestMatch.links === 'string' ? bestMatch.links : JSON.stringify(bestMatch.links)) : undefined
                );

                results.success++;
            } catch (err: any) {
                results.failed++;
                results.errors.push(`Artist ${artistId}: ${err.message}`);
            }
        }

        res.json(results);
    });

    /**
     * POST /api/metadata/maintenance/audit-all
     * Starts the background library audit/repair process
     */
    router.post("/maintenance/audit-all", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        const { forceRepair, useAI } = req.body ?? {};
        
        const started = taskManager.run('library-audit', () => maintenance.startLibraryAudit({
            forceRepair: !!forceRepair,
            useAI: !!useAI
        }));

        if (!started) {
            return res.status(409).json({ error: "Library audit is already in progress" });
        }

        res.json({ message: "Library audit started in background" });
    });

    /**
     * GET /api/metadata/maintenance/audit-status
     * Returns the status of the library audit
     */
    router.get("/maintenance/audit-status", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        res.json(maintenance.getAuditStatus());
    });

    /**
     * POST /api/metadata/maintenance/audit-stop
     */
    router.post("/maintenance/audit-stop", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin && !req.isSuperUser) return res.status(403).json({ error: "Admin only" });
        maintenance.stopLibraryAudit();
        res.json({ message: "Audit stopped" });
    });

    return router;
}

