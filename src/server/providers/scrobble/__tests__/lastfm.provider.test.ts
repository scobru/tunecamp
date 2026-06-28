import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { LastFmProvider } from '../lastfm.provider.js';

function fakeDb(sessionKey: string | null) {
    return {
        getSetting: (key: string) => {
            if (key === 'lastfm_session_key') return sessionKey;
            if (key === 'lastfm_api_key') return 'test_api_key';
            if (key === 'lastfm_api_secret') return 'test_api_secret';
            return null;
        }
    } as any;
}

describe('LastFmProvider', () => {
    let fetchMock: any;
    let originalFetch: any;
    let originalEnv: any;

    beforeEach(() => {
        originalFetch = (global as any).fetch;
        fetchMock = jest.fn(async () => ({ json: async () => ({}) }));
        (global as any).fetch = fetchMock;
        originalEnv = { ...process.env };
        process.env.LASTFM_API_KEY = 'test_key';
        process.env.LASTFM_API_SECRET = 'test_secret';
    });

    afterEach(() => {
        (global as any).fetch = originalFetch;
        process.env = originalEnv;
    });

    test('has the expected provider identity', () => {
        const p = new LastFmProvider(fakeDb('sk'));
        expect(p.id).toBe('lastfm');
        expect(p.name).toBe('Last.fm');
    });


    describe('isAvailable', () => {
        test('true when both API key and secret are provided', async () => {
            expect(await new LastFmProvider(fakeDb('sk')).isAvailable()).toBe(true);
        });

        test('false when API key is missing', async () => {
            delete process.env.LASTFM_API_KEY;
            expect(await new LastFmProvider(fakeDb('sk')).isAvailable()).toBe(false);
        });

        test('false when API secret is missing', async () => {
            delete process.env.LASTFM_API_SECRET;
            expect(await new LastFmProvider(fakeDb('sk')).isAvailable()).toBe(false);
        });

        test('false when both are missing', async () => {
            delete process.env.LASTFM_API_KEY;
            delete process.env.LASTFM_API_SECRET;
            expect(await new LastFmProvider(fakeDb('sk')).isAvailable()).toBe(false);
        });
    });

    describe('isConfigured', () => {
        test('true when a session key is stored', async () => {
            expect(await new LastFmProvider(fakeDb('sk-123')).isConfigured()).toBe(true);
        });
        test('false when there is no session key', async () => {
            expect(await new LastFmProvider(fakeDb(null)).isConfigured()).toBe(false);
        });
    });

    describe('scrobble', () => {
        test('no-ops (no request) when not configured', async () => {
            await new LastFmProvider(fakeDb(null)).scrobble({ artist: 'A', title: 'T' });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        test('posts a signed track.scrobble request', async () => {
            const p = new LastFmProvider(fakeDb('sk-xyz'));
            await p.scrobble({ artist: 'Daft Punk', title: 'One More Time', album: 'Discovery', duration: 320.4 });

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toContain('ws.audioscrobbler.com');
            expect(init.method).toBe('POST');

            const body = new URLSearchParams(init.body as string);
            expect(body.get('method')).toBe('track.scrobble');
            expect(body.get('sk')).toBe('sk-xyz');
            expect(body.get('artist')).toBe('Daft Punk');
            expect(body.get('track')).toBe('One More Time');
            expect(body.get('album')).toBe('Discovery');
            // duration is rounded to a whole number of seconds
            expect(body.get('duration')).toBe('320');
            expect(body.get('format')).toBe('json');
            // a 32-char md5 signature must be attached
            expect(body.get('api_sig')).toMatch(/^[a-f0-9]{32}$/);
        });

        test('throws when Last.fm returns an error payload', async () => {
            fetchMock.mockResolvedValueOnce({ json: async () => ({ error: 9, message: 'Invalid session key' }) });
            const p = new LastFmProvider(fakeDb('sk'));
            await expect(p.scrobble({ artist: 'A', title: 'T' })).rejects.toThrow('Last.fm error 9');
        });
    });

    describe('nowPlaying', () => {
        test('no-ops when not configured', async () => {
            await new LastFmProvider(fakeDb(null)).nowPlaying({ artist: 'A', title: 'T' });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        test('posts a track.updateNowPlaying request', async () => {
            const p = new LastFmProvider(fakeDb('sk'));
            await p.nowPlaying({ artist: 'A', title: 'T' });
            const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
            expect(body.get('method')).toBe('track.updateNowPlaying');
        });
    });
});
