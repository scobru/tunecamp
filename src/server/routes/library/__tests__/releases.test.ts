import { createReleaseRouter } from '../releases.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import type { DatabaseService } from '../../../core/database.js';
import type { ScannerService } from '../../../modules/catalog/scanner.service.js';
import type { PublishingService } from '../../../modules/publishing/publishing.service.js';
import type { AuthService } from '../../../modules/auth/auth.service.js';

// Mock dependencies
const mockDatabase = {
    getArtistByName: jest.fn(),
    createArtist: jest.fn(),
    getArtist: jest.fn(),
    createAlbum: jest.fn(),
    createRelease: jest.fn(),
    updateReleaseTracks: jest.fn(),
    getAlbum: jest.fn(),
    getRelease: jest.fn(),
    updateAlbumTitle: jest.fn(),
    updateAlbumArtist: jest.fn(),
    updateAlbumVisibility: jest.fn(),
    updateAlbumFederationSettings: jest.fn(),
    getReleaseTrackIds: jest.fn(),
    getTracksByReleaseId: jest.fn(),
    deleteAlbum: jest.fn(),
    getReleases: jest.fn(),
    getReleasesByArtist: jest.fn().mockReturnValue([]),
    getReleasesByOwner: jest.fn().mockReturnValue([]),
    getRecentReleaseByMetadata: jest.fn(),
    transaction: jest.fn((cb: any) => cb()),
    db: {
        prepare: jest.fn(() => ({ run: jest.fn() }))
    }
} as unknown as DatabaseService;

const mockScanner = {
    scanDirectory: jest.fn(),
} as unknown as ScannerService;

const mockPublishingService = {
    syncRelease: jest.fn().mockImplementation(async () => {}),
    unpublishReleaseFromAP: jest.fn().mockImplementation(async () => {}),
    unpublishReleaseFromGunDB: jest.fn().mockImplementation(async () => {}),
} as unknown as PublishingService;

const mockAuthService = {
    isRootAdmin: jest.fn().mockReturnValue(false),
} as unknown as AuthService;

const musicDir = '/tmp/music';

describe('Release Routes - Creation and Publishing', () => {
    let app: express.Express;

    beforeEach(() => {
        jest.clearAllMocks();

        app = express();
        app.use(express.json());

        // Middleware to mock permissions if needed
        app.use((req: any, res, next) => {
            req.isAdmin = true;
            req.isActive = true;
            req.role = 'admin';
            req.context = { role: 'admin' as any, userId: 1, artistId: 1 };
            req.isRootAdmin = true;
            next();
        });

        const router = createReleaseRouter(
            mockDatabase,
            mockScanner,
            mockPublishingService,
            mockAuthService,
            musicDir
        );
        app.use('/releases', router);
    });

    test('POST /releases should trigger publishing sync for new public releases', async () => {
        // Setup
        const newReleaseId = 123;
        (mockDatabase.createRelease as jest.Mock).mockReturnValue(newReleaseId);
        (mockDatabase.getRelease as jest.Mock).mockReturnValue({
            id: newReleaseId,
            title: 'Test Album',
            visibility: 'public',
            published_to_ap: true,
            published_to_gundb: true
        });

        // Act
        const response = await request(app)
            .post('/releases')
            .send({
                title: 'Test Album',
                visibility: 'public',
                publishedToAP: true,
                artist_id: 1 // Test the snake_case fallback
            });

        // Assert
        expect(response.status).toBe(201);
        expect(mockDatabase.createRelease).toHaveBeenCalled();
        
        // Verify artist_id was used
        const createCallArgs = (mockDatabase.createRelease as jest.Mock).mock.calls[0][0] as any;
        expect(createCallArgs.artist_id).toBe(1);

        // Ensure syncRelease is called for new releases
        expect(mockPublishingService.syncRelease).toHaveBeenCalledWith(newReleaseId);
    });

    test('POST /releases should prevent rapid double-submission duplicate creation', async () => {
        // Setup a duplicate release created 2 seconds ago
        const duplicateRelease = {
            id: 456,
            title: 'Test Album',
            visibility: 'public',
            created_at: new Date(Date.now() - 2000).toISOString()
        };
        (mockDatabase.getReleasesByArtist as jest.Mock).mockReturnValue([duplicateRelease]);

        // Act
        const response = await request(app)
            .post('/releases')
            .send({
                title: 'Test Album',
                visibility: 'public',
                artist_id: 1
            });

        // Assert: It should return the duplicate release with 201 status, but NOT call mockDatabase.createRelease
        expect(response.status).toBe(201);
        expect(response.body.id).toBe(456);
        expect(mockDatabase.createRelease).not.toHaveBeenCalled();
    });
});

