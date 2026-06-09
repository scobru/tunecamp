import { Router, json } from "express";
import type { DatabaseService } from "../../core/database.js";
import type { ScannerService } from "../../modules/catalog/scanner.service.js";
import type { PublishingService } from "../../modules/publishing/publishing.service.js";
import type { AuthService } from "../../modules/auth/auth.service.js";
import { wrapAsync } from "../../middleware/error-handling.js";
import { VisibilityProfile } from "../../common/visibility.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../common/errors.js";
import path from "path";
import fs from "fs-extra";
import { getPlaceholderSVG } from "../../../utils/audioUtils.js";

interface CreateReleaseBody {
    title: string;
    artistName?: string;
    artistId?: number;
    artist_id?: number;
    date?: string;
    description?: string;
    track_ids?: number[];
    type?: 'album' | 'single' | 'liveset' | 'podcast';
    year?: number;
    license?: string;
    visibility?: 'public' | 'private' | 'unlisted';
    price?: number;
    priceUsdc?: number;
    currency?: 'ETH' | 'USD' | 'USDC' | 'USDT';
    externalLinks?: string;
    coverPath?: string;
    albumArtist?: string;
    productType?: string;
    product_type?: string;
    podcastAuthor?: string;
    podcast_author?: string;
    podcastEmail?: string;
    podcast_email?: string;
    podcastCategory?: string;
    podcast_category?: string;
    podcastExplicit?: boolean | number;
    podcast_explicit?: boolean | number;
}

import type { ServiceContainer } from "../../core/container.js";

/**
 * The release category lives on the `type` column (album | single | ep | liveset | podcast).
 * `product_type` (music | podcast) is kept as a derived field for backward compatibility
 * with the podcast RSS feeds and the Subsonic podcast channel. This keeps both in sync
 * regardless of which one a caller supplies.
 */
function syncReleaseCategory(data: { type?: string; product_type?: string; productType?: string }): void {
    const productType = data.product_type ?? data.productType;
    // If the caller marks this as a podcast via either field, normalize both.
    if (data.type === 'podcast' || productType === 'podcast') {
        data.type = 'podcast';
        data.product_type = 'podcast';
    } else if (data.type !== undefined) {
        // A non-podcast type was set explicitly → it can't be a podcast product.
        data.product_type = 'music';
    } else if (productType !== undefined) {
        data.product_type = 'music';
    }
}

/**
 * Release Routes — Orchestrates the creation and management of formal releases.
 * These are separated from the raw scanned library tracks.
 */
export function createReleaseRouter(container: ServiceContainer): Router {
    const scanner: ServiceContainer['scannerService'] = (container as any).scannerService || (container as any);
    const publishing: ServiceContainer['publishingService'] = (container as any).publishingService || (container as any);
    const auth: ServiceContainer['authService'] = (container as any).authService || (container as any);
    const musicDir: ServiceContainer['musicDir'] = (container as any).musicDir || (container as any);
    const library: ServiceContainer['library'] = (container as any).library || (container as any);
    const social: ServiceContainer['social'] = (container as any).social || (container as any);
    const database: ServiceContainer['database'] = (container as any).database || (container as any);
    const router = Router();
    router.use(json());

    /**
     * GET /api/releases
     * Returns all releases the user is allowed to see.
     */
    router.get("/", wrapAsync(async (req: any, res: any) => {
        try {
            let releases = [];
            const isAdmin = req.isAdmin || req.isSuperUser;
            if (isAdmin) {
                // For Admins and Super Users, return ALL formal releases (including drafts/private)
                releases = library.getReleases(VisibilityProfile.ALL_ACCESS).map(r => ({ ...r, is_formal_release: true }));
            } else if (req.userId) {
                // For logged-in users, merge their owned releases with public ones
                const ownedFormalReleases = library.getReleasesByOwner(req.userId, VisibilityProfile.ALL_ACCESS).map(r => ({ ...r, is_formal_release: true }));
                const publicReleases = library.getReleases(VisibilityProfile.PUBLIC_STAGE).map(r => ({ ...r, is_formal_release: true }));
                
                const seenIds = new Set(ownedFormalReleases.map(r => r.id));
                releases = [...ownedFormalReleases];
                for (const r of publicReleases) {
                    if (!seenIds.has(r.id)) {
                        releases.push(r);
                        seenIds.add(r.id);
                    }
                }
            } else {
                // For anonymous users, only show public formal releases
                releases = library.getReleases(VisibilityProfile.PUBLIC_STAGE).map(r => ({ ...r, is_formal_release: true }));
            }

            res.json(releases);
        } catch (error) {
            console.error("Error getting releases:", error);
            res.status(500).json({ error: "Failed to fetch releases" });
        }
    }));

    /**
     * POST /api/admin/releases
     * Create a new formal release (Admin/Artist only)
     */
    router.post("/", wrapAsync(async (req: any, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        if (!req.isAdmin && !req.isActive) throw new ForbiddenError("Account not active");

        const body = req.body as CreateReleaseBody;
        if (!body.title) throw new BadRequestError("Title is required");

        // Keep the release category (type) and the legacy product_type in sync.
        syncReleaseCategory(body);

        // Prevent rapid duplicate creation (double-submission prevention)
        const checkArtistId = body.artist_id || body.artistId || null;
        const checkOwnerId = req.userId || null;
        if (checkArtistId || checkOwnerId) {
            let recentReleases: any[] = [];
            if (checkArtistId && typeof library.getReleasesByArtist === 'function') {
                recentReleases = library.getReleasesByArtist(checkArtistId, VisibilityProfile.ALL_ACCESS);
            } else if (checkOwnerId && typeof library.getReleasesByOwner === 'function') {
                recentReleases = library.getReleasesByOwner(checkOwnerId, VisibilityProfile.ALL_ACCESS);
            }

            const duplicate = recentReleases.find(r => {
                if (r.title.toLowerCase() !== body.title.toLowerCase()) return false;
                if (!r.created_at) return false;
                // Support both SQLite 'YYYY-MM-DD HH:MM:SS' and ISO formats
                const createdTime = Date.parse(r.created_at.replace(" ", "T"));
                return !isNaN(createdTime) && (Date.now() - createdTime) < 10000; // 10-second threshold
            });

            if (duplicate) {
                console.log(`🛡️ [Releases] Blocked duplicate release creation in rapid succession for "${body.title}"`);
                return res.status(201).json(duplicate); // Return the existing release instead of duplicating
            }
        }

        const slug = body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "release";
        
        let newReleaseId: number;

        try {
            newReleaseId = database.transaction(() => {
                const rid = library.createRelease({
                    title: body.title,
                    slug: slug,
                    artist_id: body.artist_id || body.artistId || null,
                    owner_id: req.userId || null,
                    date: body.date || new Date().toISOString(),
                    description: body.description || null,
                    type: body.type || 'album',
                    year: body.year || new Date().getFullYear(),
                    license: body.license || null,
                    visibility: body.visibility || 'private',
                    price: body.price || 0,
                    price_usdc: body.priceUsdc || 0,
                    currency: body.currency || 'ETH',
                    external_links: body.externalLinks || null,
                    cover_path: body.coverPath || null,
                    status: 'draft',
                    published_at: null,
                    published_to_gundb: false,
                    published_to_ap: false,
                    is_public: false,
                    is_release: true,
                    album_artist: body.albumArtist || null,
                    genre: "Release",
                    download: null,
                    product_type: body.product_type || body.productType || 'music',
                    podcast_author: body.podcast_author || body.podcastAuthor || null,
                    podcast_email: body.podcast_email || body.podcastEmail || null,
                    podcast_category: body.podcast_category || body.podcastCategory || null,
                    podcast_explicit: body.podcast_explicit || body.podcastExplicit || 0
                });

                if (body.track_ids && body.track_ids.length > 0) {
                    library.syncReleaseTracks(rid, body.track_ids);
                }

                return rid;
            });

            const createdRelease = library.getRelease(newReleaseId);
            if (createdRelease && createdRelease.visibility === 'public') {
                await publishing.syncRelease(newReleaseId).catch(e => console.error("Sync failed:", e));
            }
            res.status(201).json(createdRelease);
        } catch (error) {
            console.error("Error creating release:", error);
            res.status(500).json({ error: "Failed to create release" });
        }
    }));

    /**
     * GET /api/releases/:id
     */
    router.get("/:id", wrapAsync(async (req: any, res: any) => {
        const idParam = req.params.id;
        let release;

        if (isNaN(parseInt(idParam))) {
            release = library.getReleaseBySlug(idParam);
        } else {
            release = library.getRelease(parseInt(idParam));
        }

        if (!release) throw new NotFoundError("Release not found");

        const tracks = library.getReleaseTracks(release.id);
        
        const mappedTracks = tracks.map(t => ({
            ...t,
            starred: req.username ? social.isStarred(req.username, 'track', String(t.id)) : false,
            rating: req.username ? social.getItemRating(req.username, 'track', String(t.id)) : 0
        }));

        res.json({
            ...release,
            tracks: mappedTracks,
            starred: req.username ? social.isStarred(req.username, 'album', String(release.id)) : false,
            rating: req.username ? social.getItemRating(req.username, 'album', String(release.id)) : 0
        });
    }));

    /**
     * GET /api/releases/:id/cover
     */
    router.get("/:id/cover", wrapAsync(async (req: any, res: any) => {
        try {
            const param = req.params.id as string;
            let releaseId: number;
            
            // Handle external metadata covers if requested via ext: prefix
            // (Used by Search and Discovery components)
            if (param.startsWith("ext:")) {
                // Search for external metadata if metadata service was available here
                // For now, return placeholder or fallback
                const svg = getPlaceholderSVG("No Cover");
                res.setHeader("Content-Type", "image/svg+xml");
                return res.send(svg);
            }

            let release = null;
            if (isNaN(parseInt(param, 10))) {
                release = library.getReleaseBySlug(param) || library.getAlbumBySlug(param);
            } else {
                const releaseId = parseInt(param, 10);
                release = library.getRelease(releaseId) || library.getAlbum(releaseId);
            }
            
            let releaseCoverPath = release?.cover_path;
            
            // Fallback: if the release doesn't have an explicit cover_path, check if any of its tracks has one
            if (release && !releaseCoverPath) {
                const releaseTracks = (database as any).getReleaseTracks ? library.getReleaseTracks(release.id) : library.getTracksByAlbum(release.id);
                const trackWithCover = releaseTracks.find((t: any) => t.external_artwork || t.externalArtwork);
                if (trackWithCover) {
                    releaseCoverPath = (trackWithCover as any).external_artwork || (trackWithCover as any).externalArtwork;
                }
            }

            if (releaseCoverPath) {
                if (releaseCoverPath.startsWith('http')) {
                    return res.redirect(releaseCoverPath);
                }
                const coverPath = path.join(musicDir, releaseCoverPath);
                if (await fs.pathExists(coverPath)) {
                    return res.sendFile(path.resolve(coverPath), { maxAge: 86400000 });
                }
            }
            
            const svg = getPlaceholderSVG(release?.title || "No Cover");
            res.setHeader("Content-Type", "image/svg+xml");
            res.setHeader("Cache-Control", "public, max-age=3600");
            return res.send(svg);
        } catch (e) {
            console.error("Error loading release cover:", e);
            res.status(500).send("Error loading cover");
        }
    }));

    /**
     * PUT /api/admin/releases/:id
     */
    router.put("/:id", wrapAsync(async (req: any, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        
        const id = parseInt(req.params.id);
        const release = library.getRelease(id);
        if (!release) throw new NotFoundError("Release not found");

        if (!req.isAdmin && release.owner_id !== req.userId) throw new ForbiddenError("Access denied");

        const body = req.body;

        // Keep the release category (type) and the legacy product_type in sync.
        syncReleaseCategory(body);

        database.transaction(() => {
            library.updateRelease(id, body);
            if (body.track_ids) {
                library.syncReleaseTracks(id, body.track_ids);
            }
        });

        if (body.visibility === 'public' || release.visibility === 'public') {
            await publishing.syncRelease(id).catch(e => console.error("Sync failed:", e));
        }

        res.json({ success: true, message: "Release updated" });
    }));

    /**
     * DELETE /api/admin/releases/:id
     */
    router.delete("/:id", wrapAsync(async (req: any, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");

        const id = parseInt(req.params.id);
        const release = library.getRelease(id);
        if (!release) throw new NotFoundError("Release not found");

        if (!req.isAdmin && release.owner_id !== req.userId) throw new ForbiddenError("Access denied");

        try {
            if (release.published_to_ap) {
                await publishing.unpublishReleaseFromAP(release);
            }
            
            library.deleteRelease(id);
            res.json({ success: true, message: "Release deleted" });
        } catch (error) {
            console.error("Error deleting release:", error);
            res.status(500).json({ error: "Failed to delete release" });
        }
    }));

    return router;
}
