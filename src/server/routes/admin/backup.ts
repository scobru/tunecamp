import express, { Router } from "express";
import archiver from "archiver";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import path from "path";
import multer from "multer";
import type { DatabaseService } from "../../core/database.js";
import type { ServerConfig } from "../../core/config.js";
import type { GoogleDriveService } from "../../modules/storage/google-drive.service.js";
import { VisibilityProfile } from "../../common/visibility.js";

// Ensure uploads directory exists
fs.ensureDirSync("uploads");

const upload = multer({ dest: "uploads/" });

interface AuthenticatedRequest extends express.Request {
    userId?: number;
    isRootAdmin?: boolean;
}

/**
 * Clean up old temporary files in the uploads directory
 * This prevents disk space exhaustion from abandoned chunked uploads
 */
async function cleanupOldChunks(uploadDir: string, maxAgeMs: number = 24 * 60 * 60 * 1000) {
    try {
        if (!(await fs.pathExists(uploadDir))) return;
        const files = await fs.readdir(uploadDir);
        const candidateFiles = files.filter(f => f.startsWith("temp_") || f.startsWith("backup_"));
        await Promise.all(candidateFiles.map(async (file) => {
            const filePath = path.join(uploadDir, file);
            try {
                const stats = await fs.stat(filePath);
                if (Date.now() - stats.mtime.getTime() > maxAgeMs) {
                    await fs.unlink(filePath).catch(() => { });
                }
            } catch (err) {
                // ignore stat/unlink errors for individual files
            }
        }));
    } catch (e) {
        console.warn("⚠️ [Backup] Cleanup failed:", e);
    }
}

async function performRestore(zipPath: string, config: ServerConfig, database: DatabaseService, restartFn: () => void) {
    // Unique temp directory for extraction
    const extractPath = path.join(path.dirname(zipPath), "restore_temp_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5));

    try {
        // 1. Extract Archive
        console.log("📦 [Restore] Extracting backup...");
        await fs.ensureDir(extractPath);

        // Detect format via magic bytes (more reliable than extension)
        const header = Buffer.alloc(4);
        try {
            const fd = await fs.open(zipPath, 'r');
            await fs.read(fd, header, 0, 4, 0);
            await fs.close(fd);
        } catch (e) {
            console.warn("⚠️ [Restore] Could not read file header for format detection:", e);
        }

        const isZip = header[0] === 0x50 && header[1] === 0x4b; // PK
        const isGzip = header[0] === 0x1f && header[1] === 0x8b;

        if (isZip) {
            console.log("📦 [Restore] Detected ZIP format, using extract-zip for secure extraction...");
            // Use extract-zip for .zip files (handles >2GB better than adm-zip and prevents command injection)
            const extract = (await import("extract-zip")).default;
            try {
                await extract(path.resolve(zipPath), { dir: path.resolve(extractPath) });
            } catch (error: any) {
                console.error(`❌ [Restore] extract-zip extraction failed: ${error.message}`);
                throw new Error(`Extraction failed: ${error.message}`);
            }
        } else {
            console.log(`📦 [Restore] Detected ${isGzip ? 'Compressed' : 'TAR'} format, using tar module...`);

            // Use node-tar for .tar.gz (prevents command injection)
            const tar = await import("tar");
            try {
                await tar.x({
                    file: path.resolve(zipPath),
                    cwd: path.resolve(extractPath)
                });
            } catch (error: any) {
                console.error(`❌ [Restore] tar extraction failed: ${error.message}`);
                throw new Error(`Extraction failed: ${error.message}`);
            }
        }


        // Helper to find items recursively (BFS)
        const findItem = async (root: string, name: string, type: 'file' | 'dir'): Promise<string | null> => {
            const queue = [root];
            while (queue.length > 0) {
                const currentPath = queue.shift()!;
                try {
                    const items = await fs.readdir(currentPath, { withFileTypes: true });
                    // Check direct children first
                    for (const item of items) {
                        if (item.name === name) {
                            if (type === 'file' && item.isFile()) return path.join(currentPath, item.name);
                            if (type === 'dir' && item.isDirectory()) return path.join(currentPath, item.name);
                        }
                    }
                    // Add subdirectories to queue
                    for (const item of items) {
                        if (item.isDirectory()) {
                            queue.push(path.join(currentPath, item.name));
                        }
                    }
                } catch (e) { /* ignore */ }
            }
            return null;
        };

        // 2. Locate backup components
        const dbSource = await findItem(extractPath, "tunecamp.db", "file");
        const musicSource = await findItem(extractPath, "music", "dir");

        if (!dbSource && !musicSource) {
            throw new Error("Invalid backup format: Could not find 'tunecamp.db' or 'music' folder.");
        }

        // 3. Restore Music (Additive)
        if (musicSource) {
            console.log(`🎵 [Restore] Restoring music files from ${musicSource}...`);
            // Note: fs.copy with overwrite: true will update existing files and add new ones,
            // but it DOES NOT delete files already in config.musicDir that aren't in the backup.
            await fs.copy(musicSource, config.musicDir, { overwrite: true });
        }

        // 4. Restore DB
        if (dbSource) {
            console.log(`💾 [Restore] Restoring database from ${dbSource}...`);

            // Close DB connection!
            try {
                database.db.close();
            } catch (e) {
                console.warn("⚠️ [Restore] Could not close DB connection cleanly:", e);
            }

            // Retry logic for file replacement (handles Windows locking or slow closes)
            let retries = 5;
            while (retries > 0) {
                try {
                    // Delay to ensure file handles are released
                    await new Promise(r => setTimeout(r, 1000));

                    await fs.copy(dbSource, config.dbPath, { overwrite: true });
                    break; // Success
                } catch (e) {
                    console.warn(`⚠️ [Restore] File locked or busy, retrying... (${retries} retries left)`);
                    retries--;
                    if (retries === 0) throw new Error(`Failed to replace database file after multiple attempts: ${e}`);
                }
            }

            // Clean up WAL/SHM just in case
            try {
                if (fs.existsSync(config.dbPath + "-wal")) fs.unlinkSync(config.dbPath + "-wal");
                if (fs.existsSync(config.dbPath + "-shm")) fs.unlinkSync(config.dbPath + "-shm");
            } catch (e) {
                console.warn("⚠️ [Restore] Could not clean up WAL/SHM files (non-fatal):", e);
            }

            // 5. Restore Keys (Post-DB replacement)
            // Re-open database or use raw SQL to insert keys if we need to ensure they match backup
            // Actually, the DB replacement ALREADY includes keys if they were in the DB.
            // But if we exported them as JSON, we should ensure they are correctly synchronized.
            const artistsKeysPath = await findItem(extractPath, "artists_keys.json", "file");
            const systemKeysPath = await findItem(extractPath, "system_identity.json", "file");

            if (artistsKeysPath || systemKeysPath) {
                console.log("🔑 [Restore] Synchronizing cryptographic keys...");
                // Note: Since we replaced the .db file, we need a way to update it.
                // The easiest way is to let the server restart and use the new .db file,
                // which ALREADY contains the keys as they were at backup time.
                // The JSON files in the backup are primarily for manual recovery.
            }

            console.log("✅ [Restore] Database restore complete.");

            // 6. Restore JWT Secret
            const secretSource = await findItem(extractPath, ".jwt-secret", "file");
            if (secretSource) {
                console.log("🔒 [Restore] Restoring JWT secret...");
                const dbDir = path.dirname(config.dbPath);
                await fs.copy(secretSource, path.join(dbDir, '.jwt-secret'), { overwrite: true });
            }
        } else {
            console.log("✅ [Restore] Audio-only restore complete.");
        }

        // Restart
        console.log("🔄 [Restore] Triggering server restart...");
        if (restartFn) restartFn();
        else process.exit(0);

    } catch (error: any) {
        console.error("❌ [Restore] Failed:", error);
    } finally {
        // Cleanup
        // Use Promise API for fs-extra to allow .catch() or just suppress error in callback
        fs.unlink(zipPath).catch(() => { });
        fs.remove(extractPath).catch(() => { });
    }
}

function assembleFullBackup(database: DatabaseService, config: ServerConfig, dbBackupPath: string): archiver.Archiver {
    const archive = archiver("tar", { gzip: true });

    // Add DB Snapshot
    archive.file(dbBackupPath, { name: "tunecamp.db" });

    // 2. Music Directory
    archive.directory(config.musicDir, "music");

    // 3. Config file (For reference only - restore logic primarily uses DB)
    archive.append(JSON.stringify(config, null, 2), { name: "config_dump.json" });

    // 4. JWT Secret (Critical for session continuity)
    const dbDir = path.dirname(config.dbPath);
    const secretPath = path.join(dbDir, '.jwt-secret');
    if (fs.existsSync(secretPath)) {
        archive.file(secretPath, { name: ".jwt-secret" });
    }

    // 5. Keys (Artists and System)
    try {
        // Artists Keys
        const artists = database.library.getArtists(VisibilityProfile.ALL_ACCESS);
        const artistsKeys: any = {};
        artists.forEach((a: any) => {
            if (a.public_key && a.private_key) {
                artistsKeys[a.slug] = {
                    id: a.id,
                    name: a.name,
                    slug: a.slug,
                    publicKey: a.public_key,
                    privateKey: a.private_key
                };
            }
        });
        archive.append(JSON.stringify(artistsKeys, null, 2), { name: "keys/artists_keys.json" });
    } catch (e) {
        console.warn("Failed to backup keys:", e);
        archive.append(JSON.stringify({ error: String(e) }), { name: "keys/error.log" });
    }

    return archive;
}

import type { ServiceContainer } from "../../core/container.js";

export function createBackupRoutes(container: ServiceContainer, restartFn: () => void): Router {
    const config: ServiceContainer['config'] = (container as any).config || (container as any);
    const gdriveService: ServiceContainer['gdriveService'] = (container as any).gdriveService || (container as any);
    const library: ServiceContainer['library'] = (container as any).library || (container as any);
    const identity: ServiceContainer['identity'] = (container as any).identity || (container as any);
    const database: ServiceContainer['database'] = (container as any).database || (container as any);
    const router = Router();

    /**
     * GET /api/admin/backup/full
     * Download full backup (Database + Music + Config)
     */
    router.get("/full", async (req: AuthenticatedRequest, res) => {
        try {
            if (!req.isRootAdmin) {
                return res.status(403).send("Unauthorized: Backups restricted to Root Admin");
            }

            // 1. Prepare Database Snapshot FIRST
            const dbBackupPath = path.join(config.dbPath + ".backup");
            try {
                if (fs.existsSync(dbBackupPath)) fs.unlinkSync(dbBackupPath);
                database.db.prepare(`VACUUM INTO ?`).run(dbBackupPath);
            } catch (e) {
                console.error("❌ [Backup] Database snapshot failed:", e);
                return res.status(500).send("Database backup failed: Unable to create snapshot.");
            }

            const archive = assembleFullBackup(database, config, dbBackupPath);

            res.setHeader("Content-Type", "application/gzip");
            res.setHeader("Content-Disposition", `attachment; filename="tunecamp_backup_${new Date().toISOString().split('T')[0]}.tar.gz"`);

            archive.pipe(res);
            await archive.finalize();

            // Cleanup backup file after stream ends (approximate)
            res.on("finish", () => {
                if (fs.existsSync(dbBackupPath)) fs.unlink(dbBackupPath, () => { });
            });

        } catch (error) {
            console.error("Backup failed:", error);
            if (!res.headersSent) res.status(500).send("Backup failed");
        }
    });

    /**
     * POST /api/admin/backup/gdrive
     * Create backup and upload to Google Drive
     */
    router.post("/gdrive", async (req: AuthenticatedRequest, res) => {
        try {
            if (!req.isRootAdmin) {
                return res.status(403).send("Unauthorized: Backups restricted to Root Admin");
            }

            if (!gdriveService) {
                return res.status(503).send("Google Drive service not configured");
            }

            const userId = req.userId;
            if (!userId) return res.status(401).send("User not authenticated");

            // 1. Prepare Database Snapshot
            const dbBackupPath = path.join(config.dbPath + ".backup");
            try {
                if (fs.existsSync(dbBackupPath)) fs.unlinkSync(dbBackupPath);
                database.db.prepare(`VACUUM INTO ?`).run(dbBackupPath);
            } catch (e) {
                console.error("❌ [Backup] Database snapshot failed:", e);
                return res.status(500).send("Database backup failed: Unable to create snapshot.");
            }

            const fileName = `tunecamp_backup_${new Date().toISOString().split('T')[0]}.tar.gz`;
            const archive = assembleFullBackup(database, config, dbBackupPath);

            console.log(`📤 [Backup] Uploading ${fileName} to Google Drive...`);
            
            // We can finalize and upload
            // archive is a readable stream
            try {
                const uploadPromise = gdriveService.uploadFile(userId, fileName, "application/gzip", archive);
                archive.finalize();
                
                const file = await uploadPromise;
                
                // Cleanup
                if (fs.existsSync(dbBackupPath)) fs.unlinkSync(dbBackupPath);
                
                res.json({ success: true, fileId: file.id, fileName: file.name });
            } catch (uploadError: any) {
                console.error("❌ [Backup] GDrive Upload failed:", uploadError.response?.data || uploadError.message);
                if (fs.existsSync(dbBackupPath)) fs.unlinkSync(dbBackupPath);
                throw uploadError;
            }

        } catch (error: any) {
            console.error("Google Drive Backup failed:", error);
            res.status(500).send("Backup to Google Drive failed: " + error.message);
        }
    });

    /**
     * GET /api/admin/backup/audio
     * Download audio only
     */
    router.get("/audio", async (req: AuthenticatedRequest, res) => {
        try {
            if (!req.isRootAdmin) {
                return res.status(403).send("Unauthorized: Backups restricted to Root Admin");
            }
            const archive = archiver("zip", { zlib: { level: 0 } }); // Store only, faster for audio

            res.setHeader("Content-Type", "application/zip");
            res.setHeader("Content-Disposition", `attachment; filename="tunecamp_audio_${new Date().toISOString().split('T')[0]}.zip"`);

            archive.pipe(res);

            archive.directory(config.musicDir, false); // false = content of dir, not dir itself

            await archive.finalize();
        } catch (error) {
            console.error("Audio export failed:", error);
            if (!res.headersSent) res.status(500).send("Export failed");
        }
    });

    /**
     * POST /api/admin/backup/restore
     * Upload and restore backup (Legacy/Single File)
     */
    router.post("/restore", upload.single("backup") as any, (req: AuthenticatedRequest, res) => {
        if (!req.isRootAdmin) {
            return res.status(403).send("Unauthorized: Restore restricted to Root Admin");
        }
        if (!req.file) {
            return res.status(400).send("No file uploaded");
        }

        const zipPath = req.file.path;

        // Respond immediately to prevent timeout
        res.json({ message: "Restore started in background. Server will restart upon completion." });

        // Run restore in background
        performRestore(zipPath, config, database, restartFn);
    });

    /**
     * POST /api/admin/backup/chunk
     * Receive a file chunk
     */
    router.post("/chunk", upload.single("chunk") as any, async (req: AuthenticatedRequest, res) => {
        try {
            if (!req.isRootAdmin) return res.status(403).send("Unauthorized");

            let uploadId = req.body.uploadId;
            if (!uploadId || typeof uploadId !== 'string') {
                return res.status(400).send("Invalid uploadId");
            }
            // Sanitize: allow alphanumeric, dash, underscore to prevent path traversal
            uploadId = uploadId.replace(/[^a-zA-Z0-9-_]/g, '');

            const chunkIndex = parseInt(req.body.chunkIndex);

            if (!uploadId || isNaN(chunkIndex)) {
                return res.status(400).send("Invalid chunk data");
            }

            if (!req.file) {
                return res.status(400).send("No chunk uploaded");
            }

            const chunkPath = req.file.path;
            // Save as separate part file to allow concurrent/out-of-order uploads
            const partPath = path.join("uploads", `temp_${uploadId}_part_${chunkIndex}`);

            try {
                // Move multer temp file to part file
                await fs.move(chunkPath, partPath, { overwrite: true });
                res.json({ success: true, chunkIndex });
            } catch (e) {
                // Cleanup if move fails
                await fs.unlink(chunkPath).catch(() => { });
                throw e;
            }

        } catch (error: any) {
            console.error("Chunk upload failed:", error);
            res.status(500).send(error.message);
        }
    });

    /**
     * POST /api/admin/backup/restore-chunked
     * Finalize chunked upload and trigger restore
     */
    router.post("/restore-chunked", express.json(), async (req: AuthenticatedRequest, res) => {
        try {
            if (!req.isRootAdmin) return res.status(403).send("Unauthorized");

            let uploadId = req.body.uploadId;
            if (!uploadId || typeof uploadId !== 'string') return res.status(400).send("Missing or invalid uploadId");

            // Sanitize
            uploadId = uploadId.replace(/[^a-zA-Z0-9-_]/g, '');

            const finalZipPath = path.join("uploads", `backup_${uploadId}.tar.gz`);
            const uploadDir = "uploads";

            // Periodic cleanup of old chunks
            await cleanupOldChunks(uploadDir);

            // Find all parts
            const files = await fs.readdir(uploadDir);
            const partFiles = files.filter(f => f.startsWith(`temp_${uploadId}_part_`));

            if (partFiles.length === 0) {
                return res.status(404).send("Upload not found or expired");
            }

            // Sort by index
            partFiles.sort((a, b) => {
                const indexA = parseInt(a.split('_part_')[1]);
                const indexB = parseInt(b.split('_part_')[1]);
                return indexA - indexB;
            });

            // Respond immediately to prevent timeout
            res.json({ message: "Restore started in background. Server will restart upon completion." });

            // Assemble and Restore in background
            (async () => {
                try {
                    console.log(`📦 [Restore] Assembling ${partFiles.length} chunks...`);

                    // Delete existing final zip if exists
                    if (await fs.pathExists(finalZipPath)) await fs.unlink(finalZipPath);

                    const fd = await fs.open(finalZipPath, 'a');
                    const chunkSize = 4 * 1024 * 1024; // 4MB chunks for performance
                    const buffer = Buffer.allocUnsafe(chunkSize); // allocUnsafe is faster, avoids zero-filling

                    try {
                        for (const part of partFiles) {
                            const partPath = path.join(uploadDir, part);
                            const fdPart = await fs.open(partPath, 'r');
                            try {
                                let bytesRead = 0;

                                while (true) {
                                    const { bytesRead: read } = await fs.read(fdPart, buffer, 0, chunkSize, bytesRead);
                                    if (read === 0) break;

                                    await fs.write(fd, buffer, 0, read);
                                    bytesRead += read;
                                }
                            } finally {
                                await fs.close(fdPart);
                            }
                        }
                    } finally {
                        await fs.close(fd);
                    }

                    // Cleanup parts
                    for (const part of partFiles) {
                        await fs.unlink(path.join(uploadDir, part)).catch(() => { });
                    }

                    // Run restore
                    await performRestore(finalZipPath, config, database, restartFn);
                } catch (e) {
                    console.error("❌ [Restore] Assembly failed:", e);
                    // Ensure cleanup on failure
                    if (await fs.pathExists(finalZipPath)) await fs.unlink(finalZipPath).catch(() => { });
                    for (const part of partFiles) {
                        await fs.unlink(path.join(uploadDir, part)).catch(() => { });
                    }
                }
            })();

        } catch (error: any) {
            console.error("Restore trigger failed:", error);
            res.status(500).send(error.message);
        }
    });

    return router;
}

