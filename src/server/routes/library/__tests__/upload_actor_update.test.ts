import { createUploadRoutes } from '../upload.js';
import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { UserRole } from '../../../common/visibility.js';

/**
 * A profile image replaced here is the old one on Mastodon until an actor
 * `Update` says otherwise: remote servers cache a remote actor's icon, header,
 * name and bio and refresh them on that activity alone. These uploads used to
 * write the file, update the row and tell nobody.
 */

const mockLibrary = {
    getArtist: jest.fn(),
    updateArtist: jest.fn(),
    updateArtistBanner: jest.fn(),
    isArtistLinkedToUser: jest.fn().mockReturnValue(true),
};

const mockApService = {
    broadcastActorUpdate: jest.fn<any>().mockResolvedValue({ inboxes: 2 }),
};

describe('Upload Routes - actor Update on profile change', () => {
    let app: express.Express;
    let tempMusicDir: string;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockLibrary.isArtistLinkedToUser.mockReturnValue(true);
        mockApService.broadcastActorUpdate.mockResolvedValue({ inboxes: 2 } as never);
        mockLibrary.getArtist.mockReturnValue({ id: 7, name: 'Sudo Records', bio: 'bio', links: null });

        tempMusicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tunecamp-test-actor-'));
        await fs.ensureDir(path.join(tempMusicDir, 'assets'));

        app = express();
        app.use(express.json());
        app.use((req: any, res, next) => {
            req.isAdmin = true;
            req.isRootAdmin = true;
            req.isActive = true;
            req.userId = 1;
            req.artistId = 7;
            req.username = 'admin';
            req.context = { role: UserRole.ROOT_ADMIN, userId: 1, artistId: 7, isActive: true };
            next();
        });

        const mockStorageEngine = {
            remove: jest.fn<any>().mockResolvedValue(undefined),
            pathExists: jest.fn<any>().mockResolvedValue(false),
            writeFile: jest.fn<any>().mockResolvedValue(undefined),
            ensureDir: jest.fn<any>().mockResolvedValue(undefined),
            move: jest.fn<any>().mockResolvedValue(undefined),
        };

        const router = createUploadRoutes({
            database: {} as any,
            scannerService: { processAudioFile: jest.fn() } as any,
            musicDir: tempMusicDir,
            publishingService: {} as any,
            storage: mockStorageEngine as any,
            authService: { getUserByUsername: jest.fn(), getStorageInfo: jest.fn() } as any,
            identity: { getSetting: jest.fn() } as any,
            library: mockLibrary as any,
            apService: mockApService as any,
        } as any);
        app.use('/upload', router);
    });

    afterEach(async () => {
        await fs.remove(tempMusicDir);
    });

    const imageAt = async (name: string) => {
        const p = path.join(tempMusicDir, name);
        await fs.writeFile(p, 'fake image bytes');
        return p;
    };

    test('announces an actor Update after an avatar upload', async () => {
        const response = await request(app)
            .post('/upload/avatar')
            .field('artistId', '7')
            .attach('file', await imageAt('avatar.jpg'));

        expect(response.status).toBe(200);
        expect(mockLibrary.updateArtist).toHaveBeenCalled();
        expect(mockApService.broadcastActorUpdate).toHaveBeenCalledWith(7);
    });

    test('announces an actor Update after a banner upload', async () => {
        const response = await request(app)
            .post('/upload/artist-banner')
            .field('artistId', '7')
            .attach('file', await imageAt('banner.jpg'));

        expect(response.status).toBe(200);
        expect(mockLibrary.updateArtistBanner).toHaveBeenCalled();
        expect(mockApService.broadcastActorUpdate).toHaveBeenCalledWith(7);
    });

    test('an upload for an artist that does not exist announces nothing', async () => {
        mockLibrary.getArtist.mockReturnValue(undefined);

        await request(app)
            .post('/upload/avatar')
            .field('artistId', '7')
            .attach('file', await imageAt('avatar.jpg'));

        expect(mockApService.broadcastActorUpdate).not.toHaveBeenCalled();
    });

    test('a failing broadcast does not fail the upload the artist just made', async () => {
        mockApService.broadcastActorUpdate.mockRejectedValue(new Error('every inbox is down') as never);

        const response = await request(app)
            .post('/upload/avatar')
            .field('artistId', '7')
            .attach('file', await imageAt('avatar.jpg'));

        expect(response.status).toBe(200);
    });
});
