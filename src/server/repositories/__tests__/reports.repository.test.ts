import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../../core/database.js';
import { ReportsRepository } from '../reports.repository.js';
import { AlbumRepository } from '../album.repository.js';

describe('ReportsRepository', () => {
    let db: any;
    let repo: ReportsRepository;
    let albums: AlbumRepository;

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new ReportsRepository(db.db);
        albums = new AlbumRepository(db.db);

        // Add a mock admin user to satisfy reporter_id FK
        db.db.prepare(`INSERT INTO admin (id, username, password_hash) VALUES (1, 'testadmin', 'hash')`).run();
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    describe('createReport', () => {
        test('creates a report successfully', () => {
            const albumId = albums.create({
                title: 'Test Album',
                artist_id: null,
            } as any);

            const reportId = repo.createReport({
                reporter_id: 1,
                reporter_name: 'Test Reporter',
                reporter_email: 'test@example.com',
                release_id: albumId,
                reason: 'copyright',
                details: 'This is a test report'
            });

            expect(reportId).toBeGreaterThan(0);

            // Verify inserted data
            const row = db.db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as any;
            expect(row.reporter_id).toBe(1);
            expect(row.reporter_name).toBe('Test Reporter');
            expect(row.reporter_email).toBe('test@example.com');
            expect(row.release_id).toBe(albumId);
            expect(row.reason).toBe('copyright');
            expect(row.details).toBe('This is a test report');
        });
    });
});
