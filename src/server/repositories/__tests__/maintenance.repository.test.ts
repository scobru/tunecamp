import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../../core/database.js';
import { MaintenanceRepository } from '../maintenance.repository.js';
import { ArtistRepository } from '../artist.repository.js';
import { TrackRepository } from '../track.repository.js';
import { AlbumRepository } from '../album.repository.js';

describe('MaintenanceRepository', () => {
    let db: any;
    let repo: MaintenanceRepository;
    let artists: ArtistRepository;
    let tracks: TrackRepository;
    let albums: AlbumRepository;

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new MaintenanceRepository(db.db);
        artists = new ArtistRepository(db.db);
        tracks = new TrackRepository(db.db);
        albums = new AlbumRepository(db.db);
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    describe('repairArtistAssociations', () => {
        test('updates tracks and albums with correct artist_id when artist_name matches', () => {
            const artistId1 = artists.create('The Beatles');
            const artistId2 = artists.create('Pink Floyd');

            const track1Id = tracks.create({
                title: 'Hey Jude',
                artist_name: 'The Beatles',
                artist_id: null,
            } as any);

            const track2Id = tracks.create({
                title: 'Money',
                artist_name: 'pink floyd', // test collation NOCASE
                artist_id: null,
            } as any);

            const album1Id = albums.create({
                title: '1',
                album_artist: 'The Beatles',
                artist_id: null,
            } as any);

            const album2Id = albums.create({
                title: 'Dark Side of the Moon',
                album_artist: 'Pink Floyd',
                artist_id: null,
            } as any);

            const result = repo.repairArtistAssociations();
            expect(result.trackFixCount).toBe(2);
            expect(result.albumFixByNameCount).toBe(2);

            const t1 = tracks.getById(track1Id);
            expect(t1?.artist_id).toBe(artistId1);

            const t2 = tracks.getById(track2Id);
            expect(t2?.artist_id).toBe(artistId2);

            const a1 = albums.getById(album1Id);
            expect(a1?.artist_id).toBe(artistId1);

            const a2 = albums.getById(album2Id);
            expect(a2?.artist_id).toBe(artistId2);
        });

        test('ignores tracks and albums that already have artist_id', () => {
            const artistId1 = artists.create('The Beatles');

            const track1Id = tracks.create({
                title: 'Hey Jude',
                artist_name: 'The Beatles',
                artist_id: artistId1,
            } as any);

            const album1Id = albums.create({
                title: '1',
                album_artist: 'The Beatles',
                artist_id: artistId1,
            } as any);

            const result = repo.repairArtistAssociations();
            expect(result.trackFixCount).toBe(0);
            expect(result.albumFixByNameCount).toBe(0);

            const t1 = tracks.getById(track1Id);
            expect(t1?.artist_id).toBe(artistId1);

            const a1 = albums.getById(album1Id);
            expect(a1?.artist_id).toBe(artistId1);
        });

        test('ignores tracks and albums that do not have matching artist', () => {
            const track1Id = tracks.create({
                title: 'Hey Jude',
                artist_name: 'The Beatles',
                artist_id: null,
            } as any);

            const album1Id = albums.create({
                title: '1',
                album_artist: 'The Beatles',
                artist_id: null,
            } as any);

            const result = repo.repairArtistAssociations();
            expect(result.trackFixCount).toBe(0);
            expect(result.albumFixByNameCount).toBe(0);

            const t1 = tracks.getById(track1Id);
            expect(t1?.artist_id).toBeNull();

            const a1 = albums.getById(album1Id);
            expect(a1?.artist_id).toBeNull();
        });
    });
});
