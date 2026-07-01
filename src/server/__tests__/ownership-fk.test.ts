import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../core/database.js';

describe('Ownership Foreign Key Verification', () => {
    let db: any;

    beforeEach(async () => {
        db = createDatabase(':memory:');
    });

    test('track_ownership and album_ownership should strictly enforce foreign key on admin(id)', () => {
        const adminRes = db.db.prepare("INSERT INTO admin (username, password_hash) VALUES (?, ?)").run('admin_fk_test', 'hash');
        const adminId = Number(adminRes.lastInsertRowid);
        const artistId = db.createArtist('Test Artist FK');

        const trackId = db.createTrack({
            title: 'Test Track FK',
            album_id: null,
            artist_id: artistId,
            owner_id: adminId,
            track_num: 1,
            duration: 100,
            file_path: 'tracks/test.mp3',
            format: 'mp3',
            bitrate: 320,
            sample_rate: 44100,
            price: 0,
            currency: 'ETH',
            lossless_path: null,
            waveform: null,
            hash: 'hash'
        });

        // Insert valid ownership
        db.db.prepare("INSERT OR IGNORE INTO track_ownership (track_id, owner_id) VALUES (?, ?)").run(trackId, adminId);

        // Attempt to insert invalid ownership
        let trackFkError = null;
        try {
            db.db.prepare("INSERT INTO track_ownership (track_id, owner_id) VALUES (?, ?)").run(trackId, 999999);
        } catch (e) {
            trackFkError = e;
        }
        expect(trackFkError).not.toBeNull();
        expect(trackFkError.message).toMatch(/FOREIGN KEY constraint failed/);

        const albumId = db.createAlbum({
            title: 'Test Album FK',
            slug: 'test-album-fk',
            artist_id: artistId,
            owner_id: adminId,
            date: '2023-01-01',
            cover_path: null,
            genre: 'Test',
            description: '',
            type: 'album',
            year: 2023,
            download: null,
            price: 0,
            price_usdc: 0,
            currency: 'ETH',
            external_links: null,
            is_public: false,
            visibility: 'private',
            is_release: false,
            published_at: null,
            published_to_gundb: false,
            published_to_ap: false,
            license: null,
            status: 'draft',
            use_nft: true
        });

        // Insert valid ownership
        db.db.prepare("INSERT OR IGNORE INTO album_ownership (album_id, owner_id) VALUES (?, ?)").run(albumId, adminId);

        // Attempt to insert invalid ownership
        let albumFkError = null;
        try {
            db.db.prepare("INSERT INTO album_ownership (album_id, owner_id) VALUES (?, ?)").run(albumId, 999999);
        } catch (e) {
            albumFkError = e;
        }
        expect(albumFkError).not.toBeNull();
        expect(albumFkError.message).toMatch(/FOREIGN KEY constraint failed/);
    });

    afterEach(async () => {
        if (db && db.db) db.db.close();
    });

    test('Creating a track with owner_id should not fail even if admin.id is not an artist.id', () => {
        // 1. Create an admin user
        const adminRes = db.db.prepare("INSERT INTO admin (username, password_hash) VALUES (?, ?)").run('admin', 'hash');
        const adminId = Number(adminRes.lastInsertRowid);

        // 2. Create an artist
        const artistId = db.createArtist('Test Artist');
        
        // 3. Ensure adminId is NOT in artists table (unless by coincidence)
        // If we want to be sure, we can check.
        const artist = db.getArtist(adminId);
        if (artist) {
             // If by coincidence it exists, let's use a higher ID for admin
             db.db.prepare("UPDATE admin SET id = 999 WHERE id = ?").run(adminId);
             // We need to re-fetch the ID but we can just use 999
        }
        const finalAdminId = artist ? 999 : adminId;

        // 4. Create a track with finalAdminId as owner_id
        // This should fail if the issue exists because track_ownership.owner_id REFERENCES artists(id)
        
        let error: any = null;
        try {
            db.createTrack({
                title: 'Test Track',
                album_id: null,
                artist_id: artistId,
                owner_id: finalAdminId,
                track_num: 1,
                duration: 100,
                file_path: 'tracks/test.mp3',
                format: 'mp3',
                bitrate: 320,
                sample_rate: 44100,
                price: 0,
                currency: 'ETH',
                lossless_path: null,
                waveform: null,
                hash: 'hash'
            });
        } catch (e) {
            error = e;
        }

        expect(error).toBeNull();
    });

    test('Creating an album with owner_id should not fail even if admin.id is not an artist.id', () => {
        const adminRes = db.db.prepare("INSERT INTO admin (username, password_hash) VALUES (?, ?)").run('admin2', 'hash');
        const adminId = Number(adminRes.lastInsertRowid);
        const artistId = db.createArtist('Test Artist 2');
        
        // Use a definitely non-existent artist ID
        const finalAdminId = 888;
        db.db.prepare("UPDATE admin SET id = ? WHERE id = ?").run(finalAdminId, adminId);

        let error: any = null;
        try {
            db.createAlbum({
                title: 'Test Album',
                slug: 'test-album',
                artist_id: artistId,
                owner_id: finalAdminId,
                date: '2023-01-01',
                cover_path: null,
                genre: 'Test',
                description: '',
                type: 'album',
                year: 2023,
                download: null,
                price: 0,
                price_usdc: 0,
                currency: 'ETH',
                external_links: null,
                is_public: false,
                visibility: 'private',
                is_release: false,
                published_at: null,
                published_to_gundb: false,
                published_to_ap: false,
                license: null,
                status: 'draft',
                use_nft: true
            });
        } catch (e) {
            error = e;
        }

        expect(error).toBeNull();
    });
});
