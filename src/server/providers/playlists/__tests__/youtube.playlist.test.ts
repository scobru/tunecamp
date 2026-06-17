import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const playlist_info = jest.fn();
jest.unstable_mockModule('play-dl', () => ({ default: { playlist_info } }));

const { YouTubePlaylistProvider } = await import('../youtube.playlist.js');

const provider = new YouTubePlaylistProvider();

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('YouTubePlaylistProvider', () => {
    test('has the expected provider identity', () => {
        expect(provider.id).toBe('youtube-playlists');
    });

    describe('canHandlePlaylist', () => {
        test('accepts youtube.com and youtu.be urls that carry a list param', () => {
            expect(provider.canHandlePlaylist('https://www.youtube.com/watch?v=abc&list=PL123')).toBe(true);
            expect(provider.canHandlePlaylist('https://youtu.be/abc?list=PL123')).toBe(true);
        });

        test('rejects youtube urls without a list param', () => {
            expect(provider.canHandlePlaylist('https://www.youtube.com/watch?v=abc')).toBe(false);
        });

        test('rejects non-youtube and malformed urls', () => {
            expect(provider.canHandlePlaylist('https://vimeo.com/x?list=1')).toBe(false);
            expect(provider.canHandlePlaylist('not a url')).toBe(false);
        });
    });

    describe('fetchPlaylistByUrl', () => {
        test('maps playlist videos into tracks', async () => {
            const all_videos = (jest.fn() as any).mockResolvedValue([
                { id: 'v1', title: 'First', channel: { name: 'Chan' }, durationInSec: 200, thumbnails: [{ url: 'https://img/1.jpg' }] },
                { id: 'v2', title: null, channel: null, durationInSec: 100, thumbnails: [] },
            ]);
            (playlist_info as any).mockResolvedValueOnce({
                id: 'PL123',
                title: 'My List',
                description: 'desc',
                thumbnail: { url: 'https://img/pl.jpg' },
                all_videos,
            });

            const result = await provider.fetchPlaylistByUrl('https://youtube.com/playlist?list=PL123');

            expect(playlist_info).toHaveBeenCalledWith('https://youtube.com/playlist?list=PL123', { incomplete: true });
            expect(result.id).toBe('PL123');
            expect(result.title).toBe('My List');
            expect(result.thumbnail).toBe('https://img/pl.jpg');
            expect(result.tracks).toEqual([
                { title: 'First', artist: 'Chan', duration: 200, thumbnail: 'https://img/1.jpg', sourceId: 'v1', provider: 'youtube' },
                { title: 'Unknown Title', artist: 'Unknown Artist', duration: 100, thumbnail: undefined, sourceId: 'v2', provider: 'youtube' },
            ]);
        });

        test('wraps and rethrows when play-dl fails', async () => {
            (playlist_info as any).mockRejectedValueOnce(new Error('private playlist'));
            await expect(provider.fetchPlaylistByUrl('https://youtube.com/playlist?list=PLx'))
                .rejects.toThrow('Failed to fetch YouTube playlist: private playlist');
        });
    });
});
