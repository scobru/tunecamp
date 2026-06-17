import { createUsersRoutes } from '../users.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { UserRole } from '../../../common/visibility.js';

describe('Users Routes', () => {
    let app: express.Express;
    let mockDatabase: any;
    let mockAuthService: any;
    let mockAPService: any;

    beforeEach(() => {

        mockDatabase = {
            getSetting: jest.fn().mockReturnValue('true'),
            syncZenUser: jest.fn()
        };

        mockAuthService = {
            getUserByUsername: jest.fn(),
            createUser: (jest.fn() as any).mockResolvedValue({ id: 10 }),
            generateToken: jest.fn().mockReturnValue('mocked-user-token'),
            verifyZenSignature: (jest.fn() as any).mockResolvedValue(true),
            updateZenPair: jest.fn(),
            getStorageInfo: jest.fn().mockReturnValue({ storage_used: 123456 }),
            verifyToken: jest.fn<any>().mockResolvedValue({ username: 'testuser', role: UserRole.NORMAL_USER, isActive: true, userId: 10 }),
            isRootAdmin: jest.fn().mockReturnValue(false)
        };

        mockAPService = {};

        app = express();
        app.use(express.json());
        app.use('/api/users', createUsersRoutes({
            database: mockDatabase,
            authService: mockAuthService,
            apService: mockAPService
        } as any));
    });

    describe('POST /api/users/register', () => {
        test('returns 400 if username or password missing', async () => {
            const res = await request(app)
                .post('/api/users/register')
                .send({ username: 'testuser' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Username and password required');
        });

        test('returns 400 on invalid username format', async () => {
            const res = await request(app)
                .post('/api/users/register')
                .send({ username: 'a', password: 'Password123!' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Username must be at least 3 characters');
        });

        test('returns 403 if registration is disabled', async () => {
            mockDatabase.getSetting.mockReturnValue('false');

            const res = await request(app)
                .post('/api/users/register')
                .send({ username: 'testuser', password: 'Password123!' });

            expect(res.status).toBe(403);
            expect(res.body.error).toBe('Registration is currently disabled');
        });

        test('returns 409 if username already taken in DB', async () => {
            mockAuthService.getUserByUsername.mockReturnValue({ id: 5 });

            const res = await request(app)
                .post('/api/users/register')
                .send({ username: 'testuser', password: 'Password123!' });

            expect(res.status).toBe(409);
            expect(res.body.error).toBe('Username already taken');
        });

        test('successfully registers standard listener user', async () => {
            mockAuthService.getUserByUsername.mockReturnValue(null);

            const res = await request(app)
                .post('/api/users/register')
                .send({ username: 'testuser', password: 'StrongPassword123!' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.token).toBe('mocked-user-token');
            expect(res.body.username).toBe('testuser');
            expect(mockAuthService.createUser).toHaveBeenCalledWith('testuser', 'StrongPassword123!', null, expect.any(Number));
        });
    });

    describe('GET /api/users/check/:username', () => {
        test('returns available: true if username not in DB', async () => {
            mockAuthService.getUserByUsername.mockReturnValue(null);

            const res = await request(app).get('/api/users/check/freeuser');

            expect(res.status).toBe(200);
            expect(res.body.available).toBe(true);
        });

        test('returns available: false if username in DB', async () => {
            mockAuthService.getUserByUsername.mockReturnValue({ id: 1 });

            const res = await request(app).get('/api/users/check/takenuser');

            expect(res.status).toBe(200);
            expect(res.body.available).toBe(false);
        });
    });

    describe('GET /api/users/:pubKey', () => {
        test('returns 404 if user profile not found', async () => {


            const res = await request(app).get('/api/users/pub-key-not-found');

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('User not found');
        });

        test('always returns 404 (deprecated endpoint)', async () => {
            const res = await request(app).get('/api/users/pub-key');

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('User not found');
        });
    });

    describe('POST /api/users/sync', () => {
        test('is a no-op (deprecated endpoint) and returns success', async () => {
            const res = await request(app)
                .post('/api/users/sync')
                .send({ pub: 'pub-1', epub: 'epub-1' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('POST /api/users/sync-pair', () => {
        test('is a no-op (deprecated endpoint) and returns success', async () => {
            const res = await request(app)
                .post('/api/users/sync-pair')
                .send({ pair: { pub: 'pub', priv: 'priv', epub: 'epub', epriv: 'epriv' } });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('GET /api/users/me/storage', () => {
        test('returns user storage info when authenticated', async () => {
            const authApp = express();
            authApp.use(express.json());
            authApp.use((req: any, res, next) => {
                req.username = 'testuser';
                req.role = UserRole.NORMAL_USER;
                req.isActive = true;
                next();
            });
            authApp.use('/api/users', createUsersRoutes({
                database: mockDatabase,
                authService: mockAuthService,
                apService: mockAPService
            } as any));

            mockAuthService.getUserByUsername.mockReturnValue({
                id: 10,
                storage_quota: 5000,
                role: 'user'
            });

            const res = await request(authApp)
                .get('/api/users/me/storage')
                .set('Authorization', 'Bearer token');

            expect(res.status).toBe(200);
            expect(res.body.storage_quota).toBe(5000);
            expect(res.body.storage_used).toBe(123456);
        });
    });

    describe('API Tokens endpoints', () => {
        let mockPrepare: any;

        beforeEach(() => {
            mockPrepare = jest.fn();
            mockDatabase.db = {
                prepare: mockPrepare
            };
        });

        test('GET /api/users/me/api-tokens returns 403 for standard user role', async () => {
            mockAuthService.getUserByUsername.mockReturnValue({
                id: 10,
                username: 'testuser',
                role: UserRole.NORMAL_USER,
                is_active: 1
            });

            const res = await request(app)
                .get('/api/users/me/api-tokens')
                .set('Authorization', 'Bearer token');

            expect(res.status).toBe(403);
            expect(res.body.error).toContain('Access denied');
        });

        test('GET /api/users/me/api-tokens returns masked tokens for curator/admin', async () => {
            mockAuthService.getUserByUsername.mockReturnValue({
                id: 10,
                username: 'testuser',
                role: UserRole.SUPER_USER,
                is_active: 1
            });

            const mockAll = jest.fn().mockReturnValue([
                { id: 1, name: 'Token 1', token: 'tc_12345678901234567890', created_at: '2026-06-13' }
            ]);
            mockPrepare.mockReturnValue({ all: mockAll });

            const res = await request(app)
                .get('/api/users/me/api-tokens')
                .set('Authorization', 'Bearer token');

            expect(res.status).toBe(200);
            expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('SELECT id, name'));
            expect(res.body[0].name).toBe('Token 1');
            expect(res.body[0].token).toBe('tc_1234...7890'); // masked
        });

        test('POST /api/users/me/api-tokens creates a new token', async () => {
            mockAuthService.getUserByUsername.mockReturnValue({
                id: 10,
                username: 'testuser',
                role: UserRole.ADMIN,
                is_active: 1
            });

            const mockRun = jest.fn().mockReturnValue({ changes: 1 });
            mockPrepare.mockReturnValue({ run: mockRun });

            const res = await request(app)
                .post('/api/users/me/api-tokens')
                .set('Authorization', 'Bearer token')
                .send({ name: 'Script Key' });

            expect(res.status).toBe(200);
            expect(res.body.name).toBe('Script Key');
            expect(res.body.token).toMatch(/^tc_[a-f0-9]+$/);
            expect(mockRun).toHaveBeenCalledWith(10, expect.stringMatching(/^tc_/), 'Script Key');
        });

        test('DELETE /api/users/me/api-tokens/:id revokes the token', async () => {
            mockAuthService.getUserByUsername.mockReturnValue({
                id: 10,
                username: 'testuser',
                role: UserRole.ROOT_ADMIN,
                is_active: 1
            });

            const mockRun = jest.fn().mockReturnValue({ changes: 1 });
            mockPrepare.mockReturnValue({ run: mockRun });

            const res = await request(app)
                .delete('/api/users/me/api-tokens/1')
                .set('Authorization', 'Bearer token');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(mockRun).toHaveBeenCalledWith('1', 10);
        });
    });

    describe('POST /api/users/me/artist-request (self-publish auto-approve)', () => {
        const ONE_GB = 1024 * 1024 * 1024;

        // Builds an app whose listener has no artist link yet and whose instance
        // settings are driven by `settings` (keyed by setting name).
        const buildApp = (settings: Record<string, string | undefined>) => {
            const identity = { getSetting: jest.fn((k: string) => settings[k]) };
            const library = {
                createArtist: jest.fn().mockReturnValue(42),
                setArtistCanSell: jest.fn(),
            };
            mockAuthService.getUserByUsername.mockReturnValue({
                id: 10, username: 'testuser', role: UserRole.NORMAL_USER, artist_id: null, is_active: 1,
            });
            mockAuthService.getAdminById = jest.fn().mockReturnValue({
                id: 10, username: 'testuser', role: UserRole.NORMAL_USER, storage_quota: 0, token_version: 0,
            });
            mockAuthService.updateAdmin = jest.fn();
            mockAuthService.setArtistRequest = jest.fn();
            mockAuthService.getArtistRequest = jest.fn().mockReturnValue(null);

            const a = express();
            a.use(express.json());
            a.use('/api/users', createUsersRoutes({
                database: mockDatabase, authService: mockAuthService, apService: mockAPService,
                identity, library,
            } as any));
            return { app: a, identity, library };
        };

        test('grants the admin-configured default quota (in MB) on auto-approve', async () => {
            const { app: a } = buildApp({ listenerSelfPublish: 'true', listenerSelfPublishQuota: '512' });

            const res = await request(a)
                .post('/api/users/me/artist-request')
                .set('Authorization', 'Bearer token');

            expect(res.status).toBe(200);
            expect(res.body.autoApproved).toBe(true);
            expect(res.body.artistId).toBe(42);
            // role unchanged (NORMAL_USER), quota = 512 MB in bytes
            expect(mockAuthService.updateAdmin).toHaveBeenCalledWith(10, 42, UserRole.NORMAL_USER, 512 * 1024 * 1024);
        });

        test('defaults to 1GB when no quota setting is configured', async () => {
            const { app: a } = buildApp({ listenerSelfPublish: 'true', listenerSelfPublishQuota: undefined });

            const res = await request(a)
                .post('/api/users/me/artist-request')
                .set('Authorization', 'Bearer token');

            expect(res.status).toBe(200);
            expect(mockAuthService.updateAdmin).toHaveBeenCalledWith(10, 42, UserRole.NORMAL_USER, ONE_GB);
        });

        test('marks the new artist as not sellable and keeps the listener role', async () => {
            const { app: a, library } = buildApp({ listenerSelfPublish: 'true' });

            await request(a)
                .post('/api/users/me/artist-request')
                .set('Authorization', 'Bearer token');

            expect(library.createArtist).toHaveBeenCalled();
            expect(library.setArtistCanSell).toHaveBeenCalledWith(42, false);
        });

        test('rejects with 400 when the user already has an artist profile', async () => {
            const identity = { getSetting: jest.fn().mockReturnValue('true') };
            const library = { createArtist: jest.fn(), setArtistCanSell: jest.fn() };
            // Listener already linked to an artist → requireUser sets req.artistId
            mockAuthService.getUserByUsername.mockReturnValue({
                id: 10, username: 'testuser', role: UserRole.NORMAL_USER, artist_id: 7, is_active: 1,
            });

            const a = express();
            a.use(express.json());
            a.use('/api/users', createUsersRoutes({
                database: mockDatabase, authService: mockAuthService, apService: mockAPService,
                identity, library,
            } as any));

            const res = await request(a)
                .post('/api/users/me/artist-request')
                .set('Authorization', 'Bearer token');

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('You already have an artist profile');
            expect(library.createArtist).not.toHaveBeenCalled();
        });
    });
});
