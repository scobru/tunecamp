import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const IMG_BASE = 'https://img.bcbits.test';

jest.unstable_mockModule('../../../utils/bandcamp.js', () => ({
    searchBandcamp: jest.fn(),
    extractBandcampMetadata: jest.fn(),
    BANDCAMP_IMAGE_BASE: IMG_BASE,
}));

const { searchBandcamp, extractBandcampMetadata } = await import('../../../utils/bandcamp.js');
const { BandcampProvider } = await import('../bandcamp.provider.js');

const provider = new BandcampProvider();

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('BandcampProvider (streaming)', () => {
    test('canHandle recognises bandcamp source ids', () => {
        expect(provider.canHandle('https://artist.bandcamp.com/track/x')).toBe(true);
        expect(provider.canHandle('https://soundcloud.com/x')).toBe(false);
    });

    describe('search', () => {
        test('maps track results into stream candidates', async () => {
            (searchBandcamp as any).mockResolvedValueOnce([
                { url: 'https://a.bandcamp.com/track/x', name: 'X', band_name: 'Band', art_id: 9 },
            ]);
            const [c] = await provider.search('x');
            expect(searchBandcamp).toHaveBeenCalledWith('x', 't', 10);
            expect(c).toEqual({
                id: 'https://a.bandcamp.com/track/x',
                title: 'X',
                artist: 'Band',
                provider: 'bandcamp',
                thumbnail: `${IMG_BASE}/a0000000009_2.jpg`,
                meta: { url: 'https://a.bandcamp.com/track/x' },
            });
        });

        test('returns [] on error', async () => {
            (searchBandcamp as any).mockRejectedValueOnce(new Error('down'));
            expect(await provider.search('q')).toEqual([]);
        });
    });

    describe('getStreamById', () => {
        test('returns the first track stream url from scraped metadata', async () => {
            (extractBandcampMetadata as any).mockResolvedValueOnce({ tracks: [{ streamUrl: 'https://stream/1.mp3' }] });
            expect(await provider.getStreamById('https://a.bandcamp.com/track/x')).toBe('https://stream/1.mp3');
        });

        test('returns null when there are no tracks', async () => {
            (extractBandcampMetadata as any).mockResolvedValueOnce({ tracks: [] });
            expect(await provider.getStreamById('url')).toBeNull();
        });

        test('returns null on error', async () => {
            (extractBandcampMetadata as any).mockRejectedValueOnce(new Error('boom'));
            expect(await provider.getStreamById('url')).toBeNull();
        });
    });

    describe('getStreamUrl', () => {
        test('prefers an exact title+artist match, then resolves its stream', async () => {
            (searchBandcamp as any).mockResolvedValueOnce([
                { url: 'other', name: 'Other', band_name: 'Band' },
                { url: 'exact', name: 'Song', band_name: 'Artist' },
            ]);
            (extractBandcampMetadata as any).mockResolvedValueOnce({ tracks: [{ streamUrl: 'https://stream/exact.mp3' }] });

            const url = await provider.getStreamUrl('Song', 'Artist');

            expect(url).toBe('https://stream/exact.mp3');
            expect(extractBandcampMetadata).toHaveBeenCalledWith('exact');
        });

        test('falls back to the first candidate when there is no exact match', async () => {
            (searchBandcamp as any).mockResolvedValueOnce([
                { url: 'first', name: 'Different', band_name: 'Band' },
            ]);
            (extractBandcampMetadata as any).mockResolvedValueOnce({ tracks: [{ streamUrl: 'https://stream/first.mp3' }] });

            const url = await provider.getStreamUrl('Song', 'Artist');
            expect(url).toBe('https://stream/first.mp3');
            expect(extractBandcampMetadata).toHaveBeenCalledWith('first');
        });

        test('returns null when the search yields nothing', async () => {
            (searchBandcamp as any).mockResolvedValueOnce([]);
            expect(await provider.getStreamUrl('Song', 'Artist')).toBeNull();
        });
    });
});
