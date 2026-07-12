import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../../core/database.js';
import { ReportsRepository } from '../reports.repository.js';
import { AlbumRepository } from '../album.repository.js';
import { ArtistRepository } from '../artist.repository.js';

describe('ReportsRepository', () => {
    let db: any;
    let repo: ReportsRepository;
    let albums: AlbumRepository;
    let artists: ArtistRepository;

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new ReportsRepository(db.db);
        albums = new AlbumRepository(db.db);
        artists = new ArtistRepository(db.db);

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
            expect(row.status).toBe('pending'); // default status
        });
    });

    describe('getReports', () => {
        test('returns all reports with joined data', () => {
            const artistId = artists.create(
                'Test Artist',
            );

            const albumId = albums.create({
                title: 'Test Album',
                slug: 'test-album',
                artist_id: artistId,
            } as any);

            repo.createReport({
                reporter_id: 1,
                reporter_name: 'Test Reporter',
                reporter_email: 'test@example.com',
                release_id: albumId,
                reason: 'copyright',
                details: 'This is a test report'
            });

            const reports = repo.getReports();

            expect(reports).toHaveLength(1);
            expect(reports[0].reporter_name).toBe('Test Reporter');
            expect(reports[0].release_title).toBe('Test Album');
            expect(reports[0].release_slug).toBe('test-album');
            expect(reports[0].artist_name).toBe('Test Artist');
        });

        test('returns multiple reports ordered by created_at DESC', () => {
            const albumId = albums.create({
                title: 'Test Album',
                artist_id: null,
            } as any);

            repo.createReport({
                reporter_id: 1,
                reporter_name: 'Reporter 1',
                reporter_email: 'test1@example.com',
                release_id: albumId,
                reason: 'spam',
                details: 'Report 1'
            });

            // Wait a small bit so created_at time is different. SQLite sometimes goes too fast.
            db.db.prepare("UPDATE reports SET created_at = datetime('now', '-1 day') WHERE reporter_name = 'Reporter 1'").run();

            repo.createReport({
                reporter_id: 1,
                reporter_name: 'Reporter 2',
                reporter_email: 'test2@example.com',
                release_id: albumId,
                reason: 'copyright',
                details: 'Report 2'
            });

            const reports = repo.getReports();
            expect(reports).toHaveLength(2);
            expect(reports[0].reporter_name).toBe('Reporter 2');
            expect(reports[1].reporter_name).toBe('Reporter 1');
        });
    });

    describe('deleteReport', () => {
        test('deletes a report successfully', () => {
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

            // Verify it exists
            let row = db.db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
            expect(row).toBeDefined();

            repo.deleteReport(reportId);

            // Verify it's deleted
            row = db.db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
            expect(row).toBeUndefined();
        });
    });
});
