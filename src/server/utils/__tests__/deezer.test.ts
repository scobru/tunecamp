import { jest } from '@jest/globals';
import { deezerClient, extractDeezerPlaylistId, isDeezerPlaylistUrl } from '../deezer';

// Preserve the real fetch so the deezerClient suite can restore it afterwards.
const originalFetch = global.fetch;

describe('deezerClient', () => {
    beforeEach(() => {
        global.fetch = jest.fn() as any;
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    describe('getPlaylist', () => {
        it('should fetch a playlist successfully', async () => {
            const mockData = { title: 'My Playlist' };
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockData
            });

            const res = await deezerClient.getPlaylist('12345');
            expect(res).toEqual(mockData);
            expect(global.fetch).toHaveBeenCalledWith('https://api.deezer.com/playlist/12345');
        });

        it('should throw an error if the API request fails', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 404
            });

            await expect(deezerClient.getPlaylist('12345')).rejects.toThrow('Deezer API error: 404');
        });
    });

    describe('searchTracks', () => {
        it('should search tracks with default limit', async () => {
            const mockData = { data: [] };
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockData
            });

            const res = await deezerClient.searchTracks('test query');
            expect(res).toEqual(mockData);
            expect(global.fetch).toHaveBeenCalledWith('https://api.deezer.com/search/track?q=test%20query&limit=20');
        });

        it('should search tracks with custom limit', async () => {
            const mockData = { data: [] };
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockData
            });

            const res = await deezerClient.searchTracks('test query', 50);
            expect(res).toEqual(mockData);
            expect(global.fetch).toHaveBeenCalledWith('https://api.deezer.com/search/track?q=test%20query&limit=50');
        });
    });
});

describe('deezer utils', () => {
    describe('extractDeezerPlaylistId', () => {
        it('should extract playlist ID from standard URL', () => {
            expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345')).toBe('12345');
        });

        it('should extract playlist ID from URL with language prefix', () => {
            expect(extractDeezerPlaylistId('https://www.deezer.com/us/playlist/67890')).toBe('67890');
        });

        it('should extract playlist ID from URL with trailing slash', () => {
            expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345/')).toBe('12345');
        });

        it('should extract playlist ID from URL with query parameters', () => {
            expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345?theme=dark')).toBe('12345');
        });

        it('should handle malformed URL by throwing error', () => {
            expect(() => extractDeezerPlaylistId('not-a-url')).toThrow('Invalid URL');
        });

        it('should return the first segment if playlist is not in the path', () => {
            expect(extractDeezerPlaylistId('https://www.deezer.com/track/12345')).toBe('track');
        });
    });

    describe('isDeezerPlaylistUrl', () => {
        it('should return true for valid playlist URLs without language', () => {
            expect(isDeezerPlaylistUrl('https://www.deezer.com/playlist/12345')).toBe(true);
        });

        it('should return true for valid playlist URLs with language', () => {
            expect(isDeezerPlaylistUrl('https://www.deezer.com/us/playlist/12345')).toBe(true);
        });

        it('should return true for deezer.com domain (without www)', () => {
            expect(isDeezerPlaylistUrl('https://deezer.com/playlist/12345')).toBe(true);
        });

        it('should return false for non-deezer URLs', () => {
            expect(isDeezerPlaylistUrl('https://www.spotify.com/playlist/12345')).toBe(false);
        });

        it('should return false for deezer non-playlist URLs', () => {
            expect(isDeezerPlaylistUrl('https://www.deezer.com/track/12345')).toBe(false);
        });

        it('should return false for invalid URLs', () => {
            expect(isDeezerPlaylistUrl('not-a-url')).toBe(false);
        });
    });
});
