import { describe, test, expect, beforeAll, beforeEach, jest } from '@jest/globals';

// Mock the Bandcamp scraping layer before importing the service (ESM rules).
jest.unstable_mockModule('../../../utils/bandcamp.js', () => ({
    BANDCAMP_IMAGE_BASE: 'https://img.test',
    searchBandcamp: jest.fn(),
    extractBandcampMetadata: jest.fn(),
    getTralbumCollectors: jest.fn(),
    getFanCollection: jest.fn(),
}));

let DigService: any;
let bandcamp: any;

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

    beforeAll(async () => {
        bandcamp = await import('../../../utils/bandcamp.js');
        ({ DigService } = await import('../dig.service.js'));
    });

    beforeEach(() => {
        jest.clearAllMocks();
        service = new DigService({ db: mockDb } as any);

        bandcamp.extractBandcampMetadata.mockResolvedValue({
            title: 'Seed', artist: 'Seed Artist', year: 2020, cover: '', tracks: [],
            tralbumId: 999, tralbumType: 'a',
        });
        bandcamp.getTralbumCollectors.mockResolvedValue([
            { fanId: 1, username: 'a', name: 'A', url: '' },
            { fanId: 2, username: 'b', name: 'B', url: '' },
            { fanId: 3, username: 'c', name: 'C', url: '' },
        ]);
    });

    test('ranks releases by how many collectors own them, excludes the seed', async () => {
        // Release 100 in all 3 collections, 200 in 2, 300 in 1. Seed (999) must be ignored.
        bandcamp.getFanCollection.mockImplementation(async (fanId: number) => {
            const base = [collectedItem(100, 'Hit', 'Artist X'), collectedItem(999, 'Seed', 'Seed Artist')];
            if (fanId === 1) return base;
            if (fanId === 2) return [...base, collectedItem(200, 'Mid', 'Artist Y')];
            return [collectedItem(100, 'Hit', 'Artist X'), collectedItem(200, 'Mid', 'Artist Y'), collectedItem(300, 'Rare', 'Artist Z')];
        });

        const result = await service.dig('https://seed.bandcamp.com/album/seed', 'fast');

        expect(result.collectorsSampled).toBe(3);
        expect(result.results.map((r: any) => r.tralbumId)).toEqual([100, 200, 300]);
        expect(result.results.map((r: any) => r.score)).toEqual([3, 2, 1]);
        // Seed must never appear in the results.
        expect(result.results.find((r: any) => r.tralbumId === 999)).toBeUndefined();
    });

    test('counts a release at most once per collector (dedupe within a fan)', async () => {
        // Fan 1 lists release 100 twice; it should still count as 1 for that fan.
        bandcamp.getFanCollection.mockImplementation(async (fanId: number) => {
            if (fanId === 1) return [collectedItem(100, 'Hit', 'X'), collectedItem(100, 'Hit dup', 'X')];
            return [];
        });

        const result = await service.dig('https://seed.bandcamp.com/album/seed', 'fast');
        const hit = result.results.find((r: any) => r.tralbumId === 100);
        expect(hit.score).toBe(1);
    });

    test('throws when the seed release has no tralbum id', async () => {
        bandcamp.extractBandcampMetadata.mockResolvedValue(null);
        await expect(service.dig('https://bad.url', 'fast')).rejects.toThrow();
    });
});
