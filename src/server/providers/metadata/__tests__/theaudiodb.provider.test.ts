import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

let fetch: any;
let TheAudioDBProvider: any;
let provider: any;

beforeAll(async () => {
    fetch = jest.fn();
    (globalThis as any).fetch = fetch;
    ({ TheAudioDBProvider } = await import('../theaudiodb.provider.js'));
    provider = new TheAudioDBProvider();
});


beforeEach(() => {
    jest.clearAllMocks();
});

describe('TheAudioDBProvider', () => {
    test('has the expected provider identity', () => {
        expect(provider.id).toBe('theaudiodb');
        expect(provider.name).toBe('TheAudioDB');
    });

    test('release/recording/cover lookups are no-ops (artist-focused provider)', async () => {
        expect(await provider.searchRelease('q')).toEqual([]);
        expect(await provider.searchRecording('q')).toEqual([]);
        expect(await provider.getCoverUrl('1')).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    describe('searchArtist', () => {
        test('maps artist with biography, avatar and normalized links', async () => {
            (fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    artists: [{
                        idArtist: '111',
                        strArtist: 'Daft Punk',
                        strBiographyEN: 'A French duo.',
                        strBiographyIT: 'Un duo francese.',
                        strArtistThumb: 'https://img/thumb.jpg',
                        strWebsite: 'daftpunk.com',
                        strFacebook: 'https://facebook.com/daftpunk',
                        strTwitter: 'twitter.com/daftpunk'
                    }]
                })
            });

            const [a] = await provider.searchArtist('Daft Punk');
            expect(a.id).toBe('111');
            expect(a.name).toBe('Daft Punk');
            expect(a.bio).toBe('A French duo.');
            expect(a.avatarUrl).toBe('https://img/thumb.jpg');
            expect(a.source).toBe('theaudiodb');

            // links: bare domains get an https:// prefix, full urls are kept as-is
            expect(a.links).toContainEqual({ platform: 'website', url: 'https://daftpunk.com', type: 'music' });
            expect(a.links).toContainEqual({ platform: 'facebook', url: 'https://facebook.com/daftpunk', type: 'social' });
            expect(a.links).toContainEqual({ platform: 'twitter', url: 'https://twitter.com/daftpunk', type: 'social' });
        });

        test('falls back to fanart when no thumb, and omits absent links', async () => {
            (fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    artists: [{ idArtist: '2', strArtist: 'X', strArtistFanart: 'https://img/fan.jpg' }]
                })
            });
            const [a] = await provider.searchArtist('X');
            expect(a.avatarUrl).toBe('https://img/fan.jpg');
            expect(a.links).toEqual([]);
        });

        test('url-encodes the search term and uses the public api key', async () => {
            (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ artists: null }) });
            await provider.searchArtist('Sigur Rós');
            const url = (fetch as any).mock.calls[0][0] as string;
            expect(url).toContain('/api/v1/json/2/search.php');
            expect(url).toContain('s=Sigur%20R%C3%B3s');
        });

        test('returns [] when artists is null', async () => {
            (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ artists: null }) });
            expect(await provider.searchArtist('nobody')).toEqual([]);
        });

        test('returns [] on a non-ok response', async () => {
            const text = jest.fn(async () => '');
            (fetch as any).mockResolvedValueOnce({ ok: false, status: 429, bodyUsed: false, text });
            expect(await provider.searchArtist('q')).toEqual([]);
        });

        test('returns [] when fetch throws', async () => {
            (fetch as any).mockRejectedValueOnce(new Error('network'));
            expect(await provider.searchArtist('q')).toEqual([]);
        });
    });
});
