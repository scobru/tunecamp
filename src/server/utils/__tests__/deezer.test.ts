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
        describe('Standard Extraction Scenarios', () => {
            it('should properly extract numeric playlist IDs for http and https protocols', () => {
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/999999')).toBe('999999');
                expect(extractDeezerPlaylistId('http://deezer.com/playlist/101010')).toBe('101010');
            });

            it('should parse IDs correctly when language locales are present in the path', () => {
                expect(extractDeezerPlaylistId('https://www.deezer.com/en/playlist/55555')).toBe('55555');
                expect(extractDeezerPlaylistId('https://www.deezer.com/es-mx/playlist/44444')).toBe('44444');
            });
        });

        describe('Complex URL structures and edge cases', () => {
            it('should ignore any query string variables or hash anchors', () => {
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345?utm_source=twitter&foo=bar')).toBe('12345');
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345#some-hash-value')).toBe('12345');
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345?q=search#anchor')).toBe('12345');
            });

            it('should correctly handle additional paths or trailing slashes', () => {
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345/')).toBe('12345');
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345//')).toBe('12345');
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/12345/related/tracks')).toBe('12345');
            });

            it('should tolerate empty segments caused by double slashes', () => {
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist//12345')).toBe('12345');
                expect(extractDeezerPlaylistId('https://www.deezer.com//playlist///12345//')).toBe('12345');
            });

            it('should support non-standard and alphanumeric playlist identifiers', () => {
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/alpha-num-88')).toBe('alpha-num-88');
                expect(extractDeezerPlaylistId('https://deezer.page.link/playlist/A1B2C3D4')).toBe('A1B2C3D4');
            });

            it('should extract extremely long boundary IDs and zero', () => {
                const longId = '1'.repeat(256);
                expect(extractDeezerPlaylistId(`https://www.deezer.com/playlist/${longId}`)).toBe(longId);
                expect(extractDeezerPlaylistId('https://www.deezer.com/playlist/0')).toBe('0');
            });
        });

        describe('Invalid URLs and Missing IDs', () => {
            it('should throw an error if the URL is completely malformed or empty', () => {
                expect(() => extractDeezerPlaylistId('just-a-random-string')).toThrow();
                expect(() => extractDeezerPlaylistId('')).toThrow();
            });

            it('should throw when the playlist segment does not exist at all', () => {
                expect(() => extractDeezerPlaylistId('https://www.deezer.com/artist/12345')).toThrow('Deezer playlist ID not found in URL');
                expect(() => extractDeezerPlaylistId('https://www.deezer.com/')).toThrow('Deezer playlist ID not found in URL');
            });

            it('should throw when the playlist segment is the final element (no ID provided)', () => {
                expect(() => extractDeezerPlaylistId('https://www.deezer.com/playlist')).toThrow('Deezer playlist ID not found in URL');
                expect(() => extractDeezerPlaylistId('https://www.deezer.com/en/playlist/')).toThrow('Deezer playlist ID not found in URL');
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
