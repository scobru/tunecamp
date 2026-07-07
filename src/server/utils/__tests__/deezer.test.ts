import { jest } from '@jest/globals';
import { deezerClient, isDeezerPlaylistUrl, extractDeezerPlaylistId } from '../deezer';

// Mock fetch
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

describe('isDeezerPlaylistUrl', () => {
    it('should return true for valid Deezer playlist URLs', () => {
        expect(isDeezerPlaylistUrl('https://www.deezer.com/playlist/12345')).toBe(true);
        expect(isDeezerPlaylistUrl('https://deezer.com/playlist/67890')).toBe(true);
        expect(isDeezerPlaylistUrl('https://www.deezer.com/en/playlist/111')).toBe(true);
        expect(isDeezerPlaylistUrl('http://deezer.com/playlist/222')).toBe(true);
    });

    it('should return false for invalid Deezer playlist URLs', () => {
        expect(isDeezerPlaylistUrl('https://www.spotify.com/playlist/12345')).toBe(false);
        expect(isDeezerPlaylistUrl('https://deezer.com/track/12345')).toBe(false);
        expect(isDeezerPlaylistUrl('https://deezer.com/en/album/12345')).toBe(false);
    });

    it('should return false for malformed URLs', () => {
        expect(isDeezerPlaylistUrl('not-a-url')).toBe(false);
    });
});

describe('extractDeezerPlaylistId', () => {
    it('should extract the playlist ID from valid URLs', () => {
        expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345')).toBe('12345');
        expect(extractDeezerPlaylistId('https://deezer.com/en/playlist/67890')).toBe('67890');
    });
});
