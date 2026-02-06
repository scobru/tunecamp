import { Router } from "express";
import fs from "fs";
import path from "path";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { resolveFile } from "../utils/pathHelper.js";

export function createAlbumsRoutes(database: DatabaseService) {
    const router = Router();

    /**
     * GET /api/albums
     * List all library albums (is_release=0) - for personal library view
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            // Show all albums (releases + library)
            // Filter by visibility for non-admins
            const albums = database.getAlbums(!req.isAdmin).map(a => ({
                ...a,
                coverImage: a.cover_path
            }));
            res.json(albums);
        } catch (error) {
            console.error("Error getting albums:", error);
            res.status(500).json({ error: "Failed to get albums" });
        }
    });

    /**
     * GET /api/releases
     * List all releases (is_release=1) - public releases for the catalog
     */
    router.get("/releases", (req: AuthenticatedRequest, res) => {
        try {
            // Non-admin sees public releases only, admin sees all releases
            const releases = database.getReleases(req.isAdmin !== true).map(r => ({
                ...r,
                coverImage: r.cover_path
            }));
            res.json(releases);
        } catch (error) {
            console.error("Error getting releases:", error);
            res.status(500).json({ error: "Failed to get releases" });
        }
    });

    /**
     * POST /api/albums/:id/promote
     * Promote a library album to a release (admin only)
     */
    router.post("/:id/promote", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        try {
            const id = parseInt(req.params.id as string, 10);
            const album = database.getAlbum(id);
            if (!album) {
                return res.status(404).json({ error: "Album not found" });
            }
            database.promoteToRelease(id);
            res.json({ success: true, message: "Album promoted to release" });
        } catch (error) {
            console.error("Error promoting album:", error);
            res.status(500).json({ error: "Failed to promote album" });
        }
    });


    /**
     * GET /api/albums/:idOrSlug
     * Get album details with tracks (supports ID or slug)
     */
    router.get("/:idOrSlug", (req: AuthenticatedRequest, res) => {
        try {
            const param = req.params.idOrSlug as string;
            let album;

            if (/^\d+$/.test(param)) {
                album = database.getAlbum(parseInt(param, 10));
            } else {
                album = database.getAlbumBySlug(param);
            }

            if (!album) {
                return res.status(404).json({ error: "Album not found" });
            }

            // Non-admin can only see public/unlisted albums
            if (album.visibility === 'private' && !req.isAdmin) {
                return res.status(404).json({ error: "Album not found" });
            }

            const tracks = database.getTracks(album.id);

            // Map tracks to include album cover info for the player
            const mappedTracks = tracks.map(t => ({
                ...t,
                albumId: album.id,
                coverImage: album.cover_path ? `/api/albums/${album.id}/cover` : undefined
            }));

            res.json({
                ...album,
                coverImage: album.cover_path,
                tracks: mappedTracks,
            });
        } catch (error) {
            console.error("Error getting album:", error);
            res.status(500).json({ error: "Failed to get album" });
        }
    });

    /**
     * GET /api/albums/:idOrSlug/cover
     * Get album cover image (supports ID or slug)
     */
    router.get("/:idOrSlug/cover", (req: AuthenticatedRequest, res) => {
        try {
            const param = req.params.idOrSlug as string;
            let album;

            if (/^\d+$/.test(param)) {
                album = database.getAlbum(parseInt(param, 10));
            } else {
                album = database.getAlbumBySlug(param);
            }

            if (!album) {
                return res.status(404).json({ error: "Album not found" });
            }

            // Note: Cover images are accessible regardless of album visibility
            // This allows showing covers in player even for private albums

            // Verify file existence
            const resolvedPath = resolveFile(album.cover_path);
            if (!resolvedPath) {
                return res.status(404).json({ error: "Cover not found" });
            }

            const ext = path.extname(resolvedPath as string).toLowerCase();
            const contentTypes: Record<string, string> = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".gif": "image/gif",
                ".webp": "image/webp",
            };

            res.setHeader("Content-Type", contentTypes[ext] || "application/octet-stream");
            res.setHeader("Cache-Control", "public, max-age=86400");
            fs.createReadStream(resolvedPath).pipe(res);
        } catch (error) {
            console.error("Error getting cover:", error);
            res.status(500).json({ error: "Failed to get cover" });
        }
    });

    /**
     * GET /api/albums/:idOrSlug/download
     * Download all tracks as individual files or ZIP (only if download enabled)
     */
    router.get("/:idOrSlug/download", async (req: AuthenticatedRequest, res) => {
        try {
            const param = req.params.idOrSlug as string;
            let album;

            if (/^\d+$/.test(param)) {
                album = database.getAlbum(parseInt(param, 10));
            } else {
                album = database.getAlbumBySlug(param);
            }

            if (!album) {
                return res.status(404).json({ error: "Album not found" });
            }

            // Check if download is enabled
            if (!album.download || (album.download !== 'free' && album.download !== 'paid' && album.download !== 'codes')) {
                return res.status(403).json({ error: "Downloads not enabled for this release" });
            }

            // Verify unlock code if required
            if (album.download === 'codes') {
                const code = req.query.code as string;
                if (!code) {
                    return res.status(402).json({ error: "Unlock code required" });
                }
                const validation = database.validateUnlockCode(code);
                if (!validation.valid) {
                    return res.status(403).json({ error: "Invalid unlock code" });
                }
                if (validation.releaseId && validation.releaseId !== album.id) {
                    return res.status(403).json({ error: "Code is for a different release" });
                }
                // Optional: Check if already used? For now, we allow re-download or multi-use.
                // Log redemption
                database.redeemUnlockCode(code);
            }

            // Get tracks for this album
            const tracks = database.getTracks(album.id);
            if (!tracks || tracks.length === 0) {
                return res.status(404).json({ error: "No tracks found" });
            }

            // For single track, just send the file
            if (tracks.length === 1) {
                const track = tracks[0];
                const trackPath = resolveFile(track.file_path);
                if (!trackPath) {
                    return res.status(404).json({ error: "Track file not found" });
                }
                const filename = path.basename(trackPath);
                res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
                res.setHeader("Content-Type", "application/octet-stream");
                return fs.createReadStream(trackPath).pipe(res);
            }

            // For multiple tracks, create a simple sequential download
            // Send first track with info about others
            const archiver = await import("archiver");
            const archive = archiver.default("zip", { zlib: { level: 5 } });

            res.setHeader("Content-Type", "application/zip");
            res.setHeader("Content-Disposition", `attachment; filename="${album.slug || album.title}.zip"`);

            archive.pipe(res);

            for (const track of tracks) {
                const trackPath = resolveFile(track.file_path);
                if (trackPath) {
                    archive.file(trackPath, { name: path.basename(trackPath) });
                }
            }

            await archive.finalize();
        } catch (error) {
            console.error("Error downloading album:", error);
            res.status(500).json({ error: "Failed to download album" });
        }
    });

    return router;
}
