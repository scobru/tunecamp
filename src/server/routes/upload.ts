import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs-extra";
import type { DatabaseService } from "../database.js";
import type { ScannerService } from "../scanner.js";
import { sanitizeFilename } from "../../utils/audioUtils.js";

const AUDIO_EXTENSIONS = [".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

/**
 * Configure multer storage
 */
function createStorage(musicDir: string) {
    return multer.diskStorage({
        destination: (req, file, cb) => {
            // All files are uploaded to a central "tracks" directory
            const destDir = path.join(musicDir, "tracks");

            fs.ensureDir(destDir)
                .then(() => cb(null, destDir))
                .catch(err => {
                    console.error(`❌ [Multer] Failed to create destination directory ${destDir}:`, err);
                    cb(err, destDir);
                });
        },
        filename: (req, file, cb) => {
            // Use original filename, sanitized
            const sanitized = sanitizeFilename(file.originalname);
            cb(null, sanitized);
        },
    });
}

/**
 * File filter for audio and images
 */
function fileFilter(
    req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) {
    const ext = path.extname(file.originalname).toLowerCase();
    const isAudio = AUDIO_EXTENSIONS.includes(ext);
    const isImage = IMAGE_EXTENSIONS.includes(ext);

    if (isAudio || isImage) {
        cb(null, true);
    } else {
        cb(new Error(`Unsupported file type: ${ext}`));
    }
}

/** Multer for background image: save to musicDir/assets/ as background.<ext> */
function createBackgroundStorage(musicDir: string) {
    return multer.diskStorage({
        destination: (_req, _file, cb) => {
            const destDir = path.join(musicDir, "assets");
            fs.ensureDir(destDir)
                .then(() => cb(null, destDir))
                .catch(err => cb(err, destDir));
        },
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase() || ".png";
            cb(null, "background" + (IMAGE_EXTENSIONS.includes(ext) ? ext : ".png"));
        },
    });
}

export function createUploadRoutes(
    database: DatabaseService,
    scanner: ScannerService,
    musicDir: string
) {
    const router = Router();

    const upload = multer({
        storage: createStorage(musicDir),
        fileFilter,
        limits: {
            fileSize: 100 * 1024 * 1024, // 100MB
        },
    });

    const uploadBackground = multer({
        storage: createBackgroundStorage(musicDir),
        fileFilter: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            if (IMAGE_EXTENSIONS.includes(ext)) {
                cb(null, true);
            } else {
                cb(new Error(`Unsupported image type: ${ext}`));
            }
        },
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    });

    /**
     * POST /api/admin/upload/tracks
     * Upload one or more audio files
     */
    router.post("/tracks", upload.array("files", 50), async (req, res) => {
        try {
            const files = req.files as Express.Multer.File[];

            if (!files || files.length === 0) {
                return res.status(400).json({ error: "No files uploaded" });
            }

            console.log(`📤 Uploaded ${files.length} track(s)`);

            // Note: Scanner watcher will pick up the new files automatically.
            // We don't trigger a full resident scan here to avoid 504 and high CPU.

            res.status(202).json({
                message: `Upload accepted. Processing ${files.length} file(s) in background.`,
            });
        } catch (error) {
            console.error("Upload error:", error);
            res.status(500).json({ error: "Upload failed" });
        }
    });

    /**
     * POST /api/admin/upload/cover
     * Upload a cover image for a release
     */
    router.post("/cover", upload.single("file"), async (req, res) => {
        try {
            const file = req.file;
            const releaseSlug = req.body.releaseSlug;

            if (!file) {
                return res.status(400).json({ error: "No file uploaded" });
            }

            console.log(`🎨 Uploaded cover: ${file.originalname}`);

            // If release slug provided, update release.yaml and database
            if (releaseSlug) {
                // Permission Check
                const targetAlbum = database.getAlbumBySlug(releaseSlug);
                if ((req as any).artistId && targetAlbum && targetAlbum.artist_id !== (req as any).artistId) {
                    await fs.remove(file.path);
                    return res.status(403).json({ error: "Access denied: Cannot upload cover for another artist's release" });
                }

                const releaseDir = path.join(musicDir, "releases", releaseSlug);
                const releaseYamlPath = path.join(releaseDir, "release.yaml");

                if (await fs.pathExists(releaseYamlPath)) {
                    // Read and update release.yaml
                    const yaml = await import("yaml");
                    const content = await fs.readFile(releaseYamlPath, "utf-8");
                    const config = yaml.parse(content);
                    config.cover = `artwork/${file.filename}`;
                    await fs.writeFile(releaseYamlPath, yaml.stringify(config));
                }

                // Update database directly
                const album = database.getAlbumBySlug(releaseSlug);
                if (album) {
                    database.updateAlbumCover(album.id, file.path);
                    console.log(`📀 Updated cover for album: ${album.title}`);
                }

                // Trigger rescan (async)
                // scanner.scanDirectory(musicDir); // REMOVED: Triggers full re-scan, causing timeouts. Watcher handles this.
            }

            res.json({
                message: "Cover uploaded",
                file: {
                    name: file.originalname,
                    path: file.path,
                    size: file.size,
                },
            });
        } catch (error) {
            console.error("Cover upload error:", error);
            res.status(500).json({ error: "Cover upload failed" });
        }
    });

    /**
     * POST /api/admin/upload/avatar
     * Upload avatar for an artist
     */
    router.post("/avatar", upload.single("file"), async (req, res) => {
        try {
            const file = req.file;
            const artistIdRaw = req.body.artistId;
            const artistId = artistIdRaw ? parseInt(artistIdRaw as string, 10) : undefined;

            if (!file) {
                return res.status(400).json({ error: "No file uploaded" });
            }

            if (!artistId) {
                return res.status(400).json({ error: "Artist ID required" });
            }

            // Permission Check
            if ((req as any).artistId && (req as any).artistId !== artistId) {
                await fs.remove(file.path);
                return res.status(403).json({ error: "Access denied: You can only upload avatars for your own artist" });
            }

            // Check file type
            const ext = path.extname(file.originalname).toLowerCase();
            if (!IMAGE_EXTENSIONS.includes(ext)) {
                await fs.remove(file.path);
                return res.status(400).json({ error: "Only image files allowed" });
            }

            console.log(`👤 Uploaded avatar for artist ${artistId}: ${file.originalname}`);

            // Move avatar to assets folder
            const assetsDir = path.join(musicDir, "assets");
            await fs.ensureDir(assetsDir);

            const avatarFilename = `avatar-${artistId}${ext}`;
            const avatarPath = path.join(assetsDir, avatarFilename);

            // Remove old file if in different location, or overwrite
            if (file.path !== avatarPath) {
                await fs.move(file.path, avatarPath, { overwrite: true });
            }

            // Update artist in database
            const artist = database.getArtist(artistId);
            if (artist) {
                database.updateArtist(artist.id, artist.bio || undefined, avatarPath, artist.links ? JSON.parse(artist.links) : undefined);
            }

            res.json({
                message: "Avatar uploaded",
                file: {
                    name: avatarFilename,
                    path: avatarPath,
                    size: file.size,
                },
            });
        } catch (error) {
            console.error("Avatar upload error:", error);
            res.status(500).json({ error: "Avatar upload failed" });
        }
    });

    /** Multer for site cover image: save to musicDir/assets/ as site-cover.<ext> */
    function createSiteCoverStorage(musicDir: string) {
        return multer.diskStorage({
            destination: (_req, _file, cb) => {
                const destDir = path.join(musicDir, "assets");
                fs.ensureDir(destDir)
                    .then(() => cb(null, destDir))
                    .catch(err => cb(err, destDir));
            },
            filename: (_req, file, cb) => {
                const ext = path.extname(file.originalname).toLowerCase() || ".png";
                cb(null, "site-cover" + (IMAGE_EXTENSIONS.includes(ext) ? ext : ".png"));
            },
        });
    }

    const uploadSiteCover = multer({
        storage: createSiteCoverStorage(musicDir),
        fileFilter: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            if (IMAGE_EXTENSIONS.includes(ext)) {
                cb(null, true);
            } else {
                cb(new Error(`Unsupported image type: ${ext}`));
            }
        },
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    });

    /**
     * POST /api/admin/upload/background
     * Upload site background image (saved to server, URL stored in settings)
     */
    router.post("/background", uploadBackground.single("file"), async (req: any, res) => {
        try {
            if (req.artistId) {
                if (req.file) await fs.remove(req.file.path);
                return res.status(403).json({ error: "Restricted admins cannot change site background" });
            }
            const file = req.file;
            if (!file) {
                return res.status(400).json({ error: "No file uploaded" });
            }
            console.log(`🖼️ Uploaded background image: ${file.filename}`);
            const url = "/api/settings/background";
            database.setSetting("backgroundImage", url);
            res.json({
                message: "Background image uploaded",
                url,
                file: { name: file.filename, size: file.size },
            });
        } catch (error) {
            console.error("Background upload error:", error);
            res.status(500).json({ error: "Background upload failed" });
        }
    });

    /**
     * POST /api/admin/upload/site-cover
     * Upload site cover image (for network list)
     */
    router.post("/site-cover", uploadSiteCover.single("file"), async (req: any, res) => {
        try {
            if (req.artistId) {
                if (req.file) await fs.remove(req.file.path);
                return res.status(403).json({ error: "Restricted admins cannot change site cover" });
            }
            const file = req.file;
            if (!file) {
                return res.status(400).json({ error: "No file uploaded" });
            }
            console.log(`🖼️ Uploaded site cover: ${file.filename}`);
            const url = "/api/settings/cover";
            database.setSetting("coverImage", url);
            res.json({
                message: "Site cover uploaded",
                url,
                file: { name: file.filename, size: file.size },
            });
        } catch (error) {
            console.error("Site cover upload error:", error);
            res.status(500).json({ error: "Site cover upload failed" });
        }
    });

    return router;
}
