import { Router } from "express";
import fs from "fs-extra";
import path from "path";
import fetch from "node-fetch";
import { isSafeUrl } from "../../utils/networkUtils.js";
import { drainResponse } from "../utils.js";
import { metadataService } from "../metadata.js";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import type { MaintenanceService } from "../services/maintenance.service.js";

export function createMetadataRoutes(database: DatabaseService, musicDir: string, maintenance: MaintenanceService): Router {
    const router = Router();

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
            const album = database.getAlbum(albumId);
            if (!album) return res.status(404).json({ error: "Album not found" });

            // Permission Check: Artist can only apply metadata to their own albums
            if (!req.isAdmin && album.owner_id !== req.userId) {
                return res.status(403).json({ error: "Access denied" });
            }

            // 1. Update Database Info
            // Update title/date if provided
            // Assuming we might implement updateAlbumMetadata in DB, for now manually?
            // Existing DB service doesn't have updateAlbumMetadata fully exposed but we have updateAlbumArtist etc.
            // Let's just download cover for MVP as that's the visual part user wants.

            let coverUpdated = false;

            // 2. Download Cover if URL provided
            if (coverUrl) {
                // Validate SSRF
                if (!(await isSafeUrl(coverUrl))) {
                    return res.status(400).json({ error: "Invalid or unsafe cover URL" });
                }

                // Find album directory
                // We need to find the directory path from tracks or store it on album
                // Schema doesn't store album path directly, only cover_path
                // But we can guess from cover_path or first track
                const tracks = database.getTracks(albumId);
                let dir = "";
                if (tracks.length > 0 && tracks[0].file_path) {
                    dir = path.dirname(tracks[0].file_path);
                } else if (album.cover_path) {
                    dir = path.dirname(album.cover_path);
                }

                if (dir && await fs.pathExists(dir)) {
                    const uniqueId = Date.now();
                    const dest = path.join(dir, `cover-al${albumId}-${uniqueId}.jpg`);

                    let currentUrl = coverUrl;
                    let response: import("node-fetch").Response | null = null;

                    for (let i = 0; i <= 3; i++) {
                        response = await fetch(currentUrl, {
                            redirect: 'manual',
                            size: 5 * 1024 * 1024 // 5MB limit
                        });

                        if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
                            const location = response.headers.get('location');
                            if (!location) break;
                            currentUrl = new URL(location, currentUrl).toString();
                            await drainResponse(response);
                            if (!(await isSafeUrl(currentUrl))) {
                                return res.status(400).json({ error: "Invalid or unsafe cover URL on redirect" });
                            }
                            continue;
                        }
                        break; // Not a redirect
                    }

                    if (response && response.ok) {
                        const buffer = await response.buffer();
                        await fs.writeFile(dest, buffer);
                        console.log(`Downloaded cover to ${dest}`);

                        // Update DB
                        const dbPath = path.relative(musicDir, dest).replace(/\\/g, "/");
                        database.updateAlbumCover(albumId, dbPath);
                        coverUpdated = true;
                    } else if (response) {
                        await drainResponse(response);
                    }
                }
            }

            // 3. Update artist if needed (basic)
            if (artist) {
                let artistRec = database.getArtistByName(artist);
                if (!artistRec) {
                    const newId = database.createArtist(artist);
                    artistRec = database.getArtist(newId);
                }
                if (artistRec) {
                    database.updateAlbumArtist(albumId, artistRec.id);
                }
            }

            res.json({ success: true, coverUpdated });

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
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
        const filter = (req.query.filter as 'genre' | 'year' | 'cover' | 'description') || 'genre';
        const tracks = maintenance.getTracksWithMissingMetadata(filter);
        res.json(tracks);
    });

    /**
     * GET /api/metadata/maintenance/albums/missing
     * List albums with missing metadata
     */
    router.get("/maintenance/albums/missing", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
        const filter = (req.query.filter as 'genre' | 'year' | 'cover' | 'description') || 'genre';
        const albums = maintenance.getAlbumsWithMissingMetadata(filter);
        res.json(albums);
    });

    /**
     * POST /api/metadata/maintenance/autofill
     * Autofill metadata for selected tracks
     */
    router.post("/maintenance/autofill", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
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
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
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
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
        const { albumIds, fields, force } = req.body;
        if (!Array.isArray(albumIds)) return res.status(400).json({ error: "albumIds array required" });

        const results = await maintenance.autofillAlbumsMetadata(albumIds, {
            fields: fields || ['genre', 'year', 'cover'],
            force: !!force
        });

        res.json(results);
    });

    /**
     * POST /api/metadata/maintenance/albums/ai-autofill
     */
    router.post("/maintenance/albums/ai-autofill", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
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
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
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
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
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
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
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
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
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
                redirect: 'manual',
                size: 10 * 1024 * 1024 // 10MB limit
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
            const buffer = await response.buffer();
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
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
        const artists = await maintenance.getArtistsWithMissingPhotos();
        res.json(artists);
    });

    /**
     * GET /api/metadata/maintenance/artists/candidates/:artistId
     */
    router.get("/maintenance/artists/candidates/:artistId", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
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
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
        const { artistId, metadata } = req.body;
        if (!artistId || !metadata) return res.status(400).json({ error: "artistId and metadata required" });

        try {
            const artist = database.getArtist(artistId);
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
            database.updateArtist(
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
     * POST /api/metadata/maintenance/fingerprint/lookup/:trackId
     * Lookup metadata for a track using its fingerprint via ZenDB
     */
    router.post("/maintenance/fingerprint/lookup/:trackId", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
        const trackId = parseInt(req.params.trackId);
        try {
            const metadata = await maintenance.fingerprintLookup(trackId);
            if (metadata) {
                res.json(metadata);
            } else {
                res.status(404).json({ error: "No community fingerprint found for this track" });
            }
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    /**
     * POST /api/metadata/maintenance/fingerprint/share/:trackId
     * Share track metadata with the community via ZenDB fingerprinting
     */
    router.post("/maintenance/fingerprint/share/:trackId", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
        const trackId = parseInt(req.params.trackId);
        try {
            await maintenance.shareFingerprint(trackId);
            res.json({ success: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    /**
     * POST /api/metadata/maintenance/fingerprint/scan-all
     * Scans all tracks in the database to generate fingerprints and identify them via ZenDB
     */
    router.post("/maintenance/fingerprint/scan-all", async (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) return res.status(403).json({ error: "Admin only" });
        try {
            // Trigger in background but return immediately with a success message 
            // since it can take a long time
            maintenance.batchIdentifyTracks().then(results => {
                console.log(`[Maintenance] Mass scan completed:`, results);
            }).catch(e => {
                console.error(`[Maintenance] Mass scan failed:`, e);
            });
            
            res.json({ message: "Mass fingerprint scan started in background" });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    return router;
}
