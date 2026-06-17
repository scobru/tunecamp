import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createStorageRouter } from '../storage.js';

const TEST_USER = 10;

/** Builds an app with stubbed services; overrides let each test tweak behavior. */
function buildApp(overrides: any = {}) {
    const gdriveService = {
        getAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/auth?x=1'),
        exchangeCode: (jest.fn() as any).mockResolvedValue(undefined),
        getFile: (jest.fn() as any).mockResolvedValue({ id: 'f1', name: 'Artist - Title.mp3', mimeType: 'audio/mpeg' }),
        listFiles: (jest.fn() as any).mockResolvedValue([]),
        listAudioFilesRecursive: (jest.fn() as any).mockResolvedValue([]),
        ...overrides.gdriveService,
    };
    const integration = {
        getStorageAccounts: jest.fn().mockReturnValue([]),
        getStorageAccount: jest.fn(),
        deleteStorageAccount: jest.fn(),
        getPrimaryAdminId: jest.fn().mockReturnValue(1),
        ...overrides.integration,
    };
    const library = {
        createArtist: jest.fn().mockReturnValue(99),
        setArtistCanSell: jest.fn(),
        getArtistByName: jest.fn().mockReturnValue(null),
        createTrack: jest.fn().mockReturnValue(500),
        ...overrides.library,
    };
    const authService = {
        getAdminById: jest.fn(),
        updateAdmin: jest.fn(),
        ...overrides.authService,
    };
    const identity = {
        getSetting: jest.fn().mockReturnValue('false'),
        ...overrides.identity,
    };
    const database = {
        db: { prepare: jest.fn().mockReturnValue({ all: jest.fn().mockReturnValue([]) }) },
        transaction: (fn: any) => fn(),
        ...overrides.database,
    };
    // Stub middleware: authenticate as TEST_USER and pass through.
    const authMiddleware = {
        requireUser: (req: any, _res: any, next: any) => { req.userId = TEST_USER; next(); },
        requireAdmin: (req: any, _res: any, next: any) => { req.userId = TEST_USER; req.isAdmin = true; next(); },
    };

    const app = express();
    app.use('/api/storage', createStorageRouter({
        gdriveService, integration, library, authService, identity, database, authMiddleware,
    } as any));

    return { app, gdriveService, integration, library, authService, identity, database };
}

describe('Storage Router', () => {
    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    describe('GET /gdrive/auth', () => {
        test('returns an auth url seeded with the user id as state', async () => {
            const { app, gdriveService } = buildApp();
            const res = await request(app).get('/api/storage/gdrive/auth');
            expect(res.status).toBe(200);
            expect(res.body.url).toContain('accounts.google.com');
            expect(gdriveService.getAuthUrl).toHaveBeenCalledWith(String(TEST_USER));
        });
    });

    describe('GET /gdrive/accounts', () => {
        test('returns only google-provider accounts', async () => {
            const { app } = buildApp({
                integration: {
                    getStorageAccounts: jest.fn().mockReturnValue([
                        { id: 1, provider: 'google', user_id: TEST_USER },
                        { id: 2, provider: 'dropbox', user_id: TEST_USER },
                    ]),
                },
            });
            const res = await request(app).get('/api/storage/gdrive/accounts');
            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].provider).toBe('google');
        });
    });

    describe('GET /gdrive/callback', () => {
        test('returns 400 when no code is provided', async () => {
            const { app } = buildApp();
            const res = await request(app).get('/api/storage/gdrive/callback');
            expect(res.status).toBe(400);
        });

        test('exchanges the code using the user id from the state param', async () => {
            const { app, gdriveService } = buildApp();
            const res = await request(app).get('/api/storage/gdrive/callback?code=abc&state=42');
            expect(res.status).toBe(200);
            expect(gdriveService.exchangeCode).toHaveBeenCalledWith('abc', 42);
        });

        test('auto-creates an artist profile when self-publish is on and the user has none', async () => {
            const { app, library, authService } = buildApp({
                identity: { getSetting: jest.fn().mockReturnValue('true') },
                authService: {
                    getAdminById: jest.fn().mockReturnValue({ id: 42, username: 'dj', artist_id: null, role: 'user', storage_quota: 0 }),
                    updateAdmin: jest.fn(),
                },
            });
            const res = await request(app).get('/api/storage/gdrive/callback?code=abc&state=42');
            expect(res.status).toBe(200);
            expect(library.createArtist).toHaveBeenCalled();
            expect(library.setArtistCanSell).toHaveBeenCalledWith(99, false);
            expect(authService.updateAdmin).toHaveBeenCalledWith(42, 99, 'user', 0);
        });

        test('does not create an artist when the user already has one', async () => {
            const { app, library } = buildApp({
                identity: { getSetting: jest.fn().mockReturnValue('true') },
                authService: {
                    getAdminById: jest.fn().mockReturnValue({ id: 42, username: 'dj', artist_id: 7, role: 'user', storage_quota: 0 }),
                    updateAdmin: jest.fn(),
                },
            });
            const res = await request(app).get('/api/storage/gdrive/callback?code=abc&state=42');
            expect(res.status).toBe(200);
            expect(library.createArtist).not.toHaveBeenCalled();
        });

        test('returns 500 when the code exchange fails', async () => {
            const { app } = buildApp({
                gdriveService: { exchangeCode: (jest.fn() as any).mockRejectedValue(new Error('bad code')) },
            });
            const res = await request(app).get('/api/storage/gdrive/callback?code=abc&state=42');
            expect(res.status).toBe(500);
        });
    });

    describe('POST /gdrive/import', () => {
        test('returns 400 when fileId is missing', async () => {
            const { app } = buildApp();
            const res = await request(app).post('/api/storage/gdrive/import').send({});
            expect(res.status).toBe(400);
        });

        test('parses "Artist - Title", creates the missing artist, and imports the track', async () => {
            const { app, library } = buildApp();
            const res = await request(app)
                .post('/api/storage/gdrive/import')
                .send({ fileId: 'f1' });

            expect(res.status).toBe(200);
            expect(res.body.trackId).toBe(500);
            expect(library.getArtistByName).toHaveBeenCalledWith('Artist');
            expect(library.createArtist).toHaveBeenCalledWith('Artist');
            expect(library.createTrack).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Title',
                artist_id: 99,
                file_path: 'gdrive://f1',
                service: 'google-drive',
                external_id: 'f1',
            }));
        });

        test('reuses an existing artist instead of creating a new one', async () => {
            const { app, library } = buildApp({
                library: { getArtistByName: jest.fn().mockReturnValue({ id: 3 }), createTrack: jest.fn().mockReturnValue(501) },
            });
            await request(app).post('/api/storage/gdrive/import').send({ fileId: 'f1' });
            expect(library.createArtist).not.toHaveBeenCalled();
            expect(library.createTrack).toHaveBeenCalledWith(expect.objectContaining({ artist_id: 3 }));
        });
    });

    describe('POST /gdrive/import-folder', () => {
        test('returns 400 when folderId is missing', async () => {
            const { app } = buildApp();
            const res = await request(app).post('/api/storage/gdrive/import-folder').send({});
            expect(res.status).toBe(400);
        });

        test('skips files already imported and reports the imported count', async () => {
            const { app, library } = buildApp({
                gdriveService: {
                    listAudioFilesRecursive: (jest.fn() as any).mockResolvedValue([
                        { id: 'a', name: 'X - One.mp3', mimeType: 'audio/mpeg' },
                        { id: 'b', name: 'X - Two.mp3', mimeType: 'audio/mpeg' },
                    ]),
                },
                // 'a' is already imported → only 'b' should be created.
                database: {
                    db: { prepare: jest.fn().mockReturnValue({ all: jest.fn().mockReturnValue([{ external_id: 'a' }]) }) },
                    transaction: (fn: any) => fn(),
                },
            });
            const res = await request(app)
                .post('/api/storage/gdrive/import-folder')
                .send({ folderId: 'folder-1' });

            expect(res.status).toBe(200);
            expect(res.body.count).toBe(1);
            expect(library.createTrack).toHaveBeenCalledTimes(1);
            expect(library.createTrack).toHaveBeenCalledWith(expect.objectContaining({ external_id: 'b' }));
        });

        test('returns count 0 when the folder has no audio files', async () => {
            const { app, library } = buildApp();
            const res = await request(app)
                .post('/api/storage/gdrive/import-folder')
                .send({ folderId: 'empty' });
            expect(res.status).toBe(200);
            expect(res.body.count).toBe(0);
            expect(library.createTrack).not.toHaveBeenCalled();
        });
    });

    describe('DELETE /gdrive/accounts/:id', () => {
        test('returns 404 when the account belongs to another user', async () => {
            const { app, integration } = buildApp({
                integration: { getStorageAccount: jest.fn().mockReturnValue({ id: 5, user_id: 999 }) },
            });
            const res = await request(app).delete('/api/storage/gdrive/accounts/5');
            expect(res.status).toBe(404);
            expect(integration.deleteStorageAccount).not.toHaveBeenCalled();
        });

        test('deletes the account when owned by the caller', async () => {
            const { app, integration } = buildApp({
                integration: {
                    getStorageAccount: jest.fn().mockReturnValue({ id: 5, user_id: TEST_USER }),
                    deleteStorageAccount: jest.fn(),
                },
            });
            const res = await request(app).delete('/api/storage/gdrive/accounts/5');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(integration.deleteStorageAccount).toHaveBeenCalledWith(5);
        });
    });
});
