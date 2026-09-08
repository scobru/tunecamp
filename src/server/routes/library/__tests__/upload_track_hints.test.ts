import { createUploadRoutes } from '../upload.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import type { DatabaseService } from '../../../core/database.js';
import type { ScannerService } from '../../../modules/catalog/scanner.js';
import { UserRole } from '../../../common/visibility.js';

/**
 * Title and position sent alongside an upload name ONE track — they are how an
 * imported tracklist keeps its titles and order when the artist attaches the
 * audio themselves, since the files they have on disk are rarely tagged the way
 * the release lists them.
 *
 * Which is exactly why they must not leak into a batch: ten files under one
 * `title` would land as ten tracks with the same name.
 */

const mockDatabase = {
    getAlbumBySlug: jest.fn(),
    getReleaseBySlug: jest.fn(),
    addTrackToRelease: jest.fn(),
} as unknown as DatabaseService;

const mockScanner = {
    processAudioFile: jest.fn(),
} as unknown as ScannerService;

const mockAuthService = {
    getUserByUsername: jest.fn(),
    getTrackQuotaInfo: jest.fn(),
    getStorageInfo: jest.fn(),
};

const mockIdentity = {
    getSetting: jest.fn(),
};

const mockLibrary = {
    getReleaseBySlug: jest.fn(),
    getAlbumBySlug: jest.fn(),
    getTrackCountByOwner: jest.fn(),
};

/** The `metadataHints` argument of the nth processAudioFile call. */
const hintsOfCall = (n: number) =>
    (mockScanner.processAudioFile as jest.Mock).mock.calls[n][6] as Record<string, unknown>;

describe('Upload Routes - per-track metadata hints', () => {
    let app: express.Express;
    let tempMusicDir: string;

    beforeEach(async () => {
        jest.clearAllMocks();

        tempMusicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tunecamp-test-hints-'));
        await fs.ensureDir(path.join(tempMusicDir, 'tracks'));

        app = express();
        app.use(express.json());

        app.use((req, res, next) => {
            (req as any).isAdmin = true;
            (req as any).isRootAdmin = true;
            (req as any).isActive = true;
            (req as any).userId = 1;
            (req as any).artistId = 1;
            (req as any).username = 'admin';
            (req as any).context = {
                role: UserRole.ROOT_ADMIN,
                userId: 1,
                artistId: 1,
                isActive: true,
            };
            next();
        });

        const mockStorageEngine = {
            remove: jest.fn().mockResolvedValue(undefined as never),
            pathExists: jest.fn().mockResolvedValue(false as never),
            writeFile: jest.fn().mockResolvedValue(undefined as never),
            ensureDir: jest.fn().mockResolvedValue(undefined as never),
            move: jest.fn().mockResolvedValue(undefined as never),
        };

        (mockAuthService.getUserByUsername as jest.Mock).mockReturnValue({ id: 1, username: 'admin', storage_quota: 0 });
        (mockAuthService.getTrackQuotaInfo as jest.Mock).mockReturnValue({ track_quota: 0, track_quota_floor: 0 });
        (mockScanner.processAudioFile as any).mockResolvedValue({
            success: true,
            originalPath: 'mock/path/test.mp3',
            message: 'Mock Success',
            trackId: 101,
        });

        const router = createUploadRoutes({
            database: mockDatabase,
            scannerService: mockScanner,
            musicDir: tempMusicDir,
            publishingService: {} as any,
            storage: mockStorageEngine as any,
            authService: mockAuthService as any,
            identity: mockIdentity as any,
            library: mockLibrary as any,
        } as any);
        app.use('/upload', router);
    });

    afterEach(async () => {
        await fs.remove(tempMusicDir);
    });

    /** Attach `count` distinct audio files to the request. */
    const attachFiles = async (req: request.Test, count: number) => {
        for (let i = 0; i < count; i++) {
            const audioPath = path.join(tempMusicDir, `test-${i}.mp3`);
            await fs.writeFile(audioPath, `fake audio content ${i}`);
            req = req.attach('files', audioPath);
        }
        return req;
    };

    test('passes title and trackNum through for a single file', async () => {
        const response = await (await attachFiles(request(app).post('/upload/tracks'), 1))
            .field('title', 'Nocturne in C')
            .field('trackNum', '4');

        expect(response.status).toBe(202);
        expect(mockScanner.processAudioFile).toHaveBeenCalledTimes(1);
        expect(hintsOfCall(0)).toMatchObject({ title: 'Nocturne in C', trackNum: 4 });
    });

    test('ignores title and trackNum when several files are uploaded at once', async () => {
        const response = await (await attachFiles(request(app).post('/upload/tracks'), 3))
            .field('title', 'Nocturne in C')
            .field('trackNum', '4');

        expect(response.status).toBe(202);
        expect(mockScanner.processAudioFile).toHaveBeenCalledTimes(3);
        for (let i = 0; i < 3; i++) {
            expect(hintsOfCall(i).title).toBeUndefined();
            expect(hintsOfCall(i).trackNum).toBeUndefined();
        }
    });

    test('leaves the hints unset when the upload names neither', async () => {
        const response = await attachFiles(request(app).post('/upload/tracks'), 1);

        expect(response.status).toBe(202);
        expect(hintsOfCall(0).title).toBeUndefined();
        expect(hintsOfCall(0).trackNum).toBeUndefined();
    });

    test('rejects a position that is not a usable track number', async () => {
        const response = await (await attachFiles(request(app).post('/upload/tracks'), 1))
            .field('title', 'Nocturne in C')
            .field('trackNum', 'side B');

        expect(response.status).toBe(202);
        // The title still applies; only the unusable position is dropped, so the
        // file's own tag (or none) decides the order.
        expect(hintsOfCall(0)).toMatchObject({ title: 'Nocturne in C' });
        expect(hintsOfCall(0).trackNum).toBeUndefined();
    });
});
