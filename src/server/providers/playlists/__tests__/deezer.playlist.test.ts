import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../utils/deezer.js', () => ({
    deezerClient: { getPlaylist: jest.fn(), searchTracks: jest.fn() },
    isDeezerPlaylistUrl: jest.fn(),
    extractDeezerPlaylistId: jest.fn(),
}));

const { deezerClient, isDeezerPlaylistUrl, extractDeezerPlaylistId } = await import('../../../utils/deezer.js');
const { DeezerProvider } = await import('../deezer.playlist.js');

const provider = new DeezerProvider();

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('DeezerProvider', () => {
    test('has the expected provider identity', () => {
        expect(provider.id).toBe('deezer');
        expect(provider.name).toBe('Deezer');
    });

    test('canHandlePlaylist delegates to isDeezerPlaylistUrl', () => {
        (isDeezerPlaylistUrl as any).mockReturnValueOnce(true);
        expect(provider.canHandlePlaylist('https://deezer.com/playlist/1')).toBe(true);
        expect(isDeezerPlaylistUrl).toHaveBeenCalledWith('https://deezer.com/playlist/1');
    });

    describe('fetchPlaylistByUrl', () => {
        test('resolves the id and maps the playlist tracks', async () => {
            (extractDeezerPlaylistId as any).mockReturnValueOnce('908622995');
            (deezerClient.getPlaylist as any).mockResolvedValueOnce({
                id: 908622995,
                title: 'Hits',
                description: 'Top hits',
                picture_medium: 'https://img/medium.jpg',
                picture_big: 'https://img/big.jpg',
                tracks: {
                    data: [{
                        id: 1,
                        title: 'Song',
                        artist: { name: 'Artist' },
                        album: { title: 'Album', cover_medium: 'https://img/album.jpg' },
                        duration: 180,
                    }],
                },
            });

            const playlist = await provider.fetchPlaylistByUrl('https://deezer.com/playlist/908622995');

            expect(deezerClient.getPlaylist).toHaveBeenCalledWith('908622995');
            expect(playlist).toEqual({
                id: '908622995',
                title: 'Hits',
                description: 'Top hits',
                thumbnail: 'https://img/medium.jpg',
                tracks: [{
                    sourceId: '1',
                    title: 'Song',
                    artist: 'Artist',
                    album: 'Album',
                    duration: 180,
                    thumbnail: 'https://img/album.jpg',
                }],
            });
        });

        test('throws when the Deezer API returns an error', async () => {
            (extractDeezerPlaylistId as any).mockReturnValueOnce('x');
            (deezerClient.getPlaylist as any).mockResolvedValueOnce({ error: { message: 'Quota limit exceeded' } });
            await expect(provider.fetchPlaylistByUrl('https://deezer.com/playlist/x'))
                .rejects.toThrow('Deezer: Quota limit exceeded');
        });
    });

    describe('searchRecording', () => {
        test('maps track search results', async () => {
            (deezerClient.searchTracks as any).mockResolvedValueOnce({
                data: [{ id: 9, title: 'T', artist: { name: 'A' }, album: { title: 'Al', cover_medium: 'https://img/c.jpg' } }],
            });
            const [r] = await provider.searchRecording('t');
            expect(r).toEqual({ id: '9', title: 'T', artist: 'A', album: 'Al', date: '', source: 'deezer', thumbnail: 'https://img/c.jpg' });
        });

        test('returns [] when there is no data array', async () => {
            (deezerClient.searchTracks as any).mockResolvedValueOnce({});
            expect(await provider.searchRecording('t')).toEqual([]);
        });

        test('returns [] on error', async () => {
            (deezerClient.searchTracks as any).mockRejectedValueOnce(new Error('boom'));
            expect(await provider.searchRecording('t')).toEqual([]);
        });
    });

    test('searchRelease and getCoverUrl are no-ops', async () => {
        expect(await provider.searchRelease('q')).toEqual([]);
        expect(await provider.getCoverUrl('1')).toBeNull();
    });
});
