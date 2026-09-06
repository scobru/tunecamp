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
        // The guards resolve the account by id now; these tests describe it by
        // username. Delegate so every existing mockReturnValue keeps working.
        mockAuthService.getAdminById = jest.fn((...a: any[]) =>
            mockAuthService.getUserByUsername(...a));

        mockAPService = {
            ensureUserKeys: (jest.fn() as any).mockResolvedValue(undefined),
        };

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
                getArtistByName: jest.fn().mockReturnValue(null),
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

        test('queues a pending request instead of auto-creating an artist when self-publish is off', async () => {
            const { app: a, library } = buildApp({ listenerSelfPublish: 'false' });

            const res = await request(a)
                .post('/api/users/me/artist-request')
                .set('Authorization', 'Bearer token');

            expect(res.status).toBe(200);
            expect(res.body.autoApproved).toBeUndefined();
            expect(res.body.message).toMatch(/admin will review/i);
            expect(mockAuthService.setArtistRequest).toHaveBeenCalledWith(10, true);
            expect(library.createArtist).not.toHaveBeenCalled();
            expect(mockAuthService.updateAdmin).not.toHaveBeenCalled();
        });

        test('reuses an existing artist row matching the username on auto-approve', async () => {
            const { app: a, library } = buildApp({ listenerSelfPublish: 'true' });
            library.getArtistByName.mockReturnValue({ id: 77, name: 'testuser' });

            const res = await request(a)
                .post('/api/users/me/artist-request')
                .set('Authorization', 'Bearer token');

            expect(res.status).toBe(200);
            expect(res.body.artistId).toBe(77);
            expect(library.createArtist).not.toHaveBeenCalled();
            expect(library.setArtistCanSell).toHaveBeenCalledWith(77, false);
            expect(mockAuthService.updateAdmin).toHaveBeenCalledWith(10, 77, UserRole.NORMAL_USER, ONE_GB);
        });
    });

    describe('GET /api/users/me/artist-request', () => {
        const buildApp = (getArtistRequest: jest.Mock, artistId: number | null = null) => {
            mockAuthService.getArtistRequest = getArtistRequest;
            mockAuthService.verifyToken = (jest.fn() as any).mockResolvedValue({
                username: 'testuser', role: UserRole.NORMAL_USER, isActive: true, userId: 10, artistId,
            });
            const a = express();
            a.use(express.json());
            a.use('/api/users', createUsersRoutes({
                database: mockDatabase, authService: mockAuthService, apService: mockAPService,
            } as any));
            return a;
        };

        test('reports no pending request and no artist for a plain listener', async () => {
            const a = buildApp(jest.fn().mockReturnValue(null));
            const res = await request(a)
                .get('/api/users/me/artist-request')
                .set('Authorization', 'Bearer token');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ requestedAt: null, hasArtist: false });
        });

        test('reports the pending request timestamp while awaiting admin approval', async () => {
            const a = buildApp(jest.fn().mockReturnValue('2026-01-01T00:00:00.000Z'));
            const res = await request(a)
                .get('/api/users/me/artist-request')
                .set('Authorization', 'Bearer token');

            expect(res.status).toBe(200);
            expect(res.body.requestedAt).toBe('2026-01-01T00:00:00.000Z');
            expect(res.body.hasArtist).toBe(false);
        });

        test('reports hasArtist true once the request has been approved', async () => {
            const a = buildApp(jest.fn().mockReturnValue(null), 42);
            const res = await request(a)
                .get('/api/users/me/artist-request')
                .set('Authorization', 'Bearer token');

            expect(res.status).toBe(200);
            expect(res.body.hasArtist).toBe(true);
        });
    });
    describe('GET /api/users/:username/public', () => {
        const buildApp = (userRow: any, likes: any[] = [], playlists: any[] = []) => {
            const db = {
                getSetting: (k: string) => (k === 'publicUrl' ? 'https://inst.example' : 'Inst'),
                db: {
                    prepare: (sql: string) => {
                        if (sql.includes('FROM admin')) return { get: () => userRow };
                        if (sql.includes('FROM artists')) return { get: () => undefined };
                        if (sql.includes('starred_items')) return { all: () => likes };
                        if (sql.includes('playlists')) return { all: () => playlists };
                        return { get: () => undefined, all: () => [] };
                    },
                },
            };
            const a = express();
            a.use('/api/users', createUsersRoutes({
                database: db, authService: mockAuthService, apService: mockAPService,
                config: { publicUrl: 'https://inst.example', siteName: 'Inst' },
            } as any));
            return a;
        };

        test('returns 404 when the user has not opted in', async () => {
            const res = await request(buildApp({ id: 1, username: 'bob', public_profile_enabled: 0 }))
                .get('/api/users/bob/public');
            expect(res.status).toBe(404);
        });

        test('returns 404 (not 500) when the user does not exist', async () => {
            const res = await request(buildApp(undefined))
                .get('/api/users/ghost/public');
            expect(res.status).toBe(404);
        });

        test('returns only public-safe data when opted in', async () => {
            const app2 = buildApp(
                { id: 1, username: 'bob', alias: 'Bob', avatar: null, role: 'user', artist_id: null, created_at: '2026-01-01', public_profile_enabled: 1 },
                [{ ts: '2026-06-01', title: 'Song', artist: 'A', slug: 'song', cover: 'c.jpg' }],
                [{ id: 7, name: 'Mix', description: null, cover: null, created_at: '2026-05-01', trackCount: 3 }],
            );
            const res = await request(app2).get('/api/users/bob/public');
            expect(res.status).toBe(200);
            expect(res.body.username).toBe('bob');
            expect(res.body.stats).toEqual({ likes: 1, playlists: 1 });
            expect(res.body.playlists[0]).toEqual({ id: 7, name: 'Mix', description: null, trackCount: 3 });
            expect(JSON.stringify(res.body)).not.toMatch(/wallet|token|password|email/i);
        });
    });

    describe('GET /api/users/me/fediverse', () => {
        const buildApp = (userRow: any, artist: any = null) => {
            const identity = {
                getUser: () => userRow,
                getSetting: (k: string) => (k === 'publicUrl' ? 'https://inst.example' : k === 'siteHandle' ? 'inst' : k === 'site_public_key' ? 'SITEKEY' : undefined),
            };
            const library = { getArtist: () => artist };
            const a = express();
            a.use(express.json());
            a.use('/api/users', createUsersRoutes({
                database: identity, identity, library,
                authService: mockAuthService, apService: mockAPService,
                config: { publicUrl: 'https://inst.example' },
            } as any));
            return a;
        };

        test('reports no actor while the account has no AP keys', async () => {
            mockAuthService.verifyToken.mockResolvedValue({ username: 'bob', role: UserRole.NORMAL_USER, isActive: true, userId: 10 });
            const res = await request(buildApp({ id: 10, username: 'bob', role: 'user', ap_public_key: null }))
                .get('/api/users/me/fediverse').set('Authorization', 'Bearer t');
            expect(res.status).toBe(200);
            expect(res.body.hasActor).toBe(false);
            expect(res.body.handle).toBe('@bob@inst.example');
            expect(res.body.actorUri).toBe('https://inst.example/users/bob');
        });

        test('reports an actor once keys exist', async () => {
            mockAuthService.verifyToken.mockResolvedValue({ username: 'bob', role: UserRole.NORMAL_USER, isActive: true, userId: 10 });
            const res = await request(buildApp({ id: 10, username: 'bob', role: 'user', ap_public_key: 'PEM' }))
                .get('/api/users/me/fediverse').set('Authorization', 'Bearer t');
            expect(res.body.hasActor).toBe(true);
        });

        test('resolves to the artist slug when the account is linked to an artist', async () => {
            mockAuthService.verifyToken.mockResolvedValue({ username: 'bob', role: UserRole.NORMAL_USER, isActive: true, userId: 10, artistId: 3 });
            const res = await request(buildApp(
                { id: 10, username: 'bob', role: 'user', ap_public_key: null },
                { id: 3, slug: 'dj-bob', name: 'DJ Bob', public_key: 'PEM' },
            )).get('/api/users/me/fediverse').set('Authorization', 'Bearer t');
            expect(res.body).toMatchObject({
                hasActor: true,
                handle: '@dj-bob@inst.example',
                actorUri: 'https://inst.example/users/dj-bob',
            });
        });

        test('resolves root_admin to the site actor', async () => {
            mockAuthService.verifyToken.mockResolvedValue({ username: 'root', role: UserRole.ROOT_ADMIN, isActive: true, userId: 1 });
            const res = await request(buildApp({ id: 1, username: 'root', role: 'root_admin', ap_public_key: null }))
                .get('/api/users/me/fediverse').set('Authorization', 'Bearer t');
            expect(res.body).toMatchObject({ hasActor: true, handle: '@inst@inst.example' });
        });
    });
});
