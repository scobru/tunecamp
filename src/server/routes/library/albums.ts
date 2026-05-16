import { Router } from "express";
import fs from "fs-extra";
import path from "path";
import type { DatabaseService, Album, Track } from "../../core/database.js";
import type { CatalogService } from "../../modules/catalog/catalog.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { getPlaceholderSVG } from "../../../utils/audioUtils.js";
import { wrapAsync } from "../../middleware/error-handling.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../common/errors.js";

export function createAlbumsRoutes(database: DatabaseService, catalogService: CatalogService, musicDir: string): Router {
    const router = Router();

    /**
     * GET /api/albums
     * List all albums
     */
    router.get("/", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        let albums: Album[] = [];
        const username = req.username;

        if (req.isAdmin || req.isSuperUser) {
            albums = database.getAlbums();
        } else {
            // Artists and users see their own albums + public ones + starred ones
            const owned = req.userId ? database.getAlbumsByOwner(req.userId!, false) : [];
            const publicAlbums = database.getAlbums(true);
            
            // Get starred albums (especially external/link ones)
            let starredAlbums: Album[] = [];
            if (username) {
                const starredIds = database.getStarredItems(username, 'album').map(i => i.item_id);
                // Filter to find IDs that are in the database
                const validIds = starredIds.filter(id => /^\d+$/.test(id)).map(id => parseInt(id, 10));
                if (validIds.length > 0) {
                    starredAlbums = database.getAlbumsByIds(validIds);
                }
            }

            // Merge and deduplicate
            const seen = new Set();
            albums = [...owned, ...publicAlbums, ...starredAlbums].filter(a => {
                if (seen.has(a.id)) return false;
                seen.add(a.id);
                return true;
            });
        }

        // Add starred and rating info if user is authenticated
        const result = albums.map(a => ({
            ...a,
            coverImage: a.cover_path,
            starred: username ? database.isStarred(username, 'album', String(a.id)) : false,
            rating: username ? database.getItemRating(username, 'album', String(a.id)) : 0
        }));

        res.json(result);
    }));

    /**
     * GET /api/albums/starred
     * Get user's starred albums
     */
    router.get("/starred", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.username) throw new ForbiddenError("Unauthorized");
        const starredItems = database.getStarredItems(req.username, 'album');
        res.json(starredItems.map((i: any) => i.item_id));
    }));

    /**
     * GET /api/albums/search
     */
    router.get("/search", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const query = req.query.q as string;
        const limit = parseInt(req.query.limit as string) || 50;
        if (!query) return res.json([]);
        
        const albums = database.searchAlbums(query, limit, !(req.isAdmin || req.isSuperUser));
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
            const existing = database.db.prepare("SELECT id FROM albums WHERE external_id = ?").get(idParam) as any;
            if (existing) {
                albumId = existing.id;
            } else {
                // Create a link album record
                const { title, artist, coverUrl, type, year } = req.body;
                if (!title) throw new BadRequestError("Album title required to star external album");
                
                // Try to find/create artist
                let artistId = null;
                if (artist) {
                    const a = database.getArtistByName(artist);
                    artistId = a ? a.id : database.createArtist(artist);
                }

                albumId = database.createAlbum({
                    title,
                    artist_id: artistId,
                    album_artist: artist || null,
                    owner_id: req.userId || null,
                    cover_path: coverUrl || null,
                    type: type || null,
                    year: year || null,
                    external_id: idParam,
                    status: 'draft',
                    is_release: false,
                    visibility: 'public' // Mark as public so it's viewable by the user who starred it
                } as any);
            }
        } else {
            albumId = parseInt(idParam, 10);
        }

        if (isNaN(albumId)) throw new BadRequestError("Invalid album ID");

        await catalogService.starAlbum(req.username, albumId);
        res.json({ success: true, starred: true, albumId });
    }));

    /**
     * DELETE /api/albums/:id/star
     */
    router.delete("/:id/star", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.username) throw new ForbiddenError("Unauthorized");
        const idParam = req.params.id as string;
        let albumId: number;

        if (idParam.startsWith("ext:")) {
            const existing = database.db.prepare("SELECT id FROM albums WHERE external_id = ?").get(idParam) as any;
            if (existing) albumId = existing.id;
            else return res.json({ success: true, starred: false });
        } else {
            albumId = parseInt(idParam, 10);
        }

        await catalogService.unstarAlbum(req.username, albumId);
        res.json({ success: true, starred: false });
    }));

    /**
     * POST /api/albums/:id/rating
     */
    router.post("/:id/rating", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.username) throw new ForbiddenError("Unauthorized");
        const id = parseInt(req.params.id as string, 10);
        const { rating } = req.body;
        const r = parseInt(rating);
        if (isNaN(r) || r < 0 || r > 5) throw new BadRequestError("Invalid rating");
        await catalogService.setAlbumRating(req.username, id, r);
        res.json({ success: true, rating: r });
    }));

    /**
     * POST /api/albums/:id/promote
     */
    router.post("/:id/promote", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        
        const id = parseInt(req.params.id as string, 10);
        const album = database.getAlbum(id);
        if (!album) throw new NotFoundError("Album not found");

        if (!req.isAdmin && album.owner_id !== req.userId) throw new ForbiddenError("Access denied");

        await catalogService.promoteToRelease(id);
        res.json({ success: true, message: "Album promoted to release" });
    }));

    /**
     * GET /api/albums/:id
     */
    router.get("/:id", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const album = await catalogService.getAlbumForUser(req.params.id, {
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
            const album = /^\d+$/.test(param)
                ? database.getAlbum(parseInt(param, 10))
                : database.getAlbumBySlug(param);

            if (!album) throw new NotFoundError("Album not found");

            if (album.cover_path) {
                if (album.cover_path.startsWith('http')) {
                    return res.redirect(album.cover_path);
                }
                const coverPath = path.join(musicDir, album.cover_path);
                if (await fs.pathExists(coverPath)) {
                    return res.sendFile(path.resolve(coverPath), { maxAge: 86400000 });
                } else {
                    console.warn(`[Albums] Cover file not found on disk: ${coverPath} (DB path: ${album.cover_path})`);
                }
            }

            const tracks = database.getTracksByAlbum(album.id);
            if (tracks && tracks.length > 0) {
                const trackWithCover = tracks.find(t => t.external_artwork);

                if (trackWithCover && trackWithCover.external_artwork) {
                    if (trackWithCover.external_artwork.startsWith("http")) return res.redirect(trackWithCover.external_artwork);
                    const trackArtworkPath = path.join(musicDir, trackWithCover.external_artwork);
                    if (await fs.pathExists(trackArtworkPath)) return res.sendFile(path.resolve(trackArtworkPath), { maxAge: 86400000 });
                }
            }

            const svg = getPlaceholderSVG(album.title || "Album");
            res.setHeader("Content-Type", "image/svg+xml").setHeader("Cache-Control", "public, max-age=3600");
            res.send(svg);
        } catch (error: any) {
            console.error(`🚨 [Albums] Error in cover route for album ${req.params.id}:`, error);
            throw error; // Rethrow so wrapAsync handles it
        }
    }));

    /**
     * POST /api/albums/:id/cover
     */
    router.post("/:id/cover", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        
        const id = parseInt(req.params.id as string, 10);
        const { relPath } = req.body;
        if (!relPath) throw new BadRequestError("Missing relPath");

        const album = database.getAlbum(id);
        if (!album) throw new NotFoundError("Album not found");

        if (!req.isAdmin && album.owner_id !== req.userId) throw new ForbiddenError("Access denied");

        database.updateAlbumCover(id, relPath);
        res.json({ success: true, coverPath: relPath });
    }));

    /**
     * GET /api/albums/:id/download
     */
    router.get("/:id/download", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const param = req.params.id as string;
        const album = /^\d+$/.test(param)
            ? database.getAlbum(parseInt(param, 10))
            : database.getAlbumBySlug(param);

        if (!album) throw new NotFoundError("Album not found");

        const isOwner = req.userId !== undefined && album.owner_id === req.userId;
        if (!req.isAdmin && !isOwner) {
            if (!album.is_release) throw new ForbiddenError("Access denied");
            if (album.visibility === 'private') throw new ForbiddenError("Access denied");
        }

        if (!album.download || album.download === 'none') {
            throw new ForbiddenError("Downloads disabled");
        }

        const tracks = database.getTracksByAlbum(album.id);
        if (!tracks || tracks.length === 0) {
            throw new NotFoundError("No tracks found");
        }

        const archiver = await import("archiver");
        const archive = archiver.default("zip", { zlib: { level: 5 } });
        
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${album.slug || "album"}.zip"`);
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
    }));

    return router;
}

