import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

jest.unstable_mockModule('node-fetch', () => ({
    default: jest.fn()
}));

let fetch: any;
let MusicBrainzProvider: any;
let provider: any;

beforeAll(async () => {
    ({ default: fetch } = await import('node-fetch'));
    ({ MusicBrainzProvider } = await import('../musicbrainz.provider.js'));
    provider = new MusicBrainzProvider();
});


beforeEach(() => {
    jest.clearAllMocks();
    // Reset the static rate-limit clock so tests never block on waitIfNecessary().
    // With lastRequestTime = 0, the gap since "last request" is always > the interval.
    (MusicBrainzProvider as any).lastRequestTime = 0;
});

describe('MusicBrainzProvider', () => {
    test('has the expected provider identity', () => {
        expect(provider.id).toBe('musicbrainz');
        expect(provider.name).toBe('MusicBrainz');
    });

    describe('searchRelease', () => {
        test('maps releases and builds a cover art archive url', async () => {
            (fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    releases: [{
                        id: 'mbid-1',
                        title: 'Random Access Memories',
                        'artist-credit': [{ name: 'Daft Punk' }],
                        date: '2013-05-17',
                        genres: [{ name: 'Disco' }]
                    }]
                })
            });

            const [r] = await provider.searchRelease('Daft Punk - Random Access Memories');
            expect(r.id).toBe('mbid-1');
            expect(r.artist).toBe('Daft Punk');
            expect(r.year).toBe(2013);
            expect(r.genre).toBe('Disco');
            expect(r.coverUrl).toBe('https://coverartarchive.org/release/mbid-1/front-250');
            expect(r.source).toBe('musicbrainz');
        });

        test('turns "Artist - Title" into a fielded lucene query', async () => {
            (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ releases: [] }) });
            await provider.searchRelease('Daft Punk - Discovery');
            const calledUrl = (fetch as any).mock.calls[0][0] as string;
            const decoded = decodeURIComponent(calledUrl);
            expect(decoded).toContain('artist:"Daft Punk"');
            expect(decoded).toContain('release:"Discovery"');
        });

        test('falls back to "Unknown" artist and tag genre', async () => {
            (fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    releases: [{ id: 'm2', title: 'T', tags: [{ name: 'rock' }] }]
                })
            });
            const [r] = await provider.searchRelease('plain query');
            expect(r.artist).toBe('Unknown');
            expect(r.genre).toBe('rock');
            expect(r.year).toBeUndefined();
        });

        test('returns [] on a generic error status', async () => {
            const text = jest.fn(async () => '');
            (fetch as any).mockResolvedValueOnce({ ok: false, status: 500, bodyUsed: false, text });
            expect(await provider.searchRelease('q')).toEqual([]);
        });

        test('retries once on a 429 and returns the retried result', async () => {
            jest.useFakeTimers();
            try {
                (fetch as any)
                    .mockResolvedValueOnce({ ok: false, status: 429, bodyUsed: false, text: async () => '' })
                    .mockResolvedValueOnce({ ok: true, json: async () => ({ releases: [{ id: 'm3', title: 'T' }] }) });

                const promise = provider.searchRelease('q');
                // advance past the 2s backoff
                await jest.advanceTimersByTimeAsync(2100);
                const results = await promise;

                expect(results).toHaveLength(1);
                expect(results[0].id).toBe('m3');
                expect(fetch).toHaveBeenCalledTimes(2);
            } finally {
                jest.useRealTimers();
            }
        });

        test('returns [] when fetch throws', async () => {
            (fetch as any).mockRejectedValueOnce(new Error('network'));
            expect(await provider.searchRelease('q')).toEqual([]);
        });
    });

    describe('searchRecording', () => {
        test('maps recordings using the first release for album/year/cover', async () => {
            (fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    recordings: [{
                        id: 'rec-1',
                        title: 'Get Lucky',
                        'artist-credit': [{ name: 'Daft Punk' }],
                        releases: [{ id: 'rel-1', title: 'Random Access Memories', date: '2013-05-17' }]
                    }]
                })
            });

            const [r] = await provider.searchRecording('Daft Punk - Get Lucky');
            expect(r.id).toBe('rec-1');
            expect(r.albumTitle).toBe('Random Access Memories');
            expect(r.year).toBe(2013);
            expect(r.coverUrl).toBe('https://coverartarchive.org/release/rel-1/front-250');
        });

        test('handles recordings without releases', async () => {
            (fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ recordings: [{ id: 'rec-2', title: 'T', 'artist-credit': [{ name: 'A' }] }] })
            });
            const [r] = await provider.searchRecording('q');
            expect(r.albumTitle).toBeUndefined();
            expect(r.coverUrl).toBeUndefined();
            expect(r.year).toBeUndefined();
        });
    });

    describe('getCoverUrl', () => {
        test('builds the front cover url for the given mbid', async () => {
            expect(await provider.getCoverUrl('abc')).toBe('https://coverartarchive.org/release/abc/front');
        });
    });
});
