import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';
import nodeFetch from 'node-fetch';

const fetch = nodeFetch as any;

// ESM module namespaces are read-only, so spying on the bindings directly fails.
// Mock the utils module and import the SUT dynamically so it picks up the mock.
const scApiRequestSpy: any = jest.fn();
const getClientIdSpy: any = jest.fn();
const clearSoundCloudClientIdSpy: any = jest.fn();
const resolveArtworkUrlSpy: any = jest.fn(() => 'https://art.test/cover.jpg');

jest.unstable_mockModule('../../../utils/soundcloud.js', () => ({
    scApiRequest: scApiRequestSpy,
    getClientId: getClientIdSpy,
    clearSoundCloudClientId: clearSoundCloudClientIdSpy,
    resolveArtworkUrl: resolveArtworkUrlSpy,
    USER_AGENT: 'test-user-agent',
}));

let SoundCloudStreamingProvider: any;
let provider: any;

beforeAll(async () => {
    ({ SoundCloudStreamingProvider } = await import('../soundcloud.provider.js'));
    provider = new SoundCloudStreamingProvider();
});

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
    getClientIdSpy.mockResolvedValue('client-123');
    resolveArtworkUrlSpy.mockReturnValue('https://art.test/cover.jpg');
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
            getClientIdSpy.mockRejectedValueOnce(new Error('no bundle'));
            expect(await provider.isAvailable()).toBe(false);
        });
    });

    test('onDisable clears the cached client id', async () => {
        await provider.onDisable();
        expect(clearSoundCloudClientIdSpy).toHaveBeenCalled();
    });

    describe('search', () => {
        test('maps tracks into stream candidates', async () => {
            scApiRequestSpy.mockResolvedValueOnce({ collection: [progressiveTrack(7)] } as any);
            const [c] = await provider.search('song');
            expect(scApiRequestSpy).toHaveBeenCalledWith('search/tracks', { q: 'song', limit: '10' });
            expect(c).toMatchObject({
                id: '7',
                title: 'Song',
                artist: 'DJ',
                provider: 'soundcloud',
                thumbnail: 'https://art.test/cover.jpg',
                duration: 200,
            });
        });

        test('returns [] on error', async () => {
            scApiRequestSpy.mockRejectedValueOnce(new Error('boom'));
            expect(await provider.search('q')).toEqual([]);
        });
    });

    describe('getStreamUrl', () => {
        test('resolves a progressive MP3 stream url', async () => {
            scApiRequestSpy.mockResolvedValueOnce({ collection: [progressiveTrack()] } as any);
            fetch.mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ url: 'https://cf-media.sndcdn.com/final.mp3' }),
            });

            const url = await provider.getStreamUrl('Song', 'DJ');

            expect(url).toBe('https://cf-media.sndcdn.com/final.mp3');
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('client_id=client-123'),
                expect.anything(),
            );
        });

        test('returns null when the search has no results', async () => {
            scApiRequestSpy.mockResolvedValueOnce({ collection: [] } as any);
            expect(await provider.getStreamUrl('Song', 'DJ')).toBeNull();
            expect(fetch).not.toHaveBeenCalled();
        });

        test('returns null when a track has no transcodings', async () => {
            scApiRequestSpy.mockResolvedValueOnce({ collection: [{ id: 1, title: 'X', media: { transcodings: [] } }] } as any);
            expect(await provider.getStreamUrl('Song', 'DJ')).toBeNull();
        });

        test('returns null when the API request throws', async () => {
            scApiRequestSpy.mockRejectedValueOnce(new Error('boom'));
            expect(await provider.getStreamUrl('Song', 'DJ')).toBeNull();
        });
    });

    describe('getStreamById', () => {
        test('returns null for a non-numeric id without a request', async () => {
            expect(await provider.getStreamById('abc')).toBeNull();
            expect(scApiRequestSpy).not.toHaveBeenCalled();
        });

        test('looks up the track and resolves its stream', async () => {
            scApiRequestSpy.mockResolvedValueOnce(progressiveTrack(42) as any);
            fetch.mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ url: 'https://cf-media.sndcdn.com/by-id.mp3' }),
            });

            const url = await provider.getStreamById('42');
            expect(scApiRequestSpy).toHaveBeenCalledWith('tracks/42');
            expect(url).toBe('https://cf-media.sndcdn.com/by-id.mp3');
        });

        test('returns null when the lookup throws', async () => {
            scApiRequestSpy.mockRejectedValueOnce(new Error('boom'));
            expect(await provider.getStreamById('42')).toBeNull();
        });
    });
});
