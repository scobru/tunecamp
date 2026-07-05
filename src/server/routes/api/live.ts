import { Router, json, raw, Request, Response, NextFunction } from 'express';
import fs from 'fs-extra';
import { join, extname } from 'path';
import type { ServiceContainer } from '../../core/container.js';
import type { AuthenticatedRequest } from '../../middleware/auth.js';
import { wrapAsync } from '../../middleware/error-handling.js';
import { HlsLiveService } from '../../modules/live/hls.service.js';
import type { LiveSession } from '../../modules/live/live.service.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { VisibilityGuardian } from '../../common/visibility.js';
import { sanitizeFilename } from '../../../utils/audioUtils.js';

export function createLiveRoutes(container: ServiceContainer): Router {
    const liveService = container.liveService;
    const authMiddleware = container.authMiddleware;
    const config = container.config;
    const scanner = container.scannerService;
    const musicDir = container.musicDir;
    const storage = container.storage;
    const authService = container.authService;
    const hls = new HlsLiveService();
    const router = Router();

    /**
     * Ingests a finished live recording as a (private) track for the
     * broadcasting artist, reusing the normal upload/scan pipeline. Runs in the
     * background after /stop responds; best-effort, so a failure just logs and
     * drops the temp file rather than surfacing to the broadcaster.
     */
    async function finalizeRecording(recordingPath: string, session: LiveSession) {
        try {
            if (!(await fs.pathExists(recordingPath))) return;
            // A near-empty file means nothing was actually streamed.
            const { size } = await fs.stat(recordingPath);
            if (size < 4096) {
                await hls.discardRecording(recordingPath);
                return;
            }

            // Attribute to the broadcaster (not whoever stopped the session).
            const ownerId = authService?.getUserByUsername(session.username)?.id ?? undefined;
            const artistId = session.artistId != null ? Number(session.artistId) : undefined;
            const dateStr = session.startedAt.slice(0, 10);
            const trackTitle = `${(session.title || 'Live session').trim()} (Live ${dateStr})`;

            // Move the recording into the catalog's tracks dir, then scan it.
            const destDir = join(musicDir, 'tracks');
            await storage.ensureDir(destDir);
            let destPath = join(destDir, sanitizeFilename(`${trackTitle}.m4a`));
            const ext = extname(destPath);
            const base = destPath.slice(0, -ext.length);
            let counter = 1;
            while (await storage.pathExists(destPath)) {
                destPath = `${base}_${counter}${ext}`;
                counter++;
            }
            await storage.move(recordingPath, destPath, { overwrite: false });

            const result = await scanner.processAudioFile(
                destPath, musicDir,
                Number.isFinite(artistId) ? artistId : undefined,
                ownerId,
                undefined, undefined,
                { title: trackTitle }
            );

            if (result?.success && result.trackId) {
                console.log(`🎙️ [Live] Recording saved as track ${result.trackId} for ${session.username}`);
            } else {
                console.warn(`🎙️ [Live] Recording for ${session.username} processed but produced no track`);
            }
        } catch (e) {
            console.error('🎙️ [Live] Failed to finalize recording:', e);
            await hls.discardRecording(recordingPath).catch(() => {});
        }
    }

    // Same gate as publishing: managers/root always, curators only when linked
    // to an artist profile. Listeners can never go live, even with a stale artistId.
    const canBroadcast = (req: AuthenticatedRequest) =>
        VisibilityGuardian.canPublishContent({
            userId: req.userId ?? null,
            artistId: req.artistId ?? null,
            role: req.role!,
        });

    /**
     * GET /api/live/sessions
     * List active live sessions (public)
     */
    router.get('/sessions', json(), wrapAsync(async (_req: Request, res: Response) => {
        const identity = container.identity;
        if (!config.liveEnabled || identity.getSetting("hideLive") === "true") {
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
        const identity = container.identity;
        if (!config.liveEnabled || identity.getSetting("hideLive") === "true") {
            return res.status(403).json({ error: 'Live streaming is disabled on this instance' });
        }
        if (!canBroadcast(req)) {
            return res.status(403).json({ error: 'Only artists and admins can go live' });
        }

        const { title, record } = req.body;
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
            // Only broadcasters (already gated above) may record their session.
            await hls.start(session.roomId, { record: record === true });
        } catch (e: any) {
            liveService.stop(session.roomId);
            return res.status(500).json({ error: e?.message || 'Failed to start the live pipeline' });
        }
        res.json({ ...session, recording: record === true });
    }));

    /**
     * POST /api/live/:roomId/ingest
     * Receives MediaRecorder chunks from the broadcaster's browser (owner only)
     */
    router.post('/:roomId/ingest',
        authMiddleware.requireUser,
        rateLimit({ windowMs: 10000, max: 30, message: 'Ingest rate limit exceeded' }),
        (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const { roomId } = req.params;
            const own = liveService.getByUsername(req.username!);
            if (!own || own.roomId !== roomId) {
                return res.status(403).json({ error: 'Not your live session' });
            }
            next();
        },
        raw({ type: () => true, limit: '15mb' }),
        wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
            const { roomId } = req.params;
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

        // Resolve the session being stopped: the caller's own, or — for admins —
        // any session by roomId. Grab it before stopping so we keep its metadata.
        const own = liveService.getByUsername(req.username!);
        let session: LiveSession | undefined =
            own && (!roomId || roomId === own.roomId) ? own : undefined;
        if (!session && roomId && req.isAdmin) {
            session = liveService.list().find(s => s.roomId === roomId);
        }

        if (!session) {
            return res.status(404).json({ error: 'No active session found' });
        }

        liveService.stop(session.roomId);
        const recordingPath = await hls.stop(session.roomId);
        res.json({ success: true, recording: !!recordingPath });

        // Ingest the recording in the background so /stop stays responsive. It is
        // attributed to the broadcaster's user (owner) for quota/ownership.
        if (recordingPath) {
            void finalizeRecording(recordingPath, session);
        }
    }));

    return router;
}
