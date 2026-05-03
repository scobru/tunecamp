import { Router } from "express";
import fs from "fs-extra";
import path from "path";
import type { DatabaseService, Album, Track } from "../database.js";
import type { LibraryService } from "../services/library.service.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { getPlaceholderSVG } from "../../utils/audioUtils.js";
import { wrapAsync } from "../middleware/error-handling.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../common/errors.js";

export function createAlbumsRoutes(database: DatabaseService, libraryService: LibraryService, musicDir: string): Router {
    const router = Router();

    /**
     * GET /api/albums
     * List all albums
     */
    router.get("/", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.isSuperUser) throw new ForbiddenError("Access denied: Admin only");
        res.json(database.getAlbums());
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
        const id = parseInt(req.params.id as string, 10);
        await libraryService.starAlbum(req.username, id);
        res.json({ success: true, starred: true });
    }));

    /**
     * DELETE /api/albums/:id/star
     */
    router.delete("/:id/star", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.username) throw new ForbiddenError("Unauthorized");
        const id = parseInt(req.params.id as string, 10);
        await libraryService.unstarAlbum(req.username, id);
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
        await libraryService.setAlbumRating(req.username, id, r);
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

        await libraryService.promoteToRelease(id);
        res.json({ success: true, message: "Album promoted to release" });
    }));

    /**
     * GET /api/albums/:id
     */
    router.get("/:id", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const album = await libraryService.getAlbumForUser(req.params.id, {
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
        const param = req.params.id as string;
        const album = /^\d+$/.test(param)
            ? database.getAlbum(parseInt(param, 10))
            : database.getAlbumBySlug(param);

        if (!album) throw new NotFoundError("Album not found");

        if (album.cover_path) {
            const coverPath = path.join(musicDir, album.cover_path);
            if (await fs.pathExists(coverPath)) {
                return res.sendFile(path.resolve(coverPath), { maxAge: 86400000 });
            }
        }

        const tracks = database.getTracksByAlbum(album.id);
        const trackWithCover = tracks.find(t => t.external_artwork);

        if (trackWithCover && trackWithCover.external_artwork) {
            if (trackWithCover.external_artwork.startsWith("http")) return res.redirect(trackWithCover.external_artwork);
            const trackArtworkPath = path.join(musicDir, trackWithCover.external_artwork);
            if (await fs.pathExists(trackArtworkPath)) return res.sendFile(path.resolve(trackArtworkPath), { maxAge: 86400000 });
        }

        const svg = getPlaceholderSVG(album.title || "Album");
        res.setHeader("Content-Type", "image/svg+xml").setHeader("Cache-Control", "public, max-age=3600");
        res.send(svg);
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

    return router;
}
