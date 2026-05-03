import express, { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import os from "os";
import axios from "axios";
import type { DatabaseService } from "../database.js";
import type { ScannerService } from "../scanner.js";
import type { AuthService } from "../auth.js";
import type { PublishingService } from "../publishing.js";
import { sanitizeFilename } from "../../utils/audioUtils.js";
import type { StorageEngine } from "../modules/storage/storage.engine.js";
import { createAuthMiddleware } from "../middleware/auth.js";

const AUDIO_EXTENSIONS = [".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

/**
 * Configure multer storage - Use system temp dir to avoid scanner interference
 */
function createTempStorage() {
    return multer.diskStorage({
        destination: (req, file, cb) => {
            const destDir = os.tmpdir();
            console.log(`📂 [Debug] Multer destination: ${destDir}`);
            cb(null, destDir);
        },
        filename: (req, file, cb) => {
            // Use random name to avoid collisions in temp
            const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
            const ext = path.extname(file.originalname).toLowerCase();
            const filename = file.fieldname + '-' + uniqueSuffix + ext;
            console.log(`📄 [Debug] Multer filename: ${filename}`);
            cb(null, filename);
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
    console.log(`🔍 [Debug] Multer fileFilter seeing file: ${file.fieldname} (${file.originalname})`);
    const ext = path.extname(file.originalname).toLowerCase();
    const isAudio = AUDIO_EXTENSIONS.includes(ext);
    const isImage = IMAGE_EXTENSIONS.includes(ext);

    if (isAudio || isImage) {
        cb(null, true);
    } else {
        console.warn(`❌ [Debug] Multer rejected file type: ${ext}`);
        cb(new Error(`Unsupported file type: ${ext}`));
    }
}

/**
 * File filter for images only
 */
function imageFileFilter(
    _req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMAGE_EXTENSIONS.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`Unsupported image type: ${ext}`));
    }
}

// Removed createBackgroundStorage in favor of createTempStorage

export function createUploadRoutes(
    database: DatabaseService,
    scanner: ScannerService,
    musicDir: string,
    publishingService: PublishingService,
    storage: StorageEngine,
    authService?: AuthService
): Router {
    const router = Router();

    if (authService) {
        const authMiddleware = createAuthMiddleware(authService);
        router.use(authMiddleware.requireWriteAccess);
    }

    const upload = multer({
        storage: createTempStorage(),
        fileFilter,
        limits: { fileSize: 1024 * 1024 * 1024 } // 1GB limit
    });

    // Memory storage for covers (small files, avoids disk I/O in middleware)
    const uploadMemory = multer({
        storage: multer.memoryStorage(),
        fileFilter,
        limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for covers
    });

    const imageUpload = multer({
        storage: createTempStorage(),
        fileFilter: imageFileFilter,
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    });

    /**
     * Helper for site-wide image uploads (background, site cover)
     */
    async function handleSiteSettingImageUpload(
        req: any,
        res: any,
        options: {
            type: string,
            settingKey: string,
            apiUrl: string,
            errorLabel: string
        }
    ) {
        try {
            if (!req.isRootAdmin) {
                if (req.file) await storage.remove(req.file.path);
                return res.status(403).json({ error: "Only root admin can change site settings" });
            }
            const file = req.file;
            if (!file) {
                return res.status(400).json({ error: "No file uploaded" });
            }
            console.log(`🖼️ Uploaded ${options.errorLabel}: ${file.originalname}`);

            // Move to assets
            const assetsDir = path.join(musicDir, "assets");
            await storage.ensureDir(assetsDir);

            const ext = path.extname(file.originalname).toLowerCase() || ".png";
            const targetFilename = options.type + (IMAGE_EXTENSIONS.includes(ext) ? ext : ".png");
            const targetPath = path.join(assetsDir, targetFilename);

            await storage.move(file.path, targetPath, { overwrite: true });

            database.setSetting(options.settingKey, options.apiUrl);
            res.json({
                message: `${options.errorLabel.charAt(0).toUpperCase() + options.errorLabel.slice(1)} uploaded`,
                url: options.apiUrl,
                file: { name: targetFilename, size: file.size },
            });
        } catch (error) {
            console.error(`${options.errorLabel} upload error:`, error);
            if (req.file) await storage.remove(req.file.path).catch(() => { });
            res.status(500).json({ error: `${options.errorLabel.charAt(0).toUpperCase() + options.errorLabel.slice(1)} upload failed` });
        }
    }

    /**
     * POST /api/admin/upload/tracks
     * Upload one or more audio files
     */
    router.post("/tracks", upload.array("files", 50) as any, async (req: any, res: any) => {
        try {
            const files = req.files as Express.Multer.File[];
            const { releaseSlug, artistId: bodyArtistId, artist: bodyArtistName, album: bodyAlbumTitle } = req.body;

            // Get release if applicable
            const formalRelease = releaseSlug ? database.getReleaseBySlug(releaseSlug) : undefined;
            const libraryAlbum = releaseSlug ? database.getAlbumBySlug(releaseSlug) : undefined;
            const release = formalRelease || libraryAlbum;

            // Determine the target artist ID for these tracks
            let targetArtistId: number | undefined = undefined;

            if (release) {
                // If uploading to a specific release, tracks should belong to that release's artist
                targetArtistId = release.artist_id ?? undefined;
            } else if (bodyArtistId && req.isAdmin) {
                // Explicit ID takes priority (Admin only)
                targetArtistId = parseInt(bodyArtistId as string);
            } else if (bodyArtistName && (req.isAdmin || (req.isActive && !req.artistId))) {
                // Name-based lookup/creation for admins or new active artists without a profile
                const trimmedName = bodyArtistName.trim();
                if (trimmedName) {
                    const artist = database.getArtistByName(trimmedName);
                    targetArtistId = artist ? artist.id : database.createArtist(trimmedName);
                }
            } else if (!req.isAdmin) {
                // Default to uploader's own artistId (for non-admin artists)
                targetArtistId = (req as any).artistId ?? undefined;
            }

            // Determine target album/release ID
            let targetAlbumId: number | undefined = release?.id;

            if (!targetAlbumId && bodyAlbumTitle && (req.isAdmin || req.isActive)) {
                // Find or create library album by title
                const trimmedTitle = bodyAlbumTitle.trim();
                if (trimmedTitle) {
                    const slug = "lib-" + trimmedTitle.toLowerCase().replace(/[^a-z0-9]/g, '-');
                    let album = database.getAlbumBySlug(slug);
                    if (!album) {
                        const newAlbumId = database.createAlbum({
                            title: trimmedTitle,
                            slug: slug,
                            artist_id: targetArtistId || null,
                            owner_id: req.userId || null,
                            date: null,
                            cover_path: null,
                            genre: "Unknown",
                            description: `Auto-generated from upload`,
                            type: 'album',
                            year: new Date().getFullYear(),
                            download: null,
                            price: 0,
                            price_usdc: 0,
                            currency: 'ETH',
                            external_links: null,
                            is_public: false,
                            visibility: 'private',
                            is_release: false,
                            published_at: null,
                            published_to_gundb: false,
                            published_to_ap: false,
                            license: 'copyright',
                            status: 'draft',
                        });
                        album = database.getAlbum(newAlbumId);
                    }
                    targetAlbumId = album?.id;
                }
            }

            if (!req.isAdmin && !req.isActive) {
                if (files) {
                    await Promise.all(files.map(file => storage.remove(file.path).catch(() => {})));
                }
                return res.status(403).json({ error: "Access denied: Account must be activated by admin to upload tracks" });
            }

            if (!files || files.length === 0) {
                return res.status(400).json({ error: "No files uploaded" });
            }

            console.log(`📤 Upload received: ${files.length} track(s)`);
            files.forEach(f => console.log(`   - ${f.originalname}: ${(f.size / 1024 / 1024).toFixed(2)} MB`));
            if (releaseSlug) {
                console.log(`   Target Release Slug: ${releaseSlug} (Artist ID: ${targetArtistId})`);
            } else if (targetArtistId) {
                console.log(`   Target Artist ID: ${targetArtistId}`);
            } else {
                console.log(`   Target Artist: Determined by metadata`);
            }

            // Retrieve currentUser to use for quota and ownership attribution
            let currentUser: any = undefined;
            if (authService && req.username) {
                currentUser = authService.getUserByUsername(req.username);
            }

            // Storage quota check for non-admin users
            if (currentUser && currentUser.storage_quota > 0 && authService) {
                const storageInfo = authService.getStorageInfo(currentUser.id);
                const totalUploadSize = files.reduce((sum, f) => sum + f.size, 0);
                const currentUsed = storageInfo?.storage_used || 0;
                const remaining = currentUser.storage_quota - currentUsed;

                if (totalUploadSize > remaining) {
                    // Cleanup temp files
                    await Promise.all(files.map(file => storage.remove(file.path).catch(() => {})));
                    const quotaMB = (currentUser.storage_quota / 1024 / 1024).toFixed(1);
                    const usedMB = (currentUsed / 1024 / 1024).toFixed(1);
                    const remainingMB = (remaining / 1024 / 1024).toFixed(1);
                    return res.status(413).json({
                        error: `Storage quota exceeded. Used: ${usedMB}MB / ${quotaMB}MB. Remaining: ${remainingMB}MB.`
                    });
                }
            }

            if (releaseSlug && !release) {
                console.warn(`⚠️ Target release not found: ${releaseSlug}`);
            }

            // SECURITY FIX: Prevent uploading to another artist's release (unless root admin)
            const isAuthorized = req.isRootAdmin ||
                (req.userId !== undefined && req.userId !== null && release?.owner_id !== undefined && release?.owner_id !== null && Number(release.owner_id) === Number(req.userId)) ||
                (req.artistId !== undefined && req.artistId !== null && release?.artist_id !== undefined && release?.artist_id !== null && Number(release.artist_id) === Number(req.artistId));

            if (release && !isAuthorized) {
                console.warn(`⛔ Access Denied: User ${(req as any).username} (User ID ${req.userId}) tried to upload to release ${release.slug} (Owner ${release.owner_id})`);
                // Cleanup temp files
                await Promise.all(files.map(file => storage.remove(file.path).catch(() => {})));
                return res.status(403).json({ error: "Access denied: Cannot upload tracks to another artist's release" });
            }

            // Move files from temp to their final destination
            // Unified File Architecture: 
            // - If associated with a release -> musicDir/releases/<safe-slug>/
            // - If orphaned (no release) -> musicDir/tracks/
            let destDir: string;

            if (release) {
                // SECURITY: Use release.slug from DB, not req.body.releaseSlug
                const safeSlug = release.slug;
                destDir = path.join(musicDir, "releases", safeSlug);
            } else {
                destDir = path.join(musicDir, "tracks");
            }

            await storage.ensureDir(destDir);

            let movedCount = 0;
            let processedCount = 0;
            const scannerResults = [];

            for (const file of files) {
                const sanitizedName = sanitizeFilename(file.originalname);
                let destPath = path.join(destDir, sanitizedName);

                // Collision handling: If filename exists, rename it (unless hash logic handles it)
                const ext = path.extname(sanitizedName);
                const nameBase = path.basename(sanitizedName, ext);
                let counter = 1;
                while (await storage.pathExists(destPath)) {
                    destPath = path.join(destDir, `${nameBase}_${counter}${ext}`);
                    counter++;
                }

                try {
                    await storage.move(file.path, destPath, { overwrite: false });
                    movedCount++;

                    // Process immediately to get Track ID, pass uploader's user ID as ownerId
                    const uploaderId = req.userId;
                    const scanResult = await scanner.processAudioFile(destPath, musicDir, targetArtistId, uploaderId, targetAlbumId);

                    if (scanResult && scanResult.success && scanResult.trackId) {
                        scannerResults.push(scanResult);
                        processedCount++;

                        // Link to release if applicable
                        if (release) {
                            if (formalRelease) {
                                database.addTrackToRelease(release.id, scanResult.trackId);
                                console.log(`   🔗 Linked new track ${scanResult.trackId} to formal release ${release.title}`);
                            } else {
                                database.updateTrackAlbum(scanResult.trackId, release.id);
                                console.log(`   🔗 Linked new track ${scanResult.trackId} to library album ${release.title}`);
                            }
                        }
                    }

                } catch (err) {
                    console.error(`❌ Failed to move or process uploaded file ${file.path}:`, err);
                    await storage.remove(file.path).catch(() => { });
                }
            }

            console.log(`✅ Processed ${movedCount}/${files.length} uploads to ${destDir}. Scanned: ${processedCount}`);
            
            // Sync changes if we uploaded to a release
            if (release && processedCount > 0) {
                publishingService.syncRelease(release.id).catch(e => console.error("❌ Failed to sync release after track upload:", e));
            }

            // Update storage usage for quota-tracked users
            if (currentUser && processedCount > 0 && authService) {
                if (currentUser.storage_quota > 0) {
                    // Recalculate based on ALL processed files in this upload
                    const uploadedBytes = files.reduce((sum, f) => sum + f.size, 0);
                    const storageInfo = authService.getStorageInfo(currentUser.id);
                    const newUsed = (storageInfo?.storage_used || 0) + uploadedBytes;
                    authService.updateStorageUsed(currentUser.id, newUsed);
                    console.log(`📊 Updated storage for ${req.username}: ${(newUsed / 1024 / 1024).toFixed(1)}MB / ${(currentUser.storage_quota / 1024 / 1024).toFixed(1)}MB`);
                }
            }

            res.status(202).json({
                message: `Uploaded ${movedCount} files. ${processedCount} processed and linked.`,
                results: scannerResults
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
    router.post("/cover", (req: any, res: any, next: any) => {
        console.log("🔍 [Debug] Upload Request Headers:", req.headers['content-type']);
        next();
    }, imageUpload.single("file") as any, async (req: any, res: any) => {
        try {
            console.log("🔍 [Debug] Inside /cover handler");
            console.log("🔍 [Debug] req.file:", req.file ? `${req.file.originalname} (${req.file.size} bytes)` : "undefined");
            console.log("🔍 [Debug] req.body:", req.body);

            const file = req.file;
            const releaseSlug = req.body.releaseSlug;

            if (!file) {
                console.error("❌ [Debug] No file in req.file");
                return res.status(400).json({ error: "No file uploaded" });
            }

            if (!req.isAdmin && !req.isActive) {
                if (file) await storage.remove(file.path).catch(() => {});
                return res.status(403).json({ error: "Access denied: Account must be activated by admin to upload covers" });
            }

            console.log(`🎨 Uploaded cover: ${file.originalname}`);

            // If release slug provided, update release.yaml and database
            if (releaseSlug) {
                // Permission Check
                const release = database.getReleaseBySlug(releaseSlug);
                const album = database.getAlbumBySlug(releaseSlug);
                const targetItem = release || album;

                if (!targetItem) {
                    await storage.remove(file.path);
                    return res.status(404).json({ error: "Release not found" });
                }

                const isAuthorized = req.isRootAdmin ||
                    (req.userId !== undefined && req.userId !== null && targetItem.owner_id !== undefined && targetItem.owner_id !== null && Number(targetItem.owner_id) === Number(req.userId)) ||
                    (req.artistId !== undefined && req.artistId !== null && targetItem.artist_id !== undefined && targetItem.artist_id !== null && Number(targetItem.artist_id) === Number(req.artistId));

                if (!isAuthorized) {
                    await storage.remove(file.path);
                    return res.status(403).json({ error: "Access denied: Cannot upload cover for another artist's release" });
                }

                // 1. Determine target directory: musicDir/releases/<slug>/artwork/
                // SECURITY: Use targetItem.slug (from DB) instead of req.body.releaseSlug to prevent path traversal
                const safeSlug = targetItem.slug;
                const releaseDir = path.join(musicDir, "releases", safeSlug);
                const artworkDir = path.join(releaseDir, "artwork");
                await storage.ensureDir(artworkDir);

                // 2. Move file to artwork dir with UNIQUE name to avoid locking
                const ext = path.extname(file.originalname).toLowerCase();
                const uniqueId = Date.now();
                const targetFilename = `cover-${uniqueId}${ext}`;
                const targetPath = path.join(artworkDir, targetFilename);

                await storage.move(file.path, targetPath, { overwrite: true });
                console.log(`   Moved cover to: ${targetPath}`);

                // 3. Update release.yaml (relative to release dir)
                const releaseYamlPath = path.join(releaseDir, "release.yaml");
                if (await storage.pathExists(releaseYamlPath)) {
                    try {
                        const yaml = await import("yaml");
                        const content = await storage.readFile(releaseYamlPath, "utf-8");
                        const config = yaml.parse(content);
                        config.cover = `artwork/${targetFilename}`; // Relative to release.yaml
                        await storage.writeFile(releaseYamlPath, yaml.stringify(config));
                    } catch (err) {
                        console.error("Error updating release.yaml:", err);
                    }
                }

                // 4. Update database (relative to musicDir)
                const dbPath = path.relative(musicDir, targetPath).replace(/\\/g, "/");
                if (release) {
                    database.updateRelease(release.id, { cover_path: dbPath });
                    console.log(`📀 Updated cover for formal release ${release.title} -> ${dbPath}`);
                } else if (album) {
                    database.updateAlbumCover(album.id, dbPath);
                    console.log(`📀 Updated cover for library album ${album.title} -> ${dbPath}`);
                }

                // 5. Cleanup old covers (Best effort)
                try {
                    const files = await storage.readdir(artworkDir);
                    for (const f of files) {
                        if (f !== targetFilename && (f.startsWith("cover") || f.startsWith("folder") || f.startsWith("artwork"))) {
                            try {
                                await storage.remove(path.join(artworkDir, f));
                            } catch (e) {
                                console.warn(`   [Cleanup] Could not delete old cover ${f} (likely locked):`, e);
                            }
                        }
                    }
                } catch (cleanupErr) {
                    console.warn("   [Cleanup] Failed to list/clean artwork directory:", cleanupErr);
                }

                // 6. Sync changes
                publishingService.syncRelease(targetItem.id).catch(e => console.error("Failed to sync cover upload:", e));
            } else {
                // Orphan upload? Just clean up
                await storage.remove(file.path);
            }

            res.json({
                message: "Cover uploaded",
                file: {
                    name: file.originalname, // Return original name
                    size: file.size,
                },
            });
            console.log(`✅ Cover upload completed: ${file.originalname}`);
        } catch (error) {
            console.error("❌ Cover upload error:", error);
            // Try cleanup
            if (req.file) await storage.remove(req.file.path).catch(() => { });
            res.status(500).json({ error: "Cover upload failed" });
        }
    });

    /**
     * POST /api/admin/upload/avatar
     * Upload avatar for an artist
     */
    router.post("/avatar", imageUpload.single("file") as any, async (req: any, res: any) => {
        try {
            const file = req.file;
            const artistIdRaw = req.body.artistId;
            const artistId = artistIdRaw ? parseInt(artistIdRaw as string, 10) : undefined;

            if (!file) {
                return res.status(400).json({ error: "No file uploaded" });
            }

            if (!req.isAdmin && !req.isActive) {
                if (file) await storage.remove(file.path).catch(() => {});
                return res.status(403).json({ error: "Access denied: Account must be activated by admin to upload avatars" });
            }

            if (!artistId) {
                return res.status(400).json({ error: "Artist ID required" });
            }

            // Permission Check
            const isAuthorizedAvatar = req.isRootAdmin ||
                (req.artistId !== undefined && req.artistId !== null && artistId !== undefined && artistId !== null && Number(req.artistId) === Number(artistId));
            if (!isAuthorizedAvatar) {
                await storage.remove(file.path);
                return res.status(403).json({ error: "Access denied: You can only upload avatars for your own artist" });
            }

            console.log(`👤 Uploaded avatar for artist ${artistId}: ${file.originalname}`);

            const ext = path.extname(file.originalname).toLowerCase();

            // Move avatar to assets folder
            const assetsDir = path.join(musicDir, "assets");
            await storage.ensureDir(assetsDir);

            const avatarFilename = `avatar-${artistId}${ext}`;
            const avatarPath = path.join(assetsDir, avatarFilename);

            // Remove old file if in different location, or overwrite
            if (file.path !== avatarPath) {
                await storage.move(file.path, avatarPath, { overwrite: true });
            }

            // Update artist in database (relative path)
            const artist = database.getArtist(artistId);
            if (artist) {
                const dbPath = path.relative(musicDir, avatarPath).replace(/\\/g, "/");
                // Correct parameter order: (id, name, bio, photoPath, links)
                // We pass undefined for name to avoid changing it.
                database.updateArtist(artist.id, undefined, artist.bio || undefined, dbPath, artist.links ? JSON.parse(artist.links) : undefined);
            }


            res.json({
                message: "Avatar uploaded",
                file: {
                    name: avatarFilename,
                    path: avatarPath,
                    size: file.size,
                },
            });
            console.log(`✅ Avatar upload completed for artist ${artistId}`);
        } catch (error) {
            console.error("❌ Avatar upload error:", error);
            if (req.file) await storage.remove(req.file.path).catch(() => { });
            res.status(500).json({ error: "Avatar upload failed" });
        }
    });

    // Removed createSiteCoverStorage

    /**
     * POST /api/admin/upload/track-artwork
     * Upload custom artwork for a track
     */
    router.post("/track-artwork", imageUpload.single("file") as any, async (req: any, res: any) => {
        try {
            const file = req.file;
            const trackIdRaw = req.body.trackId;
            const trackId = trackIdRaw ? parseInt(trackIdRaw as string, 10) : undefined;

            if (!file) return res.status(400).json({ error: "No file uploaded" });
            if (!trackId) return res.status(400).json({ error: "Track ID required" });

            if (!req.isAdmin && !req.isActive) {
                if (file) await storage.remove(file.path).catch(() => {});
                return res.status(403).json({ error: "Access denied: Account must be activated by admin to upload track artwork" });
            }

            const track = database.getTrack(trackId);
            if (!track) {
                await storage.remove(file.path);
                return res.status(404).json({ error: "Track not found" });
            }

            // Permission Check
            const isOwner = req.userId !== undefined && req.userId !== null && track.owner_id !== undefined && track.owner_id !== null && Number(track.owner_id) === Number(req.userId);
            if (!req.isRootAdmin && !isOwner) {
                await storage.remove(file.path);
                return res.status(403).json({ error: "Access denied: Cannot upload artwork for this track" });
            }

            const ext = path.extname(file.originalname).toLowerCase();
            const assetsDir = path.join(musicDir, "assets", "tracks");
            await storage.ensureDir(assetsDir);

            const targetFilename = `track-${trackId}-${Date.now()}${ext}`;
            const targetPath = path.join(assetsDir, targetFilename);

            await storage.move(file.path, targetPath, { overwrite: true });

            const dbPath = path.relative(musicDir, targetPath).replace(/\\/g, "/");
            database.updateTrackExternalArtwork(trackId, dbPath);

            res.json({
                message: "Track artwork uploaded",
                url: `/api/tracks/${trackId}/cover`,
                file: { name: targetFilename, path: targetPath, size: file.size }
            });
            console.log(`✅ Track artwork upload completed for track ${trackId}`);
        } catch (error) {
            console.error("❌ Track artwork upload error:", error);
            if (req.file) await storage.remove(req.file.path).catch(() => { });
            res.status(500).json({ error: "Track artwork upload failed" });
        }
    });

    /**
     * POST /api/admin/upload/avatar-url
     * Download avatar for an artist from a URL
     */
    router.post("/avatar-url", express.json(), async (req: any, res: any) => {
        try {
            const { artistId, url } = req.body || {};
            
            if (!req.body) {
                return res.status(400).json({ error: "No JSON body provided" });
            }

            if (!url || !artistId) {
                return res.status(400).json({ error: "Artist ID and URL are required" });
            }

            if (!req.isAdmin && !req.isActive) {
                return res.status(403).json({ error: "Access denied: Account must be activated by admin to upload avatars" });
            }

            const id = parseInt(artistId as string, 10);

            // Permission Check
            const isAuthorizedUrl = req.isRootAdmin ||
                (req.artistId !== undefined && req.artistId !== null && id !== undefined && id !== null && Number(req.artistId) === Number(id));
            if (!isAuthorizedUrl) {
                return res.status(403).json({ error: "Access denied: You can only upload avatars for your own artist" });
            }

            console.log(`👤 Downloading avatar for artist ${id} from: ${url}`);

            const response = await axios.get(url, { 
                responseType: 'arraybuffer', 
                timeout: 30000, // Increased timeout
                maxRedirects: 5,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Referer': 'https://www.theaudiodb.com/'
                }
            });
            const contentType = response.headers['content-type'];
            
            if (typeof contentType !== 'string' || !contentType.startsWith('image/')) {
                console.warn(`⚠️ URL ${url} returned invalid content-type: ${contentType}`);
                return res.status(400).json({ error: "URL does not point to a valid image" });
            }

            const contentTypeStr = contentType as string;

            // Determine extension
            let ext = '.jpg';
            if (contentTypeStr.includes('png')) ext = '.png';
            else if (contentTypeStr.includes('webp')) ext = '.webp';
            else if (contentTypeStr.includes('gif')) ext = '.gif';

            const assetsDir = path.join(musicDir, "assets");
            await storage.ensureDir(assetsDir);

            const avatarFilename = `avatar-${id}${ext}`;
            const avatarPath = path.join(assetsDir, avatarFilename);

            await storage.writeFile(avatarPath, response.data);

            // Update artist in database (relative path)
            const artist = database.getArtist(id);
            if (artist) {
                const dbPath = path.relative(musicDir, avatarPath).replace(/\\/g, "/");
                // Correct parameter order: (id, name, bio, photoPath, links)
                // We pass undefined for name to avoid changing it.
                database.updateArtist(artist.id, undefined, artist.bio || undefined, dbPath, artist.links ? JSON.parse(artist.links) : undefined);
            }


            res.json({ message: "Avatar downloaded and saved" });
            console.log(`✅ Avatar URL download completed for artist ${id}`);
        } catch (error: any) {
            const url = req.body?.url;
            console.error(`❌ Avatar URL download error for ${url || 'unknown URL'}:`, error.message);
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
            }
            res.status(500).json({ error: `Failed to download image from URL: ${error.message}` });
        }
    });

    /**
     * POST /api/admin/upload/background
     * Upload site background image (saved to server, URL stored in settings)
     */
    router.post("/background", imageUpload.single("file") as any, async (req: any, res: any) => {
        await handleSiteSettingImageUpload(req, res, {
            type: "background",
            settingKey: "backgroundImage",
            apiUrl: "/api/settings/background",
            errorLabel: "site background"
        });
    });

    /**
     * POST /api/admin/upload/site-cover
     * Upload site cover image (for network list)
     */
    router.post("/site-cover", imageUpload.single("file") as any, async (req: any, res: any) => {
        await handleSiteSettingImageUpload(req, res, {
            type: "site-cover",
            settingKey: "coverImage",
            apiUrl: "/api/settings/cover",
            errorLabel: "site cover"
        });
    });

    return router;
}
