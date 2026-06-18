import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

// ESM module namespaces are read-only, so spying on the bindings directly fails.
// Mock the utils module and import the SUT dynamically so it picks up the mock.
const BANDCAMP_IMAGE_BASE = 'https://f4.bcbits.com/img';
const searchBandcampSpy: any = jest.fn();
const extractBandcampMetadataSpy: any = jest.fn();

jest.unstable_mockModule('../../../utils/bandcamp.js', () => ({
    searchBandcamp: searchBandcampSpy,
    extractBandcampMetadata: extractBandcampMetadataSpy,
    BANDCAMP_IMAGE_BASE,
}));

let BandcampMetadataProvider: any;
let provider: any;

beforeAll(async () => {
    ({ BandcampMetadataProvider } = await import('../bandcamp.metadata.js'));
    provider = new BandcampMetadataProvider();
});

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('BandcampMetadataProvider', () => {
    test('has the expected provider identity', () => {
        expect(provider.id).toBe('bandcamp');
        expect(provider.name).toBe('Bandcamp');
    });

    describe('searchRelease', () => {
        test('searches albums and builds an upscaled cover url from art_id', async () => {
            searchBandcampSpy.mockResolvedValueOnce([
                { url: 'https://a.bandcamp.com/album/x', name: 'X', band_name: 'Band', genre_name: 'Rock', art_id: 123 },
            ] as any);

            const [r] = await provider.searchRelease('x');

            expect(searchBandcampSpy).toHaveBeenCalledWith('x', 'a', 10);
            expect(r).toMatchObject({
                id: 'https://a.bandcamp.com/album/x',
                title: 'X',
                artist: 'Band',
                date: '',
                genre: 'Rock',
                coverUrl: `${BANDCAMP_IMAGE_BASE}/a0000000123_2.jpg`,
                source: 'bandcamp',
            });
        });

        test('falls back to img and "Unknown" artist when art_id/band_name are absent', async () => {
            searchBandcampSpy.mockResolvedValueOnce([
                { url: 'u', name: 'N', img: 'https://img/fallback.jpg' },
            ] as any);
            const [r] = await provider.searchRelease('q');
            expect(r.artist).toBe('Unknown');
            expect(r.coverUrl).toBe('https://img/fallback.jpg');
        });

        test('returns [] on error', async () => {
            searchBandcampSpy.mockRejectedValueOnce(new Error('down'));
            expect(await provider.searchRelease('q')).toEqual([]);
        });
    });

    describe('searchRecording', () => {
        test('searches tracks and carries the album title', async () => {
            searchBandcampSpy.mockResolvedValueOnce([
                { url: 'turl', name: 'Track', band_name: 'Band', album_name: 'Album', art_id: 5 },
            ] as any);
            const [r] = await provider.searchRecording('track');
            expect(searchBandcampSpy).toHaveBeenCalledWith('track', 't', 10);
            expect(r.albumTitle).toBe('Album');
            expect(r.coverUrl).toBe(`${BANDCAMP_IMAGE_BASE}/a0000000005_2.jpg`);
        });

        test('returns [] on error', async () => {
            searchBandcampSpy.mockRejectedValueOnce(new Error('down'));
            expect(await provider.searchRecording('q')).toEqual([]);
        });
    });

    describe('searchArtist', () => {
        test('searches bands and maps location to bio', async () => {
            searchBandcampSpy.mockResolvedValueOnce([
                { url: 'burl', name: 'Band', location: 'Berlin', img: 'https://img/band.jpg' },
            ] as any);
            const [r] = await provider.searchArtist('band');
            expect(searchBandcampSpy).toHaveBeenCalledWith('band', 'b', 5);
            expect(r).toMatchObject({ id: 'burl', name: 'Band', bio: 'Berlin', avatarUrl: 'https://img/band.jpg', source: 'bandcamp' });
        });

        test('returns [] on error', async () => {
            searchBandcampSpy.mockRejectedValueOnce(new Error('down'));
            expect(await provider.searchArtist('q')).toEqual([]);
        });
    });

    describe('getCoverUrl', () => {
        test('extracts cover metadata for a bandcamp url', async () => {
            extractBandcampMetadataSpy.mockResolvedValueOnce({ cover: 'https://img/cover.jpg' } as any);
            expect(await provider.getCoverUrl('https://a.bandcamp.com/album/x')).toBe('https://img/cover.jpg');
            expect(extractBandcampMetadataSpy).toHaveBeenCalledWith('https://a.bandcamp.com/album/x');
        });

        test('returns null when the metadata has no cover', async () => {
            extractBandcampMetadataSpy.mockResolvedValueOnce({} as any);
            expect(await provider.getCoverUrl('https://a.bandcamp.com/album/x')).toBeNull();
        });

        test('returns null for a non-url id without hitting the network', async () => {
            expect(await provider.getCoverUrl('12345')).toBeNull();
            expect(extractBandcampMetadataSpy).not.toHaveBeenCalled();
        });
    });
});
