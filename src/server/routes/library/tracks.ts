import { Router } from "express";
import fs from "fs-extra";
import path from "path";
import { parseFile } from "music-metadata";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import type { DatabaseService } from "../../database.js";
import type { CatalogService } from "../../modules/catalog/catalog.service.js";
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

export function createTracksRoutes(database: DatabaseService, publishingService: PublishingService, catalogService: CatalogService, musicDir: string, authService?: AuthService, gdriveService?: GoogleDriveService, streamingService?: StreamingService): Router {
    const router = Router();

    /**
     * GET /api/tracks
     * List all tracks
     */
    router.get("/", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const showMine = req.query.mine === 'true';
        const tracks = await catalogService.getTracksForUser(
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
        res.status(201).json(newTrack ? catalogService.mapTrackDTO(newTrack, req.username) : null);

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

    /**
     * GET /api/tracks/:id
     * Get track details
     */
    router.get("/:id", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) throw new BadRequestError("Invalid track ID");

        const track = database.getTrack(id);
        if (!track) throw new NotFoundError("Track not found");

        const canSeePrivate = VisibilityGuardian.can(req.context || { role: UserRole.GUEST }, Capability.VIEW_PRIVATE_LIBRARY);
        if (!canSeePrivate && track.album_id) {
            const album = database.getAlbum(track.album_id);
            if (album && album.visibility === 'private' && track.owner_id !== req.userId) {
                if (!database.isTrackInPublicPlaylist(id)) throw new ForbiddenError("Access denied");
            }
        }

        res.json(catalogService.mapTrackDTO(track, req.username));
    }));

    /**
     * PUT /api/tracks/:id
     * Update track metadata and files
     */
    router.put("/:id", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        if (!req.isAdmin && !req.isActive) throw new ForbiddenError("Account not active");

        const id = parseInt(req.params.id as string, 10);
        const track = database.getTrack(id);
        if (!track) throw new NotFoundError("Track not found");

        const isRoot = req.isRootAdmin;
        const isOwner = isRoot || track.owner_id === req.userId || (track.owner_id === null && track.artist_id === req.artistId);
        if (!isRoot && !isOwner) throw new ForbiddenError("Access denied: You can only edit your own tracks");

        const updated = await catalogService.updateTrack(id, req.body);
        res.json({ message: "Track updated", track: updated ? catalogService.mapTrackDTO(updated, req.username) : null });
    }));

    /**
     * DELETE /api/tracks/:id
     * Delete track
     */
    router.delete("/:id", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        if (!req.isAdmin && !req.isActive) throw new ForbiddenError("Account not active");

        const id = parseInt(req.params.id as string, 10);
        const track = database.getTrack(id);
        if (!track) throw new NotFoundError("Track not found");

        const isRoot = req.isRootAdmin;
        const isOwner = isRoot || track.owner_id === req.userId || (track.owner_id === null && track.artist_id === req.artistId);
        if (!isRoot && !isOwner) throw new ForbiddenError("Access denied: You can only delete your own tracks");

        const deleteFile = req.query.deleteFile === "true";
        await catalogService.deleteTrack(id, deleteFile);
        res.json({ message: "Track deleted" });
    }));

    /**
     * POST /api/tracks/:id/star
     */
    router.post("/:id/star", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.username) throw new ForbiddenError("Unauthorized");
        let idParam = req.params.id as string;
        let trackId: number;

        if (idParam.startsWith("ext:")) {
            // Check if we already have this external track linked
            const existing = database.getTrackByExternalId(idParam);
            if (existing) {
                trackId = existing.id;
            } else {
                // Create a "Link" track record
                const { title, artist, coverUrl, duration } = req.body;
                if (!title) throw new BadRequestError("Title required to link external track");
                
                // Try to find/create artist
                let artistId = null;
                if (artist) {
                    const a = database.getArtistByName(artist);
                    artistId = a ? a.id : database.createArtist(artist);
                }

                trackId = database.createTrack({
                    title,
                    artist_id: artistId,
                    artist_name: artist || null,
                    owner_id: req.userId || null,
                    album_id: null,
                    track_num: 1,
                    duration: duration || 0,
                    external_id: idParam,
                    external_artwork: coverUrl || null,
                    service: idParam.split(":")[1],
                    url: idParam, // The ext: ID acts as the identifier for streaming
                    file_path: null, format: null, bitrate: null, sample_rate: null, lossless_path: null,
                    price: 0, price_usdc: 0, currency: 'ETH', waveform: null, lyrics: null
                });
            }
        } else {
            trackId = parseInt(idParam, 10);
        }

        if (isNaN(trackId)) throw new BadRequestError("Invalid track ID");
        await catalogService.starTrack(req.username, trackId);
        res.json({ success: true, starred: true, trackId });
    }));

    /**
     * DELETE /api/tracks/:id/star
     */
    router.delete("/:id/star", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.username) throw new ForbiddenError("Unauthorized");
        const idParam = req.params.id as string;
        let trackId: number;

        if (idParam.startsWith("ext:")) {
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
    router.post("/:id/rating", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.username) throw new ForbiddenError("Unauthorized");
        const trackId = parseInt(req.params.id as string, 10);
        const { rating } = req.body;
        const r = parseInt(rating);
        if (isNaN(r) || r < 0 || r > 5) throw new BadRequestError("Invalid rating (must be 0-5)");
        await catalogService.setTrackRating(req.username, trackId, r);
        res.json({ success: true, rating: r });
    }));

    /**
     * GET /api/tracks/:id/lyrics
     */
    router.get("/:id/lyrics", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const id = parseInt(req.params.id as string, 10);
        const track = database.getTrack(id);
        if (!track || !track.file_path) throw new NotFoundError("Track not found");

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
    router.get("/:id/cover", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const id = parseInt(req.params.id as string, 10);
        const track = database.getTrack(id);
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
     * GET /api/tracks/:id/metadata (extract from file)
     */
    router.get("/:id/metadata", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        const id = parseInt(req.params.id as string, 10);
        const track = database.getTrack(id);
        if (!track || !track.file_path) throw new NotFoundError("Track not found");

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
    router.post("/:id/match-metadata", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        if (!req.isAdmin && !req.artistId) throw new ForbiddenError("Unauthorized");
        const id = parseInt(req.params.id, 10);
        const track = database.getTrack(id);
        if (!track) throw new NotFoundError("Track not found");
        
        const isRoot = req.isRootAdmin;
        if (!isRoot && !req.isAdmin && track.owner_id !== req.artistId) throw new ForbiddenError("Access denied");

        const { title, artist, albumTitle, coverUrl } = req.body;
        console.log(`🔍 [Metadata Match] Processing track ${id}:`, { title, artist, albumTitle, hasCover: !!coverUrl });

        try {
            let artistId = track.artist_id;
            if (artist) {
                console.log(`   - Matching artist: "${artist}"`);
                const a = database.getArtistByName(artist);
                artistId = a ? a.id : database.createArtist(artist);
                console.log(`   - Artist ID: ${artistId}`);
                database.updateTrackArtist(id, artistId);
            }

            if (albumTitle) {
                console.log(`   - Matching album: "${albumTitle}"`);
                const slug = "lib-" + albumTitle.toLowerCase().replace(/[^a-z0-9]/g, '-');
                let alb = database.getAlbumBySlug(slug);
                if (!alb) {
                    console.log(`   - Creating new library album: "${albumTitle}" (slug: ${slug})`);
                    const newId = database.createAlbum({
                        title: albumTitle, slug, artist_id: artistId, owner_id: req.userId || null,
                        date: null, cover_path: null, genre: "Matched", description: "Matched",
                        type: 'album', year: null, download: null, price: 0, price_usdc: 0, currency: 'ETH',
                        external_links: null, is_public: false, visibility: 'private', is_release: false,
                        published_at: null, published_to_gundb: false, published_to_ap: false, license: null,
                        status: 'draft',
                    });
                    alb = database.getAlbum(newId);
                }
                if (alb) {
                    console.log(`   - Associating track with album ID: ${alb.id}`);
                    database.updateTrackAlbum(id, alb.id);
                }
            }

            if (title) {
                console.log(`   - Updating title: "${title}"`);
                database.updateTrackTitle(id, title);
            }
            
            if (coverUrl) {
                console.log(`   - Updating external artwork: ${coverUrl.substring(0, 50)}...`);
                (database as any).db.prepare("UPDATE tracks SET external_artwork = ? WHERE id = ?").run(coverUrl, id);
            }

            const updated = database.getTrack(id);
            res.json({ message: "Metadata matched", track: updated ? catalogService.mapTrackDTO(updated, req.username) : null });
        } catch (error: any) {
            console.error(`❌ [Metadata Match Error] Track ${id}:`, error);
            throw error;
        }
    }));

    const activeStreamingService = streamingService || getStreamingService();
    
    /**
     * GET /api/tracks/:id/stream
     */
    router.get("/:id/stream", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const idParam = req.params.id as string;

        // Handle external streaming IDs (e.g., ext:youtube:VIDEO_ID)
        if (idParam.startsWith("ext:")) {
            const parts = idParam.split(":");
            if (parts.length < 3) throw new BadRequestError("Invalid external ID");
            const providerId = parts[1];
            const originalId = parts.slice(2).join(":");

            console.log(`🌐 [Streaming] Requesting external stream: ${providerId} / ${originalId}`);
            
            let url: string | null = null;
            if (providerId === 'search') {
                const [artist, title] = originalId.split(" - ");
                url = await activeStreamingService.resolve(title || originalId, artist || "");
            } else {
                url = await activeStreamingService.resolveById(providerId, originalId);
            }
            
            if (!url) throw new NotFoundError("External stream not found");

            // Redirect to the proxy route so CORS/SSL are handled centrally
            return res.redirect(`/api/proxy/stream?url=${encodeURIComponent(url)}`);
        }

        const id = parseInt(idParam, 10);
        const track = database.getTrack(id);
        if (!track) throw new NotFoundError("Track not found");

        const isOwner = (req.userId !== undefined && track.owner_id === req.userId) || (req.artistId !== undefined && track.artist_id === req.artistId);
        const canSeePrivate = VisibilityGuardian.can(req.context || { role: UserRole.GUEST }, Capability.VIEW_PRIVATE_LIBRARY);
        if (!canSeePrivate && !isOwner) {
            if (track.album_id) {
                const album = database.getRelease(track.album_id) || database.getAlbum(track.album_id);
                if (album && album.visibility === 'private' && !database.isTrackInPublicPlaylist(id)) throw new ForbiddenError("Access denied");
            } else throw new ForbiddenError("Access denied");
        }

        if (!track.file_path) throw new NotFoundError("Track file not found");

        // Google Drive support
        if (track.file_path.startsWith("gdrive://")) {
            if (!gdriveService) throw new Error("Google Drive service not available");
            const fileId = track.file_path.substring(9);
            const ownerId = track.owner_id || database.getPrimaryAdminId() || 1;
            const { stream, status, headers } = await gdriveService.getFileStream(ownerId, fileId, req.headers.range);
            
            const filteredHeaders: any = {};
            ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(h => {
                if (headers[h]) filteredHeaders[h] = headers[h];
            });

            res.writeHead(status, filteredHeaders);
            stream.pipe(res);
            return;
        }

        let trackPath = path.join(musicDir, track.file_path);
        let usingLosslessFallback = false;

        if (!await fs.pathExists(trackPath)) {
            const decoded = decodeURIComponent(trackPath);
            if (await fs.pathExists(decoded)) trackPath = decoded;
            else if (track.lossless_path) {
                let lp = path.join(musicDir, track.lossless_path);
                if (!await fs.pathExists(lp)) lp = decodeURIComponent(lp);
                if (await fs.pathExists(lp)) { trackPath = lp; usingLosslessFallback = true; }
                else throw new NotFoundError("Audio file not found");
            } else {
                // --- STREAMING PROVIDER FALLBACK ---
                // Local file missing: ask StreamingService if any registered provider can serve it.
                if (activeStreamingService.getRegistry().getAll().length > 0) {
                    const title = track.title || "";
                    const artist = track.artist_name || "";
                    const streamUrl = await activeStreamingService.resolve(title, artist).catch(() => null);
                    if (streamUrl) {
                        console.log(`📡 [Stream] Local file missing, falling back to streaming provider for: ${artist} - ${title}`);
                        // Redirect to the existing proxy route so CORS/SSL are handled centrally
                        return res.redirect(`/api/proxy/stream?url=${encodeURIComponent(streamUrl)}`);
                    }
                }
                throw new NotFoundError("Audio file not found");
            }
        }

        const stat = await fs.promises.stat(trackPath);
        const ext = path.extname(trackPath).toLowerCase();
        let targetFormat = req.query.format as string;
        
        // Only force MP3 transcoding for WAV (heavy/poorly supported) or when using a lossless fallback
        // FLAC is well-supported natively and should be served as-is for better seeking/quality
        if (!targetFormat && (ext === '.wav' || usingLosslessFallback)) targetFormat = 'mp3';

        if (targetFormat && (targetFormat !== ext.substring(1) || usingLosslessFallback)) {
            const contentTypeMap: any = { 'mp3': 'audio/mpeg', 'aac': 'audio/aac', 'ogg': 'audio/ogg', 'opus': 'audio/opus' };
            res.setHeader("Content-Type", contentTypeMap[targetFormat] || 'audio/mpeg');
            
            ffmpeg(trackPath)
                .format(targetFormat)
                .audioCodec(targetFormat === 'mp3' ? 'libmp3lame' : 'copy')
                .audioChannels(2)
                .audioBitrate((req.query.bitrate as string) || '192k')
                .on('error', (err) => { 
                    if (!err.message.includes("Output stream closed")) {
                        console.error('Transcoding error:', err.message);
                    }
                })
                .pipe(res, { end: true });
            return;
        }

        const range = req.headers.range;
        const contentTypes: any = { ".mp3": "audio/mpeg", ".flac": "audio/flac", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".opus": "audio/opus" };
        const contentType = contentTypes[ext] || "audio/mpeg";

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Type": contentType });
            fs.createReadStream(trackPath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, { "Content-Length": stat.size, "Content-Type": contentType, "Accept-Ranges": "bytes" });
            fs.createReadStream(trackPath).pipe(res);
        }
    }));

    /**
     * GET /api/tracks/:id/download
     * Download original file
     */
    router.get("/:id/download", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const id = parseInt(req.params.id as string, 10);
        const track = database.getTrack(id);
        if (!track) throw new NotFoundError("Track not found");

        const isOwner = (req.userId !== undefined && track.owner_id === req.userId) || (req.artistId !== undefined && track.artist_id === req.artistId);
        const canSeePrivate = VisibilityGuardian.can(req.context || { role: UserRole.GUEST }, Capability.VIEW_PRIVATE_LIBRARY);
        if (!canSeePrivate && !isOwner) {
            if (track.album_id) {
                const album = database.getRelease(track.album_id) || database.getAlbum(track.album_id);
                if (album && album.visibility === 'private' && !database.isTrackInPublicPlaylist(id)) throw new ForbiddenError("Access denied");
            } else throw new ForbiddenError("Access denied");
        }

        if (!track.file_path) throw new NotFoundError("Track file not found");

        // Google Drive support
        if (track.file_path.startsWith("gdrive://")) {
            if (!gdriveService) throw new Error("Google Drive service not available");
            const fileId = track.file_path.substring(9);
            const ownerId = track.owner_id || database.getPrimaryAdminId() || 1;
            const { stream, headers } = await gdriveService.getFileStream(ownerId, fileId);
            
            const ext = headers['content-type'] === 'audio/flac' ? '.flac' : 
                        headers['content-type'] === 'audio/mpeg' ? '.mp3' : 
                        headers['content-type'] === 'audio/wav' ? '.wav' : '.mp3';
            
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

    return router;
}

