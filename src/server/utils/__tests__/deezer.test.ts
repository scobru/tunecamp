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
        describe('valid URL parsing', () => {
            it('extracts ID from standard format', () => {
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345')).toBe('12345');
                expect(extractDeezerPlaylistId('http://www.deezer.com/playlist/9876')).toBe('9876');
            });

            it('extracts ID from URL with language prefix', () => {
                expect(extractDeezerPlaylistId('https://www.deezer.com/us/playlist/67890')).toBe('67890');
                expect(extractDeezerPlaylistId('https://www.deezer.com/fr/playlist/1111')).toBe('1111');
            });

            it('handles trailing slashes correctly', () => {
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345/')).toBe('12345');
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345//')).toBe('12345');
            });

            it('ignores extra segments after the playlist ID', () => {
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345/extra')).toBe('12345');
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345/info/details')).toBe('12345');
            });

            it('handles multiple consecutive slashes gracefully', () => {
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist//12345')).toBe('12345');
            });

            it('handles URLs with query parameters and hash fragments', () => {
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345?theme=dark')).toBe('12345');
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345#section')).toBe('12345');
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345?q=1#top')).toBe('12345');
            });

            it('extracts non-numeric alphanumeric IDs', () => {
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/abc-123')).toBe('abc-123');
                expect(extractDeezerPlaylistId('https://deezer.page.link/playlist/XYZ999')).toBe('XYZ999');
            });
        });

        describe('error handling and edge cases', () => {
            it('throws error for malformed URLs', () => {
                expect(() => extractDeezerPlaylistId('not-a-url')).toThrow();
                expect(() => extractDeezerPlaylistId('')).toThrow();
            });

            it('throws error when "playlist" segment is missing', () => {
                expect(() => extractDeezerPlaylistId('https://www.deezer.com/track/12345')).toThrow('Playlist ID not found in URL');
                expect(() => extractDeezerPlaylistId('https://www.deezer.com/album/12345')).toThrow('Playlist ID not found in URL');
            });

            it('throws error when "playlist" is the last segment', () => {
                expect(() => extractDeezerPlaylistId('https://www.deezer.com/playlist')).toThrow('Playlist ID not found in URL');
                expect(() => extractDeezerPlaylistId('https://www.deezer.com/us/playlist/')).toThrow('Playlist ID not found in URL');
            });

            it('throws error for base URLs with no segments', () => {
                expect(() => extractDeezerPlaylistId('https://www.deezer.com')).toThrow('Playlist ID not found in URL');
                expect(() => extractDeezerPlaylistId('https://www.deezer.com/')).toThrow('Playlist ID not found in URL');
            });
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
