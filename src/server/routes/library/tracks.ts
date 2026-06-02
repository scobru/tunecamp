import express, { Router } from "express";
import fs from "fs-extra";
import path from "path";
import { parseFile } from "music-metadata";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import type { DatabaseService, Album, Release, Track, TrackDTO, AlbumDTO } from "../../core/database.js";
import type { CatalogService } from "../../modules/catalog/catalog.service.js";
import type { DiscoveryService } from "../../modules/catalog/discovery.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { wrapAsync } from "../../middleware/error-handling.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../common/errors.js";

// Set ffmpeg path
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}

import type { AuthService } from "../../modules/auth/auth.service.js";
import type { PublishingService } from "../../modules/publishing/publishing.service.js";
import { GoogleDriveService } from "../../modules/storage/google-drive.service.js";
import { metadataService } from "../../modules/catalog/metadata.service.js";
import { getStreamingService } from "../../modules/streaming/streaming.service.js";
import { VisibilityGuardian, Capability, UserRole } from "../../common/visibility.js";
import type { StreamingService } from "../../modules/streaming/streaming.service.js";
import { LocalizationService } from "../../modules/catalog/localization.service.js";
import { mapTrackDTO } from "../../modules/catalog/catalog.mappers.js";
import type { MediaEngine } from "../../modules/media/media-engine.js";


export function createTracksRoutes(database: DatabaseService, publishingService: PublishingService, catalogService: CatalogService, discoveryService: DiscoveryService, musicDir: string, authService?: AuthService, gdriveService?: GoogleDriveService, streamingService?: StreamingService, localizationService?: LocalizationService, mediaEngine?: MediaEngine): Router {

    const router = Router();
    router.use(express.json());

    /**
     * GET /api/tracks
     * List all tracks
     */
    router.get("/", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const showMine = req.query.mine === 'true';
        const tracks = await discoveryService.getTracksForUser(
            { 
                userId: req.userId, 
                artistId: req.artistId,
                role: req.role, 
                isActive: req.isActive,
                username: req.username 
            },
            { mineOnly: showMine }
        );
        res.json(tracks);
    }));

    /**
     * GET /api/tracks/starred
     * Get user's starred tracks
     */
    router.get("/starred", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.username) throw new ForbiddenError("Unauthorized");
        const starredItems = database.getStarredItems(req.username, 'track');
        // Return just IDs for easy lookup in frontend
        res.json(starredItems.map((i: any) => i.item_id));
    }));

    /**
     * GET /api/tracks/pricing/batch
     * Get pricing data for all tracks owned by the current user
     */
    router.get("/pricing/batch", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.isSuperUser && !req.artistId) throw new ForbiddenError("Unauthorized");

        const isRoot = req.isRootAdmin || req.isSuperUser;
        let tracksToSync: any[] = [];
        
        if (isRoot) {
           tracksToSync = database.getTracks();
        } else if (req.artistId) {
           tracksToSync = database.getTracksByOwner(req.artistId);
        } else {
           return res.json([]);
        }

        const artistIdsToFetch = [...new Set(tracksToSync
            .filter(t => t.price && t.price > 0 && t.artist_id)
            .map(t => t.artist_id as number))];

        const artistsBatch = database.getArtistsByIds(artistIdsToFetch);
        const artistMap = new Map(artistsBatch.map(a => [a.id, a]));

        const pricingData = tracksToSync
            .filter(t => t.price && t.price > 0)
            .map(t => ({
                trackId: t.id,
                price: t.price,
                currency: t.currency || 'ETH',
                priceUSDC: t.price_usdc || 0,
                priceUSDT: t.price_usdt || 0,
                walletAddress: t.artist_id ? artistMap.get(t.artist_id)?.wallet_address : null
            }));

        res.json(pricingData);
    }));

    /**
     * POST /api/tracks
     * Create a new track (usually for external links)
     */
    router.post("/", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        if (!req.isAdmin && !req.isActive) throw new ForbiddenError("Account not active");

        const { title, albumId, artistId: bodyArtistId, trackNum, url, service, externalArtwork, duration, lyrics, currency, priceUsdc } = req.body;
        
        let finalArtistId = bodyArtistId;
        if (!req.isAdmin) {
            finalArtistId = req.artistId;
        } else if (!req.isRootAdmin) {
            if (req.artistId) finalArtistId = req.artistId;
        }

        if (!title) throw new BadRequestError("Title is required");

        const trackId = database.createTrack({
            title,
            album_id: albumId || null,
            artist_id: finalArtistId || null,
            owner_id: req.userId || null,
            track_num: trackNum || null,
            duration: duration || 0,
            file_path: null, format: null, bitrate: null, sample_rate: null, lossless_path: null,
            url: url || null, service: service || null,
            external_artwork: externalArtwork || null,
            price: 0,
            price_usdc: priceUsdc !== undefined ? parseFloat(priceUsdc) : 0,
            currency: currency || 'ETH',
            waveform: null, lyrics: lyrics || null
        });

        const newTrack = database.getTrack(trackId);
        res.status(201).json(newTrack ? mapTrackDTO(newTrack, database, req.username) : null);

        if (albumId) {
            publishingService.syncRelease(albumId).catch(e => console.error("Sync failed:", e));
        }
    }));

    /**
     * GET /api/tracks/search-metadata
     */
    router.get("/search-metadata", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        const query = req.query.q as string;
        if (!query) throw new BadRequestError("Query required");
        res.json(await metadataService.searchRecording(query));
    }));

    /**
     * PUT /api/tracks/batch
     */
    router.put("/batch", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        const { trackIds, data } = req.body;
        if (!Array.isArray(trackIds) || trackIds.length === 0) throw new BadRequestError("trackIds required");
        
        const isRoot = req.isRootAdmin;
        const results = await catalogService.batchUpdateTracks(trackIds, data, {
            userId: isRoot ? undefined : (req.userId ?? undefined),
            artistId: isRoot ? undefined : (req.artistId ?? undefined),
            isAdmin: !!req.isAdmin,
            username: req.username
        });
        res.json({ message: "Batch update completed", ...results });
    }));

    /**
     * DELETE /api/tracks/batch
     */
    router.delete("/batch", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        const { trackIds, deleteFiles } = req.body;
        if (!Array.isArray(trackIds) || trackIds.length === 0) throw new BadRequestError("trackIds required");
        
        const isRoot = req.isRootAdmin;
        const results = await catalogService.batchDeleteTracks(trackIds, deleteFiles === true, {
            userId: isRoot ? undefined : (req.userId ?? undefined),
            artistId: isRoot ? undefined : (req.artistId ?? undefined),
            isAdmin: !!req.isAdmin
        });
        res.json({ message: "Batch deletion completed", ...results });
    }));

    // --- Sub-routes (must come BEFORE /:id(*) wildcard) ---

    /**
     * POST /api/tracks/:id/localize
     */
    router.post("/:id(*)/localize", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_ALL_CONTENT)) {
            throw new ForbiddenError("Only admins can localize tracks");
        }
        if (!localizationService) throw new BadRequestError("Localization service not available");

        const idParam = req.params.id as string;
        let trackId: number;

        if (idParam.startsWith("ext:")) {
            const track = database.getTrackByExternalId(idParam);
            if (!track) throw new NotFoundError("Track not found");
            trackId = track.id;
        } else {
            trackId = parseInt(idParam, 10);
        }

        if (isNaN(trackId)) throw new BadRequestError("Invalid track ID");
        
        try {
            const updatedTrack = await localizationService.localizeTrack(trackId);
            res.json({ success: true, track: updatedTrack });
        } catch (error: any) {
            console.error(`❌ [API] Localization failed for track ${trackId}:`, error.message);
            res.status(500).json({ error: error.message });
        }
    }));

    /**
     * POST /api/tracks/:id/star
     */
    router.post("/:id(*)/star", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.username) throw new ForbiddenError("Unauthorized");
        let idParam = req.params.id as string;
        let trackId: number;

        if (idParam.startsWith("ext:") || idParam.startsWith("http")) {
            const existing = database.getTrackByExternalId(idParam);
            if (existing) {
                trackId = existing.id;
            } else {
                const { title, artist, coverUrl, duration, url: sourceUrl } = req.body;
                if (!title) throw new BadRequestError("Title required to link external track");
                let artistId = null;
                if (artist) {
                    const a = database.getArtistByName(artist);
                    artistId = a ? a.id : database.createArtist(artist);
                }
                trackId = database.createTrack({
                    title, artist_id: artistId, artist_name: artist || null,
                    owner_id: req.userId || null, album_id: null, track_num: 1, duration: duration || 0,
                    external_id: idParam, external_artwork: coverUrl || null,
                    service: idParam.startsWith("ext:") ? idParam.split(":")[1] : "link",
                    url: sourceUrl || idParam, file_path: null, format: null, bitrate: null, sample_rate: null, 
                    lossless_path: null, price: 0, price_usdc: 0, currency: 'ETH', waveform: null, lyrics: null
                });
            }
        } else {
            trackId = parseInt(idParam, 10);
        }

        if (isNaN(trackId)) throw new BadRequestError("Invalid track ID");

        const track = database.getTrack(trackId);
        if (!track) throw new NotFoundError("Track not found");

        if (req.context && !VisibilityGuardian.can(req.context, Capability.VIEW_PRIVATE_LIBRARY)) {
            const releases = database.getReleasesByTrackId(trackId);
            const isPublic = track.visibility === 'public' || track.visibility === 'unlisted' || releases.length > 0;
            if (!isPublic) throw new ForbiddenError("You can only favorite public tracks");
        }

        await catalogService.starTrack(req.username, trackId);
        res.json({ success: true, starred: true, trackId });
    }));

    /**
     * DELETE /api/tracks/:id/star
     */
    router.delete("/:id(*)/star", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.username) throw new ForbiddenError("Unauthorized");
        const idParam = req.params.id as string;
        let trackId: number;

        if (idParam.startsWith("ext:") || idParam.startsWith("http")) {
            const existing = database.getTrackByExternalId(idParam);
            if (!existing) return res.json({ success: true, starred: false });
            trackId = existing.id;
        } else {
            trackId = parseInt(idParam, 10);
        }

        if (isNaN(trackId)) throw new BadRequestError("Invalid track ID");
        await catalogService.unstarTrack(req.username, trackId);
        res.json({ success: true, starred: false });
    }));

    /**
     * POST /api/tracks/:id/rating
     */
    router.post("/:id(*)/rating", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.username) throw new ForbiddenError("Unauthorized");
        const idParam = req.params.id as string;
        let trackId: number;

        if (idParam.startsWith("ext:")) {
            const track = database.getTrackByExternalId(idParam);
            if (!track) throw new NotFoundError("Track not found");
            trackId = track.id;
        } else {
            trackId = parseInt(idParam, 10);
        }

        if (isNaN(trackId)) throw new BadRequestError("Invalid track ID");
        const { rating } = req.body;
        const r = parseInt(rating);
        if (isNaN(r) || r < 0 || r > 5) throw new BadRequestError("Invalid rating");
        await catalogService.setTrackRating(req.username, trackId, r);
        res.json({ success: true, rating: r });
    }));

    /**
     * GET /api/tracks/:id/lyrics
     */
    router.get("/:id(*)/lyrics", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const idParam = req.params.id as string;
        let track;
        if (idParam.startsWith("ext:")) track = database.getTrackByExternalId(idParam);
        else {
            const id = parseInt(idParam, 10);
            if (!isNaN(id)) track = database.getTrack(id);
        }

        if (!track) throw new NotFoundError("Track not found");
        if (!track.file_path) return res.json({ lyrics: track.lyrics || "" });

        const trackPath = path.join(musicDir, track.file_path);
        if (!await fs.pathExists(trackPath)) throw new NotFoundError("File not found");

        const metadata = await parseFile(trackPath).catch(() => null);
        let lyrics = track.lyrics || "";
        if (!lyrics && metadata?.common?.lyrics) {
            const l = metadata.common.lyrics;
            lyrics = Array.isArray(l) && l.length > 0 ? (typeof l[0] === 'string' ? l[0] : (l[0] as any).text || "") : (typeof l === 'string' ? l : "");
        }
        res.json({ lyrics });
    }));

    /**
     * GET /api/tracks/:id/cover
     */
    router.get("/:id(*)/cover", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const idParam = req.params.id as string;
        let track;
        if (idParam.startsWith("ext:")) track = database.getTrackByExternalId(idParam);
        else {
            const id = parseInt(idParam, 10);
            if (!isNaN(id)) track = database.getTrack(id);
        }

        if (!track) throw new NotFoundError("Track not found");
        if (track.external_artwork) {
            if (track.external_artwork.startsWith('http')) return res.redirect(track.external_artwork);
            const artworkPath = path.join(musicDir, track.external_artwork);
            if (await fs.pathExists(artworkPath)) return res.sendFile(path.resolve(artworkPath), { maxAge: 86400000 });
        }
        if (track.album_id) return res.redirect(`/api/albums/${track.album_id}/cover`);

        const { getPlaceholderSVG } = await import("../../../utils/audioUtils.js");
        const svg = getPlaceholderSVG(track.title || "No Cover");
        res.setHeader("Content-Type", "image/svg+xml").setHeader("Cache-Control", "public, max-age=3600");
        return res.send(svg);
    }));

    /**
     * GET /api/tracks/:id/metadata
     */
    router.get("/:id(*)/metadata", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        const idParam = req.params.id as string;
        let track;
        if (idParam.startsWith("ext:")) track = database.getTrackByExternalId(idParam);
        else {
            const id = parseInt(idParam, 10);
            if (!isNaN(id)) track = database.getTrack(id);
        }

        if (!track || !track.file_path) throw new NotFoundError("Track or file not found");
        const trackPath = path.join(musicDir, track.file_path);
        const metadata = await parseFile(trackPath).catch(() => null);
        if (!metadata) throw new Error("Failed to parse metadata");

        const { common } = metadata;
        let coverBase64 = null;
        if (common.picture && common.picture.length > 0) {
            const pic = common.picture[0];
            coverBase64 = `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`;
        }

        res.json({
            title: common.title || track.title,
            artist: common.artist || common.albumartist,
            album: common.album,
            year: common.year,
            genre: common.genre ? common.genre.join(", ") : undefined,
            cover: coverBase64
        });
    }));

    /**
     * POST /api/tracks/:id/match-metadata
     */
    router.post("/:id(*)/match-metadata", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        const idParam = req.params.id as string;
        let track;
        if (idParam.startsWith("ext:")) track = database.getTrackByExternalId(idParam);
        else {
            const id = parseInt(idParam, 10);
            if (!isNaN(id)) track = database.getTrack(id);
        }

        if (!track) throw new NotFoundError("Track not found");
        const isRoot = req.isRootAdmin;
        if (!isRoot && !req.isAdmin && track.owner_id !== req.artistId) throw new ForbiddenError("Access denied");

        const { title, artist, albumTitle, coverUrl, genre, year } = req.body;
        try {
            await catalogService.updateTrack(track.id, {
                title,
                artist,
                album: albumTitle,
                externalArtwork: coverUrl,
                genre,
                year: year ? parseInt(year) : undefined
            });

            const updated = database.getTrack(track.id);
            res.json({ message: "Metadata matched and synced", track: updated ? mapTrackDTO(updated, database, req.username) : null });
        } catch (error: any) {
            console.error(`❌ [Metadata Match Error] Track ${track.id}:`, error);
            throw error;
        }
    }));

    /**
     * GET /api/tracks/:id/stream
     */
    router.get("/:id(*)/stream", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!mediaEngine) throw new Error("Media engine not initialized");
        const idParam = req.params.id as string;
        let trackId: number | undefined;
        let externalId: string | undefined;

        if (idParam.startsWith("ext:")) {
            externalId = idParam;
            const dbTrack = database.getTrackByExternalId(idParam);
            if (dbTrack) trackId = dbTrack.id;
        } else trackId = parseInt(idParam, 10);

        if (trackId && !isNaN(trackId)) {
            const track = database.getTrack(trackId);
            if (!track) { if (!externalId) throw new NotFoundError("Track not found"); }
            else {
                const isOwner = (req.userId !== undefined && track.owner_id === req.userId) || (req.artistId !== undefined && track.artist_id === req.artistId);
                const canSeePrivate = VisibilityGuardian.can(req.context || { role: UserRole.GUEST }, Capability.VIEW_PRIVATE_LIBRARY);
                if (!canSeePrivate && !isOwner && !req.userId) {
                    if (track.album_id) {
                        const album = database.getRelease(track.album_id) || database.getAlbum(track.album_id);
                        if (album && album.visibility === 'private' && !database.isTrackInPublicPlaylist(trackId)) throw new ForbiddenError("Access denied");
                    } else throw new ForbiddenError("Access denied");
                }
            }
        } else if (!externalId) throw new BadRequestError("Invalid track ID");

        try {
            const result = await mediaEngine.getStream({
                trackId, externalId, format: req.query.format as string, bitrate: req.query.bitrate as string, range: req.headers.range
            });
            if (result.contentLength) res.setHeader("Content-Length", result.contentLength);
            if (result.contentRange) res.setHeader("Content-Range", result.contentRange);
            res.setHeader("Content-Type", result.contentType).setHeader("Accept-Ranges", "bytes");
            res.status(result.statusCode);
            result.stream.pipe(res);
        } catch (error: any) {
            if (error.message?.startsWith("REDIRECT:")) return res.redirect(error.message.substring(9));
            throw error;
        }
    }));

    /**
     * GET /api/tracks/:id/download
     */
    router.get("/:id(*)/download", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const idParam = req.params.id as string;
        let track;
        if (idParam.startsWith("ext:")) track = database.getTrackByExternalId(idParam);
        else {
            const id = parseInt(idParam, 10);
            if (!isNaN(id)) track = database.getTrack(id);
        }

        if (!track) throw new NotFoundError("Track not found");
        const isOwner = (req.userId !== undefined && track.owner_id === req.userId) || (req.artistId !== undefined && track.artist_id === req.artistId);
        const canSeePrivate = VisibilityGuardian.can(req.context || { role: UserRole.GUEST }, Capability.VIEW_PRIVATE_LIBRARY);
        if (!canSeePrivate && !isOwner && !req.userId) {
            if (track.album_id) {
                const album = database.getRelease(track.album_id) || database.getAlbum(track.album_id);
                if (album && album.visibility === 'private' && !database.isTrackInPublicPlaylist(track.id)) throw new ForbiddenError("Access denied");
            } else throw new ForbiddenError("Access denied");
        }

        if (!track.file_path) throw new NotFoundError("Track file not found");
        if (track.file_path.startsWith("gdrive://")) {
            if (!gdriveService) throw new Error("Google Drive service not available");
            const fileId = track.file_path.substring(9);
            const ownerId = track.owner_id || database.getPrimaryAdminId() || 1;
            const { stream, headers } = await gdriveService.getFileStream(ownerId, fileId);
            const ext = headers['content-type']?.includes('flac') ? '.flac' : headers['content-type']?.includes('wav') ? '.wav' : '.mp3';
            const filename = `${track.artist_name || 'Unknown'} - ${track.title || 'Untitled'}${ext}`;
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            res.setHeader('Content-Type', headers['content-type'] || 'application/octet-stream');
            if (headers['content-length']) res.setHeader('Content-Length', headers['content-length']);
            stream.pipe(res);
            return;
        }

        let trackPath = path.join(musicDir, track.file_path);
        if (!await fs.pathExists(trackPath)) {
            const decoded = decodeURIComponent(trackPath);
            if (await fs.pathExists(decoded)) trackPath = decoded;
            else if (track.lossless_path) {
                let lp = path.join(musicDir, track.lossless_path);
                if (!await fs.pathExists(lp)) lp = decodeURIComponent(lp);
                if (await fs.pathExists(lp)) trackPath = lp;
                else throw new NotFoundError("Audio file not found");
            } else throw new NotFoundError("Audio file not found");
        }
        const ext = path.extname(trackPath);
        const filename = `${track.artist_name || 'Unknown'} - ${track.title || 'Untitled'}${ext}`;
        res.download(trackPath, filename);
    }));

    // --- General Wildcard Routes (must come AFTER specific sub-routes) ---

    /**
     * GET /api/tracks/:id
     */
    router.get("/:id(*)", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const idParam = req.params.id as string;
        let track;
        if (idParam.startsWith("ext:")) track = database.getTrackByExternalId(idParam);
        else {
            const id = parseInt(idParam, 10);
            if (!isNaN(id)) track = database.getTrack(id);
        }
        if (!track) throw new NotFoundError("Track not found");
        const canSeePrivate = VisibilityGuardian.can(req.context || { role: UserRole.GUEST }, Capability.VIEW_PRIVATE_LIBRARY);
        if (!canSeePrivate && track.album_id) {
            const album = database.getAlbum(track.album_id);
            if (album && album.visibility === 'private' && track.owner_id !== req.userId) {
                if (!database.isTrackInPublicPlaylist(track.id)) throw new ForbiddenError("Access denied");
            }
        }
        res.json(mapTrackDTO(track, database, req.username));
    }));

    /**
     * PUT /api/tracks/:id
     */
    router.put("/:id(*)", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        if (!req.isAdmin && !req.isActive) throw new ForbiddenError("Account not active");
        const idParam = req.params.id as string;
        let track;
        if (idParam.startsWith("ext:")) track = database.getTrackByExternalId(idParam);
        else {
            const id = parseInt(idParam, 10);
            if (!isNaN(id)) track = database.getTrack(id);
        }
        if (!track) throw new NotFoundError("Track not found");
        const isRoot = req.isRootAdmin;
        const isOwner = isRoot || req.isAdmin || track.owner_id === req.userId || (track.owner_id === null && track.artist_id === req.artistId);
        if (!isRoot && !isOwner) throw new ForbiddenError("Access denied");

        if (!req.body || typeof req.body !== "object") throw new BadRequestError("Request body is required");

        const updated = await catalogService.updateTrack(track.id, req.body);
        res.json({ message: "Track updated", track: updated ? mapTrackDTO(updated, database, req.username) : null });
    }));

    /**
     * DELETE /api/tracks/:id
     */
    router.delete("/:id(*)", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        if (!req.isAdmin && !req.isActive) throw new ForbiddenError("Account not active");
        const idParam = req.params.id as string;
        let track;
        if (idParam.startsWith("ext:")) track = database.getTrackByExternalId(idParam);
        else {
            const id = parseInt(idParam, 10);
            if (!isNaN(id)) track = database.getTrack(id);
        }
        if (!track) throw new NotFoundError("Track not found");
        const isRoot = req.isRootAdmin;
        const isOwner = isRoot || req.isAdmin || track.owner_id === req.userId || (track.owner_id === null && track.artist_id === req.artistId);
        if (!isRoot && !isOwner) throw new ForbiddenError("Access denied");

        const deleteFile = req.query.deleteFile === "true";
        await catalogService.deleteTrack(track.id, deleteFile);
        res.json({ message: "Track deleted" });
    }));

    return router;
}
