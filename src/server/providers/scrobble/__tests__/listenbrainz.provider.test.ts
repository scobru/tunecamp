import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

jest.unstable_mockModule('node-fetch', () => ({
    default: jest.fn()
}));

let fetch: any;
let ListenBrainzProvider: any;

beforeAll(async () => {
    ({ default: fetch } = await import('node-fetch'));
    ({ ListenBrainzProvider } = await import('../listenbrainz.provider.js'));
});

function fakeDb(token: string | null) {
    return {
        getSetting: (key: string) => (key === 'listenbrainz_token' ? token : null)
    } as any;
}

beforeEach(() => {
    jest.clearAllMocks();
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
});

describe('ListenBrainzProvider', () => {
    test('has the expected provider identity', () => {
        const p = new ListenBrainzProvider(fakeDb('t'));
        expect(p.id).toBe('listenbrainz');
        expect(p.name).toBe('ListenBrainz');
    });

    describe('isConfigured', () => {
        test('true when a token is stored', async () => {
            expect(await new ListenBrainzProvider(fakeDb('tok')).isConfigured()).toBe(true);
        });
        test('false without a token', async () => {
            expect(await new ListenBrainzProvider(fakeDb(null)).isConfigured()).toBe(false);
        });
    });

    describe('scrobble', () => {
        test('no-ops (no request) when not configured', async () => {
            await new ListenBrainzProvider(fakeDb(null)).scrobble({ artist: 'A', title: 'T' });
            expect(fetch).not.toHaveBeenCalled();
        });

        test('submits a single listen with auth header and correct payload', async () => {
            const p = new ListenBrainzProvider(fakeDb('my-token'));
            await p.scrobble({ artist: 'Daft Punk', title: 'Get Lucky', album: 'RAM', duration: 248.6 });

            expect(fetch).toHaveBeenCalledTimes(1);
            const [url, init] = (fetch as any).mock.calls[0];
            expect(url).toContain('/submit-listens');
            expect(init.method).toBe('POST');
            expect(init.headers.Authorization).toBe('Token my-token');

            const payload = JSON.parse(init.body as string);
            expect(payload.listen_type).toBe('single');
            const meta = payload.payload[0].track_metadata;
            expect(meta.artist_name).toBe('Daft Punk');
            expect(meta.track_name).toBe('Get Lucky');
            expect(meta.release_name).toBe('RAM');
            expect(meta.additional_info.duration).toBe(249); // rounded
            expect(meta.additional_info.submission_client).toBe('TuneCamp');
            expect(typeof payload.payload[0].listened_at).toBe('number');
        });

        test('throws on a non-ok response', async () => {
            (fetch as any).mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'unauthorized' });
            const p = new ListenBrainzProvider(fakeDb('tok'));
            await expect(p.scrobble({ artist: 'A', title: 'T' })).rejects.toThrow('ListenBrainz error 401');
        });
    });

    describe('nowPlaying', () => {
        test('submits a playing_now listen without listened_at', async () => {
            const p = new ListenBrainzProvider(fakeDb('tok'));
            await p.nowPlaying({ artist: 'A', title: 'T' });
            const payload = JSON.parse((fetch as any).mock.calls[0][1].body as string);
            expect(payload.listen_type).toBe('playing_now');
            expect(payload.payload[0].listened_at).toBeUndefined();
        });
    });
});
