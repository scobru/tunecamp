import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../utils/soundcloud.js', () => ({
    scApiRequest: jest.fn(),
    resolveArtworkUrl: jest.fn(() => 'https://art.test/cover.jpg'),
    getClientId: jest.fn(),
    clearSoundCloudClientId: jest.fn(),
    USER_AGENT: 'test-agent',
}));
jest.unstable_mockModule('node-fetch', () => ({ default: jest.fn() }));

const { scApiRequest, getClientId, clearSoundCloudClientId } = await import('../../../utils/soundcloud.js');
const { default: fetch } = await import('node-fetch');
const { SoundCloudStreamingProvider } = await import('../soundcloud.provider.js');

const provider = new SoundCloudStreamingProvider();

const progressiveTrack = (id = 1) => ({
    id,
    title: 'Song',
    user: { username: 'DJ' },
    full_duration: 200000,
    permalink_url: 'https://soundcloud.com/dj/song',
    media: {
        transcodings: [
            { url: 'https://api.soundcloud.com/media/x/progressive', format: { protocol: 'progressive', mime_type: 'audio/mpeg' } },
        ],
    },
});

beforeEach(() => {
    jest.clearAllMocks();
    (getClientId as any).mockResolvedValue('client-123');
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('SoundCloudStreamingProvider', () => {
    test('canHandle recognises soundcloud source ids', () => {
        expect(provider.canHandle('https://soundcloud.com/dj/song')).toBe(true);
        expect(provider.canHandle('https://i1.sndcdn.com/x.jpg')).toBe(true);
        expect(provider.canHandle('https://bandcamp.com/x')).toBe(false);
    });

    describe('isAvailable', () => {
        test('true when a client id can be obtained', async () => {
            expect(await provider.isAvailable()).toBe(true);
        });
        test('false when client id retrieval fails', async () => {
            (getClientId as any).mockRejectedValueOnce(new Error('no bundle'));
            expect(await provider.isAvailable()).toBe(false);
        });
    });

    test('onDisable clears the cached client id', async () => {
        await provider.onDisable();
        expect(clearSoundCloudClientId).toHaveBeenCalled();
    });

    describe('search', () => {
        test('maps tracks into stream candidates', async () => {
            (scApiRequest as any).mockResolvedValueOnce({ collection: [progressiveTrack(7)] });
            const [c] = await provider.search('song');
            expect(scApiRequest).toHaveBeenCalledWith('search/tracks', { q: 'song', limit: '10' });
            expect(c).toMatchObject({
                id: '7',
                title: 'Song',
                artist: 'DJ',
                provider: 'soundcloud',
                thumbnail: 'https://art.test/cover.jpg',
                duration: 200, // floor(200000 / 1000)
            });
        });

        test('returns [] on error', async () => {
            (scApiRequest as any).mockRejectedValueOnce(new Error('boom'));
            expect(await provider.search('q')).toEqual([]);
        });
    });

    describe('getStreamUrl', () => {
        test('resolves a progressive MP3 stream url', async () => {
            (scApiRequest as any).mockResolvedValueOnce({ collection: [progressiveTrack()] });
            (fetch as any).mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ url: 'https://cf-media.sndcdn.com/final.mp3' }),
            });

            const url = await provider.getStreamUrl('Song', 'DJ');

            expect(url).toBe('https://cf-media.sndcdn.com/final.mp3');
            // The transcoding URL is fetched with the client_id appended.
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('client_id=client-123'),
                expect.anything(),
            );
        });

        test('returns null when the search has no results', async () => {
            (scApiRequest as any).mockResolvedValueOnce({ collection: [] });
            expect(await provider.getStreamUrl('Song', 'DJ')).toBeNull();
            expect(fetch).not.toHaveBeenCalled();
        });

        test('returns null when a track has no transcodings', async () => {
            (scApiRequest as any).mockResolvedValueOnce({ collection: [{ id: 1, title: 'X', media: { transcodings: [] } }] });
            expect(await provider.getStreamUrl('Song', 'DJ')).toBeNull();
        });

        test('returns null when the API request throws', async () => {
            (scApiRequest as any).mockRejectedValueOnce(new Error('boom'));
            expect(await provider.getStreamUrl('Song', 'DJ')).toBeNull();
        });
    });

    describe('getStreamById', () => {
        test('returns null for a non-numeric id without a request', async () => {
            expect(await provider.getStreamById('abc')).toBeNull();
            expect(scApiRequest).not.toHaveBeenCalled();
        });

        test('looks up the track and resolves its stream', async () => {
            (scApiRequest as any).mockResolvedValueOnce(progressiveTrack(42));
            (fetch as any).mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ url: 'https://cf-media.sndcdn.com/by-id.mp3' }),
            });

            const url = await provider.getStreamById('42');
            expect(scApiRequest).toHaveBeenCalledWith('tracks/42');
            expect(url).toBe('https://cf-media.sndcdn.com/by-id.mp3');
        });

        test('returns null when the lookup throws', async () => {
            (scApiRequest as any).mockRejectedValueOnce(new Error('boom'));
            expect(await provider.getStreamById('42')).toBeNull();
        });
    });
});
