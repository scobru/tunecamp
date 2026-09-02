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
import { UserRole } from '../../../common/visibility.js';

/**
 * Smallest file music-metadata will read Vorbis comments from: the FLAC magic,
 * a STREAMINFO block, and a VORBIS_COMMENT block. Built here rather than
 * committed as a binary fixture so the tags under test are visible in the test.
 */
function makeFlac(tags: Record<string, string>): Buffer {
    const streamInfo = Buffer.alloc(34);
    streamInfo.writeUInt16BE(4096, 0); // min block size
    streamInfo.writeUInt16BE(4096, 2); // max block size
    // min/max frame size stay zero ("unknown"), then the packed 64-bit field:
    // 20 bits sample rate | 3 bits channels-1 | 5 bits bits-per-sample-1 | 36 bits samples
    const packed = Buffer.alloc(8);
    packed.writeBigUInt64BE((44100n << 44n) | (1n << 41n) | (15n << 36n) | 44100n);
    packed.copy(streamInfo, 10);

    const vendor = Buffer.from('tunecamp-test');
    const comments = Object.entries(tags).map(([k, v]) => Buffer.from(`${k}=${v}`));
    const u32le = (n: number) => {
        const b = Buffer.alloc(4);
        b.writeUInt32LE(n);
        return b;
    };
    const vorbisComment = Buffer.concat([
        u32le(vendor.length),
        vendor,
        u32le(comments.length),
        ...comments.flatMap((c) => [u32le(c.length), c]),
    ]);

    const block = (type: number, payload: Buffer, isLast: boolean) => {
        const header = Buffer.alloc(4);
        header.writeUInt8((isLast ? 0x80 : 0) | type, 0);
        header.writeUIntBE(payload.length, 1, 3);
        return Buffer.concat([header, payload]);
    };

    return Buffer.concat([
        Buffer.from('fLaC'),
        block(0, streamInfo, false),
        block(4, vorbisComment, true),
    ]);
}

const TAGS = {
    TITLE: 'An Eagle in Your Mind',
    ARTIST: 'Boards of Canada',
    ALBUMARTIST: 'Boards of Canada',
    ALBUM: 'Music Has the Right to Children',
    DATE: '1998',
    GENRE: 'IDM',
    TRACKNUMBER: '2',
    DISCNUMBER: '1',
};

const mockDatabase = {
    getAlbumBySlug: jest.fn(),
    getReleaseBySlug: jest.fn(),
} as unknown as DatabaseService;

const mockScanner = {
    processAudioFile: jest.fn(),
} as unknown as ScannerService;

const mockPublishingService = {
    syncRelease: jest.fn().mockImplementation(() => Promise.resolve()),
} as unknown as PublishingService;

const mockAuthService = {
    getUser: jest.fn(),
} as unknown as AuthService;

describe('Upload Routes - POST /upload/inspect', () => {
    let app: express.Express;
    let tempMusicDir: string;
    let flacPath: string;

    beforeEach(async () => {
        jest.clearAllMocks();

        tempMusicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tunecamp-inspect-'));
        flacPath = path.join(tempMusicDir, 'eagle.flac');
        await fs.writeFile(flacPath, makeFlac(TAGS));

        app = express();
        app.use(express.json());
        app.use((req: any, _res, next) => {
            Object.assign(req, {
                userId: 5,
                artistId: 5,
                isRootAdmin: false,
                isAdmin: false,
                isActive: true,
                context: { role: UserRole.NORMAL_USER, userId: 5, artistId: 5, isActive: true },
            });
            next();
        });

        const mockStorageEngine = {
            pathExists: jest.fn().mockResolvedValue(true as never),
            readdir: jest.fn().mockResolvedValue([] as never),
            readFile: jest.fn().mockResolvedValue('' as never),
            remove: jest.fn(),
            move: jest.fn(),
            ensureDir: jest.fn(),
            writeFile: jest.fn(),
        };

        const router = createUploadRoutes({
            database: mockDatabase,
            scannerService: mockScanner,
            musicDir: tempMusicDir,
            publishingService: mockPublishingService,
            storage: mockStorageEngine as any,
            authService: mockAuthService,
        } as any);
        app.use('/upload', router);
    });

    afterEach(async () => {
        await fs.remove(tempMusicDir);
    });

    test('reads the tags out of the uploaded slice', async () => {
        const response = await request(app)
            .post('/upload/inspect')
            .field('size', (await fs.stat(flacPath)).size)
            .attach('head', flacPath);

        expect(response.status).toBe(200);
        expect(response.body.tags).toEqual({
            title: 'An Eagle in Your Mind',
            artist: 'Boards of Canada',
            albumArtist: 'Boards of Canada',
            album: 'Music Has the Right to Children',
            year: 1998,
            genre: 'IDM',
            trackNo: 2,
            discNo: 1,
        });
    }, 30000);

    test('splices the tail back at the declared offset without corrupting the head', async () => {
        const tailPath = path.join(tempMusicDir, 'tail.flac');
        await fs.writeFile(tailPath, Buffer.alloc(16, 0x5a));

        const response = await request(app)
            .post('/upload/inspect')
            .field('size', 5000)
            .attach('head', flacPath)
            .attach('tail', tailPath);

        expect(response.status).toBe(200);
        expect(response.body.tags.title).toBe('An Eagle in Your Mind');
    }, 30000);

    test('ignores a declared size larger than any file the server would accept', async () => {
        const tailPath = path.join(tempMusicDir, 'tail.flac');
        await fs.writeFile(tailPath, Buffer.alloc(16, 0x5a));

        const response = await request(app)
            .post('/upload/inspect')
            .field('size', 64 * 1024 * 1024 * 1024) // 64GB
            .attach('head', flacPath)
            .attach('tail', tailPath);

        expect(response.status).toBe(200);
        expect(response.body.tags.title).toBe('An Eagle in Your Mind');
    }, 30000);

    test('answers with empty tags for a file it cannot read tags from', async () => {
        const emptyPath = path.join(tempMusicDir, 'silence.flac');
        await fs.writeFile(emptyPath, Buffer.alloc(64));

        const response = await request(app)
            .post('/upload/inspect')
            .field('size', 64)
            .attach('head', emptyPath);

        expect(response.status).toBe(200);
        expect(response.body.tags).toEqual({});
    }, 30000);

    test('rejects a non-audio slice', async () => {
        const textPath = path.join(tempMusicDir, 'notes.txt');
        await fs.writeFile(textPath, 'not audio');

        const response = await request(app)
            .post('/upload/inspect')
            .field('size', 9)
            .attach('head', textPath);

        expect(response.status).toBe(400);
    }, 30000);

    test('rejects a request with no slice at all', async () => {
        const response = await request(app).post('/upload/inspect').field('size', 0);

        expect(response.status).toBe(400);
    }, 30000);

    test('leaves no temp slices behind', async () => {
        const before = (await fs.readdir(os.tmpdir())).filter(
            (n) => n.startsWith('head-') || n.startsWith('tail-'),
        );

        await request(app)
            .post('/upload/inspect')
            .field('size', (await fs.stat(flacPath)).size)
            .attach('head', flacPath);

        const after = (await fs.readdir(os.tmpdir())).filter(
            (n) => n.startsWith('head-') || n.startsWith('tail-'),
        );
        expect(after).toEqual(before);
    }, 30000);
});
