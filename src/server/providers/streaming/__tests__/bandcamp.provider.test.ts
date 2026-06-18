import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import * as bandcampUtils from '../../../utils/bandcamp.js';
import { BANDCAMP_IMAGE_BASE } from '../../../utils/bandcamp.js';
import { BandcampProvider } from '../bandcamp.provider.js';

const searchBandcampSpy = jest.spyOn(bandcampUtils, 'searchBandcamp' as any);
const extractBandcampMetadataSpy = jest.spyOn(bandcampUtils, 'extractBandcampMetadata' as any);

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
            searchBandcampSpy.mockResolvedValueOnce([
                { url: 'https://a.bandcamp.com/track/x', name: 'X', band_name: 'Band', art_id: 9 },
            ] as any);
            const [c] = await provider.search('x');
            expect(searchBandcampSpy).toHaveBeenCalledWith('x', 't', 10);
            expect(c).toMatchObject({
                id: 'https://a.bandcamp.com/track/x',
                title: 'X',
                artist: 'Band',
                provider: 'bandcamp',
                thumbnail: `${BANDCAMP_IMAGE_BASE}/a0000000009_2.jpg`,
                meta: { url: 'https://a.bandcamp.com/track/x' },
            });
        });

        test('returns [] on error', async () => {
            searchBandcampSpy.mockRejectedValueOnce(new Error('down'));
            expect(await provider.search('q')).toEqual([]);
        });
    });

    describe('getStreamById', () => {
        test('returns the first track stream url from scraped metadata', async () => {
            extractBandcampMetadataSpy.mockResolvedValueOnce({ tracks: [{ streamUrl: 'https://stream/1.mp3' }] } as any);
            expect(await provider.getStreamById('https://a.bandcamp.com/track/x')).toBe('https://stream/1.mp3');
        });

        test('returns null when there are no tracks', async () => {
            extractBandcampMetadataSpy.mockResolvedValueOnce({ tracks: [] } as any);
            expect(await provider.getStreamById('url')).toBeNull();
        });

        test('returns null on error', async () => {
            extractBandcampMetadataSpy.mockRejectedValueOnce(new Error('boom'));
            expect(await provider.getStreamById('url')).toBeNull();
        });
    });

    describe('getStreamUrl', () => {
        test('prefers an exact title+artist match, then resolves its stream', async () => {
            searchBandcampSpy.mockResolvedValueOnce([
                { url: 'other', name: 'Other', band_name: 'Band' },
                { url: 'exact', name: 'Song', band_name: 'Artist' },
            ] as any);
            extractBandcampMetadataSpy.mockResolvedValueOnce({ tracks: [{ streamUrl: 'https://stream/exact.mp3' }] } as any);

            const url = await provider.getStreamUrl('Song', 'Artist');

            expect(url).toBe('https://stream/exact.mp3');
            expect(extractBandcampMetadataSpy).toHaveBeenCalledWith('exact');
        });

        test('falls back to the first candidate when there is no exact match', async () => {
            searchBandcampSpy.mockResolvedValueOnce([
                { url: 'first', name: 'Different', band_name: 'Band' },
            ] as any);
            extractBandcampMetadataSpy.mockResolvedValueOnce({ tracks: [{ streamUrl: 'https://stream/first.mp3' }] } as any);

            const url = await provider.getStreamUrl('Song', 'Artist');
            expect(url).toBe('https://stream/first.mp3');
            expect(extractBandcampMetadataSpy).toHaveBeenCalledWith('first');
        });

        test('returns null when the search yields nothing', async () => {
            searchBandcampSpy.mockResolvedValueOnce([] as any);
            expect(await provider.getStreamUrl('Song', 'Artist')).toBeNull();
        });
    });
});
