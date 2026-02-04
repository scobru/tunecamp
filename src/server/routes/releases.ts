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
    type?: 'album' | 'single' | 'ep';
    year?: number;
    externalLinks?: { label: string; url: string }[] | { [key: string]: string };
}

interface UpdateReleaseBody extends Partial<CreateReleaseBody> {
    artistId?: number;
    isPublic?: boolean;
    visibility?: 'public' | 'private' | 'unlisted';
}

// ... imports at top ...
import type { GunDBService } from "../gundb.js";
import type { ServerConfig } from "../config.js";
import type { ActivityPubService } from "../activitypub.js";

// ... existing interfaces ...

export function createReleaseRoutes(
    database: DatabaseService,
    scanner: ScannerService,
    musicDir: string,
    gundbService: GunDBService,
    config: ServerConfig,
    apService: ActivityPubService
) {
    const router = Router();

    // ... existing POST / ...

    // ... existing POST /:id/tracks/add ...

    /**
     * PUT /api/admin/releases/:id
     * Update release metadata
     */
    router.put("/:id", async (req: any, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const body = req.body as UpdateReleaseBody;

            const album = database.getAlbum(id);
            if (!album) {
                return res.status(404).json({ error: "Release not found" });
            }

            // Permission Check
            if (req.artistId) {
                if (album.artist_id !== req.artistId) {
                    return res.status(403).json({ error: "Access denied: You can only edit your own releases" });
                }
                // Don't allow changing artist name if restricted
                if (body.artistName) {
                    const artist = database.getArtist(req.artistId);
                    if (artist && body.artistName !== artist.name) {
                        return res.status(403).json({ error: "Cannot change artist name to a different artist" });
                    }
                }
            }

            // Find release.yaml ... 
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
                const releaseDir = trackDir.includes("tracks") ? path.dirname(trackDir) : trackDir;
                const releaseYamlPath = path.join(releaseDir, "release.yaml");

                if (await fs.pathExists(releaseYamlPath)) {
                    const { parse } = await import("yaml");
                    const content = await fs.readFile(releaseYamlPath, "utf-8");
                    const config = parse(content);

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

            // Update DB checks...
            if (body.title) {
                try { database.updateAlbumTitle(id, body.title); } catch (e) {
                    console.error("Failed to update album title in DB:", e);
                }
            }
            if (body.artistId) {
                // If restricted, we already checked this in permission check above/below 
                // actually we need to verify permission if changing artist
                if (req.artistId && req.artistId !== body.artistId) {
                    return res.status(403).json({ error: "Cannot assign to another artist" });
                }

                const artist = database.getArtist(body.artistId);
                if (artist) {
                    database.updateAlbumArtist(id, artist.id);
                }
            } else if (body.artistName) {
                let artist = database.getArtistByName(body.artistName);
                if (!artist) {
                    const artistId = database.createArtist(body.artistName);
                    artist = database.getArtist(artistId);
                }
                if (artist) {
                    database.updateAlbumArtist(id, artist.id);
                }
            }

            let visibilityChanged = false;
            let currentVisibility = album.visibility || 'private';

            if (body.visibility) {
                database.updateAlbumVisibility(id, body.visibility);
                visibilityChanged = true;
                currentVisibility = body.visibility;
            } else if (typeof body.isPublic === "boolean") {
                // Backward compatibility
                database.updateAlbumVisibility(id, body.isPublic ? 'public' : 'private');
                visibilityChanged = true;
                currentVisibility = body.isPublic ? 'public' : 'private';
            }

            // Update type and year in DB - these were recently added columns
            if (body.type) {
                try {
                    database.db.prepare("UPDATE albums SET type = ? WHERE id = ?").run(body.type, id);
                } catch (e) {
                    console.error("Failed to update album type in DB:", e);
                }
            }
            if (body.year) {
                try {
                    database.db.prepare("UPDATE albums SET year = ? WHERE id = ?").run(body.year, id);
                } catch (e) {
                    console.error("Failed to update album year in DB:", e);
                }
            }

            await scanner.scanDirectory(musicDir);

            // SYNC WITH FEDERATION
            // If visibility changed OR ANY metadata changed (since it updates the Note content/attachments), we need to update network
            const shouldSync = visibilityChanged || !!body.title || !!body.description || !!body.genres || !!body.artistName || !!body.download || !!body.externalLinks || !!body.date;

            if (shouldSync) {
                const updatedAlbum = database.getAlbum(id);
                if (updatedAlbum) {
                    const publicUrl = database.getSetting("publicUrl") || config.publicUrl;
                    if (publicUrl) {
                        const siteInfo = {
                            url: publicUrl,
                            title: config.siteName || "TuneCamp Server",
                            artistName: updatedAlbum.artist_name || "",
                        };

                        const isPublic = updatedAlbum.visibility === 'public' || updatedAlbum.visibility === 'unlisted';

                        // If it's Public/Unlisted -> Register
                        if (isPublic) {
                            await gundbService.registerSite(siteInfo);
                            const freshTracks = database.getTracks(id);
                            await gundbService.registerTracks(siteInfo, updatedAlbum, freshTracks);

                            // ActivityPub update/create
                            apService.broadcastRelease(updatedAlbum).catch(e => console.error("AP Broadcast failed:", e));
                        }
                        // If it became Private -> Unregister
                        else {
                            await gundbService.unregisterTracks(siteInfo, updatedAlbum);
                            // ActivityPub Delete
                            apService.broadcastDelete(updatedAlbum).catch(e => console.error("AP Delete failed:", e));
                        }
                    }
                    // Trigger network sync to clean up
                    gundbService.syncNetwork().catch(e => console.error("Network sync failed:", e));
                }
            }

            res.json({ message: "Release updated" });

        } catch (error) {
            console.error("Error updating release:", error);
            res.status(500).json({ error: "Failed to update release" });
        }
    });

    /**
     * DELETE /api/admin/releases/:id
     * Delete a release
     */
    router.delete("/:id", async (req: any, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const keepFiles = req.query.keepFiles === "true";

            const album = database.getAlbum(id);
            if (!album) return res.status(404).json({ error: "Release not found" });

            // Permission Check
            if (req.artistId && album.artist_id !== req.artistId) {
                return res.status(403).json({ error: "Access denied" });
            }

            let releaseDir: string | null = null;
            const tracks = database.getTracks(id);
            if (tracks.length > 0) {
                const trackDir = path.dirname(tracks[0].file_path);
                releaseDir = trackDir.includes("tracks") ? path.dirname(trackDir) : trackDir;
            } else {
                const releasesDir = path.join(musicDir, "releases");
                const potentialDir = path.join(releasesDir, album.slug);
                if (await fs.pathExists(potentialDir)) releaseDir = potentialDir;
                else if (album.cover_path) {
                    const coverDir = path.dirname(album.cover_path);
                    releaseDir = coverDir.includes("artwork") ? path.dirname(coverDir) : coverDir;
                }
            }

            if (keepFiles) {
                if (releaseDir) {
                    const yamlPath = path.join(releaseDir, "release.yaml");
                    if (await fs.pathExists(yamlPath)) await fs.remove(yamlPath);
                }
                database.deleteAlbum(id, true);
                res.json({ message: "Release deleted (files kept)" });
            } else {
                if (releaseDir && await fs.pathExists(releaseDir)) {
                    await fs.remove(releaseDir);
                }
                database.deleteAlbum(id, false);
                res.json({ message: "Release deleted" });
            }

            await scanner.scanDirectory(musicDir);
        } catch (error) {
            console.error("Error deleting release:", error);
            res.status(500).json({ error: "Failed to delete release" });
        }
    });

    /**
     * GET /api/admin/releases/:id/folder
     */
    router.get("/:id/folder", async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const album = database.getAlbum(id);
            if (!album) return res.status(404).json({ error: "Release not found" });

            const tracks = database.getTracks(id);
            if (tracks.length === 0) return res.json({ folder: null, files: [] });

            const trackDir = path.dirname(tracks[0].file_path);
            const releaseDir = trackDir.includes("tracks") ? path.dirname(trackDir) : trackDir;

            const files: any[] = [];
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
            res.json({ folder: releaseDir, files });
        } catch (error) {
            console.error("Error getting release folder:", error);
            res.status(500).json({ error: "Failed to get folder" });
        }
    });

    return router;
}
