import { describe, test, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import * as bandcampUtils from '../../../utils/bandcamp.js';
import { DigService } from '../dig.service.js';

const extractBandcampMetadataSpy = jest.spyOn(bandcampUtils, 'extractBandcampMetadata' as any);
const getTralbumCollectorsSpy = jest.spyOn(bandcampUtils, 'getTralbumCollectors' as any);
const getFanCollectionSpy = jest.spyOn(bandcampUtils, 'getFanCollection' as any);

/** Minimal in-memory stand-in for database.db (cache always misses, writes are no-ops). */
const mockDb = {
    prepare: () => ({
        get: () => undefined,
        run: () => ({ lastInsertRowid: 1 }),
        all: () => [],
    }),
};

const collectedItem = (id: number, title: string, artist: string) => ({
    tralbumId: id,
    tralbumType: 'a',
    title,
    artist,
    url: `https://x.bandcamp.com/album/${id}`,
    coverUrl: '',
    alsoCollectedCount: 0,
    previewUrl: null,
});

describe('DigService.dig — collector cross-reference ranking', () => {
    let service: any;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new DigService({ db: mockDb } as any);

        extractBandcampMetadataSpy.mockResolvedValue({
            title: 'Seed', artist: 'Seed Artist', year: 2020, cover: '', tracks: [],
            tralbumId: 999, tralbumType: 'a',
        } as any);
        getTralbumCollectorsSpy.mockResolvedValue([
            { fanId: 1, username: 'a', name: 'A', url: '' },
            { fanId: 2, username: 'b', name: 'B', url: '' },
            { fanId: 3, username: 'c', name: 'C', url: '' },
        ] as any);
    });

    test('ranks releases by how many collectors own them, excludes the seed', async () => {
        (getFanCollectionSpy as any).mockImplementation(async (fanId: number) => {
            const base = [collectedItem(100, 'Hit', 'Artist X'), collectedItem(999, 'Seed', 'Seed Artist')];
            if (fanId === 1) return base;
            if (fanId === 2) return [...base, collectedItem(200, 'Mid', 'Artist Y')];
            return [collectedItem(100, 'Hit', 'Artist X'), collectedItem(200, 'Mid', 'Artist Y'), collectedItem(300, 'Rare', 'Artist Z')];
        });

        const result = await service.dig('https://seed.bandcamp.com/album/seed', 'fast');

        expect(result.collectorsSampled).toBe(3);
        expect(result.results.map((r: any) => r.tralbumId)).toEqual([100, 200, 300]);
        expect(result.results.map((r: any) => r.score)).toEqual([3, 2, 1]);
        expect(result.results.find((r: any) => r.tralbumId === 999)).toBeUndefined();
    });

    test('counts a release at most once per collector (dedupe within a fan)', async () => {
        (getFanCollectionSpy as any).mockImplementation(async (fanId: number) => {
            if (fanId === 1) return [collectedItem(100, 'Hit', 'X'), collectedItem(100, 'Hit dup', 'X')];
            return [];
        });

        const result = await service.dig('https://seed.bandcamp.com/album/seed', 'fast');
        const hit = result.results.find((r: any) => r.tralbumId === 100);
        expect(hit.score).toBe(1);
    });

    test('throws when the seed release has no tralbum id', async () => {
        extractBandcampMetadataSpy.mockResolvedValue(null as any);
        await expect(service.dig('https://bad.url', 'fast')).rejects.toThrow();
    });
});
