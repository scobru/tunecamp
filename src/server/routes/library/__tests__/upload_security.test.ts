import { createUploadRoutes } from '../upload.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import type { DatabaseService } from '../../../core/database.js';
import type { ScannerService } from '../../../modules/catalog/scanner.js';

// Mock dependencies
const mockDatabase = {
    getAlbumBySlug: jest.fn(),
    getReleaseBySlug: jest.fn(),
    addTrackToRelease: jest.fn(),
} as unknown as DatabaseService;

const mockScanner = {
    processAudioFile: jest.fn(),
} as unknown as ScannerService;

describe('Upload Routes - Security Check', () => {
    let app: express.Express;
    let tempMusicDir: string;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Create a temporary music directory
        tempMusicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tunecamp-test-sec-'));
        await fs.ensureDir(path.join(tempMusicDir, 'tracks'));

        app = express();
        app.use(express.json());

        // Simulate restricted admin middleware
        app.use((req, res, next) => {
            (req as any).isAdmin = true;
            (req as any).isRootAdmin = false;
            (req as any).artistId = 1; // Authenticated as Artist 1
            next();
        });

        const mockStorageEngine = {
            remove: jest.fn().mockResolvedValue(undefined as never),
            pathExists: jest.fn().mockResolvedValue(true as never),
            writeFile: jest.fn().mockResolvedValue(undefined as never),
        };

        const router = createUploadRoutes(
            mockDatabase,
            mockScanner,
            tempMusicDir,
            {} as any, // mock publishingService
            mockStorageEngine as any, // mock storageEngine
            {} as any  // mock authService
        );
        app.use('/upload', router);
    });

    afterEach(async () => {
        // Clean up temp directory
        await fs.remove(tempMusicDir);
    });

    test('POST /tracks should prevent uploading to another artist\'s release', async () => {
        // Setup: Target release belongs to Artist 2
        (mockDatabase.getReleaseBySlug as jest.Mock).mockReturnValue({
            id: 99,
            title: 'Other Artist Album',
            slug: 'other-artist-album',
            artist_id: 2 // DIFFERENT from req.artistId (1)
        });

        // Setup: Scanner returns success with valid object structure
        (mockScanner.processAudioFile as any).mockResolvedValue({
            success: true,
            originalPath: 'mock/path/test.mp3',
            message: 'Mock Success',
            trackId: 101
        });

        // Create dummy audio file
        const audioPath = path.join(tempMusicDir, 'test.mp3');
        await fs.writeFile(audioPath, 'fake audio content');

        // Act
        const response = await request(app)
            .post('/upload/tracks')
            .field('releaseSlug', 'other-artist-album')
            .attach('files', audioPath);

        // Assert
        // Expecting the fix to return 403 Forbidden

        if (response.status === 403) {
             console.log("✅ Security check passed: Upload blocked due to artist mismatch.");
        } else {
             console.error(`❌ Security check failed: Expected 403, got ${response.status}`);
        }

        expect(response.status).toBe(403);
        expect(mockDatabase.addTrackToRelease).not.toHaveBeenCalled(); // Track should NOT be linked
    });
});

