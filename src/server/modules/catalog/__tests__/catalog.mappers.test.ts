import { mapTrackDTO, mapAlbumDTO } from '../catalog.mappers.js';
import { jest } from '@jest/globals';

describe('Catalog Mappers', () => {
    let mockDatabase: any;

    beforeEach(() => {
        mockDatabase = {
            isStarred: jest.fn().mockReturnValue(true),
            getItemRating: jest.fn().mockReturnValue(4)
        };
    });

    describe('mapTrackDTO', () => {
        test('maps database track correctly to DTO format with username context', () => {
            const mockTrack: any = {
                id: 1,
                album_id: 10,
                artist_id: 20,
                lossless_path: '/music/lossless.flac',
                external_artwork: 'https://images.com/cover.jpg',
                album_title: 'Gold Album',
                album_download: 1,
                artist_name: 'Superstar',
                file_path: 'artist/album/01_song.mp3',
                waveform: null
            };

            const result = mapTrackDTO(mockTrack, mockDatabase, 'testuser');

            expect(result.id).toBe(1);
            expect(result.albumId).toBe(10);
            expect(result.artistId).toBe(20);
            expect(result.losslessPath).toBe('/music/lossless.flac');
            expect(result.externalArtwork).toBe('https://images.com/cover.jpg');
            expect(result.albumName).toBe('Gold Album');
            expect(result.artistName).toBe('Superstar');
            expect(result.path).toBe('artist/album/01_song.mp3');
            expect(result.filename).toBe('01_song.mp3');
            expect(result.coverUrl).toBe('/api/tracks/1/cover');
            expect(result.waveform).toBe('/api/waveform/1');
            expect(result.starred).toBe(true);
            expect(result.rating).toBe(4);
            
            expect(mockDatabase.isStarred).toHaveBeenCalledWith('testuser', 'track', '1');
            expect(mockDatabase.getItemRating).toHaveBeenCalledWith('testuser', 'track', '1');
        });

        test('returns defaults when metadata is missing or optional', () => {
            const mockTrack: any = {
                id: 2,
                album_id: null,
                artist_id: null,
                lossless_path: null,
                external_artwork: null,
                album_title: 'Single',
                album_download: 0,
                artist_name: null,
                file_path: null,
                waveform: 'precomputed-waveform'
            };

            const result = mapTrackDTO(mockTrack, mockDatabase); // No username

            expect(result.filename).toBeUndefined();
            expect(result.coverUrl).toBeNull();
            expect(result.waveform).toBe('precomputed-waveform');
            expect(result.starred).toBe(false);
            expect(result.rating).toBe(0);
        });

        test('handles conditional fallbacks correctly (album cover, empty artist, null waveform)', () => {
            const mockTrack: any = {
                id: 3,
                album_id: 50, // Has album ID for cover fallback
                artist_id: 60,
                lossless_path: null,
                external_artwork: null, // No external artwork
                album_title: 'Fallback Album',
                album_download: 0,
                artist_name: '', // Empty string should map to null
                file_path: null, // No file path
                waveform: null // No waveform
            };

            const result = mapTrackDTO(mockTrack, mockDatabase);

            expect(result.artistName).toBeNull();
            expect(result.coverUrl).toBe('/api/albums/50/cover');
            expect(result.waveform).toBeNull();
            expect(result.filename).toBeUndefined();
        });
    });

    describe('mapAlbumDTO', () => {
        test('maps database album correctly to DTO format with username context', () => {
            const mockAlbum: any = {
                id: 101,
                title: 'Gold Album',
                visibility: 'public',
                cover_path: 'artist/album/cover.jpg'
            };

            const result = mapAlbumDTO(mockAlbum, mockDatabase, 'testuser');

            expect(result.id).toBe(101);
            expect(result.title).toBe('Gold Album');
            expect(result.is_public).toBe(true);
            expect(result.is_release).toBe(true);
            expect(result.coverImage).toBe('artist/album/cover.jpg');
            expect(result.starred).toBe(true);
            expect(result.rating).toBe(4);

            expect(mockDatabase.isStarred).toHaveBeenCalledWith('testuser', 'album', '101');
            expect(mockDatabase.getItemRating).toHaveBeenCalledWith('testuser', 'album', '101');
        });

        test('correctly maps private/unlisted visibility tags and custom releases settings', () => {
            const mockRelease: any = {
                id: 102,
                title: 'Secret EP',
                visibility: 'private',
                is_release: false,
                is_public: false
            };

            const result = mapAlbumDTO(mockRelease, mockDatabase);

            expect(result.is_public).toBe(false);
            expect(result.is_release).toBe(false);
        });
    });
});
