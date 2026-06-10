import { Router, json, Request, Response } from 'express';
import type { ServiceContainer } from '../../core/container.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';
import { wrapAsync } from '../../middleware/error-handling.js';

export function createLiveRoutes(container: ServiceContainer): Router {
    const liveService = container.liveService;
    const authMiddleware = container.authMiddleware;
    const config = container.config;
    const router = Router();
    router.use(json());

    const canBroadcast = (req: AuthenticatedRequest) =>
        req.isAdmin || req.isSuperUser || !!req.artistId;

    /**
     * GET /api/live/sessions
     * List active live sessions (public)
     */
    router.get('/sessions', wrapAsync(async (_req: Request, res: Response) => {
        if (!config.liveEnabled) {
            return res.json({ enabled: false, sessions: [] });
        }
        res.json({ enabled: true, sessions: liveService.list() });
    }));

    /**
     * POST /api/live/start
     * Announce a live session (artists and admins only)
     */
    router.post('/start', authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
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

        const session = liveService.start(req.username!, title.trim(), req.artistId ?? undefined);
        res.json(session);
    }));

    /**
     * POST /api/live/stop
     * End a live session. Owners stop their own; admins can stop any by roomId.
     */
    router.post('/stop', authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
        const { roomId } = req.body;

        const own = liveService.getByUsername(req.username!);
        if (own && (!roomId || roomId === own.roomId)) {
            liveService.stop(own.roomId);
            return res.json({ success: true });
        }

        if (roomId && req.isAdmin) {
            const stopped = liveService.stop(roomId);
            return res.json({ success: stopped });
        }

        res.status(404).json({ error: 'No active session found' });
    }));

    return router;
}
