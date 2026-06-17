import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const searchTracks: any = jest.fn();
const getPlaylist: any = jest.fn();

jest.unstable_mockModule('../../../utils/spotify.js', () => ({
    SpotifyMetadataClient: jest.fn().mockImplementation(() => ({ searchTracks, getPlaylist })),
    isSpotifyPlaylistUrl: jest.fn(),
    extractSpotifyPlaylistId: jest.fn(),
}));

const { isSpotifyPlaylistUrl, extractSpotifyPlaylistId } = await import('../../../utils/spotify.js');
const { SpotifyProvider } = await import('../spotify.provider.js');

const provider = new SpotifyProvider();

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('SpotifyProvider', () => {
    test('has the expected provider identity', () => {
        expect(provider.id).toBe('spotify');
        expect(provider.name).toBe('Spotify');
    });

    test('searchRelease is a no-op (not implemented upstream)', async () => {
        expect(await provider.searchRelease('q')).toEqual([]);
    });

    test('getCoverUrl returns null', async () => {
        expect(await provider.getCoverUrl('x')).toBeNull();
    });

    describe('searchRecording', () => {
        test('maps tracks, joining multiple artist names', async () => {
            searchTracks.mockResolvedValueOnce([{
                uri: 'spotify:track:1',
                name: 'Song',
                artists: { items: [{ profile: { name: 'A' } }, { profile: { name: 'B' } }] },
                albumOfTrack: { name: 'The Album' },
            }]);

            const [r] = await provider.searchRecording('song');

            expect(searchTracks).toHaveBeenCalledWith('song');
            expect(r).toMatchObject({
                id: 'spotify:track:1',
                title: 'Song',
                artist: 'A, B',
                album: 'The Album',
                source: 'spotify',
            });
        });

        test('returns [] when the client throws', async () => {
            searchTracks.mockRejectedValueOnce(new Error('totp failed'));
            expect(await provider.searchRecording('q')).toEqual([]);
        });
    });

    describe('canHandlePlaylist', () => {
        test('delegates to isSpotifyPlaylistUrl', () => {
            (isSpotifyPlaylistUrl as any).mockReturnValueOnce(true);
            expect(provider.canHandlePlaylist('https://open.spotify.com/playlist/abc')).toBe(true);
            expect(isSpotifyPlaylistUrl).toHaveBeenCalledWith('https://open.spotify.com/playlist/abc');
        });
    });

    describe('fetchPlaylistByUrl', () => {
        test('resolves the id, fetches the playlist, and maps tracks', async () => {
            (extractSpotifyPlaylistId as any).mockReturnValueOnce('pl1');
            getPlaylist.mockResolvedValueOnce({
                id: 'pl1',
                name: 'My Playlist',
                description: 'desc',
                images: { items: [{ sources: [{ url: 'https://img/playlist.jpg' }] }] },
                content: {
                    items: [{
                        itemV2: {
                            data: {
                                uri: 'spotify:track:9',
                                name: 'Track',
                                artists: { items: [{ profile: { name: 'Artist' } }] },
                                duration: { totalMilliseconds: 215000 },
                                albumOfTrack: { coverArt: { sources: [{ url: 'https://img/cover.jpg' }] } },
                            },
                        },
                    }],
                },
            });

            const playlist = await provider.fetchPlaylistByUrl('https://open.spotify.com/playlist/pl1');

            expect(extractSpotifyPlaylistId).toHaveBeenCalledWith('https://open.spotify.com/playlist/pl1');
            expect(getPlaylist).toHaveBeenCalledWith('pl1');
            expect(playlist).toEqual({
                id: 'pl1',
                title: 'My Playlist',
                description: 'desc',
                thumbnail: 'https://img/playlist.jpg',
                tracks: [{
                    title: 'Track',
                    artist: 'Artist',
                    duration: 215, // floor(215000 / 1000)
                    thumbnail: 'https://img/cover.jpg',
                    sourceId: 'spotify:track:9',
                    provider: 'spotify',
                }],
            });
        });
    });
});
