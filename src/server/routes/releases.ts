import { Router } from "express";
import path from "path";
import fs from "fs-extra";
import { stringify } from "yaml";
import type { DatabaseService } from "../database.js";
import type { ScannerService } from "../scanner.js";
import { slugify } from "../../utils/audioUtils.js";

interface CreateReleaseBody {
    title: string;
    date?: string;
    description?: string;
    genres?: string[];
    download?: "free" | "paycurtain" | "codes" | "none";
    price?: number;
    artistName?: string;
    externalLinks?: { label: string; url: string }[] | { [key: string]: string };
}

interface UpdateReleaseBody extends Partial<CreateReleaseBody> {
    isPublic?: boolean;
}



export function createReleaseRoutes(
    database: DatabaseService,
    scanner: ScannerService,
    musicDir: string
) {
    const router = Router();

    /**
     * POST /api/admin/releases
     * Create a new release
     */
    router.post("/", async (req, res) => {
        try {
            const body = req.body as CreateReleaseBody;

            if (!body.title) {
                return res.status(400).json({ error: "Title is required" });
            }

            const slug = slugify(body.title);
            const releaseDir = path.join(musicDir, "releases", slug);

            // Check if release already exists
            if (await fs.pathExists(releaseDir)) {
                return res.status(409).json({ error: "Release with this title already exists" });
            }

            // Create folder structure
            await fs.ensureDir(path.join(releaseDir, "tracks"));
            await fs.ensureDir(path.join(releaseDir, "artwork"));

            // Create release.yaml
            const releaseConfig: Record<string, any> = {
                title: body.title,
                date: body.date || new Date().toISOString().split("T")[0],
            };

            if (body.description) releaseConfig.description = body.description;
            if (body.genres && body.genres.length > 0) releaseConfig.genres = body.genres;
            if (body.download) releaseConfig.download = body.download;
            if (body.price) releaseConfig.price = body.price;
            if (body.artistName) releaseConfig.artist = body.artistName;

            await fs.writeFile(
                path.join(releaseDir, "release.yaml"),
                stringify(releaseConfig)
            );

            console.log(`📀 Created release: ${body.title} (${slug})`);

            // Trigger rescan
            await scanner.scanDirectory(musicDir);

            // Get the created album from database
            const album = database.getAlbumByTitle(body.title);

            res.status(201).json({
                message: "Release created",
                slug,
                album,
            });
        } catch (error) {
            console.error("Error creating release:", error);
            res.status(500).json({ error: "Failed to create release" });
        }
    });

    /**
     * PUT /api/admin/releases/:id
     * Update release metadata
     */
    router.put("/:id", async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const body = req.body as UpdateReleaseBody;

            const album = database.getAlbum(id);
            if (!album) {
                return res.status(404).json({ error: "Release not found" });
            }

            // Find release.yaml for this album
            // We need to find the folder containing this album's tracks
            const tracks = database.getTracks(id);
            if (tracks.length === 0) {
                // Allow updating releases without tracks - try to find by slug
                const releaseDir = path.join(musicDir, "releases", album.slug);
                const releaseYamlPath = path.join(releaseDir, "release.yaml");

                if (await fs.pathExists(releaseYamlPath)) {
                    const { parse } = await import("yaml");
                    const content = await fs.readFile(releaseYamlPath, "utf-8");
                    const config = parse(content);

                    // Update fields
                    if (body.title) config.title = body.title;
                    if (body.date) config.date = body.date;
                    if (body.description !== undefined) config.description = body.description;
                    if (body.genres) config.genres = body.genres;
                    if (body.download) config.download = body.download;
                    if (body.price !== undefined) config.price = body.price;
                    if (body.artistName) config.artist = body.artistName;
                    if (body.externalLinks) config.links = body.externalLinks;

                    await fs.writeFile(releaseYamlPath, stringify(config));
                }
            } else {
                const trackDir = path.dirname(tracks[0].file_path);
                const releaseDir = trackDir.includes("tracks")
                    ? path.dirname(trackDir)
                    : trackDir;
                const releaseYamlPath = path.join(releaseDir, "release.yaml");

                if (await fs.pathExists(releaseYamlPath)) {
                    const { parse } = await import("yaml");
                    const content = await fs.readFile(releaseYamlPath, "utf-8");
                    const config = parse(content);

                    // Update fields
                    if (body.title) config.title = body.title;
                    if (body.date) config.date = body.date;
                    if (body.description !== undefined) config.description = body.description;
                    if (body.genres) config.genres = body.genres;
                    if (body.download !== undefined) config.download = body.download;
                    if (body.price !== undefined) config.price = body.price;
                    if (body.artistName) config.artist = body.artistName;
                    if (body.externalLinks) config.links = body.externalLinks;

                    await fs.writeFile(releaseYamlPath, stringify(config));
                }
            }

            // Update artist in database if artistName provided
            if (body.artistName) {
                let artist = database.getArtistByName(body.artistName);
                if (!artist) {
                    // Create artist if doesn't exist
                    const artistId = database.createArtist(body.artistName);
                    artist = database.getArtist(artistId);
                }
                if (artist) {
                    database.updateAlbumArtist(id, artist.id);
                }
            }

            // Update visibility in database
            if (typeof body.isPublic === "boolean") {
                database.updateAlbumVisibility(id, body.isPublic);
            }

            // Rescan to pick up changes
            await scanner.scanDirectory(musicDir);

            res.json({ message: "Release updated" });
        } catch (error) {
            console.error("Error updating release:", error);
            res.status(500).json({ error: "Failed to update release" });
        }
    });

    /**
     * DELETE /api/admin/releases/:id
     * Delete a release and all its files
     */
    router.delete("/:id", async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const keepFiles = req.query.keepFiles === "true";

            const album = database.getAlbum(id);
            if (!album) {
                return res.status(404).json({ error: "Release not found" });
            }

            let releaseDir: string | null = null;

            // Try to find release folder from tracks first
            const tracks = database.getTracks(id);
            if (tracks.length > 0) {
                const trackDir = path.dirname(tracks[0].file_path);
                releaseDir = trackDir.includes("tracks")
                    ? path.dirname(trackDir)
                    : trackDir;
            } else {
                // No tracks - try to find folder by slug in releases directory
                const releasesDir = path.join(musicDir, "releases");
                const potentialDir = path.join(releasesDir, album.slug);
                if (await fs.pathExists(potentialDir)) {
                    releaseDir = potentialDir;
                } else {
                    // Also check for cover_path to infer directory
                    if (album.cover_path) {
                        const coverDir = path.dirname(album.cover_path);
                        if (coverDir.includes("artwork")) {
                            releaseDir = path.dirname(coverDir);
                        } else {
                            releaseDir = coverDir;
                        }
                    }
                }
            }

            // If keepFiles is true, we ONLY delete release.yaml to demote it
            if (keepFiles) {
                if (releaseDir) {
                    const yamlPath = path.join(releaseDir, "release.yaml");
                    if (await fs.pathExists(yamlPath)) {
                        await fs.remove(yamlPath);
                        console.log(`🗑️ Deleted release.yaml for: ${album.title}`);
                    }
                }
                database.deleteAlbum(id, true);
                res.json({ message: "Release deleted (files kept)" });
            } else {
                // Delete the release folder if found
                if (releaseDir && await fs.pathExists(releaseDir)) {
                    await fs.remove(releaseDir);
                    console.log(`🗑️ Deleted release folder: ${releaseDir}`);
                } else {
                    console.log(`⚠️ Could not find release folder for album: ${album.title} (slug: ${album.slug})`);
                }
                // Always delete from database
                database.deleteAlbum(id, false);
                res.json({ message: "Release deleted" });
            }

            // Rescan to update database
            await scanner.scanDirectory(musicDir);
        } catch (error) {
            console.error("Error deleting release:", error);
            res.status(500).json({ error: "Failed to delete release" });
        }
    });

    /**
     * GET /api/admin/releases/:id/folder
     * Get release folder info
     */
    router.get("/:id/folder", async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);

            const album = database.getAlbum(id);
            if (!album) {
                return res.status(404).json({ error: "Release not found" });
            }

            const tracks = database.getTracks(id);
            if (tracks.length === 0) {
                return res.json({ folder: null, files: [] });
            }

            const trackDir = path.dirname(tracks[0].file_path);
            const releaseDir = trackDir.includes("tracks")
                ? path.dirname(trackDir)
                : trackDir;

            // Get folder contents
            const files: { name: string; type: string; size: number }[] = [];

            async function walkDir(dir: string, prefix = "") {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await walkDir(fullPath, `${prefix}${entry.name}/`);
                    } else {
                        const stat = await fs.stat(fullPath);
                        files.push({
                            name: `${prefix}${entry.name}`,
                            type: path.extname(entry.name).substring(1),
                            size: stat.size,
                        });
                    }
                }
            }

            await walkDir(releaseDir);

            res.json({
                folder: releaseDir,
                files,
            });
        } catch (error) {
            console.error("Error getting release folder:", error);
            res.status(500).json({ error: "Failed to get release folder" });
        }
    });

    /**
     * POST /api/admin/releases/:id/tracks/add
     * Move a track from library to this release
     */
    router.post("/:id/tracks/add", async (req, res) => {
        try {
            const releaseId = parseInt(req.params.id, 10);
            const { trackId } = req.body;

            if (!trackId) {
                return res.status(400).json({ error: "Track ID is required" });
            }

            const release = database.getAlbum(releaseId);
            if (!release) {
                return res.status(404).json({ error: "Release not found" });
            }

            const track = database.getTrack(trackId);
            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            // Determine target path
            let releaseDir: string | null = null;
            const existingTracks = database.getTracks(releaseId);

            if (existingTracks.length > 0) {
                // If release has tracks, use that directory
                const trackDir = path.dirname(existingTracks[0].file_path);
                releaseDir = trackDir.includes("tracks")
                    ? trackDir
                    : path.join(trackDir, "tracks");
            } else {
                // Determine release directory from slug
                releaseDir = path.join(musicDir, "releases", release.slug, "tracks");
                await fs.ensureDir(releaseDir);
            }

            if (!releaseDir) {
                return res.status(500).json({ error: "Could not determine release directory" });
            }

            const fileName = path.basename(track.file_path);
            const newPath = path.join(releaseDir, fileName);

            // Move file
            if (track.file_path !== newPath) {
                // Update database FIRST to prevent watcher from deleting the track on unlink
                database.updateTrackPath(trackId, newPath, releaseId);

                try {
                    await fs.move(track.file_path, newPath, { overwrite: true });
                    console.log(`📦 Moved track: ${track.title} -> ${newPath}`);
                } catch (moveError) {
                    // Revert database change if move fails
                    console.error("Move failed, reverting DB:", moveError);
                    database.updateTrackPath(trackId, track.file_path, track.album_id || 0); // Revert to old path/album
                    throw moveError;
                }
            } else {
                // Even if path is same, ensure album link is correct
                database.updateTrackAlbum(trackId, releaseId);
            }


            // Trigger rescan (optional but good for consistency)
            // await scanner.scanDirectory(musicDir);

            res.json({ message: "Track added to release", newPath });
        } catch (error) {
            console.error("Error adding track to release:", error);
            res.status(500).json({ error: "Failed to add track to release" });
        }
    });

    return router;
}
