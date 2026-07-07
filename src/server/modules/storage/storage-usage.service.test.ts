import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { getInstanceStorage } from './storage-usage.service.js';

describe('storage-usage.service', () => {
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

    describe('getInstanceStorage', () => {
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
});
