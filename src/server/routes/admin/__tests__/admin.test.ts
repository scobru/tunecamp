import { createAdminRoutes } from '../admin.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import type { DatabaseService } from '../../../core/database.js';
import type { ScannerService } from '../../../modules/catalog/scanner.service.js';
import type { ServerConfig } from '../../../core/config.js';
import type { PublishingService } from '../../../modules/publishing/publishing.service.js';
import type { AuthService } from '../../../modules/auth/auth.service.js';

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

const mockMaintenanceService = {
    syncAllTagsFromDb: jest.fn(),
    startLibraryAudit: jest.fn(),
    stopLibraryAudit: jest.fn(),
} as any;


/**
 * Builds a test Express app with a simulated viewer context.
 * role/userId/artistId map directly to VisibilityGuardian inputs.
 */
function buildApp(viewer: { role: string; userId?: number; artistId?: number }) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
        req.username = 'testuser';
        req.isRootAdmin = viewer.role === 'root_admin';
        req.role = viewer.role;
        req.userId = viewer.userId ?? null;
        req.artistId = viewer.artistId ?? null;
        req.context = { role: viewer.role as any, userId: viewer.userId ?? null, artistId: viewer.artistId ?? null };
        next();
    });
    const router = createAdminRoutes({
        database: mockDatabase,
        library: mockDatabase,
        identity: mockDatabase,
        social: mockDatabase,
        integration: mockDatabase,
        scannerService: mockScanner,
        musicDir: '/tmp/music',
        config: mockConfig,
        authService: mockAuthService,
        publishingService: mockPublishingService,
        apService: {} as any,
        telegramBotService: {} as any,
        soulseekService: {} as any,
        metadataService: {} as any,
        streamingService: {} as any,
        gdriveService: undefined,
        playlistService: undefined,
        scrobbleService: undefined,
        maintenanceService: mockMaintenanceService,
    } as any);
    app.use('/admin', router);
    return app;
}

describe('Artist release permission gates', () => {
    beforeEach(() => jest.clearAllMocks());

    // An artist is a regular user (role='user') with an artistId linked to their account.
    const artist = { role: 'user', userId: 42, artistId: 7 };
    // A listener has no artistId — they may not create or manage releases.
    const listener = { role: 'user', userId: 99, artistId: undefined };

    test('Artist: POST /releases is not blocked by the restriction middleware (passes through to releaseRouter)', async () => {
        const app = buildApp(artist);
        const res = await request(app).post('/admin/releases').send({ title: 'My Track' });
        // The admin router has no POST /releases handler — it falls through to the next middleware.
        // We just need to confirm the middleware did NOT return 403.
        expect(res.status).not.toBe(403);
    });

    test('Listener: POST /releases is blocked with 403', async () => {
        const app = buildApp(listener);
        const res = await request(app).post('/admin/releases').send({ title: 'Sneaky' });
        expect(res.status).toBe(403);
    });

    test('Artist: PUT /releases/:id/visibility is not blocked', async () => {
        (mockDatabase as any).getRelease = jest.fn().mockReturnValue({ id: 10, owner_id: 42, artist_id: 7, visibility: 'private' });
        (mockDatabase as any).updateAlbum = jest.fn().mockReturnValue(true);
        (mockDatabase as any).updateRelease = jest.fn().mockReturnValue(true);
        const app = buildApp(artist);
        const res = await request(app).put('/admin/releases/10/visibility').send({ isPublic: true });
        expect(res.status).not.toBe(403);
    });

    test('Listener: PUT /releases/:id/visibility is blocked with 403', async () => {
        const app = buildApp(listener);
        const res = await request(app).put('/admin/releases/10/visibility').send({ isPublic: true });
        expect(res.status).toBe(403);
    });

    test('Artist: POST /releases/:id/tracks/add sub-path is not blocked', async () => {
        const app = buildApp(artist);
        const res = await request(app).post('/admin/releases/10/tracks/add').send({ trackId: 5 });
        // No handler exists for this route in the admin router → 404, not 403
        expect(res.status).not.toBe(403);
    });

    test('Listener: POST /releases/:id/tracks/add is blocked with 403', async () => {
        const app = buildApp(listener);
        const res = await request(app).post('/admin/releases/10/tracks/add').send({ trackId: 5 });
        expect(res.status).toBe(403);
    });

    test('Artist: PUT /releases/batch/visibility is blocked (batch stays admin-only)', async () => {
        const app = buildApp(artist);
        const res = await request(app).put('/admin/releases/batch/visibility').send({ ids: [1, 2], visibility: 'public' });
        expect(res.status).toBe(403);
    });

    test('Artist: admin-only settings route is blocked with 403', async () => {
        const app = buildApp(artist);
        const res = await request(app).put('/admin/settings').send({ siteName: 'Hacked' });
        expect(res.status).toBe(403);
    });
});

describe('Curator (super_user) and Manager (admin) permission boundaries', () => {
    beforeEach(() => jest.clearAllMocks());

    // Curator: super_user role. Has MANAGE_PRIVATE_LIBRARY but NOT MANAGE_ALL_CONTENT.
    // They can only manage content they own (owner_id / artist_id match).
    const curatorWithArtist = { role: 'super_user', userId: 10, artistId: 3 };
    const curatorNoArtist   = { role: 'super_user', userId: 11, artistId: undefined };

    // Manager: admin role. Has MANAGE_ALL_CONTENT — can manage any release.
    const manager = { role: 'admin', userId: 20, artistId: undefined };

    // ── Middleware gate ──────────────────────────────────────────────────────────

    test('Curator passes the admin restriction middleware for release routes', async () => {
        const app = buildApp(curatorWithArtist);
        // The admin router has no POST /releases handler — falls through to releaseRouter.
        // We just need to confirm the middleware does NOT return 403.
        const res = await request(app).post('/admin/releases').send({ title: 'Test' });
        expect(res.status).not.toBe(403);
    });

    test('Manager passes the admin restriction middleware for all non-GET routes', async () => {
        const app = buildApp(manager);
        const res = await request(app).post('/admin/releases').send({ title: 'Test' });
        expect(res.status).not.toBe(403);
    });

    // ── Curator visibility-toggle: middleware passes; handler enforces ownership ─

    test('Curator can toggle visibility of a release they own (owner_id matches)', async () => {
        (mockDatabase as any).getRelease = jest.fn().mockReturnValue({
            id: 10, owner_id: 10, artist_id: 3, visibility: 'private', is_release: 1,
        });
        (mockDatabase as any).updateAlbum = jest.fn().mockReturnValue(true);
        (mockDatabase as any).updateRelease = jest.fn().mockReturnValue(true);
        const app = buildApp(curatorWithArtist);
        const res = await request(app).put('/admin/releases/10/visibility').send({ isPublic: true });
        expect(res.status).not.toBe(403);
    });

    test('Curator is blocked from toggling visibility of a release owned by someone else', async () => {
        (mockDatabase as any).getRelease = jest.fn().mockReturnValue({
            id: 20, owner_id: 999, artist_id: 999, visibility: 'private', is_release: 1,
        });
        (mockDatabase as any).getAlbum = jest.fn().mockReturnValue(null);
        (mockDatabase as any).updateAlbum = jest.fn();
        (mockDatabase as any).updateRelease = jest.fn();
        const app = buildApp(curatorWithArtist);
        const res = await request(app).put('/admin/releases/20/visibility').send({ isPublic: true });
        // Handler enforces MANAGE_ALL_CONTENT for cross-owner edits; Curator has only
        // MANAGE_PRIVATE_LIBRARY so it gets 403.
        expect(res.status).toBe(403);
    });

    test('Manager can toggle visibility of a release owned by someone else', async () => {
        (mockDatabase as any).getRelease = jest.fn().mockReturnValue({
            id: 20, owner_id: 999, artist_id: 999, visibility: 'private', is_release: 1,
        });
        (mockDatabase as any).getAlbum = jest.fn().mockReturnValue(null);
        (mockDatabase as any).updateAlbum = jest.fn().mockReturnValue(true);
        (mockDatabase as any).updateRelease = jest.fn().mockReturnValue(true);
        (mockPublishingService.syncRelease as jest.Mock).mockResolvedValue(undefined);
        const app = buildApp(manager);
        const res = await request(app).put('/admin/releases/20/visibility').send({ isPublic: true });
        // Manager has MANAGE_ALL_CONTENT → bypasses ownership check
        expect(res.status).not.toBe(403);
    });

    // ── canPublishContent gate (inside releaseRouter POST handler) ────────────────
    // The admin restriction middleware lets Curator through, but canPublishContent
    // inside the releaseRouter handler still blocks Curators without an artistId.
    // These tests document that contract via the middleware layer only
    // (the releaseRouter is not mounted in this test app, so we can only confirm
    // the middleware passes — the handler-level check is tested in releases.test.ts).

    test('Curator without artistId: middleware does not block (handler enforces canPublish)', async () => {
        const app = buildApp(curatorNoArtist);
        const res = await request(app).post('/admin/releases').send({ title: 'Test' });
        // 404 = no matching route in admin router; 403 would mean middleware blocked it
        expect(res.status).not.toBe(403);
    });

    // ── System-level routes stay out of reach for Curator ───────────────────────

    test('Curator cannot create system users (route-level admin check)', async () => {
        const app = buildApp(curatorWithArtist);
        const res = await request(app)
            .post('/admin/system/users')
            .send({ username: 'hacker', password: 'pw' });
        expect(res.status).toBe(403);
    });

    test('Curator cannot change global settings (route-level root-admin check)', async () => {
        (mockDatabase.setSetting as jest.Mock).mockImplementation(() => {});
        const app = buildApp(curatorWithArtist);
        const res = await request(app).put('/admin/settings').send({ siteName: 'Hacked' });
        expect(res.status).toBe(403);
    });

    test('Manager cannot change root-admin-only settings', async () => {
        (mockDatabase.setSetting as jest.Mock).mockImplementation(() => {});
        const app = buildApp(manager);
        const res = await request(app).put('/admin/settings').send({ siteName: 'Hacked' });
        expect(res.status).toBe(403);
    });
});

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

        const router = createAdminRoutes({
            database: mockDatabase,
            library: mockDatabase.library || mockDatabase,
            identity: mockDatabase.identity || mockDatabase,
            social: mockDatabase.social || mockDatabase,
            integration: mockDatabase.integration || mockDatabase,
            scannerService: mockScanner,
            musicDir: '/tmp/music',
            config: mockConfig,
            authService: mockAuthService,
            publishingService: mockPublishingService,
            apService: {} as any,
            telegramBotService: {} as any,
            soulseekService: {} as any,
            metadataService: {} as any,
            streamingService: {} as any,
            gdriveService: undefined,
            playlistService: undefined,
            scrobbleService: undefined,
            maintenanceService: mockMaintenanceService
        } as any);
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
            .send({ mode: 'personal', siteName: 'My Library', hideDj: true });

        expect(response.status).toBe(200);
        expect(mockDatabase.setSetting).toHaveBeenCalledWith('mode', 'personal');
        expect(mockDatabase.setSetting).toHaveBeenCalledWith('siteName', 'My Library');
        expect(mockDatabase.setSetting).toHaveBeenCalledWith('hideDj', 'true');
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

    describe('System Maintenance', () => {
        beforeEach(() => {
            (mockAuthService.isRootAdmin as jest.Mock).mockImplementation((username) => username === 'root');
        });

        test('Root admin CAN trigger sync-tags', async () => {
            (mockMaintenanceService.syncAllTagsFromDb as any).mockResolvedValue({ success: 10, failed: 0 });

            const response = await request(app)
                .post('/admin/system/sync-tags')
                .set('x-username', 'root')
                .send({});

            expect(response.status).toBe(200);
            expect(response.body.message).toMatch(/Tag synchronization started in background/i);
            
            // Wait a bit for the background promise to be called (though it's not awaited in the route)
            expect(mockMaintenanceService.syncAllTagsFromDb).toHaveBeenCalled();
        });

        test('Non-root admin CANNOT trigger sync-tags', async () => {
            const response = await request(app)
                .post('/admin/system/sync-tags')
                .set('x-username', 'other')
                .send({});

            expect(response.status).toBe(403);
            expect(mockMaintenanceService.syncAllTagsFromDb).not.toHaveBeenCalled();
        });
    });
});


