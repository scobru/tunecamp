import { Router } from "express";
import path from "path";
import fs from "fs-extra";
import { stringify } from "yaml";
import type { DatabaseService } from "../database.js";
import type { ScannerService } from "../scanner.js";
import type { PublishingService } from "../publishing.js";
import type { AuthService } from "../auth.js";
import { VisibilityGuardian, Capability } from "../common/visibility.js";

interface CreateReleaseBody {
    title: string;
    artistName?: string;
    artistId?: number;
    artist_id?: number;
    date?: string;
    description?: string;
    track_ids?: number[];
    type?: 'album' | 'single' | 'ep';
    year?: number;
    license?: string;
    visibility?: 'public' | 'private' | 'unlisted';
    download?: string;
    price?: number | string;
    priceUsdc?: number | string;
    currency?: 'ETH' | 'USD';
    genres?: string[];
    externalLinks?: any[];
    publishedToGunDB?: boolean;
    publishedToAP?: boolean;
}

interface UpdateReleaseBody extends Partial<CreateReleaseBody> {
    isPublic?: boolean;
}

export function createReleaseRouter(
    database: DatabaseService,
    scanner: ScannerService,
    publishingService: PublishingService,
    authService: AuthService,
    musicDir: string
): Router {
    const router = Router();

    router.get("/", async (req: any, res) => {
        try {
            let releases: any[];
            if (req.isAdmin || req.isSuperUser) {
                releases = database.getReleases();
            } else if (req.userId !== undefined) {
                // Show public releases OR those owned by the user
                const ownedReleases = database.getReleasesByOwner(req.userId, false); 
                const publicReleases = database.getReleases(true); 
                
                // Merge and deduplicate by ID
                const seenIds = new Set();
                releases = [];
                
                // Prioritize owned releases (might be private/unlisted)
                for (const r of ownedReleases) {
                    if (!seenIds.has(r.id)) {
                        releases.push(r);
                        seenIds.add(r.id);
                    }
                }
                
                // Add public releases
                for (const r of publicReleases) {
                    if (!seenIds.has(r.id)) {
                        releases.push(r);
                        seenIds.add(r.id);
                    }
                }

                // Sort by date desc (handle null dates safely)
                releases.sort((a, b) => {
                    const dateA = a.date || a.published_at || a.created_at || 0;
                    const dateB = b.date || b.published_at || b.created_at || 0;
                    const timeA = typeof dateA === 'number' ? dateA : new Date(dateA).getTime();
                    const timeB = typeof dateB === 'number' ? dateB : new Date(dateB).getTime();
                    return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
                });
            } else {
                releases = database.getReleases(true);
            }
            res.json(releases);
        } catch (error) {
            console.error("Error getting releases:", error);
            res.status(500).json({ error: "Failed to get releases" });
        }
    });

    router.get("/:idOrSlug", async (req: any, res) => {
        try {
            const param = req.params.idOrSlug as string;
            let release: any;
            
            if (/^\d+$/.test(param)) {
                release = database.getRelease(parseInt(param, 10));
            } else {
                release = database.getReleaseBySlug(param);
            }

            if (!release) {
                return res.status(404).json({ error: "Release not found" });
            }

            // Permission Check: Non-admin can only see public/unlisted releases, unless they are the owner
            if (release.visibility === 'private' && !req.isAdmin && !req.isSuperUser && release.owner_id !== req.userId) {
                return res.status(404).json({ error: "Release not found" });
            }

            const tracks = database.getTracksByReleaseId(release.id);
            
            // Map tracks to include release cover info for the player
            const mappedTracks = tracks.map(t => ({
                ...t,
                albumId: release.id,
                artistId: t.artist_id,
                coverImage: release.cover_path ? `/api/releases/${release.id}/cover` : undefined,
                externalArtwork: t.external_artwork,
            }));

            res.json({
                ...release,
                coverImage: release.cover_path,
                tracks: mappedTracks,
            });
        } catch (error) {
            console.error("Error getting release:", error);
            res.status(500).json({ error: "Failed to get release" });
        }
    });

    /**
     * GET /api/releases/:idOrSlug/cover
     */
    router.get("/:idOrSlug/cover", async (req: any, res) => {
        try {
            const param = req.params.idOrSlug as string;
            let release: any;

            if (/^\d+$/.test(param)) {
                release = database.getRelease(parseInt(param, 10));
            } else {
                release = database.getReleaseBySlug(param);
            }

            if (!release || !release.cover_path) {
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="#222"/><text x="200" y="200" font-family="Arial" font-size="24" fill="#444" text-anchor="middle" dominant-baseline="middle">${release ? release.title : "No Cover"}</text></svg>`;
                res.setHeader("Content-Type", "image/svg+xml");
                return res.send(svg);
            }

            const resolvedPath = path.join(musicDir, release.cover_path);
            if (!await fs.pathExists(resolvedPath)) {
                res.status(404).json({ error: "Cover file missing" });
                return;
            }

            res.sendFile(path.resolve(resolvedPath));
        } catch (error) {
            console.error("Error getting release cover:", error);
            res.status(500).json({ error: "Failed to get cover" });
        }
    });

    /**
     * GET /api/releases/:idOrSlug/download
     */
    router.get("/:idOrSlug/download", async (req: any, res) => {
        try {
            const param = req.params.idOrSlug as string;
            let release: any;

            if (/^\d+$/.test(param)) {
                release = database.getRelease(parseInt(param, 10));
            } else {
                release = database.getReleaseBySlug(param);
            }

            if (!release) {
                return res.status(404).json({ error: "Release not found" });
            }

            // Download logic (simplified copy from albums.ts but strictly for releases)
            if (!release.download || release.download === 'none') {
                return res.status(403).json({ error: "Downloads disabled" });
            }

            const tracks = database.getTracksByReleaseId(release.id);
            if (!tracks || tracks.length === 0) {
                return res.status(404).json({ error: "No tracks" });
            }

            // ZIP logic
            const archiver = await import("archiver");
            const archive = archiver.default("zip", { zlib: { level: 5 } });
            res.setHeader("Content-Type", "application/zip");
            res.setHeader("Content-Disposition", `attachment; filename="${release.slug || "release"}.zip"`);
            archive.pipe(res);

            for (const track of tracks) {
                if (track.file_path) {
                    const trackPath = path.join(musicDir, track.file_path);
                    if (await fs.pathExists(trackPath)) {
                        archive.file(trackPath, { name: path.basename(trackPath) });
                    }
                }
            }
            await archive.finalize();
        } catch (error) {
            console.error("Error downloading release:", error);
            res.status(500).json({ error: "Download failed" });
        }
    });

    router.post("/", async (req: any, res) => {
        try {
            const body = req.body as CreateReleaseBody;
            const userArtistId = req.artistId;
            const canCreate = req.context && VisibilityGuardian.can(req.context, Capability.CREATE_RELEASES);
            
            if (!canCreate) {
                return res.status(403).json({ error: "Access denied: You must be an artist or root admin to create releases" });
            }

            if (!body.title) {
                return res.status(400).json({ error: "Title is required" });
            }

            // Determine the final Artist ID and ownership logic
            let artistId: number | null = body.artistId || body.artist_id || null;
            
            // SECURITY CHECK: Non-root users cannot create releases for other artists or new artists
            if (!req.isRootAdmin) {
                if (artistId && artistId !== userArtistId) {
                    return res.status(403).json({ error: "Access denied: You can only create releases for your own artist profile" });
                }
                if (body.artistName) {
                    const existingArtist = database.getArtistByName(body.artistName);
                    if (existingArtist && existingArtist.id !== userArtistId) {
                         return res.status(403).json({ error: "Access denied: Artist name belongs to another user" });
                    }
                }
                // Force userArtistId for regular users/artists
                artistId = userArtistId;
            } else {
                // Admin logic: allow creating/assigning to any artist
                if (!artistId && body.artistName) {
                    const existingArtist = database.getArtistByName(body.artistName);
                    if (existingArtist) {
                        artistId = existingArtist.id;
                    } else {
                        artistId = database.createArtist(body.artistName);
                    }
                }
            }

            const slug = body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "release";

            // Verify Track Ownership before creating the release association
            const validatedTrackIds: number[] = [];
            if (body.track_ids && body.track_ids.length > 0) {
                const tracks = database.getTracksByIds(body.track_ids);
                const trackMap = new Map();
                for (const t of tracks) {
                    trackMap.set(t.id, t);
                }

                for (const trackId of body.track_ids) {
                    const track = trackMap.get(trackId);
                    if (track) {
                        // Admin can add anything, Users can only add their own tracks
                        if (req.isAdmin || track.owner_id === req.userId) {
                            validatedTrackIds.push(trackId);
                        } else {
                            console.warn(`⚠️ User ${req.username} tried to add unauthorized track ${trackId} to release`);
                        }
                    }
                }
            }

            const newReleaseId = database.createRelease({
                title: body.title,
                slug: slug,
                artist_id: artistId,
                owner_id: req.userId || artistId, // Owner is the person who created/manages it
                date: body.date || new Date().toISOString(),
                description: body.description || null,
                type: body.type || 'album',
                year: body.year || new Date().getFullYear(),
                license: body.license || null,
                visibility: body.visibility || 'private',
                cover_path: null,
                genre: body.genres?.join(", ") || null,
                download: body.download || null,
                price: body.price !== undefined ? Number(body.price) : 0,
                price_usdc: body.priceUsdc !== undefined ? Number(body.priceUsdc) : 0,
                currency: body.currency || 'ETH',
                external_links: body.externalLinks ? JSON.stringify(body.externalLinks) : null,
                published_at: body.visibility === 'public' || body.visibility === 'unlisted' ? new Date().toISOString() : null,
                published_to_gundb: body.publishedToGunDB !== undefined ? body.publishedToGunDB : (body.visibility === 'public' || body.visibility === 'unlisted'),
                published_to_ap: body.publishedToAP !== undefined ? body.publishedToAP : (body.visibility === 'public' || body.visibility === 'unlisted'),
                status: 'draft',
            });

            // Associate only validated tracks
            for (const trackId of validatedTrackIds) {
                database.addTrackToRelease(newReleaseId, trackId);
            }

            publishingService.syncRelease(newReleaseId).catch(e => console.error("Failed to sync new release:", e));

            const newRelease = database.getRelease(newReleaseId);
            res.status(201).json(newRelease);

        } catch (error) {
            console.error("Error creating release:", error);
            res.status(500).json({ error: "Failed to create release" });
        }
    });

    return router;
}
