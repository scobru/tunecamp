import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import type { DatabaseService } from '../../../core/database.js';
import type { CatalogService } from '../../../modules/catalog/catalog.service.js';
import type { DiscoveryService } from '../../../modules/catalog/discovery.service.js';

// Mock music-metadata
jest.unstable_mockModule('music-metadata', () => ({
  parseFile: jest.fn()
}), { virtual: true });

// Mock metadataService
jest.unstable_mockModule('../../../modules/catalog/metadata.service.js', () => ({
  metadataService: {
    searchRelease: jest.fn().mockImplementation(() => Promise.resolve([{ title: 'Matched Album', artist: 'Matched Artist' }]))
  }
}), { virtual: true });

// Import module under test dynamically
let createAlbumsRoutes: any;
beforeAll(async () => {
    const mod = await import('../albums.js');
    createAlbumsRoutes = mod.createAlbumsRoutes;
});

// Mock dependencies
const mockDatabase = {
    getAlbum: jest.fn(),
    getAlbumBySlug: jest.fn(),
    getTracksByReleaseId: jest.fn(),
    getTracks: jest.fn(),
    getTracksByAlbum: jest.fn(),
    isStarred: jest.fn(),
    getItemRating: jest.fn(),
    updateAlbumCover: jest.fn(),
    getRelease: jest.fn(),
    updateAlbum: jest.fn(),
    updateAlbumArtist: jest.fn(),
    getArtistByName: jest.fn(),
    createArtist: jest.fn(),
    getArtist: jest.fn(),
} as unknown as DatabaseService;

const mockCatalogService = {
    promoteToRelease: jest.fn(),
    setVisibility: jest.fn(),
    deleteAlbum: jest.fn(),
    starAlbum: jest.fn(),
    unstarAlbum: jest.fn(),
    setAlbumRating: jest.fn(),
    getAlbumForUser: jest.fn(),
    updateAlbum: jest.fn(),
} as unknown as CatalogService;

const mockDiscoveryService = {
    getAlbumForUser: jest.fn(),
} as unknown as DiscoveryService;

describe('Albums Routes - Cache Optimization', () => {
    let app: express.Express;
    let tempMusicDir: string;
    let coverPath: string;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Create a temporary music directory
        tempMusicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tunecamp-test-albums-'));
        coverPath = path.join(tempMusicDir, 'cover.jpg');
        await fs.ensureDir(tempMusicDir);
        await fs.writeFile(coverPath, 'fake image content');

        app = express();
        app.use(express.json());

        // Mock auth middleware
        app.use((req: any, res, next) => {
            req.isAdmin = (app as any).testAuth?.isAdmin ?? true;
            req.userId = (app as any).testAuth?.userId ?? 1;
            next();
        });

        const router = createAlbumsRoutes({
            database: mockDatabase,
            library: mockDatabase.library || mockDatabase,
            social: mockDatabase.social || mockDatabase,
            catalogService: mockCatalogService,
            discoveryService: mockDiscoveryService,
            musicDir: tempMusicDir
        } as any);
        app.use('/albums', router);

        // Simple error handler
        app.use((err: any, req: any, res: any, next: any) => {
            const statusCode = err.statusCode || 500;
            res.status(statusCode).json({ error: err.message });
        });
    });

    afterEach(async () => {
        // Clean up temp directory
        if (tempMusicDir) {
            await fs.remove(tempMusicDir);
        }
    });

    test('GET /albums/:id/cover returns correct cache headers (max-age=86400)', async () => {
        // Setup
        (mockDatabase.getAlbum as jest.Mock).mockReturnValue({
            id: 1,
            title: 'Test Album',
            slug: 'test-album',
            cover_path: 'cover.jpg',
            visibility: 'public'
        });

        // Act
        const response = await request(app).get('/albums/1/cover');

        // Assert
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toContain('max-age=86400');
        expect(response.headers['content-type']).toContain('image/jpeg');
    });

    describe('GET /albums/:idOrSlug/download', () => {
        test('returns 404 when album has no tracks', async () => {
            // Setup
            (mockDatabase.getAlbum as jest.Mock).mockReturnValue({
                id: 1,
                title: 'Empty Album',
                slug: 'empty-album',
                download: 'free',
                visibility: 'public'
            });
            (mockDatabase.getTracksByAlbum as jest.Mock).mockReturnValue([]);

            // Act
            const response = await request(app).get('/albums/1/download');

            // Assert
            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: "No tracks found" });
        });
    });

    describe('Metadata Search & Matching', () => {
        test('GET /albums/search-metadata calls metadataService.searchRelease', async () => {
            const response = await request(app)
                .get('/albums/search-metadata')
                .query({ q: 'Test Query' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual([{ title: 'Matched Album', artist: 'Matched Artist' }]);
        });

        test('POST /albums/:id/match-metadata updates metadata and matches artist', async () => {
            // Setup database mocks
            (mockDatabase.getAlbum as jest.Mock).mockReturnValue({
                id: 1,
                title: 'Old Title',
                owner_id: 1
            });
            (mockCatalogService.updateAlbum as jest.Mock<any>).mockResolvedValue(undefined);

            // Act
            const response = await request(app)
                .post('/albums/1/match-metadata')
                .send({
                    title: 'New Title',
                    artist: 'Matched Artist',
                    genre: 'Rock',
                    year: 2026,
                    description: 'New Description'
                });

            // Assert
            expect(response.status).toBe(200);
            expect(mockCatalogService.updateAlbum).toHaveBeenCalledWith(1, {
                title: 'New Title',
                artist: 'Matched Artist',
                cover_path: undefined,
                genre: 'Rock',
                year: 2026,
                description: 'New Description'
            });
        });
    });
});

