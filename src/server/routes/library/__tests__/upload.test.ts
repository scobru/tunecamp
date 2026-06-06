import { createUploadRoutes } from '../upload.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import type { DatabaseService } from '../../../core/database.js';
import type { ScannerService } from '../../../modules/catalog/scanner.js';
import type { PublishingService } from '../../../modules/publishing/publishing.service.js';
import type { AuthService } from '../../../modules/auth/auth.service.js';

// Mock dependencies
const mockDatabase = {
    getAlbumBySlug: jest.fn(),
    getReleaseBySlug: jest.fn(),
    updateAlbumCover: jest.fn(),
    updateRelease: jest.fn(),
    getArtist: jest.fn(),
    updateArtist: jest.fn(),
    setSetting: jest.fn(),
} as unknown as DatabaseService;

const mockScanner = {
    processAudioFile: jest.fn(),
} as unknown as ScannerService;

const mockPublishingService = {
    publishRelease: jest.fn(),
    syncRelease: jest.fn().mockImplementation(() => Promise.resolve()),
} as unknown as PublishingService;

const mockAuthService = {
    getUser: jest.fn(),
} as unknown as AuthService;

describe('Upload Routes - Authorization', () => {
    let app: express.Express;
    let tempMusicDir: string;
    let currentTestUser: any = {};

    beforeEach(async () => {
        jest.setTimeout(15000);
        jest.clearAllMocks();
        // Clear properties instead of reassigning the object to maintain closure reference
        for (const key in currentTestUser) delete currentTestUser[key];

        // Create a temporary music directory
        tempMusicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tunecamp-test-'));
        await fs.ensureDir(path.join(tempMusicDir, 'releases'));
        await fs.ensureDir(path.join(tempMusicDir, 'assets'));

        app = express();
        app.use(express.json());

        // Middleware to inject test user
        app.use((req: any, res, next) => {
            Object.assign(req, currentTestUser);
            next();
        });

        const mockStorageEngine = {
            pathExists: jest.fn().mockResolvedValue(true as never),
            readdir: jest.fn().mockResolvedValue([] as never),
            readFile: jest.fn().mockResolvedValue('' as never),
            remove: jest.fn(),
            move: jest.fn(),
            ensureDir: jest.fn(),
            writeFile: jest.fn()
        };

        const router = createUploadRoutes({
            database: mockDatabase,
            scannerService: mockScanner,
            musicDir: tempMusicDir,
            publishingService: mockPublishingService,
            storage: mockStorageEngine as any,
            authService: mockAuthService
        } as any);
        app.use('/upload', router);
    });

    afterEach(async () => {
        await fs.remove(tempMusicDir);
    });

    test('POST /upload/cover allows upload if user matches artist_id', async () => {
        const validSlug = 'test-album';
        Object.assign(currentTestUser, { userId: 5, artistId: 5, isRootAdmin: false, isAdmin: true, isActive: true });
        
        (mockDatabase.getReleaseBySlug as jest.Mock).mockReturnValue({
            id: 1,
            slug: validSlug,
            artist_id: 5,
            owner_id: 10,
            title: 'Test Album'
        });
        (mockDatabase.getAlbumBySlug as jest.Mock).mockReturnValue(undefined);

        const imagePath = path.join(tempMusicDir, 'test.jpg');
        await fs.writeFile(imagePath, 'fake image');

        const response = await request(app)
            .post('/upload/cover')
            .field('releaseSlug', validSlug)
            .attach('file', imagePath);

        expect(response.status).toBe(200);
    }, 30000);

    test('POST /upload/cover allows upload if user matches owner_id (THE FIX)', async () => {
        const validSlug = 'test-album';
        Object.assign(currentTestUser, { userId: 10, artistId: 10, isRootAdmin: false, isAdmin: true, isActive: true });
        
        (mockDatabase.getReleaseBySlug as jest.Mock).mockReturnValue({
            id: 1,
            slug: validSlug,
            artist_id: 5,
            owner_id: 10,
            title: 'Test Album'
        });
        (mockDatabase.getAlbumBySlug as jest.Mock).mockReturnValue(undefined);

        const imagePath = path.join(tempMusicDir, 'test.jpg');
        await fs.writeFile(imagePath, 'fake image');

        const response = await request(app)
            .post('/upload/cover')
            .field('releaseSlug', validSlug)
            .attach('file', imagePath);

        expect(response.status).toBe(200);
    }, 30000);

    test('POST /upload/cover denies upload if user matches neither', async () => {
        const validSlug = 'test-album';
        Object.assign(currentTestUser, { userId: 99, artistId: 99, isRootAdmin: false, isAdmin: true, isActive: true });
        
        (mockDatabase.getReleaseBySlug as jest.Mock).mockReturnValue({
            id: 1,
            slug: validSlug,
            artist_id: 5,
            owner_id: 10
        });
        (mockDatabase.getAlbumBySlug as jest.Mock).mockReturnValue(undefined);

        const imagePath = path.join(tempMusicDir, 'test.jpg');
        await fs.writeFile(imagePath, 'fake image');

        const response = await request(app)
            .post('/upload/cover')
            .field('releaseSlug', validSlug)
            .attach('file', imagePath);

        expect(response.status).toBe(403);
        expect(response.body.error).toContain('Cannot upload cover for another artist');
    }, 30000);

    test('POST /upload/cover allows root admin to bypass all checks', async () => {
        const validSlug = 'test-album';
        Object.assign(currentTestUser, { artistId: 99, isRootAdmin: true, isAdmin: true, isActive: true });
        
        (mockDatabase.getReleaseBySlug as jest.Mock).mockReturnValue({
            id: 1,
            slug: validSlug,
            artist_id: 1,
            owner_id: 1,
            title: 'Root Album'
        });
        (mockDatabase.getAlbumBySlug as jest.Mock).mockReturnValue(undefined);

        const imagePath = path.join(tempMusicDir, 'test.jpg');
        await fs.writeFile(imagePath, 'fake image');

        const response = await request(app)
            .post('/upload/cover')
            .field('releaseSlug', validSlug)
            .attach('file', imagePath);

        expect(response.status).toBe(200);
    }, 30000);
});

