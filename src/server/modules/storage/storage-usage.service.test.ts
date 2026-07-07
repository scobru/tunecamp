import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { createDatabase } from '../../core/database.js';
import { recomputeFileSizes, getInstanceStorage, recomputeUserStorage } from './storage-usage.service.js';

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

describe('getInstanceStorage', () => {
    let db: DatabaseType;
    let tempDir: string;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec(`
            CREATE TABLE admin (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT,
                role TEXT,
                storage_quota INTEGER,
                storage_used INTEGER
            );
            CREATE TABLE tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_id INTEGER,
                file_path TEXT,
                lossless_path TEXT,
                file_size INTEGER
            );
        `);
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'music-'));
    });

    afterEach(() => {
        db.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
        jest.restoreAllMocks();
    });

    test('computes correct overall instance storage with missing directory', async () => {
        db.prepare('INSERT INTO admin (username, role, storage_quota) VALUES (?, ?, ?)').run('user1', 'user', 1000);
        const nonExistentDir = path.join(tempDir, 'does-not-exist');
        const result = await getInstanceStorage(db, nonExistentDir);

        expect(result.diskUsed).toBe(0);
        expect(result.dbTotal).toBe(0);
        expect(result.quotaAllocated).toBe(1000);
        expect(result.trackCount).toBe(0);
        expect(result.byUser.length).toBe(1);
    });

    test('computes correct overall instance storage with populated db and files', async () => {
        db.prepare('INSERT INTO admin (username, role, storage_quota) VALUES (?, ?, ?)').run('user1', 'user', 1000);
        db.prepare('INSERT INTO admin (username, role, storage_quota) VALUES (?, ?, ?)').run('user2', 'user', 0); // unlimited

        db.prepare('INSERT INTO tracks (owner_id, file_size) VALUES (?, ?)').run(1, 100);
        db.prepare('INSERT INTO tracks (owner_id, file_size) VALUES (?, ?)').run(1, 200);
        db.prepare('INSERT INTO tracks (owner_id, file_size) VALUES (?, ?)').run(2, 500);

        // Create files
        fs.writeFileSync(path.join(tempDir, 'file1.mp3'), '12345'); // 5 bytes
        fs.writeFileSync(path.join(tempDir, 'file2.mp3'), '1234567890'); // 10 bytes
        fs.mkdirSync(path.join(tempDir, 'subdir'));
        fs.writeFileSync(path.join(tempDir, 'subdir', 'file3.mp3'), '123456789012345'); // 15 bytes

        const result = await getInstanceStorage(db, tempDir);

        expect(result.diskUsed).toBe(30);
        expect(result.dbTotal).toBe(800);
        expect(result.quotaAllocated).toBe(1000);
        expect(result.trackCount).toBe(3);

        expect(result.byUser).toHaveLength(2);
        // Results should be ordered by 'used' DESC
        expect(result.byUser[0]).toEqual({
            id: 2,
            username: 'user2',
            role: 'user',
            quota: 0,
            used: 500,
            trackCount: 1
        });
        expect(result.byUser[1]).toEqual({
            id: 1,
            username: 'user1',
            role: 'user',
            quota: 1000,
            used: 300,
            trackCount: 2
        });
    });

    test('handles unreadable entries gracefully during disk measurement by mocking fs.stat', async () => {
        // Mock fs.stat to throw an error, simulating an unreadable file
        const originalStat = fs.stat;
        const statSpy = jest.spyOn(fs, 'stat').mockImplementation(async (pathPath: fs.PathLike, opts?: fs.StatOptions) => {
            const pathStr = pathPath.toString();
            if (pathStr.includes('bad.mp3')) {
                throw new Error('EACCES: permission denied');
            }
            return originalStat(pathPath, opts);
        });

        db.prepare('INSERT INTO admin (username, role, storage_quota) VALUES (?, ?, ?)').run('user1', 'admin', 500);

        fs.writeFileSync(path.join(tempDir, 'good.mp3'), '12345'); // 5 bytes
        fs.writeFileSync(path.join(tempDir, 'bad.mp3'), '12345');

        const result = await getInstanceStorage(db, tempDir);

        expect(result.diskUsed).toBe(5); // Only good.mp3 is counted
        expect(result.quotaAllocated).toBe(500);
    });
});

describe('recomputeUserStorage', () => {
    let db: any;

    beforeEach(() => {
        db = createDatabase(':memory:');

        db.db.prepare(`
            INSERT INTO admin (id, username, password_hash, role, storage_quota)
            VALUES (1, 'admin', 'hash', 'root_admin', 0)
        `).run();
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    test('updates admin.storage_used from tracks.file_size', () => {
        db.db.prepare(`
            INSERT INTO tracks (id, title, owner_id, file_size)
            VALUES (1, 'Track 1', 1, 1024), (2, 'Track 2', 1, 2048)
        `).run();

        recomputeUserStorage(db.db);

        const row = db.db.prepare('SELECT storage_used FROM admin WHERE id = 1').get();
        expect(row.storage_used).toBe(3072);
    });

    test('sets admin.storage_used to 0 when user has no tracks', () => {
         recomputeUserStorage(db.db);

         const row = db.db.prepare('SELECT storage_used FROM admin WHERE id = 1').get();
         expect(row.storage_used).toBe(0);
    });

    test('handles multiple users', () => {
        db.db.prepare(`
            INSERT INTO admin (id, username, password_hash, role, storage_quota)
            VALUES (2, 'user2', 'hash', 'user', 0)
        `).run();

        db.db.prepare(`
            INSERT INTO tracks (id, title, owner_id, file_size)
            VALUES
              (1, 'Track 1', 1, 100),
              (2, 'Track 2', 2, 200),
              (3, 'Track 3', 2, 300)
        `).run();

        recomputeUserStorage(db.db);

        const row1 = db.db.prepare('SELECT storage_used FROM admin WHERE id = 1').get();
        expect(row1.storage_used).toBe(100);

        const row2 = db.db.prepare('SELECT storage_used FROM admin WHERE id = 2').get();
        expect(row2.storage_used).toBe(500);
    });

    test('skips tracks with null file_size', () => {
         db.db.prepare(`
             INSERT INTO tracks (id, title, owner_id, file_size)
             VALUES
               (1, 'Track 1', 1, 100),
               (2, 'Track 2', 1, NULL)
         `).run();

         recomputeUserStorage(db.db);

         const row = db.db.prepare('SELECT storage_used FROM admin WHERE id = 1').get();
         expect(row.storage_used).toBe(100);
    });
});
