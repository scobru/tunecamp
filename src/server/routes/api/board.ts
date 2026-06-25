import { Router, json, Request, Response } from 'express';
import type { ServiceContainer } from '../../core/container.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';
import { wrapAsync } from '../../middleware/error-handling.js';
import { VisibilityProfile } from '../../common/visibility.js';

export function createBoardRoutes(container: ServiceContainer): Router {
    const boardService = container.boardService;
    const authMiddleware = container.authMiddleware;
    const router = Router();
    router.use(json());

    const extractAudioUrls = (content: string): string[] => {
        if (!content) return [];
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const rawUrls = content.match(urlRegex) || [];
        const urls = rawUrls.map(url => url.replace(/[.,!?;:()]+$/, ""));
        return urls.filter(url => {
            const lower = url.toLowerCase();
            if (lower.includes(".mp3") || lower.includes(".wav") || lower.includes(".flac") || lower.includes(".ogg") || lower.includes(".m4a") || lower.includes(".aac")) {
                return true;
            }
            if (lower.includes("drive.google.com/file/d/") || lower.includes("drive.google.com/open?id=") || lower.includes("drive.google.com/uc?")) {
                return true;
            }
            if (lower.includes("dropbox.com/s/") || lower.includes("dropbox.com/scl/fi/")) {
                return true;
            }
            return false;
        });
    };

    const getTitleFromUrl = (url: string, fallbackTitle: string): string => {
        try {
            const decoded = decodeURIComponent(url);
            const u = new URL(decoded);
            const pathname = u.pathname;
            const filename = pathname.split('/').pop();
            if (filename && filename.includes(".")) {
                const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
                if (nameWithoutExt) return nameWithoutExt.replace(/[-_]/g, ' ');
            }
        } catch {}
        return fallbackTitle || "External Audio";
    };

    const syncBoardExternalTracks = async (
        content: string, 
        userId: number | null, 
        trackMetadata?: { artist?: string; title?: string; album?: string; url?: string }
    ) => {
        try {
            const urls = trackMetadata?.url ? [trackMetadata.url] : extractAudioUrls(content);
            if (urls.length === 0) return;

            const library = container.library;
            const artists = library.getArtists(VisibilityProfile.ALL_ACCESS).filter(a => a.id !== -1);
            const primaryArtistId = artists.length > 0 ? artists[0].id : -1;

            for (const url of urls) {
                const extId = `ext:link:${url}`;
                const existing = library.getTrackByExternalId(extId);
                if (!existing) {
                    const trackTitle = trackMetadata?.title || getTitleFromUrl(url, "External Track");
                    
                    let artistId = primaryArtistId;
                    const artistName = trackMetadata?.artist || null;
                    if (artistName) {
                        const dbArtist = library.getArtistByName(artistName);
                        if (dbArtist) {
                            artistId = dbArtist.id;
                        } else {
                            artistId = library.createArtist(artistName);
                        }
                    }

                    let albumId: number | null = null;
                    if (trackMetadata?.album) {
                        const dbAlbum = library.getAlbums().find(a => a.title.toLowerCase() === trackMetadata.album!.toLowerCase());
                        if (dbAlbum) {
                            albumId = dbAlbum.id;
                        }
                    }

                    const service = url.includes("drive.google.com") ? "gdrive" : url.includes("dropbox.com") ? "dropbox" : "link";
                    
                    console.log(`📡 [BoardRoutes] Extracting external track with metadata: "${trackTitle}" by "${artistName || 'Unknown'}" -> ${url}`);
                    library.createTrack({
                        title: trackTitle,
                        album_id: albumId,
                        artist_id: artistId,
                        owner_id: userId,
                        artist_name: artistName,
                        track_num: null,
                        duration: 0,
                        file_path: null,
                        format: null,
                        bitrate: null,
                        sample_rate: null,
                        price: 0,
                        price_usdc: 0,
                        currency: 'ETH',
                        waveform: null,
                        url: url,
                        service: service,
                        external_artwork: null,
                        lyrics: null,
                        lossless_path: null,
                        external_id: extId,
                        hash: null,
                        fingerprint: null,
                        genre: null,
                        year: null,
                        mime_type: 'audio/mpeg',
                        file_size: 0,
                        file_hash: null,
                        version: null,
                        description: `Condiviso tramite Board`
                    });
                }
            }
        } catch (err) {
            console.error("❌ Error parsing external tracks from board message:", err);
        }
    };

    /**
     * GET /api/board/history
     * Get the recent board history
     */
    router.get('/history', wrapAsync(async (req: Request, res: Response) => {
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
        const history = boardService.getHistory(isNaN(limit) ? 100 : limit);
        res.json(history);
    }));

    /**
     * POST /api/board/messages
     * Send a new board message (requires authentication)
     */
    router.post('/messages', authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
        const { message, trackMetadata } = req.body;

        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        if (message.length > 500) {
            return res.status(400).json({ error: 'Message too long (max 500 characters)' });
        }

        const username = req.username || 'Listener';
        const role = req.role || 'user';

        const savedMessage = boardService.addMessage(
            username,
            role,
            message.trim(),
            'webapp'
        );

        if (!savedMessage) {
            return res.status(500).json({ error: 'Failed to send message' });
        }

        // Extract and sync external tracks from board messages
        syncBoardExternalTracks(message.trim(), req.userId || null, trackMetadata);

        // Federate to Fediverse if the user has a linked artist account (fire-and-forget)
        if (req.artistId) {
            container.apService.broadcastBoardMessage(req.artistId, message.trim())
                .catch(err => console.error('[Board] Board→Fediverse federation failed:', err));
        }

        res.json(savedMessage);
    }));

    /**
     * DELETE /api/board/messages/:id
     * Delete a board message (requires authentication and either ownership or admin role)
     */
    router.delete('/messages/:id', authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid message ID' });
        }

        const msg = boardService.getMessage(id);
        if (!msg) {
            return res.status(404).json({ error: 'Message not found' });
        }

        const isAdmin = req.role === 'admin' || req.role === 'root_admin' || req.role === 'super_user';
        const isOwner = req.username === msg.username;

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ error: 'You are not authorized to delete this message' });
        }

        const success = boardService.deleteMessage(id);
        if (!success) {
            return res.status(500).json({ error: 'Failed to delete message' });
        }

        res.json({ success: true });
    }));

    /**
     * GET /api/board/stream
     * Server-Sent Events stream for real-time board updates
     */
    router.get('/stream', wrapAsync(async (req: Request, res: Response) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        // Send a ping to keep-alive
        res.write('comment: connected\n\n');
        if (typeof (res as any).flush === 'function') {
            (res as any).flush();
        }

        const onMessage = (msg: any) => {
            res.write(`data: ${JSON.stringify(msg)}\n\n`);
            if (typeof (res as any).flush === 'function') {
                (res as any).flush();
            }
        };

        boardService.events.on('message', onMessage);

        req.on('close', () => {
            boardService.events.off('message', onMessage);
        });
    }));

    return router;
}
