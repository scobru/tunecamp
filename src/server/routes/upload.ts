import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs-extra";
import type { DatabaseService } from "../database.js";
import type { ScannerService } from "../scanner.js";

const AUDIO_EXTENSIONS = [".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

/**
 * Configure multer storage
 */
function createStorage(musicDir: string) {
    return multer.diskStorage({
        destination: async (req, file, cb) => {
            // Determine destination based on request
            const releaseSlug = req.body.releaseSlug;
            const uploadType = req.body.type || "library";

            let destDir: string;

            if (releaseSlug) {
                // Upload to release folder
                const isAudio = AUDIO_EXTENSIONS.includes(
                    path.extname(file.originalname).toLowerCase()
                );
                destDir = isAudio
                    ? path.join(musicDir, "releases", releaseSlug, "tracks")
                    : path.join(musicDir, "releases", releaseSlug, "artwork");
            } else if (uploadType === "release") {
                // No slug but type is release - use library as fallback
                destDir = path.join(musicDir, "library");
            } else {
                // Upload to library
                destDir = path.join(musicDir, "library");
            }

            await fs.ensureDir(destDir);
            cb(null, destDir);
        },
        filename: (req, file, cb) => {
            // Use original filename, sanitized
            const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
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

            // Trigger rescan to process new files
            await scanner.scanDirectory(musicDir);

            res.json({
                message: `Uploaded ${files.length} file(s)`,
                files: files.map((f) => ({
                    name: f.originalname,
                    path: f.path,
                    size: f.size,
                })),
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

                // Trigger rescan
                await scanner.scanDirectory(musicDir);
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
            const artistId = req.body.artistId;

            if (!file) {
                return res.status(400).json({ error: "No file uploaded" });
            }

            if (!artistId) {
                return res.status(400).json({ error: "Artist ID required" });
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
            const artist = database.getArtist(parseInt(artistId, 10));
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

    return router;
}
