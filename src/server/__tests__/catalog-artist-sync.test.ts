import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createDatabase } from '../core/database.js';
import { CatalogService } from '../modules/catalog/catalog.service.js';

describe('Catalog Track Artist Update Synchronization', () => {
    let db: any;
    let catalogService: CatalogService;

    beforeEach(async () => {
        db = createDatabase(':memory:');
        
        // Mock all dependencies other than database
        const mockPublishing: any = { syncRelease: (jest.fn() as any).mockResolvedValue(undefined) };
        const mockZendb: any = {};
        const mockStorage: any = {};
        const mockFingerprinting: any = {};
        const mockOpenRouter: any = {};
        const mockMetadataService: any = { syncPhysicalTags: (jest.fn() as any).mockResolvedValue(undefined) };

        catalogService = new CatalogService(
            db,
            mockPublishing,
            mockZendb,
            mockStorage,
            'musicDir',
            mockFingerprinting,
            mockOpenRouter,
            mockMetadataService
        );
    });

    afterEach(async () => {
        if (db && db.db) db.db.close();
    });

    test('manual update should work directly on tracks table', () => {
        const artistId1 = db.createArtist('Artist One');
        const artistId2 = db.createArtist('Artist Two');
        const adminRes = db.db.prepare("INSERT INTO admin (username, password_hash) VALUES (?, ?)").run('admin', 'hash');
        const adminId = Number(adminRes.lastInsertRowid);

        const trackId = db.createTrack({
            title: 'Test Track',
            album_id: null,
            artist_id: artistId1,
            owner_id: adminId,
            artist_name: 'Artist One',
            track_num: 1,
            duration: 120,
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

        // Verify initial state of track
        let track = db.getTrack(trackId);
        expect(track.artist_id).toBe(artistId1);

        // Manually update
        db.db.prepare("UPDATE tracks SET artist_id = ?, artist_name = ? WHERE id = ?").run(artistId2, 'Artist Two', trackId);

        let trackAfter = db.getTrack(trackId);
        console.log("MANUAL UPDATE RESULT FROM DB:", JSON.stringify(trackAfter, null, 2));
        expect(trackAfter.artist_id).toBe(artistId2);
        expect(trackAfter.artist_name).toBe('Artist Two');
    });

    test('updateTrack should synchronize track artist_name when linking a track to a different artist by ID', async () => {
        // 1. Create two artists in database
        const artistId1 = db.createArtist('Artist One');
        const artistId2 = db.createArtist('Artist Two');

        // 2. Create an admin user to own the track
        const adminRes = db.db.prepare("INSERT INTO admin (username, password_hash) VALUES (?, ?)").run('admin', 'hash');
        const adminId = Number(adminRes.lastInsertRowid);

        // 3. Create a track linked to Artist One
        const trackId = db.createTrack({
            title: 'Test Track',
            album_id: null,
            artist_id: artistId1,
            owner_id: adminId,
            artist_name: 'Artist One',
            track_num: 1,
            duration: 120,
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

        // Verify initial state of track
        let track = db.getTrack(trackId);
        expect(track.artist_id).toBe(artistId1);
        expect(track.artist_name).toBe('Artist One');

        // 4. Update the track to link to Artist Two, providing ONLY artistId, leaving artist name undefined (frontend scenario)
        const updated = await catalogService.updateTrack(
            trackId,
            { artistId: String(artistId2) }
        );

        // Verify track is successfully updated
        expect(updated).toBeDefined();
        
        // 5. Fetch from database to verify persistence of both artist_id and artist_name
        const dbTrack = db.getTrack(trackId);
        expect(dbTrack.artist_id).toBe(artistId2);
        expect(dbTrack.artist_name).toBe('Artist Two'); // Verify that the artist_name synced successfully!
    });
});
