import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

// ESM module namespaces are read-only, so spying on the bindings directly fails.
// Mock the utils module and import the SUT dynamically so it picks up the mock.
const isDeezerPlaylistUrlSpy: any = jest.fn();
const extractDeezerPlaylistIdSpy: any = jest.fn();
const getPlaylistSpy: any = jest.fn();
const searchTracksSpy: any = jest.fn();
const deezerClient = { getPlaylist: getPlaylistSpy, searchTracks: searchTracksSpy };

jest.unstable_mockModule('../../../utils/deezer.js', () => ({
    deezerClient,
    isDeezerPlaylistUrl: isDeezerPlaylistUrlSpy,
    extractDeezerPlaylistId: extractDeezerPlaylistIdSpy,
}));

let DeezerProvider: any;
let provider: any;

beforeAll(async () => {
    ({ DeezerProvider } = await import('../deezer.playlist.js'));
    provider = new DeezerProvider();
});

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
        isDeezerPlaylistUrlSpy.mockReturnValueOnce(true as any);
        expect(provider.canHandlePlaylist('https://deezer.com/playlist/1')).toBe(true);
        expect(isDeezerPlaylistUrlSpy).toHaveBeenCalledWith('https://deezer.com/playlist/1');
    });

    describe('fetchPlaylistByUrl', () => {
        test('resolves the id and maps the playlist tracks', async () => {
            extractDeezerPlaylistIdSpy.mockReturnValueOnce('908622995' as any);
            getPlaylistSpy.mockResolvedValueOnce({
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
            } as any);

            const playlist = await provider.fetchPlaylistByUrl('https://deezer.com/playlist/908622995');

            expect(getPlaylistSpy).toHaveBeenCalledWith('908622995');
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
            extractDeezerPlaylistIdSpy.mockReturnValueOnce('x' as any);
            getPlaylistSpy.mockResolvedValueOnce({ error: { message: 'Quota limit exceeded' } } as any);
            await expect(provider.fetchPlaylistByUrl('https://deezer.com/playlist/x'))
                .rejects.toThrow('Deezer: Quota limit exceeded');
        });
    });

    describe('searchRecording', () => {
        test('maps track search results', async () => {
            searchTracksSpy.mockResolvedValueOnce({
                data: [{ id: 9, title: 'T', artist: { name: 'A' }, album: { title: 'Al', cover_medium: 'https://img/c.jpg' } }],
            } as any);
            const [r] = await provider.searchRecording('t');
            expect(r).toEqual({ id: '9', title: 'T', artist: 'A', album: 'Al', date: '', source: 'deezer', thumbnail: 'https://img/c.jpg' });
        });

        test('returns [] when there is no data array', async () => {
            searchTracksSpy.mockResolvedValueOnce({} as any);
            expect(await provider.searchRecording('t')).toEqual([]);
        });

        test('returns [] on error', async () => {
            searchTracksSpy.mockRejectedValueOnce(new Error('boom'));
            expect(await provider.searchRecording('t')).toEqual([]);
        });
    });

    test('searchRelease and getCoverUrl are no-ops', async () => {
        expect(await provider.searchRelease('q')).toEqual([]);
        expect(await provider.getCoverUrl('1')).toBeNull();
    });
});
