import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../../core/database.js';
import { recomputeUserStorage } from './storage-usage.service.js';

describe('storage-usage.service', () => {
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

    describe('recomputeUserStorage', () => {
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
});
