import { createUsersRoutes } from '../users.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { UserRole } from '../../../common/visibility.js';

describe('Users Routes', () => {
    let app: express.Express;
    let mockZenDBService: any;
    let mockDatabase: any;
    let mockAuthService: any;
    let mockAPService: any;

    beforeEach(() => {
        mockZenDBService = {
            getUser: jest.fn(),
            registerUser: jest.fn(),
            getComments: jest.fn(),
            addComment: jest.fn(),
            deleteComment: jest.fn()
        };

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
            getStorageInfo: jest.fn().mockReturnValue({ storage_used: 123456 })
        };

        mockAPService = {};

        app = express();
        app.use(express.json());
        app.use('/api/users', createUsersRoutes(mockZenDBService, mockDatabase, mockAuthService, mockAPService));
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
                .send({ username: 'testuser', password: 'StrongPassword123!', pubKey: 'pub-123', signature: 'sig-123' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.token).toBe('mocked-user-token');
            expect(res.body.username).toBe('testuser');
            expect(mockAuthService.createUser).toHaveBeenCalledWith('testuser', 'StrongPassword123!', null, expect.any(Number), 'pub-123');
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
            mockZenDBService.getUser.mockResolvedValue(null);

            const res = await request(app).get('/api/users/pub-key-not-found');

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('User not found');
        });

        test('returns user details if found', async () => {
            const mockUser = { username: 'zenuser', pubKey: 'pub-key' };
            mockZenDBService.getUser.mockResolvedValue(mockUser);

            const res = await request(app).get('/api/users/pub-key');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockUser);
        });
    });

    describe('POST /api/users/sync', () => {
        test('returns 400 if pub or epub is missing', async () => {
            const res = await request(app)
                .post('/api/users/sync')
                .send({ alias: 'NoPub' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('pub and epub are required');
        });

        test('syncs Zen data successfully', async () => {
            const res = await request(app)
                .post('/api/users/sync')
                .send({ pub: 'pub-1', epub: 'epub-1', alias: 'TestAlias', avatar: 'avatar.png' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(mockDatabase.syncZenUser).toHaveBeenCalledWith('pub-1', 'epub-1', 'TestAlias', 'avatar.png');
        });
    });

    describe('POST /api/users/sync-pair', () => {
        test('syncs GunDB pair when authenticated', async () => {
            // Re-mount router with active, authenticated user context
            const authApp = express();
            authApp.use(express.json());
            authApp.use((req: any, res, next) => {
                req.username = 'testuser';
                req.role = UserRole.NORMAL_USER;
                req.isActive = true;
                next();
            });
            authApp.use('/api/users', createUsersRoutes(mockZenDBService, mockDatabase, mockAuthService, mockAPService));

            const res = await request(authApp)
                .post('/api/users/sync-pair')
                .send({
                    pair: {
                        pub: 'pub',
                        priv: 'priv',
                        epub: 'epub',
                        epriv: 'epriv'
                    }
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(mockAuthService.updateZenPair).toHaveBeenCalledWith('testuser', expect.any(Object));
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
            authApp.use('/api/users', createUsersRoutes(mockZenDBService, mockDatabase, mockAuthService, mockAPService));

            mockAuthService.getUserByUsername.mockReturnValue({
                id: 10,
                storage_quota: 5000,
                role: 'user'
            });

            const res = await request(authApp).get('/api/users/me/storage');

            expect(res.status).toBe(200);
            expect(res.body.storage_quota).toBe(5000);
            expect(res.body.storage_used).toBe(123456);
        });
    });
});
