import { describe, test, expect, beforeEach, beforeAll, jest } from '@jest/globals';

// catalog.service -> common/network pulls in node-fetch (ESM-only, untransformed by jest);
// stub the leaf module before importing the service so the graph loads under CJS.
jest.unstable_mockModule('node-fetch', () => ({
    default: jest.fn(),
    Response: class {},
}));

// Dynamic import is required so the module graph loads cleanly under ESM.
let CatalogService: any;

const mockDb = {
    getTracksByIds: jest.fn(),
};

const mockPublishing = {
    syncRelease: jest.fn<any>().mockResolvedValue(undefined),
};

const mockMetadata = {
    syncPhysicalTags: jest.fn<any>().mockResolvedValue(undefined),
};

describe('CatalogService.batchUpdateTracks', () => {
    let catalogService: any;

    beforeAll(async () => {
        const mod = await import('../catalog.service.js');
        CatalogService = mod.CatalogService;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        catalogService = new CatalogService(
            mockDb as any,
            mockPublishing as any,
            {} as any, // storage
            '/music', // musicDir
            {} as any, // openRouter
            mockMetadata as any
        );
        // updateTrack does heavy DB/file work; stub it to echo back a track with the given id.
        jest.spyOn(catalogService, 'updateTrack').mockImplementation(
            async (id: any) => ({ id: Number(id), album_id: null, owner_id: null })
        );
    });

    test('updates all tracks when ids arrive as strings (regression: string/number Map key mismatch)', async () => {
        // DB rows always carry numeric ids.
        mockDb.getTracksByIds.mockReturnValue([
            { id: 3026, owner_id: null, artist_id: null, album_id: null },
            { id: 3028, owner_id: null, artist_id: null, album_id: null },
        ]);

        // The HTTP layer delivers ids as strings.
        const res = await catalogService.batchUpdateTracks(['3026', '3028'], { genre: 'Rock' }, { isAdmin: true });

        expect(res.success).toBe(2);
        expect(res.failed).toBe(0);
        expect(res.errors).toEqual([]);
        // DB must be queried with numeric ids.
        expect(mockDb.getTracksByIds).toHaveBeenCalledWith([3026, 3028]);
    });

    test('reports genuinely missing tracks as not found', async () => {
        mockDb.getTracksByIds.mockReturnValue([
            { id: 3026, owner_id: null, artist_id: null, album_id: null },
        ]);

        const res = await catalogService.batchUpdateTracks(['3026', '9999'], { genre: 'Rock' }, { isAdmin: true });

        expect(res.success).toBe(1);
        expect(res.failed).toBe(1);
        expect(res.errors).toEqual(['Track 9999 not found']);
    });
});
