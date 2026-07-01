import express, { Router } from "express";
import fs from "fs-extra";
import path from "path";
import type { DatabaseService, Album, Track } from "../../core/database.js";
import type { CatalogService } from "../../modules/catalog/catalog.service.js";
import type { DiscoveryService } from "../../modules/catalog/discovery.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { getPlaceholderSVG } from "../../../utils/audioUtils.js";
import { wrapAsync } from "../../middleware/error-handling.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../common/errors.js";
import { serveCachedList, invalidateListCacheOnMutation } from "../../common/list-cache.js";
import { metadataService as metadataServiceModule } from "../../modules/catalog/metadata.service.js";
import { VisibilityProfile, VisibilityGuardian, Capability } from "../../common/visibility.js";
import type { ServiceContainer } from "../../core/container.js";

/**
 * Albums Routes — Handles album and release discovery and management.
 */
export function createAlbumsRoutes(container: ServiceContainer): Router {
    const catalogService = container.catalogService;
    const discoveryService = container.discoveryService;
    const musicDir = container.musicDir;
    const library = container.library;
    const social = container.social;
    const database = container.database;
    const metadataService = (container as any).metadataService || metadataServiceModule;
    const router = Router();
    router.use(express.json());
    router.use(invalidateListCacheOnMutation);

    /**
     * GET /
     */
    router.get("/", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const username = req.username;
        const isAdmin = req.isAdmin || req.isSuperUser;
        // Varies by access scope + owner + per-user starred/rating in the payload.
        const scopeKey = `albums:${isAdmin ? "admin" : "user"}:u${req.userId ?? "-"}:n${username ?? "anon"}`;

        await serveCachedList(req, res, scopeKey, () => {
            let albums: Album[] = [];

            if (isAdmin) {
                albums = library.getAlbums(VisibilityProfile.ALL_ACCESS);
            } else {
                // Artists and users see their own albums + public ones + starred ones
                const owned = req.userId ? library.getAlbumsByOwner(req.userId!, VisibilityProfile.ALL_ACCESS) : [];
                const publicAlbums = library.getAlbums(VisibilityProfile.PUBLIC_STAGE);

                const starredItems = username ? social.getStarredItems(username, 'album') : [];
                const starredIds = new Set(starredItems.map((i: any) => parseInt(i.item_id, 10)).filter(id => !isNaN(id)));

                // Deduplicate
                const seenIds = new Set(owned.map(a => a.id));
                albums = [...owned];

                for (const a of publicAlbums) {
                    if (!seenIds.has(a.id)) {
                        albums.push(a);
                        seenIds.add(a.id);
                    }
                }

                // Add starred albums that might not be owned or public
                if (starredIds.size > 0) {
                    const starredAlbums = library.getAlbumsByIds(Array.from(starredIds));
                    for (const a of starredAlbums) {
                        if (!seenIds.has(a.id)) {
                            albums.push(a);
                            seenIds.add(a.id);
                        }
                    }
                }
            }

            return albums.map((a: Album) => ({
                ...a,
                coverImage: a.cover_path,
                starred: username ? social.isStarred(username, 'album', String(a.id)) : false,
                rating: username ? social.getItemRating(username, 'album', String(a.id)) : 0
            }));
        });
    }));

    /**
     * GET /api/albums/search
     */
    router.get("/search", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const query = req.query.q as string;
        const limit = parseInt(req.query.limit as string) || 50;
        if (!query) return res.json([]);
        
        const isAdmin = req.isAdmin || req.isSuperUser;
        const profile = isAdmin ? VisibilityProfile.ALL_ACCESS : VisibilityProfile.PUBLIC_STAGE;
        const albums = library.searchAlbums(query, limit, profile);
        res.json(albums.map((a: Album) => ({ ...a, coverImage: a.cover_path })));
    }));

    /**
     * POST /api/albums/:id/star
     */
    router.post("/:id/star", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.username) throw new ForbiddenError("Unauthorized");
        const idParam = req.params.id as string;
        let albumId: number;

        if (idParam.startsWith("ext:")) {
            // Check if we already have this external album linked
            const existing = library.getAlbumByExternalId(idParam);
            if (existing) {
                albumId = existing.id;
            } else {
                 // Try to resolve from search/metadata
                 // For now just error out if not found
                 throw new BadRequestError("External album must be matched before starring");
            }
        } else {
            albumId = parseInt(idParam, 10);
        }

        if (isNaN(albumId)) throw new BadRequestError("Invalid album ID");

        const album = library.getAlbum(albumId) || library.getRelease(albumId);
        if (!album) throw new NotFoundError("Album not found");
        
        if (req.context && !VisibilityGuardian.can(req.context, Capability.VIEW_PRIVATE_LIBRARY)) {
            const isPublic = album.visibility === 'public' || album.visibility === 'unlisted' || album.is_release;
            if (!isPublic) throw new ForbiddenError("You can only favorite public albums");
        }

        await catalogService.starAlbum(req.username, albumId);
        res.json({ success: true, starred: true });
    }));

    /**
     * DELETE /api/albums/:id/star
     */
    router.delete("/:id/star", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.username) throw new ForbiddenError("Unauthorized");
        const idParam = req.params.id as string;
        let albumId: number;

        if (idParam.startsWith("ext:")) {
            const existing = library.getAlbumByExternalId(idParam);
            if (!existing) return res.json({ success: true, starred: false });
            albumId = existing.id;
        } else {
            albumId = parseInt(idParam, 10);
        }

        if (isNaN(albumId)) throw new BadRequestError("Invalid album ID");
        await catalogService.unstarAlbum(req.username, albumId);
        res.json({ success: true, starred: false });
    }));

    /**
     * POST /api/albums/:id/promote
     * Manually promote a library album to a formal release
     */
    router.post("/:id/promote", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.context || !VisibilityGuardian.canWriteContent(req.context)) throw new ForbiddenError("Unauthorized");

        const id = parseInt(req.params.id as string, 10);
        const album = library.getAlbum(id);
        if (!album) throw new NotFoundError("Album not found");

        if (!VisibilityGuardian.canManageItem(req.context, album)) throw new ForbiddenError("Access denied");

        await catalogService.promoteToRelease(id);
        res.json({ success: true, message: "Album promoted to release" });
    }));

    /**
     * GET /api/albums/starred
     * Get user's starred albums
     */
    router.get("/starred", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.username) throw new ForbiddenError("Unauthorized");
        try {
            const starredItems = social.getStarredItems(req.username, 'album');
            // Return IDs for easy lookup
            res.json(starredItems.map((i: any) => i.item_id));
        } catch (error) {
            console.error("Error getting starred albums:", error);
            res.status(500).json({ error: "Failed to fetch starred albums" });
        }
    }));

    /**
     * GET /api/albums/search-metadata
     */
    router.get("/search-metadata", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.context || !VisibilityGuardian.canWriteContent(req.context)) throw new ForbiddenError("Unauthorized");
        const query = req.query.q as string;
        if (!query) throw new BadRequestError("Query required");
        res.json(await metadataService.searchRelease(query));
    }));

    /**
     * POST /api/albums/:id/match-metadata
     */
    router.post("/:id/match-metadata", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.context || !VisibilityGuardian.canWriteContent(req.context)) throw new ForbiddenError("Unauthorized");

        const idParam = req.params.id as string;
        const albumId = parseInt(idParam, 10);
        if (isNaN(albumId)) throw new BadRequestError("Invalid album ID");

        const album = library.getAlbum(albumId) || library.getRelease(albumId);
        if (!album) throw new NotFoundError("Album not found");

        if (!VisibilityGuardian.canManageItem(req.context, album)) {
            throw new ForbiddenError("Access denied");
        }

        const { title, artist, coverUrl, genre, year, description } = req.body;

        try {
            await catalogService.updateAlbum(albumId, {
                title,
                artist,
                cover_path: coverUrl,
                genre,
                year: year ? (typeof year === 'string' ? parseInt(year, 10) : year) : undefined,
                description
            });

            const updatedAlbum = library.getAlbum(albumId) || library.getRelease(albumId);
            res.json({ message: "Metadata matched and synced", album: updatedAlbum });
        } catch (error: any) {
            console.error(`❌ [Metadata Match Error] Album ${albumId}:`, error);
            res.status(500).json({ error: error.message });
        }
    }));

    /**
     * GET /api/albums/:id
     */
    router.get("/:id", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const album = await discoveryService.getAlbumForUser(req.params.id, {
            userId: req.userId,
            artistId: req.artistId,
            role: req.role,
            isActive: req.isActive,
            username: req.username
        });
        res.json(album);
    }));

    /**
     * GET /api/albums/:id/cover
     */
    router.get("/:id/cover", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        try {
            const param = req.params.id as string;
            let albumId: number;
            
            if (param.startsWith("ext:")) {
                const results = await metadataService.searchRelease(param.replace("ext:", ""));
                if (results && results.length > 0 && results[0].coverUrl) {
                    return res.redirect(results[0].coverUrl);
                }
                const svg = getPlaceholderSVG("No Cover");
                res.setHeader("Content-Type", "image/svg+xml");
                return res.send(svg);
            }

            let album = null;
            albumId = parseInt(param, 10);
            if (!isNaN(albumId)) {
                album = library.getAlbum(albumId) || library.getRelease(albumId);
            }
            if (!album) {
                album = library.getAlbumBySlug(param) || library.getReleaseBySlug(param);
            }
            
            let albumCoverPath = album?.cover_path;
            
            // Fallback: if the album doesn't have an explicit cover_path, check if any of its tracks has one
            if (album && !albumCoverPath) {
                const albumTracks = library.getTracksByAlbum(album.id);
                const trackWithCover = albumTracks.find(t => t.external_artwork || (t as any).externalArtwork);
                if (trackWithCover) {
                    albumCoverPath = trackWithCover.external_artwork || (trackWithCover as any).externalArtwork;
                }
            }

            if (albumCoverPath) {
                if (albumCoverPath.startsWith('http')) {
                    return res.redirect(albumCoverPath);
                }
                const coverPath = path.join(musicDir, albumCoverPath);
                if (await fs.pathExists(coverPath)) {
                    return res.sendFile(path.resolve(coverPath), { maxAge: 86400000 });
                }
            }
            
            const svg = getPlaceholderSVG(album?.title || "No Cover");
            res.setHeader("Content-Type", "image/svg+xml");
            res.setHeader("Cache-Control", "public, max-age=3600");
            return res.send(svg);
        } catch (e) {
            res.status(500).send("Error loading cover");
        }
    }));

    /**
     * GET /api/albums/:id/download (ZIP)
     */
    router.get("/:id/download", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const id = parseInt(req.params.id as string, 10);
        const album = library.getAlbum(id) || library.getRelease(id);
        if (!album) throw new NotFoundError("Album not found");

        const isAdmin = req.isAdmin || req.isSuperUser;
        const isOwner = album.owner_id === req.userId;
        const isRelease = 'is_release' in album ? !!album.is_release : true;

        if (!isAdmin && !isOwner) {
            if (!isRelease || album.visibility === 'private') throw new ForbiddenError("Access denied");
        }

        const tracks = library.getTracksByAlbum(id);
        if (tracks.length === 0) throw new NotFoundError("No tracks found");

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(album.title || 'album')}.zip"`);

        const archiver = (await import('archiver')).default;
        const archive = archiver('zip', { zlib: { level: 9 }, statConcurrency: 50 });

        archive.on('warning', (err: any) => {
            if (err.code === 'ENOENT') {
                console.warn(`[Albums] Missing file skipped in ZIP: ${err.message}`);
            } else {
                throw err;
            }
        });

        archive.pipe(res);

        for (const track of tracks) {
            if (track.file_path) {
                const trackPath = path.join(musicDir, track.file_path);
                archive.file(trackPath, { name: path.basename(trackPath) });
            }
        }
        await archive.finalize();
    }));

    return router;
}
