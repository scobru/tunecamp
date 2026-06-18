import { Router, json, Response } from 'express';
import type { ServiceContainer } from '../../core/container.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';
import { wrapAsync } from '../../middleware/error-handling.js';
import { NowPlayingService } from '../../modules/presence/now-playing.service.js';

/**
 * "Now listening" — opt-in presence. Each broadcasting client pings POST / with
 * what it's playing; opted-in users then appear in GET /. The view is
 * members-only (login required), and presence is only recorded for users who
 * have explicitly turned the feature on (default off, for privacy).
 */
export function createNowPlayingRoutes(container: ServiceContainer): Router {
    const authMiddleware = container.authMiddleware;
    const authService = container.authService;
    const presence = new NowPlayingService();
    const router = Router();
    router.use(json());

    /** GET /api/now-playing/preference — the caller's opt-in state */
    router.get('/preference', authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
        const enabled = req.userId != null ? authService.getNowPlayingEnabled(req.userId) : false;
        res.json({ enabled });
    }));

    /** PUT /api/now-playing/preference — toggle the opt-in */
    router.put('/preference', authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
        const { enabled } = req.body ?? {};
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: "Field 'enabled' (boolean) is required" });
        }
        if (req.userId == null) return res.status(401).json({ error: 'Unauthorized' });
        authService.setNowPlayingEnabled(req.userId, enabled);
        // Stop sharing immediately when turning it off.
        if (!enabled && req.username) presence.clear(req.username);
        res.json({ enabled });
    }));

    /** POST /api/now-playing — heartbeat; only recorded if the caller opted in */
    router.post('/', authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (req.userId == null || !req.username) return res.status(401).json({ error: 'Unauthorized' });
        if (!authService.getNowPlayingEnabled(req.userId)) {
            return res.json({ recorded: false });
        }

        const { trackId, title, artist } = req.body ?? {};
        // No title means nothing is playing (paused/stopped) → drop presence.
        if (!title) {
            presence.clear(req.username);
            return res.json({ recorded: false });
        }

        presence.set(req.username, {
            trackId: trackId ?? null,
            title: String(title).slice(0, 300),
            artist: String(artist ?? '').slice(0, 300),
        });
        res.json({ recorded: true });
    }));

    /** GET /api/now-playing — opted-in users currently listening (members only) */
    router.get('/', authMiddleware.requireUser, wrapAsync(async (_req: AuthenticatedRequest, res: Response) => {
        const listeners = presence.list().map(e => {
            const profile = authService.getUserProfile(e.username);
            return {
                username: e.username,
                alias: profile?.alias ?? null,
                avatar: profile?.avatar ?? null,
                trackId: e.trackId,
                title: e.title,
                artist: e.artist,
                updatedAt: e.updatedAt,
            };
        });
        res.json({ listeners });
    }));

    return router;
}
