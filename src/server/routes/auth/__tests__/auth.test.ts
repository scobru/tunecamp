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
            getUserPair: jest.fn().mockReturnValue(null)
        };

        mockAuthMiddleware = {
            requireAdmin: jest.fn().mockImplementation((req: any, res: any, next: any) => {
                req.username = 'admin';
                req.role = UserRole.ADMIN;
                next();
            })
        };

        app = express();
        app.use(express.json());
        app.use('/api/auth', createAuthRoutes(mockAuthService, mockAuthMiddleware));
    });

    describe('POST /api/auth/login', () => {
        test('returns 400 if credentials are missing', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({});
            
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Password or GunDB proof required');
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
        });
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
            guestApp.use('/api/auth', createAuthRoutes(mockAuthService, mockAuthMiddleware));

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
            authApp.use('/api/auth', createAuthRoutes(mockAuthService, mockAuthMiddleware));

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
});
