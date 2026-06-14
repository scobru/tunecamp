import { createAuthRoutes } from '../auth.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { UserRole } from '../../../common/visibility.js';

describe('Auth Routes', () => {
    let app: express.Express;
    let mockAuthService: any;
    let mockAuthMiddleware: any;

    beforeEach(() => {
        mockAuthService = {
            isFirstRun: jest.fn().mockReturnValue(false),
            authenticateUser: jest.fn(),
            generateToken: jest.fn().mockReturnValue('mocked-jwt-token'),
            isRootAdmin: jest.fn().mockReturnValue(false),
            isDefaultPassword: (jest.fn() as any).mockResolvedValue(false),
            createAdmin: (jest.fn() as any).mockResolvedValue({ id: 1 }),
            changePassword: (jest.fn() as any).mockResolvedValue(undefined),
            getUserPair: jest.fn().mockReturnValue(null),
            getUserByUsername: jest.fn(),
            getUserProfile: jest.fn().mockReturnValue(null),
            updateUserProfile: jest.fn(),
            getZenAvatar: jest.fn().mockReturnValue(null)
        };

        mockAuthMiddleware = {
            requireAdmin: jest.fn().mockImplementation((req: any, res: any, next: any) => {
                req.username = 'admin';
                req.role = UserRole.ADMIN;
                next();
            }),
            requireUser: jest.fn().mockImplementation((req: any, res: any, next: any) => {
                req.username = 'admin';
                req.role = UserRole.ADMIN;
                next();
            })
        };

        app = express();
        app.use(express.json());
        app.use('/api/auth', createAuthRoutes({
            authService: mockAuthService,
            authMiddleware: mockAuthMiddleware
        } as any));
    });

    describe('POST /api/auth/login', () => {
        test('returns 400 if credentials are missing', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({});
            
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Password required');
        });

        test('returns 400 if it is first run and no accounts are set up', async () => {
            mockAuthService.isFirstRun.mockReturnValue(true);
            const res = await request(app)
                .post('/api/auth/login')
                .send({ password: 'Password123!' });

            expect(res.status).toBe(400);
            expect(res.body.firstRun).toBe(true);
        });

        test('returns 401 on invalid password/credentials', async () => {
            mockAuthService.authenticateUser.mockResolvedValue({ success: false });

            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'wrongpassword' });

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('Invalid username or password');
        });

        test('returns JWT token and credentials on success', async () => {
            mockAuthService.authenticateUser.mockResolvedValue({
                success: true,
                isAdmin: true,
                artistId: null,
                role: UserRole.ADMIN,
                isActive: true,
                id: 1,
                tokenVersion: 1
            });
            mockAuthService.isRootAdmin.mockReturnValue(true);
            mockAuthService.isDefaultPassword.mockResolvedValue(false);

            const res = await request(app)
                .post('/api/auth/login')
                .send({ username: 'admin', password: 'CorrectPassword123!' });

            expect(res.status).toBe(200);
            expect(res.body.token).toBe('mocked-jwt-token');
            expect(res.body.isRootAdmin).toBe(true);
        });
    });

    describe('POST /api/auth/setup', () => {
        test('returns 400 if not first run', async () => {
            mockAuthService.isFirstRun.mockReturnValue(false);

            const res = await request(app)
                .post('/api/auth/setup')
                .send({ username: 'admin', password: 'Password123!' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Admin account already set up');
        });

        test('returns 400 on weak password during setup', async () => {
            mockAuthService.isFirstRun.mockReturnValue(true);

            const res = await request(app)
                .post('/api/auth/setup')
                .send({ username: 'admin', password: '123' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('at least');
        });

        test('successfully sets up admin account and returns token', async () => {
            mockAuthService.isFirstRun.mockReturnValue(true);

            const res = await request(app)
                .post('/api/auth/setup')
                .send({ username: 'admin', password: 'StrongPassword123!' });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Admin account created successfully');
            expect(res.body.token).toBe('mocked-jwt-token');
            expect(res.body.isRootAdmin).toBe(true);
        });
    });

    describe('POST /api/auth/password', () => {
        test('returns 400 if current or new password is not provided', async () => {
            const res = await request(app)
                .post('/api/auth/password')
                .send({ newPassword: 'StrongPassword123!' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Current and new password required');
        });

        test('returns 401 if current password is incorrect', async () => {
            mockAuthService.authenticateUser.mockImplementation(async (username: string, pass: string) => {
                if (pass === 'wrong') return { success: false };
                return { success: true };
            });

            const res = await request(app)
                .post('/api/auth/password')
                .send({ currentPassword: 'wrong', newPassword: 'StrongPassword123!' });

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('Current password is incorrect');
            expect(mockAuthService.changePassword).not.toHaveBeenCalled();
        });

        test('successfully changes password and returns new token', async () => {
            mockAuthService.authenticateUser.mockResolvedValue({ success: true, tokenVersion: 2 });
            mockAuthService.getUserPair.mockReturnValue({ pub: 'some-key' });

            const res = await request(app)
                .post('/api/auth/password')
                .send({ currentPassword: 'OldPassword123!', newPassword: 'NewPassword123!' });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Password changed successfully');
            expect(res.body.token).toBe('mocked-jwt-token');
            expect(res.body.pair).toEqual({ pub: 'some-key' });
            expect(mockAuthService.changePassword).toHaveBeenCalledWith('admin', 'NewPassword123!');
        });
    });

    describe('POST /api/auth/password (integration, real auth service)', () => {
        test('persists the new password: old one stops working, new one authenticates', async () => {
            const sqlite3 = (await import('better-sqlite3')).default;
            const { createAuthService } = await import('../../../modules/auth/auth.service.js');

            const db = new sqlite3(':memory:');
            db.exec(`
                CREATE TABLE IF NOT EXISTS gun_users (
                    pub TEXT PRIMARY KEY,
                    epub TEXT NOT NULL,
                    alias TEXT UNIQUE NOT NULL
                );
                CREATE TABLE IF NOT EXISTS artists (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    slug TEXT UNIQUE NOT NULL,
                    visibility TEXT DEFAULT 'public'
                );
            `);
            const realAuthService = createAuthService(db, 'secret', 'admin', 'tunecamp');
            await realAuthService.init();

            const integrationApp = express();
            integrationApp.use(express.json());
            integrationApp.use('/api/auth', createAuthRoutes({
                authService: realAuthService,
                authMiddleware: {
                    requireAdmin: (req: any, _res: any, next: any) => {
                        req.username = 'admin';
                        req.role = UserRole.ROOT_ADMIN;
                        req.userId = 1;
                        next();
                    },
                    requireUser: (req: any, _res: any, next: any) => {
                        req.username = 'admin';
                        req.role = UserRole.ROOT_ADMIN;
                        req.userId = 1;
                        next();
                    }
                }
            } as any));

            const res = await request(integrationApp)
                .post('/api/auth/password')
                .send({ currentPassword: 'tunecamp', newPassword: 'BrandNewPassword123!' });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Password changed successfully');

            const oldAuth = await realAuthService.authenticateUser('admin', 'tunecamp');
            expect(oldAuth && oldAuth.success).toBeFalsy();

            const newAuth = await realAuthService.authenticateUser('admin', 'BrandNewPassword123!');
            expect(newAuth && newAuth.success).toBe(true);

            db.close();
        }, 30000);
    });

    describe('GET /api/auth/status', () => {
        test('returns appropriate guest status when unauthenticated', async () => {
            // Re-mount router without setting authenticated user on req
            const guestApp = express();
            guestApp.use(express.json());
            guestApp.use((req: any, res, next) => {
                req.role = UserRole.GUEST;
                next();
            });
            guestApp.use('/api/auth', createAuthRoutes({
                authService: mockAuthService,
                authMiddleware: mockAuthMiddleware
            } as any));

            const res = await request(guestApp).get('/api/auth/status');

            expect(res.status).toBe(200);
            expect(res.body.authenticated).toBe(false);
        });

        test('returns authenticated status with user details', async () => {
            const authApp = express();
            authApp.use(express.json());
            authApp.use((req: any, res, next) => {
                req.username = 'testuser';
                req.role = UserRole.NORMAL_USER;
                req.artistId = 5;
                req.userId = 10;
                req.isActive = true;
                next();
            });
            authApp.use('/api/auth', createAuthRoutes({
                authService: mockAuthService,
                authMiddleware: mockAuthMiddleware
            } as any));

            mockAuthService.isFirstRun.mockReturnValue(false);
            mockAuthService.isDefaultPassword.mockResolvedValue(false);
            mockAuthService.getUserPair.mockReturnValue({ pub: 'user-pub-key' });

            const res = await request(authApp).get('/api/auth/status');

            expect(res.status).toBe(200);
            expect(res.body.authenticated).toBe(true);
            expect(res.body.username).toBe('testuser');
            expect(res.body.artistId).toBe(5);
            expect(res.body.userId).toBe(10);
            expect(res.body.pair).toEqual({ pub: 'user-pub-key' });
        });
    });

    describe('Artist Unlinking (integration, real auth service)', () => {
        test('prevents auto-linking on subsequent logins after explicit unlinking by root admin', async () => {
            const sqlite3 = (await import('better-sqlite3')).default;
            const { createAuthService } = await import('../../../modules/auth/auth.service.js');

            const db = new sqlite3(':memory:');
            db.exec(`
                CREATE TABLE IF NOT EXISTS gun_users (
                    pub TEXT PRIMARY KEY,
                    epub TEXT NOT NULL,
                    alias TEXT UNIQUE NOT NULL
                );
                CREATE TABLE IF NOT EXISTS artists (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    slug TEXT UNIQUE NOT NULL,
                    visibility TEXT DEFAULT 'public'
                );
            `);
            const realAuthService = createAuthService(db, 'secret', 'admin', 'tunecamp');
            await realAuthService.init();

            // 1. Create an artist with name "curator1"
            const artistInsert = db.prepare("INSERT INTO artists (name, slug, visibility) VALUES ('curator1', 'curator1', 'public')").run();
            const artistId = Number(artistInsert.lastInsertRowid);

            // 2. Create curator1 admin user with no artist linked initially
            const curatorResult = await realAuthService.createUser('curator1', 'CuratorPass123!', null, 1024, undefined, UserRole.SUPER_USER);
            const curatorId = curatorResult.id;

            // 3. Authenticate the user (first login). This should auto-link because artist_unlinked is 0 and artist curator1 exists.
            const firstAuth = await realAuthService.authenticateUser('curator1', 'CuratorPass123!');
            expect(firstAuth).toBeTruthy();
            if (firstAuth) {
                expect(firstAuth.artistId).toBe(artistId);
            }

            // Verify database has the link
            let curatorRow = db.prepare("SELECT artist_id, artist_unlinked FROM admin WHERE id = ?").get(curatorId) as any;
            expect(curatorRow.artist_id).toBe(artistId);
            expect(curatorRow.artist_unlinked).toBe(0);

            // 4. Update curator (Root Admin unlinks the artist by setting it to null/None)
            realAuthService.updateAdmin(curatorId, null, UserRole.SUPER_USER);

            // Verify database has unlinked and marked as unlinked
            curatorRow = db.prepare("SELECT artist_id, artist_unlinked FROM admin WHERE id = ?").get(curatorId) as any;
            expect(curatorRow.artist_id).toBeNull();
            expect(curatorRow.artist_unlinked).toBe(1);

            // 5. Authenticate user again (subsequent login). Since artist_unlinked is 1, it should NOT auto-link.
            const secondAuth = await realAuthService.authenticateUser('curator1', 'CuratorPass123!');
            expect(secondAuth).toBeTruthy();
            if (secondAuth) {
                expect(secondAuth.artistId).toBeNull();
            }

            // Verify database still has no link
            curatorRow = db.prepare("SELECT artist_id, artist_unlinked FROM admin WHERE id = ?").get(curatorId) as any;
            expect(curatorRow.artist_id).toBeNull();
            expect(curatorRow.artist_unlinked).toBe(1);

            db.close();
        }, 30000);
    });
});

