import { createAdminRoutes } from '../admin.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import type { DatabaseService } from '../../../core/database.js';
import type { ScannerService } from '../../../modules/catalog/scanner.service.js';
import type { ServerConfig } from '../../../core/config.js';
import type { ZenDBService } from '../../../modules/network/zendb.service.js';
import type { PublishingService } from '../../../modules/publishing/publishing.service.js';

// Mock dependencies
const mockDatabase = {
    getSetting: jest.fn(),
    setSetting: jest.fn(),
    getStats: jest.fn(),
    getAllSettings: jest.fn(),
    getArtists: jest.fn(),
    getAlbums: jest.fn(),
    getAlbum: jest.fn(),
    updateAlbumVisibility: jest.fn(),
    getTracks: jest.fn(),
    getPost: jest.fn(),
    updatePost: jest.fn(),
    createPost: jest.fn(),
    updateTracksOrder: jest.fn(),
    deletePost: jest.fn(),
} as unknown as DatabaseService;

const mockScanner = {
    scanDirectory: jest.fn(),
    scanAll: jest.fn(),
    getRegistry: jest.fn(() => ({ getEnabled: () => [] }))
} as unknown as ScannerService;

const mockZenDBService = {
    registerSite: jest.fn(),
    registerTracks: jest.fn(),
    unregisterTracks: jest.fn(),
    syncNetwork: jest.fn(),
    getIdentityKeyPair: jest.fn(),
    setIdentityKeyPair: jest.fn(),
} as unknown as ZenDBService;

const mockConfig = {
    publicUrl: 'http://localhost',
    siteName: 'Test Site',
} as unknown as ServerConfig;

const mockAuthService = {
    isRootAdmin: jest.fn(),
    listAdmins: jest.fn(),
    getAdminById: jest.fn(),
    changePassword: jest.fn(),
    createAdmin: jest.fn(),
    updateAdmin: jest.fn(),
    deleteAdmin: jest.fn(),
} as unknown as AuthService;

const mockPublishingService = {
    publishReleaseToGunDB: jest.fn(),
    unpublishReleaseFromGunDB: jest.fn(),
    publishReleaseToAP: jest.fn(),
    unpublishReleaseFromAP: jest.fn(),
    syncRelease: jest.fn(),
    publishPostToAP: jest.fn(),
    unpublishPostFromAP: jest.fn(),
    syncPost: jest.fn(),
} as unknown as PublishingService;


describe('Admin Routes Vulnerability Check', () => {
    let app: express.Express;

    beforeEach(() => {
        jest.clearAllMocks();

        (mockAuthService.listAdmins as jest.Mock).mockReturnValue([
            { id: 1, username: 'root', role: 'admin' },
            { id: 2, username: 'other', role: 'admin' }
        ]);
        (mockAuthService.getAdminById as jest.Mock).mockImplementation((id: any) => {
            if (id === 1) return { id: 1, username: 'root', role: 'admin' };
            if (id === 2) return { id: 2, username: 'other', role: 'admin' };
            return undefined;
        });

        app = express();
        app.use(express.json());

        // Simple auth middleware mock
        app.use((req: any, res, next) => {
            req.username = req.headers['x-username'] || 'admin';
            req.isRootAdmin = mockAuthService.isRootAdmin(req.username);
            req.role = req.headers['x-role'] || (req.isRootAdmin ? 'root_admin' : 'admin');
            req.context = {
                role: req.role as any,
                userId: req.username === 'root' ? 1 : 2,
                artistId: req.headers['x-artist-id'] ? parseInt(req.headers['x-artist-id'] as string) : undefined
            };
            next();
        });

        const router = createAdminRoutes(
            mockDatabase,
            mockScanner,
            '/tmp/music',
            mockZenDBService,
            mockConfig,
            mockAuthService,
            mockPublishingService as any,
            {} as any, // apService
            {} as any, // telegramBotService
            {} as any, // soulseekService
            {} as any, // lindaBotService
            {} as any, // metadataService
            {} as any, // streamingService
            {} as any  // federationService
        );
        app.use('/admin', router);
    });

    test('Non-root admin CANNOT change root admin password', async () => {
        // Setup:
        // root admin (id=1, username='root')
        // other admin (id=2, username='other')

        const admins = [
            { id: 1, username: 'root', is_root: true, artist_id: null, created_at: '', artist_name: null },
            { id: 2, username: 'other', is_root: false, artist_id: null, created_at: '', artist_name: null }
        ];

        (mockAuthService.listAdmins as jest.Mock).mockReturnValue(admins);
        (mockAuthService.isRootAdmin as jest.Mock).mockImplementation((username) => username === 'root');
        (mockAuthService.changePassword as jest.Mock).mockImplementation(async () => {});

        // Act: specific user 'other' tries to change password of user 'root' (id=1)
        const response = await request(app)
            .put('/admin/system/users/1/password')
            .set('x-username', 'other') // Authenticated as 'other'
            .send({ password: 'newpassword123' });

        // Assert:
        // Currently (vulnerable): 200 OK
        // Expected (fixed): 403 Forbidden

        expect(response.status).toBe(403);
        expect(mockAuthService.changePassword).not.toHaveBeenCalled();
    });

    test('Root admin CAN change other admin password', async () => {
        const admins = [
            { id: 1, username: 'root', is_root: true, artist_id: null, created_at: '', artist_name: null },
            { id: 2, username: 'other', is_root: false, artist_id: null, created_at: '', artist_name: null }
        ];

        (mockAuthService.listAdmins as jest.Mock).mockReturnValue(admins);
        (mockAuthService.isRootAdmin as jest.Mock).mockImplementation((username) => username === 'root');
        (mockAuthService.changePassword as jest.Mock).mockImplementation(async () => {});

        const response = await request(app)
            .put('/admin/system/users/2/password')
            .set('x-username', 'root')
            .send({ password: 'newpassword123' });

        expect(response.status).toBe(200);
        expect(mockAuthService.changePassword).toHaveBeenCalledWith('other', 'newpassword123');
    });

    test('User CAN change own password', async () => {
        const admins = [
            { id: 1, username: 'root', is_root: true, artist_id: null, created_at: '', artist_name: null },
            { id: 2, username: 'other', is_root: false, artist_id: null, created_at: '', artist_name: null }
        ];

        (mockAuthService.listAdmins as jest.Mock).mockReturnValue(admins);
        (mockAuthService.isRootAdmin as jest.Mock).mockImplementation((username) => username === 'root');
        (mockAuthService.changePassword as jest.Mock).mockImplementation(async () => {});

        const response = await request(app)
            .put('/admin/system/users/2/password')
            .set('x-username', 'other')
            .send({ password: 'newpassword123' });

        expect(response.status).toBe(200);
        expect(mockAuthService.changePassword).toHaveBeenCalledWith('other', 'newpassword123');
    });

    test('Root admin CAN update settings with mode', async () => {
        (mockAuthService.isRootAdmin as jest.Mock).mockReturnValue(true);
        (mockDatabase.setSetting as jest.Mock).mockImplementation(() => {});
        (mockDatabase.getArtists as jest.Mock).mockReturnValue([]);
        (mockDatabase.getAlbums as jest.Mock).mockReturnValue([]);

        const response = await request(app)
            .put('/admin/settings')
            .set('x-username', 'root')
            .send({ mode: 'personal', siteName: 'My Library' });

        expect(response.status).toBe(200);
        expect(mockDatabase.setSetting).toHaveBeenCalledWith('mode', 'personal');
        expect(mockDatabase.setSetting).toHaveBeenCalledWith('siteName', 'My Library');
    });

    describe('Super User Restriction', () => {
        beforeEach(() => {
            (mockAuthService.isRootAdmin as jest.Mock).mockImplementation((username) => username === 'root');
        });

        test('Super user CAN perform GET requests', async () => {
            (mockDatabase.getStats as jest.Mock).mockReturnValue({ artists: 0, albums: 0, tracks: 0 });
            
            const response = await request(app)
                .get('/admin/stats')
                .set('x-username', 'readonly')
                .set('x-role', 'super_user');

            expect(response.status).toBe(200);
        });

        test('Super user CANNOT perform PUT requests', async () => {
            const response = await request(app)
                .put('/admin/settings')
                .set('x-username', 'readonly')
                .set('x-role', 'super_user')
                .send({ siteName: 'Hacked' });

            expect(response.status).toBe(403);
            expect(response.body.error).toMatch(/Access denied|Only root admin/i);
            expect(mockDatabase.setSetting).not.toHaveBeenCalled();
        });

        test('Super user CANNOT perform POST requests', async () => {
            const response = await request(app)
                .post('/admin/system/users')
                .set('x-username', 'readonly')
                .set('x-role', 'super_user')
                .send({ username: 'attacker', password: 'password123' });

            expect(response.status).toBe(403);
            expect(mockAuthService.createAdmin).not.toHaveBeenCalled();
        });

        test('Super user CANNOT perform DELETE requests', async () => {
            const response = await request(app)
                .delete('/admin/system/users/2')
                .set('x-username', 'readonly')
                .set('x-role', 'super_user');

            expect(response.status).toBe(403);
            expect(mockAuthService.deleteAdmin).not.toHaveBeenCalled();
        });
    });
});


