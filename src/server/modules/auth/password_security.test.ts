import request from 'supertest';
import express from 'express';
import { createAuthRoutes } from '../../routes/auth/auth.js';
import { createAdminRoutes } from '../../routes/admin/admin.js';
import { jest } from '@jest/globals';

// Mock dependencies
const mockAuthService: any = {
    isFirstRun: jest.fn().mockReturnValue(true),
    createAdmin: jest.fn().mockImplementation(() => Promise.resolve({ id: 1 })),
    createUser: jest.fn().mockImplementation(() => Promise.resolve({ id: 2 })),
    generateToken: jest.fn().mockReturnValue('mock-token'),
    authenticateUser: jest.fn().mockImplementation(() => Promise.resolve({ success: true, artistId: null, isAdmin: true, id: 1 })),
    isRootAdmin: jest.fn().mockReturnValue(true),
    listAdmins: jest.fn().mockReturnValue([{ id: 1, username: 'admin' }]),
    changePassword: jest.fn(),
    isDefaultPassword: jest.fn().mockImplementation(() => Promise.resolve(false)),
};

const mockDatabase: any = {
    getStats: jest.fn(),
    getAllSettings: jest.fn(),
};

const mockScanner: any = {};
const mockGunDB: any = {};
const mockConfig: any = {};
const mockApService: any = {};

const app = express();
app.use(express.json());

// Auth routes
app.use('/api/auth', createAuthRoutes({
    authService: mockAuthService,
    authMiddleware: {
        requireAdmin: (req: any, res: any, next: any) => next(),
        requireUser: (req: any, res: any, next: any) => next()
    }
} as any));

// Admin routes
const adminMiddleware = (req: any, res: any, next: any) => {
    req.username = 'admin'; // Mock admin user
    req.isRootAdmin = true;
    req.role = 'root_admin';
    req.context = { role: 'root_admin' as any, userId: 1 };
    next();
};

app.use('/api/admin', adminMiddleware, createAdminRoutes({
    database: mockDatabase,
    scannerService: mockScanner,
    musicDir: '/tmp',
    config: mockConfig,
    authService: mockAuthService,
    publishingService: {} as any,
    apService: mockApService,
    telegramBotService: {} as any,
    soulseekService: {} as any,
    metadataService: {} as any,
    streamingService: {} as any,
    maintenanceService: {} as any,
    library: mockDatabase.library || mockDatabase,
    identity: mockDatabase.identity || mockDatabase,
    social: mockDatabase.social || mockDatabase,
    integration: mockDatabase.integration || mockDatabase
} as any));


describe('Password Security', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/auth/setup', () => {
        it('rejects weak password (6 chars)', async () => {
            mockAuthService.isFirstRun.mockReturnValue(true);
            const res = await request(app)
                .post('/api/auth/setup')
                .send({ username: 'admin', password: '123456' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/at least 8 characters/i);
        });

        it('accepts strong password (8 chars)', async () => {
            mockAuthService.isFirstRun.mockReturnValue(true);
            const res = await request(app)
                .post('/api/auth/setup')
                .send({ username: 'admin', password: 'strongpassword' });

            expect(res.status).toBe(200);
        });
    });

    describe('POST /api/admin/system/users', () => {
        it('rejects weak password (6 chars)', async () => {
            mockAuthService.isRootAdmin.mockReturnValue(true);
            const res = await request(app)
                .post('/api/admin/system/users')
                .send({ username: 'newadmin', password: '123456' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/at least 8 characters/i);
        });

        it('accepts strong password (8 chars)', async () => {
            mockAuthService.isRootAdmin.mockReturnValue(true);
            const res = await request(app)
                .post('/api/admin/system/users')
                .send({ username: 'newadmin', password: 'strongpassword' });

            expect(res.status).toBe(200);
        });
    });
});
