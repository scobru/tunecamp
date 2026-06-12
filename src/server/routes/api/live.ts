import { Router, json, raw, Request, Response } from 'express';
import fs from 'fs-extra';
import type { ServiceContainer } from '../../core/container.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';
import { wrapAsync } from '../../middleware/error-handling.js';
import { HlsLiveService } from '../../modules/live/hls.service.js';

export function createLiveRoutes(container: ServiceContainer): Router {
    const liveService = container.liveService;
    const authMiddleware = container.authMiddleware;
    const config = container.config;
    const hls = new HlsLiveService();
    const router = Router();

    const canBroadcast = (req: AuthenticatedRequest) =>
        req.isAdmin || req.isSuperUser || !!req.artistId;

    /**
     * GET /api/live/sessions
     * List active live sessions (public)
     */
    router.get('/sessions', json(), wrapAsync(async (_req: Request, res: Response) => {
        if (!config.liveEnabled) {
            return res.json({ enabled: false, sessions: [] });
        }
        const sessions = liveService.list().map(s => ({
            ...s,
            listenerCount: hls.getListenerCount(s.roomId)
        }));
        res.json({ enabled: true, sessions });
    }));

    /**
     * POST /api/live/start
     * Announce a live session and spin up its HLS pipeline (artists and admins only)
     */
    router.post('/start', json(), authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!config.liveEnabled) {
            return res.status(403).json({ error: 'Live streaming is disabled on this instance' });
        }
        if (!canBroadcast(req)) {
            return res.status(403).json({ error: 'Only artists and admins can go live' });
        }

        const { title } = req.body;
        if (!title || typeof title !== 'string' || !title.trim()) {
            return res.status(400).json({ error: 'Title is required' });
        }
        if (title.length > 120) {
            return res.status(400).json({ error: 'Title too long (max 120 characters)' });
        }

        // Replacing a previous session must also tear down its pipeline
        const previous = liveService.getByUsername(req.username!);
        if (previous) await hls.stop(previous.roomId);

        const session = liveService.start(req.username!, title.trim(), req.artistId ?? undefined);
        try {
            await hls.start(session.roomId);
        } catch (e: any) {
            liveService.stop(session.roomId);
            return res.status(500).json({ error: e?.message || 'Failed to start the live pipeline' });
        }
        res.json(session);
    }));

    /**
     * POST /api/live/:roomId/ingest
     * Receives MediaRecorder chunks from the broadcaster's browser (owner only)
     */
    router.post('/:roomId/ingest',
        authMiddleware.requireUser,
        raw({ type: () => true, limit: '15mb' }),
        wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
            const { roomId } = req.params;
            const own = liveService.getByUsername(req.username!);
            if (!own || own.roomId !== roomId) {
                return res.status(403).json({ error: 'Not your live session' });
            }
            if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
                return res.status(400).json({ error: 'Empty chunk' });
            }
            if (!hls.ingest(roomId, req.body)) {
                return res.status(409).json({ error: 'Live pipeline is not running' });
            }
            res.json({ success: true });
        })
    );

    /**
     * GET /api/live/:roomId/hls/:file
     * Serves the rolling HLS playlist and audio segments (public)
     */
    router.get('/:roomId/hls/:file', wrapAsync(async (req: Request, res: Response) => {
        const { roomId, file } = req.params;
        const filePath = hls.resolveFile(roomId, file);
        if (!filePath || !(await fs.pathExists(filePath))) {
            return res.status(404).json({ error: 'Not found' });
        }

        if (file.endsWith('.m3u8')) {
            // Playlist polls double as the listener heartbeat
            hls.trackListener(roomId, req.ip || req.socket.remoteAddress || 'unknown');
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'no-store');
        } else {
            res.setHeader('Content-Type', 'video/mp2t');
            // Segments are immutable once written
            res.setHeader('Cache-Control', 'public, max-age=60');
        }
        res.sendFile(filePath);
    }));

    /**
     * POST /api/live/stop
     * End a live session. Owners stop their own; admins can stop any by roomId.
     */
    router.post('/stop', json(), authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
        const { roomId } = req.body;

        const own = liveService.getByUsername(req.username!);
        if (own && (!roomId || roomId === own.roomId)) {
            liveService.stop(own.roomId);
            await hls.stop(own.roomId);
            return res.json({ success: true });
        }

        if (roomId && req.isAdmin) {
            const stopped = liveService.stop(roomId);
            await hls.stop(roomId);
            return res.json({ success: stopped });
        }

        res.status(404).json({ error: 'No active session found' });
    }));

    return router;
}
