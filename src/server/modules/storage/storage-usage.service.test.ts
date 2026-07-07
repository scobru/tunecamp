import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { recomputeFileSizes } from './storage-usage.service.js';

describe('recomputeFileSizes', () => {
    let db: Database.Database;
    let musicDir: string;

    beforeEach(async () => {
        db = new Database(':memory:');
        db.exec(`
            CREATE TABLE tracks (
                id INTEGER PRIMARY KEY,
                file_path TEXT,
                lossless_path TEXT,
                file_size INTEGER
            );
        `);

        musicDir = path.join(os.tmpdir(), "tc-storage-usage-" + crypto.randomBytes(6).toString('hex'));
        await fs.ensureDir(musicDir);
    });

    afterEach(async () => {
        db.close();
        await fs.remove(musicDir);
    });

    test('skips tracks with missing files (missing increments)', async () => {
        db.prepare("INSERT INTO tracks (id, file_path, file_size) VALUES (1, 'missing.mp3', 50)").run();

        const result = recomputeFileSizes(db, musicDir);

        expect(result).toEqual({ scanned: 1, updated: 0, missing: 1 });
        const row = db.prepare("SELECT file_size FROM tracks WHERE id = 1").get() as any;
        expect(row.file_size).toBe(50); // Unchanged
    });

    test('updates tracks when file_size is different on disk', async () => {
        db.prepare("INSERT INTO tracks (id, file_path, file_size) VALUES (1, 'song.mp3', 0)").run();

        const fileContent = Buffer.alloc(150);
        await fs.writeFile(path.join(musicDir, 'song.mp3'), fileContent);

        const result = recomputeFileSizes(db, musicDir);

        expect(result).toEqual({ scanned: 1, updated: 1, missing: 0 });
        const row = db.prepare("SELECT file_size FROM tracks WHERE id = 1").get() as any;
        expect(row.file_size).toBe(150); // Updated
    });

    test('does not update tracks when file_size matches on disk', async () => {
        db.prepare("INSERT INTO tracks (id, file_path, file_size) VALUES (1, 'song.mp3', 150)").run();

        const fileContent = Buffer.alloc(150);
        await fs.writeFile(path.join(musicDir, 'song.mp3'), fileContent);

        const result = recomputeFileSizes(db, musicDir);

        expect(result).toEqual({ scanned: 1, updated: 0, missing: 0 });
        const row = db.prepare("SELECT file_size FROM tracks WHERE id = 1").get() as any;
        expect(row.file_size).toBe(150); // Unchanged
    });

    test('combines sizes from file_path and lossless_path', async () => {
        db.prepare("INSERT INTO tracks (id, file_path, lossless_path, file_size) VALUES (1, 'song.mp3', 'song.flac', 0)").run();

        await fs.writeFile(path.join(musicDir, 'song.mp3'), Buffer.alloc(100));
        await fs.writeFile(path.join(musicDir, 'song.flac'), Buffer.alloc(300));

        const result = recomputeFileSizes(db, musicDir);

        expect(result).toEqual({ scanned: 1, updated: 1, missing: 0 });
        const row = db.prepare("SELECT file_size FROM tracks WHERE id = 1").get() as any;
        expect(row.file_size).toBe(400); // Updated to sum of both
    });

    test('handles case where file_path is missing but lossless_path exists', async () => {
        db.prepare("INSERT INTO tracks (id, file_path, lossless_path, file_size) VALUES (1, 'missing.mp3', 'song.flac', 0)").run();

        await fs.writeFile(path.join(musicDir, 'song.flac'), Buffer.alloc(300));

        const result = recomputeFileSizes(db, musicDir);

        expect(result).toEqual({ scanned: 1, updated: 1, missing: 0 });
        const row = db.prepare("SELECT file_size FROM tracks WHERE id = 1").get() as any;
        expect(row.file_size).toBe(300); // Updated to sum of both
    });
});
