import { isDeezerPlaylistUrl } from '../deezer.js';

describe('deezer utils', () => {
    describe('isDeezerPlaylistUrl', () => {
        it('should return true for valid deezer playlist URLs', () => {
            expect(isDeezerPlaylistUrl('https://www.deezer.com/playlist/12345')).toBe(true);
            expect(isDeezerPlaylistUrl('https://deezer.com/playlist/12345')).toBe(true);
            expect(isDeezerPlaylistUrl('https://www.deezer.com/us/playlist/12345')).toBe(true);
            expect(isDeezerPlaylistUrl('https://www.deezer.com/fr/playlist/1234567')).toBe(true);
            expect(isDeezerPlaylistUrl('http://www.deezer.com/playlist/987')).toBe(true);
        });

        it('should return false for invalid deezer playlist URLs', () => {
            expect(isDeezerPlaylistUrl('https://www.deezer.com/track/12345')).toBe(false);
            expect(isDeezerPlaylistUrl('https://www.deezer.com/album/12345')).toBe(false);
            expect(isDeezerPlaylistUrl('https://www.spotify.com/playlist/12345')).toBe(false);
            expect(isDeezerPlaylistUrl('https://deezer.com/playlist/abc')).toBe(false);
        });

        it('should return false for invalid URL strings', () => {
            expect(isDeezerPlaylistUrl('not-a-url')).toBe(false);
            expect(isDeezerPlaylistUrl('')).toBe(false);
        });
    });
});
