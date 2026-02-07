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
    artistId?: number;
    type?: 'album' | 'single' | 'ep';
    year?: number;
    externalLinks?: { label: string; url: string }[] | { [key: string]: string };
    track_ids?: number[];
    visibility?: 'public' | 'private' | 'unlisted';
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

    router.post("/", async (req: any, res) => {
        try {
            const body = req.body as CreateReleaseBody;

            // Basic validation
            if (!body.title) {
                return res.status(400).json({ error: "Title is required" });
            }

            // Determine artist
            let artistId: number | null = body.artistId || null;
            if (!artistId && body.artistName) {
                const existingArtist = database.getArtistByName(body.artistName);
                if (existingArtist) {
                    artistId = existingArtist.id;
                } else {
                    artistId = database.createArtist(body.artistName);
                }
            }

            const slug = slugify(body.title);

            const newAlbumId = database.createAlbum({
                title: body.title,
                slug: slug,
                artist_id: artistId,
                date: body.date || new Date().toISOString(),
                description: body.description || null,
                type: body.type || 'album',
                year: body.year || new Date().getFullYear(),
                is_release: true,
                visibility: body.visibility || 'private',
                is_public: body.visibility === 'public' || body.visibility === 'unlisted',
                cover_path: null,
                genre: body.genres?.join(", ") || null,
                download: body.download || null,
                external_links: body.externalLinks ? JSON.stringify(body.externalLinks) : null,
                published_at: body.visibility === 'public' || body.visibility === 'unlisted' ? new Date().toISOString() : null,
            });

            // Associate tracks
            if (body.track_ids && body.track_ids.length > 0) {
                for (const trackId of body.track_ids) {
                    database.addTrackToRelease(newAlbumId, trackId);
                }
            }

            const newAlbum = database.getAlbum(newAlbumId);

            res.status(201).json(newAlbum);

        } catch (error) {
            console.error("Error creating release:", error);
            res.status(500).json({ error: "Failed to create release" });
        }
    });

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

            // Update track associations
            if (body.track_ids) {
                const existingTrackIds = database.getTracksByReleaseId(id).map(t => t.id);
                const newTrackIds = body.track_ids;

                const toAdd = newTrackIds.filter(newId => !existingTrackIds.includes(newId));
                const toRemove = existingTrackIds.filter(oldId => !newTrackIds.includes(oldId));

                for (const trackId of toAdd) {
                    database.addTrackToRelease(id, trackId);
                }
                for (const trackId of toRemove) {
                    database.removeTrackFromRelease(id, trackId);
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
                            const freshTracks = database.getTracksByReleaseId(id);
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
            const tracks = database.getTracksByReleaseId(id);
            if (tracks.length > 0) {
                const trackDir = path.dirname(tracks[0].file_path);
                releaseDir = trackDir.includes("tracks") ? path.dirname(trackDir) : trackDir;
            } else {
                // Fallback for releases with no tracks
                const releasesDir = path.join(musicDir, "releases");
                const potentialDir = path.join(releasesDir, album.slug);
                if (await fs.pathExists(potentialDir)) releaseDir = potentialDir;
            }

            if (keepFiles) {
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

            const tracks = database.getTracksByReleaseId(id);
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
