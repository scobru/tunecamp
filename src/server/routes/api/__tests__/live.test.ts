import { jest, describe, test, expect, beforeEach, beforeAll } from "@jest/globals";
import express from "express";
import request from "supertest";

// The route constructs HlsLiveService directly; stub it so /start never spawns ffmpeg.
const mockHls = {
    start: jest.fn<any>().mockResolvedValue(undefined),
    stop: jest.fn<any>().mockResolvedValue(null),
    ingest: jest.fn<any>().mockReturnValue(true),
    resolveFile: jest.fn<any>().mockReturnValue(null),
    getListenerCount: jest.fn<any>().mockReturnValue(0),
    trackListener: jest.fn(),
    discardRecording: jest.fn<any>().mockResolvedValue(undefined),
};
jest.unstable_mockModule('../../../modules/live/hls.service.js', () => ({
    HlsLiveService: jest.fn().mockImplementation(() => mockHls),
}));

let createLiveRoutes: any;

const mockLiveService = {
    list: jest.fn<any>().mockReturnValue([]),
    getByUsername: jest.fn<any>().mockReturnValue(undefined),
    start: jest.fn<any>(),
    stop: jest.fn(),
};

// What requireUser injects; each test overrides to model a different caller.
let caller: { userId: number; username: string; role: string; artistId?: number; isAdmin?: boolean };

const mockAuthMiddleware = {
    requireUser: (req: any, _res: any, next: any) => {
        Object.assign(req, caller);
        next();
    },
};

function buildApp() {
    const container = {
        liveService: mockLiveService,
        authMiddleware: mockAuthMiddleware,
        config: { liveEnabled: true },
        scannerService: {},
        musicDir: '/music',
        storage: {},
        authService: { getUserByUsername: jest.fn() },
        identity: { getSetting: jest.fn<any>().mockReturnValue(undefined) },
    } as any;
    const app = express();
    app.use('/api/live', createLiveRoutes(container));
    return app;
}

describe('Live routes — broadcast gate (canPublishContent)', () => {
    let app: express.Express;

    beforeAll(async () => {
        ({ createLiveRoutes } = await import('../live.js'));
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockLiveService.list.mockReturnValue([]);
        mockLiveService.getByUsername.mockReturnValue(undefined);
        mockLiveService.start.mockReturnValue({ roomId: 'r1', username: 'u', title: 't', startedAt: '2026-01-01T00:00:00Z' });
        mockHls.start.mockResolvedValue(undefined);
        mockHls.ingest.mockReturnValue(true);
        app = buildApp();
    });

    test('listener without artist link cannot start (403)', async () => {
        caller = { userId: 4, username: 'listener', role: 'user' };
        const res = await request(app).post('/api/live/start').send({ title: 'My show' });
        expect(res.status).toBe(403);
        expect(mockLiveService.start).not.toHaveBeenCalled();
    });

    test('curator without artist link cannot start (403)', async () => {
        caller = { userId: 2, username: 'curator', role: 'super_user' };
        const res = await request(app).post('/api/live/start').send({ title: 'My show' });
        expect(res.status).toBe(403);
    });

    test('listener-artist (user role + artistId) can start', async () => {
        caller = { userId: 7, username: 'listener-artist', role: 'user', artistId: 10 };
        const res = await request(app).post('/api/live/start').send({ title: 'My show' });
        expect(res.status).toBe(200);
        expect(mockLiveService.start).toHaveBeenCalledWith('listener-artist', 'My show', 10);
    });

    test('admin can start without artist link', async () => {
        caller = { userId: 1, username: 'admin', role: 'admin' };
        const res = await request(app).post('/api/live/start').send({ title: 'My show' });
        expect(res.status).toBe(200);
    });

    test('missing title rejected (400)', async () => {
        caller = { userId: 1, username: 'admin', role: 'admin' };
        const res = await request(app).post('/api/live/start').send({});
        expect(res.status).toBe(400);
    });

    test('ingest to a session you do not own is rejected (403)', async () => {
        caller = { userId: 7, username: 'someone', role: 'user', artistId: 10 };
        mockLiveService.getByUsername.mockReturnValue(undefined);
        const res = await request(app)
            .post('/api/live/rooms-of-others/ingest')
            .set('Content-Type', 'application/octet-stream')
            .send(Buffer.from('chunk'));
        expect(res.status).toBe(403);
        expect(mockHls.ingest).not.toHaveBeenCalled();
    });

    test('sessions listing is public and reports disabled state', async () => {
        const container = {
            liveService: mockLiveService,
            authMiddleware: mockAuthMiddleware,
            config: { liveEnabled: false },
            scannerService: {},
            musicDir: '/music',
            storage: {},
            authService: { getUserByUsername: jest.fn() },
            identity: { getSetting: jest.fn<any>().mockReturnValue(undefined) },
        } as any;
        const disabledApp = express();
        disabledApp.use('/api/live', createLiveRoutes(container));
        const res = await request(disabledApp).get('/api/live/sessions');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ enabled: false, sessions: [] });
    });
});
