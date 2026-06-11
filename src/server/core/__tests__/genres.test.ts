import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from '@jest/globals';
import { createDatabase } from '../database.js';
import { VisibilityProfile } from '../../common/visibility.js';

describe('Library Manager: Case-Insensitive Genre Deduplication', () => {
    let db: any;
    let logSpy: any;
    let warnSpy: any;

    beforeAll(() => {
        // Suppress migration/insert chatter for a clean test run.
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterAll(() => {
        logSpy.mockRestore();
        warnSpy.mockRestore();
    });

    beforeEach(() => {
        db = createDatabase(':memory:');
    });

    afterEach(() => {
        if (db && db.db) db.db.close();
    });

    test('should merge duplicate genres case-insensitively and select the best casing', () => {
        const userId = db.createUser('fan', 'hashed-pw', null, 'user');
        const artistId = db.createArtist('Test Artist');
        const albumId = db.createAlbum({
            title: 'Test Album',
            artist_id: artistId,
            owner_id: userId,
            visibility: 'public',
        });

        // Insert tracks with different case variations of the same genre
        db.createTrack({
            title: 'Track 1',
            album_id: albumId,
            artist_id: artistId,
            owner_id: userId,
            track_num: 1,
            duration: 120,
            file_path: 'artist/album/t1.mp3',
            genre: 'rock'
        });

        db.createTrack({
            title: 'Track 2',
            album_id: albumId,
            artist_id: artistId,
            owner_id: userId,
            track_num: 2,
            duration: 120,
            file_path: 'artist/album/t2.mp3',
            genre: 'Rock'
        });

        db.createTrack({
            title: 'Track 3',
            album_id: albumId,
            artist_id: artistId,
            owner_id: userId,
            track_num: 3,
            duration: 120,
            file_path: 'artist/album/t3.mp3',
            genre: 'ROCK'
        });

        db.createTrack({
            title: 'Track 4',
            album_id: albumId,
            artist_id: artistId,
            owner_id: userId,
            track_num: 4,
            duration: 120,
            file_path: 'artist/album/t4.mp3',
            genre: 'hip-hop/rap'
        });

        db.createTrack({
            title: 'Track 5',
            album_id: albumId,
            artist_id: artistId,
            owner_id: userId,
            track_num: 5,
            duration: 120,
            file_path: 'artist/album/t5.mp3',
            genre: 'Hip-Hop/Rap'
        });

        const genres = db.getGenres(VisibilityProfile.ALL_ACCESS);
        
        // rock/Rock/ROCK should merge to Rock (first-letter capitalization score: 11)
        // hip-hop/rap and Hip-Hop/Rap should merge to Hip-Hop/Rap (more uppercase letters score: 12)
        expect(genres).toEqual(['Hip-Hop/Rap', 'Rock']);
    });

    test('should query tracks case-insensitively using getTracksByGenre', () => {
        const userId = db.createUser('fan', 'hashed-pw', null, 'user');
        const artistId = db.createArtist('Test Artist');
        const albumId = db.createAlbum({
            title: 'Test Album',
            artist_id: artistId,
            owner_id: userId,
            visibility: 'public',
        });

        db.createTrack({
            title: 'Track A',
            album_id: albumId,
            artist_id: artistId,
            owner_id: userId,
            track_num: 1,
            duration: 120,
            file_path: 'artist/album/ta.mp3',
            genre: 'Alternative metal, Rock'
        });

        db.createTrack({
            title: 'Track B',
            album_id: albumId,
            artist_id: artistId,
            owner_id: userId,
            track_num: 2,
            duration: 120,
            file_path: 'artist/album/tb.mp3',
            genre: 'alternative metal'
        });

        // Search for 'Alternative Metal'
        const tracksAlternativeMetal = db.getTracksByGenre('Alternative Metal', VisibilityProfile.ALL_ACCESS);
        expect(tracksAlternativeMetal).toHaveLength(2);
        expect(tracksAlternativeMetal.map((t: any) => t.title).sort()).toEqual(['Track A', 'Track B']);

        // Search for 'rock'
        const tracksRock = db.getTracksByGenre('rock', VisibilityProfile.ALL_ACCESS);
        expect(tracksRock).toHaveLength(1);
        expect(tracksRock[0].title).toBe('Track A');
    });
});
