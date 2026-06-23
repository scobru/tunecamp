import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

let fetch: any;
let ITunesProvider: any;
let provider: any;

beforeAll(async () => {
    fetch = jest.fn();
    (globalThis as any).fetch = fetch;
    ({ ITunesProvider } = await import('../itunes.provider.js'));
    provider = new ITunesProvider();
});


beforeEach(() => {
    jest.clearAllMocks();
});

describe('ITunesProvider', () => {
    test('has the expected provider identity', () => {
        expect(provider.id).toBe('itunes');
        expect(provider.name).toBe('iTunes');
    });

    describe('searchRelease', () => {
        test('maps album results and upgrades artwork resolution', async () => {
            (fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [{
                        collectionId: 12345,
                        collectionName: 'Discovery',
                        artistName: 'Daft Punk',
                        releaseDate: '2001-03-12T08:00:00Z',
                        primaryGenreName: 'Electronic',
                        artworkUrl100: 'https://example.com/a/100x100bb.jpg'
                    }]
                })
            });

            const results = await provider.searchRelease('Daft Punk Discovery');

            expect(results).toEqual([{
                id: '12345',
                title: 'Discovery',
                artist: 'Daft Punk',
                date: '2001-03-12T08:00:00Z',
                year: 2001,
                genre: 'Electronic',
                coverUrl: 'https://example.com/a/1400x1400bb.jpg',
                source: 'itunes'
            }]);

            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('entity=album'),
                expect.anything()
            );
        });

        test('url-encodes the query term', async () => {
            (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) });
            await provider.searchRelease('AC/DC Back In Black');
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('term=AC%2FDC%20Back%20In%20Black'),
                expect.anything()
            );
        });

        test('handles missing artwork and release date gracefully', async () => {
            (fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [{ collectionId: 7, collectionName: 'X', artistName: 'Y' }]
                })
            });

            const [r] = await provider.searchRelease('q');
            expect(r.year).toBeUndefined();
            expect(r.date).toBe('');
            expect(r.coverUrl).toBeUndefined();
        });

        test('returns [] on a non-ok response', async () => {
            const text = jest.fn(async () => '');
            (fetch as any).mockResolvedValueOnce({ ok: false, status: 503, bodyUsed: false, text });
            const results = await provider.searchRelease('q');
            expect(results).toEqual([]);
            // body should be drained to avoid leaks
            expect(text).toHaveBeenCalled();
        });

        test('returns [] when fetch throws', async () => {
            (fetch as any).mockRejectedValueOnce(new Error('network down'));
            const results = await provider.searchRelease('q');
            expect(results).toEqual([]);
        });

        test('tolerates a missing results array', async () => {
            (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
            expect(await provider.searchRelease('q')).toEqual([]);
        });
    });

    describe('searchRecording', () => {
        test('maps song results with album title and trackId', async () => {
            (fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: [{
                        trackId: 999,
                        trackName: 'One More Time',
                        artistName: 'Daft Punk',
                        collectionName: 'Discovery',
                        releaseDate: '2000-01-01T00:00:00Z',
                        primaryGenreName: 'Electronic',
                        artworkUrl100: 'https://example.com/b/100x100bb.jpg'
                    }]
                })
            });

            const [r] = await provider.searchRecording('Daft Punk One More Time');
            expect(r.id).toBe('999');
            expect(r.title).toBe('One More Time');
            expect(r.albumTitle).toBe('Discovery');
            expect(r.year).toBe(2000);
            expect(r.coverUrl).toBe('https://example.com/b/1400x1400bb.jpg');
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('entity=song'),
                expect.anything()
            );
        });
    });

    describe('getCoverUrl', () => {
        test('returns upscaled artwork from the lookup endpoint', async () => {
            (fetch as any).mockResolvedValueOnce({
                json: async () => ({ results: [{ artworkUrl100: 'https://x/100x100bb.jpg' }] })
            });
            const url = await provider.getCoverUrl('12345');
            expect(url).toBe('https://x/1400x1400bb.jpg');
            expect(fetch).toHaveBeenCalledWith(expect.stringContaining('lookup?id=12345'));
        });

        test('returns null when no artwork is present', async () => {
            (fetch as any).mockResolvedValueOnce({ json: async () => ({ results: [{}] }) });
            expect(await provider.getCoverUrl('1')).toBeNull();
        });

        test('returns null when the lookup throws', async () => {
            (fetch as any).mockRejectedValueOnce(new Error('boom'));
            expect(await provider.getCoverUrl('1')).toBeNull();
        });
    });
});
