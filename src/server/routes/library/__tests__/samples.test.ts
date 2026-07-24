import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { createSamplesRoutes } from '../samples.js';
import { errorHandler } from '../../../middleware/error-handling.js';

const OWNER = 10;
const STRANGER = 20;

function buildApp(overrides: any = {}) {
    const samplesRepository = {
        list: jest.fn().mockReturnValue([]),
        getById: jest.fn().mockReturnValue(null),
        create: jest.fn(),
        update: jest.fn(),
        setModeration: jest.fn(),
        incrementDownloadCount: jest.fn(),
        delete: jest.fn(),
        ...overrides.samplesRepository,
    };
    const storage = {
        ensureDir: jest.fn().mockImplementation((p: string) => fs.ensureDir(p)),
        move: jest.fn().mockImplementation((from: string, to: string, opts: any) => fs.move(from, to, opts)),
        remove: jest.fn().mockImplementation((p: string) => fs.remove(p)),
        ...overrides.storage,
    };
    const identity = { getSetting: jest.fn().mockReturnValue('false'), ...overrides.identity };

    let currentUser: any = null;
    const authMiddleware = {
        optionalAuth: (req: any, _res: any, next: any) => {
            if (currentUser) Object.assign(req, currentUser);
            next();
        },
        requireUser: (req: any, res: any, next: any) => {
            if (!currentUser) return res.status(401).json({ error: 'Unauthorized' });
            Object.assign(req, currentUser);
            next();
        },
    };
    const setUser = (user: any) => { currentUser = user; };

    const app = express();
    app.use(express.json());
    app.use('/api/samples', authMiddleware.optionalAuth, createSamplesRoutes({ samplesRepository, musicDir: overrides.musicDir, storage, identity, authMiddleware } as any));
    app.use(errorHandler);
    return { app, samplesRepository, storage, identity, setUser };
}

function userContext(userId: number, extra: any = {}) {
    return { userId, username: 'testuser', isActive: true, ...extra };
}

describe('samples routes', () => {
    let musicDir: string;

    beforeEach(async () => {
        musicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tunecamp-samples-'));
    });

    afterEach(async () => {
        await fs.remove(musicDir);
    });

    test('GET / returns approved samples for anonymous', async () => {
        const { app, samplesRepository } = buildApp({ musicDir });
        const res = await request(app).get('/api/samples');
        expect(res.status).toBe(200);
        expect(samplesRepository.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    });

    test('GET /?mine=true without auth is 403', async () => {
        const { app } = buildApp({ musicDir });
        const res = await request(app).get('/api/samples?mine=true');
        expect(res.status).toBe(403);
    });

    test('GET /:id 403 when pending and viewer is a stranger', async () => {
        const { app, samplesRepository, setUser } = buildApp({ musicDir });
        samplesRepository.getById.mockReturnValue({ id: 1, status: 'pending', ownerId: OWNER, artistId: null });
        setUser(userContext(STRANGER));
        const res = await request(app).get('/api/samples/1');
        expect(res.status).toBe(403);
    });

    test('GET /:id 200 when pending and viewer is the owner', async () => {
        const { app, samplesRepository, setUser } = buildApp({ musicDir });
        samplesRepository.getById.mockReturnValue({ id: 1, status: 'pending', ownerId: OWNER, artistId: null });
        setUser(userContext(OWNER));
        const res = await request(app).get('/api/samples/1');
        expect(res.status).toBe(200);
    });

    test('GET /:id 404 when missing', async () => {
        const { app } = buildApp({ musicDir });
        const res = await request(app).get('/api/samples/999');
        expect(res.status).toBe(404);
    });

    test('GET /:id/download serves file and increments count', async () => {
        const { app, samplesRepository } = buildApp({ musicDir });
        await fs.ensureDir(path.join(musicDir, 'samples'));
        await fs.writeFile(path.join(musicDir, 'samples', 'kick.wav'), 'fake-audio');
        samplesRepository.getById.mockReturnValue({ id: 1, status: 'approved', ownerId: OWNER, artistId: null, title: 'Kick', filePath: 'samples/kick.wav' });
        const res = await request(app).get('/api/samples/1/download');
        expect(res.status).toBe(200);
        expect(samplesRepository.incrementDownloadCount).toHaveBeenCalledWith(1);
    });

    test('GET /:id/download 404 when file missing on disk', async () => {
        const { app, samplesRepository } = buildApp({ musicDir });
        samplesRepository.getById.mockReturnValue({ id: 1, status: 'approved', ownerId: OWNER, artistId: null, title: 'Kick', filePath: 'samples/missing.wav' });
        const res = await request(app).get('/api/samples/1/download');
        expect(res.status).toBe(404);
    });

    test('POST / 403 without artist profile', async () => {
        const { app, setUser } = buildApp({ musicDir });
        setUser(userContext(OWNER));
        const res = await request(app).post('/api/samples').field('title', 'Kick').attach('file', Buffer.from('audio'), 'kick.wav');
        expect(res.status).toBe(403);
    });

    test('POST / 400 without file', async () => {
        const { app, setUser } = buildApp({ musicDir });
        setUser(userContext(OWNER, { artistId: 5 }));
        const res = await request(app).post('/api/samples').field('title', 'Kick');
        expect(res.status).toBe(400);
    });

    test('POST / creates pending sample by default', async () => {
        const { app, samplesRepository, setUser } = buildApp({ musicDir });
        setUser(userContext(OWNER, { artistId: 5 }));
        samplesRepository.create.mockImplementation((s: any) => ({ id: 1, ...s }));
        const res = await request(app).post('/api/samples').field('title', 'Kick').attach('file', Buffer.from('audio'), 'kick.wav');
        expect(res.status).toBe(201);
        expect(samplesRepository.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    });

    test('POST / auto-approves for admin', async () => {
        const { app, samplesRepository, setUser } = buildApp({ musicDir });
        setUser(userContext(OWNER, { artistId: 5, isAdmin: true }));
        samplesRepository.create.mockImplementation((s: any) => ({ id: 1, ...s }));
        const res = await request(app).post('/api/samples').field('title', 'Kick').attach('file', Buffer.from('audio'), 'kick.wav');
        expect(res.status).toBe(201);
        expect(samplesRepository.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    });

    test('PUT /:id 403 when not owner', async () => {
        const { app, samplesRepository, setUser } = buildApp({ musicDir });
        samplesRepository.getById.mockReturnValue({ id: 1, status: 'approved', ownerId: OWNER, artistId: null });
        setUser(userContext(STRANGER));
        const res = await request(app).put('/api/samples/1').send({ title: 'New' });
        expect(res.status).toBe(403);
    });

    test('PUT /:id 200 when owner', async () => {
        const { app, samplesRepository, setUser } = buildApp({ musicDir });
        samplesRepository.getById.mockReturnValue({ id: 1, status: 'approved', ownerId: OWNER, artistId: null });
        samplesRepository.update.mockReturnValue({ id: 1, title: 'New' });
        setUser(userContext(OWNER));
        const res = await request(app).put('/api/samples/1').send({ title: 'New' });
        expect(res.status).toBe(200);
    });

    test('DELETE /:id 403 when not owner', async () => {
        const { app, samplesRepository, setUser } = buildApp({ musicDir });
        samplesRepository.getById.mockReturnValue({ id: 1, status: 'approved', ownerId: OWNER, artistId: null });
        setUser(userContext(STRANGER));
        const res = await request(app).delete('/api/samples/1');
        expect(res.status).toBe(403);
    });

    test('DELETE /:id 204 when owner', async () => {
        const { app, samplesRepository, setUser } = buildApp({ musicDir });
        samplesRepository.getById.mockReturnValue({ id: 1, status: 'approved', ownerId: OWNER, artistId: null, filePath: 'samples/kick.wav' });
        setUser(userContext(OWNER));
        const res = await request(app).delete('/api/samples/1');
        expect(res.status).toBe(204);
        expect(samplesRepository.delete).toHaveBeenCalledWith(1);
    });

    test('GET /moderation/pending 403 for non-moderator', async () => {
        const { app, setUser } = buildApp({ musicDir });
        setUser(userContext(STRANGER));
        const res = await request(app).get('/api/samples/moderation/pending');
        expect(res.status).toBe(403);
    });

    test('GET /moderation/pending 200 for admin', async () => {
        const { app, setUser } = buildApp({ musicDir });
        setUser(userContext(OWNER, { isAdmin: true }));
        const res = await request(app).get('/api/samples/moderation/pending');
        expect(res.status).toBe(200);
    });

    test('POST /:id/approve 403 for non-moderator', async () => {
        const { app, setUser } = buildApp({ musicDir });
        setUser(userContext(STRANGER));
        const res = await request(app).post('/api/samples/1/approve');
        expect(res.status).toBe(403);
    });

    test('POST /:id/approve 200 for admin', async () => {
        const { app, samplesRepository, setUser } = buildApp({ musicDir });
        samplesRepository.setModeration.mockReturnValue({ id: 1, status: 'approved' });
        setUser(userContext(OWNER, { isAdmin: true }));
        const res = await request(app).post('/api/samples/1/approve');
        expect(res.status).toBe(200);
        expect(samplesRepository.setModeration).toHaveBeenCalledWith(1, 'approved', undefined);
    });

    test('POST /:id/reject 200 for admin', async () => {
        const { app, samplesRepository, setUser } = buildApp({ musicDir });
        samplesRepository.setModeration.mockReturnValue({ id: 1, status: 'rejected' });
        setUser(userContext(OWNER, { isAdmin: true }));
        const res = await request(app).post('/api/samples/1/reject');
        expect(res.status).toBe(200);
        expect(samplesRepository.setModeration).toHaveBeenCalledWith(1, 'rejected', undefined);
    });
});
