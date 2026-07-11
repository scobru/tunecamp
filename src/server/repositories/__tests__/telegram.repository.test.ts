import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabase } from '../../core/database.js';
import { TelegramRepository } from '../telegram.repository.js';
import { ArtistRepository } from '../artist.repository.js';
import { AlbumRepository } from '../album.repository.js';
import { TrackRepository } from '../track.repository.js';

describe('TelegramRepository', () => {
    let db: any;
    let repo: TelegramRepository;
    let artistRepo: ArtistRepository;
    let albumRepo: AlbumRepository;
    let trackRepo: TrackRepository;

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new TelegramRepository(db.db);
        artistRepo = new ArtistRepository(db.db);
        albumRepo = new AlbumRepository(db.db);
        trackRepo = new TrackRepository(db.db);
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    describe('getRecentArtists', () => {
        test('returns recent artists ordered by name ASC', () => {
            artistRepo.create('Zebra');
            artistRepo.create('Aardvark');
            artistRepo.create('Monkey');

            const artists = repo.getRecentArtists(2);
            expect(artists).toHaveLength(2);
            expect(artists[0].name).toBe('Aardvark');
            expect(artists[1].name).toBe('Monkey');
        });

        test('respects default limit', () => {
            for(let i=0; i<60; i++) {
                artistRepo.create(`Artist ${i}`);
            }
            const artists = repo.getRecentArtists();
            expect(artists).toHaveLength(50);
        });
    });

    describe('getRecentAlbums', () => {
        test('returns recent albums (is_release=0) with artist name, ordered by id DESC', () => {
            const artistId = artistRepo.create('The Beatles');
            albumRepo.create({ title: 'Abbey Road', artist_id: artistId, date: '2023', cover_path: 'artwork', is_release: false });
            albumRepo.create({ title: 'Let It Be', artist_id: artistId, date: '2023', cover_path: 'artwork', is_release: false });
            albumRepo.create({ title: 'Yellow Submarine', artist_id: artistId, date: '2023', cover_path: 'artwork', is_release: true }); // release, should be excluded

            const albums = repo.getRecentAlbums(10);
            expect(albums).toHaveLength(2);
            // Let It Be was created last
            expect(albums[0].title).toBe('Let It Be');
            expect(albums[0].artist_name).toBe('The Beatles');
            expect(albums[1].title).toBe('Abbey Road');
        });
    });

    describe('getRecentReleases', () => {
        test('returns recent releases with artist name, ordered by id DESC', () => {
            const artistId = artistRepo.create('Daft Punk');
            // Since v_releases and releases views are populated using `is_release=1`, we create regular albums but mark them as releases
            albumRepo.createRelease({ title: 'Discovery', artist_id: artistId, date: '2001', cover_path: 'artwork', status: 'released' });
            albumRepo.createRelease({ title: 'Random Access Memories', artist_id: artistId, date: '2013', cover_path: 'artwork', status: 'released' });
            albumRepo.create({ title: 'Homework', artist_id: artistId, date: '1997', cover_path: 'artwork', is_release: false, status: 'draft' }); // regular album, should be excluded

            // To ensure they appear in the `releases` view they also need status='released'. `albumRepo.create` sets status to 'draft' by default.


            const releases = repo.getRecentReleases(10);
            expect(releases).toHaveLength(2);
            expect(releases[0].title).toBe('Random Access Memories');
            expect(releases[0].artist_name).toBe('Daft Punk');
            expect(releases[1].title).toBe('Discovery');
        });
    });

    describe('getDatabaseStats', () => {
        test('returns correct counts for artists, tracks, albums, releases', () => {
            const artistId = artistRepo.create('Pink Floyd');
            const album1 = albumRepo.create({ title: 'The Dark Side of the Moon', artist_id: artistId, date: '1973', cover_path: 'artwork', is_release: false });
            const release1 = albumRepo.createRelease({ title: 'The Wall', artist_id: artistId, date: '1979', cover_path: 'artwork', status: 'released' });

            trackRepo.create({ title: 'Money', album_id: album1, artist_id: artistId, track_num: 1, duration: 300, file_path: '/path', format: 'mp3', bitrate: 320, sample_rate: 44100, price: 1, price_usdc: 1, price_usdt: 1, currency: 'usd', waveform: 'wave', url: 'url', service: 'service', external_artwork: 'artwork', lyrics: 'lyrics', lossless_path: 'lossless', external_id: 'external', hash: 'hash', fingerprint: 'fingerprint', genre: 'rock', year: 1973, mime_type: 'audio/mpeg', file_size: 5000000, file_hash: 'hash', version: '1.0' });
            trackRepo.create({ title: 'Another Brick in the Wall', album_id: release1, artist_id: artistId, track_num: 1, duration: 200, file_path: '/path2', format: 'mp3', bitrate: 320, sample_rate: 44100, price: 1, price_usdc: 1, price_usdt: 1, currency: 'usd', waveform: 'wave', url: 'url', service: 'service', external_artwork: 'artwork', lyrics: 'lyrics', lossless_path: 'lossless', external_id: 'external', hash: 'hash', fingerprint: 'fingerprint', genre: 'rock', year: 1979, mime_type: 'audio/mpeg', file_size: 4000000, file_hash: 'hash', version: '1.0' });



            const stats = repo.getDatabaseStats();
            expect(stats.artists).toBe(2); // Pink Floyd + @site (created by createDatabase)
            expect(stats.tracks).toBe(2);
            expect(stats.albums).toBe(2); // Releases are also albums
            expect(stats.releases).toBe(1);
        });
    });

    describe('getRecentTracks', () => {
        test('returns recent tracks ordered by id DESC', () => {
            const artistId = artistRepo.create('Muse');
            const albumId = albumRepo.create({ title: 'Absolution', artist_id: artistId, date: '2003', cover_path: 'artwork', is_release: false });

            trackRepo.create({ title: 'Time Is Running Out', album_id: albumId, artist_id: artistId, track_num: 1, duration: 200, file_path: '/path', format: 'mp3', bitrate: 320, sample_rate: 44100, price: 1, price_usdc: 1, price_usdt: 1, currency: 'usd', waveform: 'wave', url: 'url', service: 'service', external_artwork: 'artwork', lyrics: 'lyrics', lossless_path: 'lossless', external_id: 'external', hash: 'hash', fingerprint: 'fingerprint', genre: 'rock', year: 2003, mime_type: 'audio/mpeg', file_size: 4000000, file_hash: 'hash', version: '1.0' });
            trackRepo.create({ title: 'Hysteria', album_id: albumId, artist_id: artistId, track_num: 2, duration: 200, file_path: '/path2', format: 'mp3', bitrate: 320, sample_rate: 44100, price: 1, price_usdc: 1, price_usdt: 1, currency: 'usd', waveform: 'wave', url: 'url', service: 'service', external_artwork: 'artwork', lyrics: 'lyrics', lossless_path: 'lossless', external_id: 'external', hash: 'hash', fingerprint: 'fingerprint', genre: 'rock', year: 2003, mime_type: 'audio/mpeg', file_size: 4000000, file_hash: 'hash', version: '1.0' });

            // Set explicit artist_names so track can find them. trackRepo.create doesn't do this
            db.db.prepare("UPDATE tracks SET artist_name = 'Muse'").run();

            const tracks = repo.getRecentTracks(10);
            expect(tracks).toHaveLength(2);
            expect(tracks[0].title).toBe('Hysteria');
            expect(tracks[0].artist_name).toBe('Muse');
            expect(tracks[1].title).toBe('Time Is Running Out');
        });
    });

    describe('searchReleaseTracks', () => {
        test('finds tracks by title, album title or artist name', () => {
            const artistId = artistRepo.create('Gorillaz');
            const releaseId = albumRepo.createRelease({ title: 'Demon Days', artist_id: artistId, date: '2005', cover_path: 'cover.jpg', status: 'released' });


            trackRepo.create({ title: 'Feel Good Inc.', album_id: releaseId, artist_id: artistId, track_num: 1, duration: 200, file_path: '/path', format: 'mp3', bitrate: 320, sample_rate: 44100, price: 1, price_usdc: 1, price_usdt: 1, currency: 'usd', waveform: 'wave', url: 'url', service: 'service', external_artwork: 'artwork', lyrics: 'lyrics', lossless_path: 'lossless', external_id: 'external', hash: 'hash', fingerprint: 'fingerprint', genre: 'rock', year: 2005, mime_type: 'audio/mpeg', file_size: 4000000, file_hash: 'hash', version: '1.0' });
            trackRepo.create({ title: 'Dare', album_id: releaseId, artist_id: artistId, track_num: 2, duration: 200, file_path: '/path2', format: 'mp3', bitrate: 320, sample_rate: 44100, price: 1, price_usdc: 1, price_usdt: 1, currency: 'usd', waveform: 'wave', url: 'url', service: 'service', external_artwork: 'artwork', lyrics: 'lyrics', lossless_path: 'lossless', external_id: 'external', hash: 'hash', fingerprint: 'fingerprint', genre: 'rock', year: 2005, mime_type: 'audio/mpeg', file_size: 4000000, file_hash: 'hash', version: '1.0' });

            db.db.prepare("UPDATE tracks SET artist_name = 'Gorillaz'").run();

            // Search by track title
            let results = repo.searchReleaseTracks('Feel Good');
            expect(results).toHaveLength(1);
            expect(results[0].title).toBe('Feel Good Inc.');

            // Search by artist name
            results = repo.searchReleaseTracks('Gorillaz');
            expect(results).toHaveLength(2);

            // Search by album title
            results = repo.searchReleaseTracks('Demon Days');
            expect(results).toHaveLength(2);
            expect(results[0].album_title).toBe('Demon Days');
            expect(results[0].artist_name).toBe('Gorillaz');
            expect(results[0].album_cover).toBe('cover.jpg');
        });
    });
});
