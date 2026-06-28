import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { SubsonicService } from '../subsonic.service.js';
import { DatabaseService } from '../../../core/database.js';
import { Track } from '../../../core/database.js';

describe('SubsonicService', () => {
  let mockDb: jest.Mocked<DatabaseService>;
  let service: SubsonicService;

  beforeEach(() => {
    mockDb = {
      isStarred: jest.fn(),
      getItemRating: jest.fn(),
      getStarredItems: jest.fn(),
      getSetting: jest.fn(),
      getItemRatings: jest.fn(),
    } as unknown as jest.Mocked<DatabaseService>;

    service = new SubsonicService(mockDb);
  });

  describe('formatTrack', () => {
    test('should format track correctly with all basic fields', () => {
      const mockTrack = {
        id: 1,
        album_id: 10,
        artist_id: 100,
        title: 'Test Track',
        album_title: 'Test Album',
        artist_name: 'Test Artist',
        track_num: 1,
        year: 2023,
        genre: 'Rock',
        duration: 180.5,
        bitrate: 320000,
        file_path: '/path/to/track.mp3',
        format: 'mp3',
        created_at: '2023-01-01T00:00:00Z',
        disc_number: 1,
        sample_rate: 44100,
        bit_depth: 16
      } as unknown as Track;

      mockDb.isStarred.mockReturnValue(false);
      mockDb.getItemRating.mockReturnValue(undefined as any);

      const result = service.formatTrack(mockTrack, 'testuser');

      expect(result['@id']).toBe('tr_1');
      expect(result['@parent']).toBe('al_10');
      expect(result['@isDir']).toBe(false);
      expect(result['@title']).toBe('Test Track');
      expect(result['@album']).toBe('Test Album');
      expect(result['@artist']).toBe('Test Artist');
      expect(result['@track']).toBe(1);
      expect(result['@year']).toBe(2023);
      expect(result['@genre']).toBe('Rock');
      expect(result['@coverArt']).toBe('al_10');
      expect(result['@size']).toBe(0);
      expect(result['@contentType']).toBe('audio/mpeg');
      expect(result['@suffix']).toBe('mp3');
      expect(result['@duration']).toBe(180);
      expect(result['@bitRate']).toBe(320);
      expect(result['@path']).toBe('/path/to/track.mp3');
      expect(result['@albumId']).toBe('al_10');
      expect(result['@artistId']).toBe('ar_100');
      expect(result['@type']).toBe('music');
      expect(result['@created']).toBe('2023-01-01T00:00:00Z');
      expect(result['@starred']).toBeUndefined();
      expect(result['@userRating']).toBeUndefined();
      expect(result['@discNumber']).toBe(1);
      expect(result['@samplingRate']).toBe(44100);
      expect(result['@bitDepth']).toBe(16);
    });

    test('should handle missing starredSet and ratingsMap properly', () => {
      const mockTrack = {
        id: 1,
        format: 'flac',
      } as unknown as Track;

      mockDb.isStarred.mockReturnValue(true);
      mockDb.getItemRating.mockReturnValue(5);

      const result = service.formatTrack(mockTrack, 'testuser');
      expect(result['@starred']).toBeDefined();
      expect(result['@userRating']).toBe(5);
    });

    test('should use provided starredSet and ratingsMap for bulk processing', () => {
        const mockTrack = {
            id: 1,
            format: 'flac',
            created_at: '2023-01-01T00:00:00Z'
        } as unknown as Track;
        const starredSet = new Set(['tr_1']);
        const ratingsMap = new Map([['tr_1', 4]]);

        const result = service.formatTrack(mockTrack, 'testuser', starredSet, ratingsMap);

        expect(mockDb.isStarred).not.toHaveBeenCalled();
        expect(mockDb.getItemRating).not.toHaveBeenCalled();
        expect(result['@starred']).toBe('2023-01-01T00:00:00Z');
        expect(result['@userRating']).toBe(4);
    });
  });

  describe('formatTracksBulk', () => {
      test('should correctly batch tracks', () => {
          const mockTracks = [
              { id: 1, format: 'mp3' },
              { id: 2, format: 'mp3' }
          ] as unknown as Track[];

          mockDb.getStarredItems.mockReturnValue([ { item_id: 'tr_1' } ]);
          mockDb.getItemRatings.mockReturnValue(new Map([['tr_2', 3]]));

          const result = service.formatTracksBulk(mockTracks, 'testuser');

          expect(result).toHaveLength(2);
          expect(result[0]['@id']).toBe('tr_1');
          expect(result[0]['@starred']).toBeDefined();
          expect(result[0]['@userRating']).toBeUndefined();

          expect(result[1]['@id']).toBe('tr_2');
          expect(result[1]['@starred']).toBeUndefined();
          expect(result[1]['@userRating']).toBe(3);
      });

      test('should return empty array for empty input', () => {
          expect(service.formatTracksBulk([], 'testuser')).toEqual([]);
      });
  });

  describe('formatAlbum', () => {
    test('should format album correctly', () => {
      const mockAlbum = {
        id: 10,
        artist_id: 100,
        title: 'Test Album',
        artist_name: 'Test Artist',
        songCount: 12,
        duration: 3600.5,
        created_at: '2023-01-01T00:00:00Z',
        year: 2023,
        genre: 'Rock'
      };

      mockDb.isStarred.mockReturnValue(true);
      const ratingsMap = new Map([['al_10', 5]]);

      const result = service.formatAlbum(mockAlbum, 'testuser', ratingsMap);

      expect(result['@id']).toBe('al_10');
      expect(result['@name']).toBe('Test Album');
      expect(result['@title']).toBe('Test Album');
      expect(result['@artist']).toBe('Test Artist');
      expect(result['@artistId']).toBe('ar_100');
      expect(result['@isDir']).toBe(true);
      expect(result['@coverArt']).toBe('al_10');
      expect(result['@songCount']).toBe(12);
      expect(result['@duration']).toBe(3600);
      expect(result['@created']).toBe('2023-01-01T00:00:00Z');
      expect(result['@year']).toBe(2023);
      expect(result['@genre']).toBe('Rock');
      expect(result['@starred']).toBe('2023-01-01T00:00:00Z');
      expect(result['@userRating']).toBe(5);
    });

    test('should handle missing year and compute from date', () => {
      const mockAlbum = {
        id: 10,
        title: 'Test Album',
        date: '2022-05-01'
      };

      mockDb.isStarred.mockReturnValue(false);
      const result = service.formatAlbum(mockAlbum, 'testuser');
      expect(result['@year']).toBe(2022);
    });
  });

  describe('formatAlbumsBulk', () => {
      test('should batch format albums correctly', () => {
          const mockAlbums = [
              { id: 10, title: 'Album 1' },
              { id: 11, title: 'Album 2' }
          ];

          mockDb.getItemRatings.mockReturnValue(new Map([['al_11', 4]]));
          mockDb.isStarred.mockImplementation((user, type, id) => id === 'al_10');

          const result = service.formatAlbumsBulk(mockAlbums, 'testuser');

          expect(result).toHaveLength(2);
          expect(result[0]['@id']).toBe('al_10');
          expect(result[0]['@starred']).toBeDefined();
          expect(result[0]['@userRating']).toBeUndefined();

          expect(result[1]['@id']).toBe('al_11');
          expect(result[1]['@starred']).toBeUndefined();
          expect(result[1]['@userRating']).toBe(4);
      });

      test('should return empty array for empty input', () => {
          expect(service.formatAlbumsBulk([], 'testuser')).toEqual([]);
      });
  });

  describe('formatArtist', () => {
    test('should format artist correctly', () => {
      const mockArtist = {
        id: 100,
        name: 'Test Artist',
        albumCount: 3,
        created_at: '2023-01-01T00:00:00Z'
      };

      mockDb.isStarred.mockReturnValue(true);
      mockDb.getItemRating.mockReturnValue(4);

      const result = service.formatArtist(mockArtist, 'testuser');

      expect(result['@id']).toBe('ar_100');
      expect(result['@name']).toBe('Test Artist');
      expect(result['@coverArt']).toBe('ar_100');
      expect(result['@artistImageUrl']).toBe('getCoverArt.view?id=ar_100');
      expect(result['@albumCount']).toBe(3);
      expect(result['@starred']).toBe('2023-01-01T00:00:00Z');
      expect(result['@userRating']).toBe(4);
    });
  });

  describe('getContentType', () => {
    test('should return correct content types', () => {
      expect(service.getContentType('flac')).toBe('audio/flac');
      expect(service.getContentType('ogg')).toBe('audio/ogg');
      expect(service.getContentType('opus')).toBe('audio/ogg');
      expect(service.getContentType('wav')).toBe('audio/wav');
      expect(service.getContentType('m4a')).toBe('audio/mp4');
      expect(service.getContentType('mp4')).toBe('audio/mp4');
      expect(service.getContentType('mp3')).toBe('audio/mpeg');
      expect(service.getContentType(null)).toBe('audio/mpeg');
      expect(service.getContentType(undefined)).toBe('audio/mpeg');
      expect(service.getContentType('unknown')).toBe('audio/mpeg');
    });
  });

  describe('formatPodcastChannel', () => {
      test('should format basic channel info', () => {
          const mockAlbum = {
              id: 10,
              title: 'Podcast',
              description: 'Desc',
              artist_slug: 'podcast-artist'
          };

          mockDb.getSetting.mockReturnValue('https://example.com');

          const result = service.formatPodcastChannel(mockAlbum, 'testuser', false);

          expect(result['@id']).toBe('al_10');
          expect(result['@title']).toBe('Podcast');
          expect(result['@description']).toBe('Desc');
          expect(result['@status']).toBe('completed');
          expect(result['@url']).toBe('https://example.com/artists/podcast-artist/feed.xml');
          expect(result.episode).toBeUndefined();
      });

      test('should handle missing publicUrl', () => {
          const mockAlbum = { id: 10, title: 'Podcast', artist_slug: 'artist' };
          mockDb.getSetting.mockReturnValue(undefined);

          const result = service.formatPodcastChannel(mockAlbum, 'testuser', false);
          expect(result['@url']).toBe('/artists/artist/feed.xml');
      });
  });

  describe('formatPodcastEpisode', () => {
      test('should format episode correctly', () => {
          const mockTrack = {
              id: 1,
              album_id: 10,
              title: 'Episode 1',
              description: 'Ep Desc',
              created_at: '2023-01-01T00:00:00Z',
              duration: 3600.5,
              file_size: 5000000,
              format: 'mp3'
          } as unknown as Track;

          const result = service.formatPodcastEpisode(mockTrack, 'testuser');

          expect(result['@id']).toBe('tr_1');
          expect(result['@streamId']).toBe('tr_1');
          expect(result['@channelId']).toBe('al_10');
          expect(result['@title']).toBe('Episode 1');
          expect(result['@description']).toBe('Ep Desc');
          expect(result['@publishDate']).toBe('2023-01-01T00:00:00Z');
          expect(result['@status']).toBe('completed');
          expect(result['@duration']).toBe(3600);
          expect(result['@bytes']).toBe(5000000);
          expect(result['@coverArt']).toBe('al_10');
          expect(result['@contentType']).toBe('audio/mpeg');
          expect(result['@isDir']).toBe(false);
      });
  });
});
