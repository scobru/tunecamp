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

describe('Upload Routes - Track-count cap', () => {
    let app: express.Express;
    let tempMusicDir: string;

    beforeEach(async () => {
        jest.clearAllMocks();

        tempMusicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tunecamp-test-trackcap-'));
        await fs.ensureDir(path.join(tempMusicDir, 'tracks'));

        app = express();
        app.use(express.json());

        app.use((req, res, next) => {
            (req as any).isAdmin = false;
            (req as any).isRootAdmin = false;
            (req as any).isActive = true;
            (req as any).userId = 55;
            (req as any).artistId = 1;
            (req as any).username = 'listener1';
            (req as any).context = {
                role: UserRole.NORMAL_USER,
                userId: 55,
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

        (mockAuthService.getUserByUsername as jest.Mock).mockReturnValue({ id: 55, username: 'listener1', storage_quota: 0 });
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

    const attachFile = async (req: request.Test) => {
        const audioPath = path.join(tempMusicDir, 'test.mp3');
        await fs.writeFile(audioPath, 'fake audio content');
        return req.attach('files', audioPath);
    };

    test('blocks upload when the per-user track quota override is exceeded', async () => {
        (mockAuthService.getTrackQuotaInfo as jest.Mock).mockReturnValue({ track_quota: 5, track_quota_floor: 0 });
        (mockLibrary.getTrackCountByOwner as jest.Mock).mockReturnValue(5);

        const response = await attachFile(request(app).post('/upload/tracks'));

        expect(response.status).toBe(413);
        expect(response.body.error).toBe('Track limit exceeded. You have 5/5 tracks. Upgrade your plan to add more.');
        expect(mockScanner.processAudioFile).not.toHaveBeenCalled();
    });

    test('blocks upload using the global listenerTrackCap when no per-user override exists', async () => {
        (mockAuthService.getTrackQuotaInfo as jest.Mock).mockReturnValue({ track_quota: null, track_quota_floor: 0 });
        (mockIdentity.getSetting as jest.Mock).mockReturnValue('10');
        (mockLibrary.getTrackCountByOwner as jest.Mock).mockReturnValue(10);

        const response = await attachFile(request(app).post('/upload/tracks'));

        expect(response.status).toBe(413);
        expect(response.body.error).toBe('Track limit exceeded. You have 10/10 tracks. Upgrade your plan to add more.');
    });

    test('allows upload when under the per-user track quota override', async () => {
        (mockAuthService.getTrackQuotaInfo as jest.Mock).mockReturnValue({ track_quota: 5, track_quota_floor: 0 });
        (mockLibrary.getTrackCountByOwner as jest.Mock).mockReturnValue(2);

        const response = await attachFile(request(app).post('/upload/tracks'));

        expect(response.status).not.toBe(413);
        expect(mockLibrary.getTrackCountByOwner).toHaveBeenCalledWith(55);
    });

    test('skips the track-count check entirely when the effective quota is unlimited (0)', async () => {
        (mockAuthService.getTrackQuotaInfo as jest.Mock).mockReturnValue({ track_quota: 0, track_quota_floor: 0 });

        const response = await attachFile(request(app).post('/upload/tracks'));

        expect(response.status).not.toBe(413);
        expect(mockLibrary.getTrackCountByOwner).not.toHaveBeenCalled();
    });

    test('does not run the quota check when the user cannot be resolved (no authService currentUser)', async () => {
        (mockAuthService.getUserByUsername as jest.Mock).mockReturnValue(undefined);
        (mockAuthService.getTrackQuotaInfo as jest.Mock).mockReturnValue({ track_quota: 1, track_quota_floor: 0 });

        const response = await attachFile(request(app).post('/upload/tracks'));

        expect(response.status).not.toBe(413);
        expect(mockAuthService.getTrackQuotaInfo).not.toHaveBeenCalled();
    });
});
