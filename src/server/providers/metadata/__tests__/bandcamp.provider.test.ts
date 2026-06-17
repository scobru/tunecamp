import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const IMG_BASE = 'https://img.bcbits.test';

jest.unstable_mockModule('../../../utils/bandcamp.js', () => ({
    searchBandcamp: jest.fn(),
    extractBandcampMetadata: jest.fn(),
    BANDCAMP_IMAGE_BASE: IMG_BASE,
}));

const { searchBandcamp, extractBandcampMetadata } = await import('../../../utils/bandcamp.js');
const { BandcampMetadataProvider } = await import('../bandcamp.metadata.js');

const provider = new BandcampMetadataProvider();

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
            (searchBandcamp as any).mockResolvedValueOnce([
                { url: 'https://a.bandcamp.com/album/x', name: 'X', band_name: 'Band', genre_name: 'Rock', art_id: 123 },
            ]);

            const [r] = await provider.searchRelease('x');

            expect(searchBandcamp).toHaveBeenCalledWith('x', 'a', 10);
            expect(r).toEqual({
                id: 'https://a.bandcamp.com/album/x',
                title: 'X',
                artist: 'Band',
                date: '',
                genre: 'Rock',
                coverUrl: `${IMG_BASE}/a0000000123_2.jpg`,
                source: 'bandcamp',
            });
        });

        test('falls back to img and "Unknown" artist when art_id/band_name are absent', async () => {
            (searchBandcamp as any).mockResolvedValueOnce([
                { url: 'u', name: 'N', img: 'https://img/fallback.jpg' },
            ]);
            const [r] = await provider.searchRelease('q');
            expect(r.artist).toBe('Unknown');
            expect(r.coverUrl).toBe('https://img/fallback.jpg');
        });

        test('returns [] on error', async () => {
            (searchBandcamp as any).mockRejectedValueOnce(new Error('down'));
            expect(await provider.searchRelease('q')).toEqual([]);
        });
    });

    describe('searchRecording', () => {
        test('searches tracks and carries the album title', async () => {
            (searchBandcamp as any).mockResolvedValueOnce([
                { url: 'turl', name: 'Track', band_name: 'Band', album_name: 'Album', art_id: 5 },
            ]);
            const [r] = await provider.searchRecording('track');
            expect(searchBandcamp).toHaveBeenCalledWith('track', 't', 10);
            expect(r.albumTitle).toBe('Album');
            expect(r.coverUrl).toBe(`${IMG_BASE}/a0000000005_2.jpg`);
        });

        test('returns [] on error', async () => {
            (searchBandcamp as any).mockRejectedValueOnce(new Error('down'));
            expect(await provider.searchRecording('q')).toEqual([]);
        });
    });

    describe('searchArtist', () => {
        test('searches bands and maps location to bio', async () => {
            (searchBandcamp as any).mockResolvedValueOnce([
                { url: 'burl', name: 'Band', location: 'Berlin', img: 'https://img/band.jpg' },
            ]);
            const [r] = await provider.searchArtist('band');
            expect(searchBandcamp).toHaveBeenCalledWith('band', 'b', 5);
            expect(r).toEqual({ id: 'burl', name: 'Band', bio: 'Berlin', avatarUrl: 'https://img/band.jpg', source: 'bandcamp' });
        });

        test('returns [] on error', async () => {
            (searchBandcamp as any).mockRejectedValueOnce(new Error('down'));
            expect(await provider.searchArtist('q')).toEqual([]);
        });
    });

    describe('getCoverUrl', () => {
        test('extracts cover metadata for a bandcamp url', async () => {
            (extractBandcampMetadata as any).mockResolvedValueOnce({ cover: 'https://img/cover.jpg' });
            expect(await provider.getCoverUrl('https://a.bandcamp.com/album/x')).toBe('https://img/cover.jpg');
            expect(extractBandcampMetadata).toHaveBeenCalledWith('https://a.bandcamp.com/album/x');
        });

        test('returns null when the metadata has no cover', async () => {
            (extractBandcampMetadata as any).mockResolvedValueOnce({});
            expect(await provider.getCoverUrl('https://a.bandcamp.com/album/x')).toBeNull();
        });

        test('returns null for a non-url id without hitting the network', async () => {
            expect(await provider.getCoverUrl('12345')).toBeNull();
            expect(extractBandcampMetadata).not.toHaveBeenCalled();
        });
    });
});
