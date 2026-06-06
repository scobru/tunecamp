import express from 'express';
import request from 'supertest';
import fs from 'fs-extra';
import path from 'path';
import { createBackupRoutes } from '../backup.js';
import type { DatabaseService } from '../../../core/database.js';
import type { ServerConfig } from '../../../core/config.js';
import { jest } from '@jest/globals';

// Mocks
const mockDatabase = {
    db: {
        prepare: jest.fn().mockReturnValue({ run: jest.fn() }),
        close: jest.fn(),
    },
    getArtists: jest.fn().mockReturnValue([]),
    getSetting: jest.fn(),
} as unknown as DatabaseService;

const mockConfig = {
    dbPath: 'test.db',
    musicDir: 'test_music',
} as unknown as ServerConfig;

const mockRestartFn = jest.fn();

describe('Backup Routes (Chunked Upload)', () => {
    let app: express.Express;
    const uploadId = 'test_upload_123';
    const tempDir = 'uploads';

    beforeAll(async () => {
        await fs.ensureDir(tempDir);
        // Create dummy files for restore target
        await fs.ensureDir(mockConfig.musicDir);
        await fs.writeFile(mockConfig.dbPath, 'dummy db content');
    });

    afterAll(async () => {
        // Wait for background async processes to finish and release file handles
        await new Promise(r => setTimeout(r, 2000));
        try { await fs.remove(tempDir); } catch (e) {}
        try { await fs.remove(mockConfig.musicDir); } catch (e) {}
        try { await fs.remove(mockConfig.dbPath); } catch (e) {}
        try { if (fs.existsSync('test.db.backup')) fs.unlinkSync('test.db.backup'); } catch (e) {}
    });

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(express.json()); // needed for /restore-chunked body

        // Mock auth middleware (req.artistId undefined = root admin)
        app.use((req: any, res, next) => {
            req.isRootAdmin = true;
            next();
        });

        const router = createBackupRoutes({
            database: mockDatabase,
            config: mockConfig
        } as any, mockRestartFn);
        app.use('/backup', router);
    });

    test('should upload chunks as separate parts', async () => {
        const chunk1 = Buffer.from('Hello ');
        const chunk2 = Buffer.from('World!');

        // Upload Chunk 1
        const res1 = await request(app)
            .post('/backup/chunk')
            .field('uploadId', uploadId)
            .field('chunkIndex', 0)
            .attach('chunk', chunk1, 'chunk1.bin');

        expect(res1.status).toBe(200);
        expect(res1.body.success).toBe(true);

        // Verify part 0 exists
        const part0Path = path.join(tempDir, `temp_${uploadId}_part_0`);
        expect(await fs.pathExists(part0Path)).toBe(true);
        expect((await fs.readFile(part0Path)).toString()).toBe('Hello ');

        // Upload Chunk 2
        const res2 = await request(app)
            .post('/backup/chunk')
            .field('uploadId', uploadId)
            .field('chunkIndex', 1)
            .attach('chunk', chunk2, 'chunk2.bin');

        expect(res2.status).toBe(200);

        // Verify part 1 exists
        const part1Path = path.join(tempDir, `temp_${uploadId}_part_1`);
        expect(await fs.pathExists(part1Path)).toBe(true);
        expect((await fs.readFile(part1Path)).toString()).toBe('World!');
    }, 30000);

    test('should assemble and finalize chunked upload', async () => {
        // Prepare temp parts
        const part0Path = path.join(tempDir, `temp_${uploadId}_part_0`);
        const part1Path = path.join(tempDir, `temp_${uploadId}_part_1`);

        await fs.writeFile(part0Path, 'Dummy Zip Part 1');
        await fs.writeFile(part1Path, 'Dummy Zip Part 2');

        // Call restore-chunked
        const res = await request(app)
            .post('/backup/restore-chunked')
            .send({ uploadId });

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('Restore started');

        // Allow some time for async assembly (using polling)
        let retries = 50;
        while (retries > 0) {
            const p0 = await fs.pathExists(part0Path);
            const p1 = await fs.pathExists(part1Path);
            if (!p0 && !p1) break;
            await new Promise(r => setTimeout(r, 100));
            retries--;
        }
        
        // Check parts are gone
        expect(await fs.pathExists(part0Path)).toBe(false);
        expect(await fs.pathExists(part1Path)).toBe(false);

        // Final zip might be gone if restore failed (invalid zip), which is expected for dummy content
    }, 30000);
});


