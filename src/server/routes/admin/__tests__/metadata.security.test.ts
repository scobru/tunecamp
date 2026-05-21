import express from 'express';
import request from 'supertest';
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Mock isSafeUrl BEFORE importing the routes
jest.unstable_mockModule('../../../../utils/networkUtils.js', () => ({
    isSafeUrl: jest.fn()
}));

// Dynamic imports
const { createMetadataRoutes } = await import('../metadata.js');
const { isSafeUrl } = await import('../../../../utils/networkUtils.js');

const mockDb = {
    getAlbum: jest.fn(),
    getTracks: jest.fn(),
    updateAlbumCover: jest.fn(),
    getArtistByName: jest.fn(),
    createArtist: jest.fn(),
    updateAlbumArtist: jest.fn(),
} as any;

const mockCatalogService = {
    updateAlbum: jest.fn<any>().mockResolvedValue(undefined),
} as any;

describe('Metadata Security', () => {
    let app: express.Express;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(express.json());
        // Mock AuthenticatedRequest middleware
        app.use((req: any, res, next) => {
            req.isAdmin = true;
            next();
        });
        app.use('/api/metadata', createMetadataRoutes(mockDb, '/tmp/music', { scanTracks: jest.fn(), scanDirectory: jest.fn() } as any, mockCatalogService));
    });

    test('POST /api/metadata/apply should block unsafe coverUrl', async () => {
        (isSafeUrl as jest.Mock<typeof isSafeUrl>).mockResolvedValue(false);
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 1, title: 'Test Album' });

        const response = await request(app)
            .post('/api/metadata/apply')
            .send({
                albumId: 1,
                coverUrl: 'http://127.0.0.1/secret.jpg'
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid or unsafe cover URL');
    });

    test('POST /api/metadata/apply should allow safe coverUrl', async () => {
        (isSafeUrl as jest.Mock<typeof isSafeUrl>).mockResolvedValue(true);
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 1, title: 'Test Album', cover_path: '/tmp/music/album/cover.jpg' });
        (mockDb.getTracks as jest.Mock).mockReturnValue([]);

        // Mock fetch indirectly by making the directory non-existent or similar if we just want to test the guard
        // In metadata.ts, if dir is not found, it proceeds without erroring on fetch.

        const response = await request(app)
            .post('/api/metadata/apply')
            .send({
                albumId: 1,
                coverUrl: 'https://legit.com/cover.jpg'
            });

        expect(response.status).toBe(200);
        expect(isSafeUrl).toHaveBeenCalledWith('https://legit.com/cover.jpg');
    });
});
