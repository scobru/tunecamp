import { describe, test, expect, beforeEach, beforeAll, jest } from '@jest/globals';

// We must use unstable_mockModule before any other imports in ESM
jest.unstable_mockModule('../metadata.service.js', () => {
    return {
        metadataService: {
            searchRecording: jest.fn()
        }
    };
});

// Dynamic imports for mocked modules
let AutoTaggerService: any;
let metadataService: any;

// Mock other dependencies
const mockDb = {
    getTracks: jest.fn(),
};

const mockCatalogService = {
    updateTrack: jest.fn(),
};

const mockOpenRouter = {
    enrichMetadata: jest.fn(),
};

describe('AutoTaggerService', () => {
    let autoTagger: any;

    beforeAll(async () => {
        const autotaggerModule = await import('../autotagger.service.js');
        const metadataModule = await import('../metadata.service.js');
        AutoTaggerService = autotaggerModule.AutoTaggerService;
        metadataService = metadataModule.metadataService;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        autoTagger = new AutoTaggerService(
            mockDb as any,
            mockCatalogService as any,
            mockOpenRouter as any
        );
    });

    test('getStatus should return initial status', () => {
        const status = autoTagger.getStatus();
        expect(status.isScanning).toBe(false);
        expect(status.totalTracks).toBe(0);
    });

    test('similarity should calculate correct score', () => {
        // @ts-ignore - accessing private method for testing
        expect(autoTagger.similarity('hello', 'hello')).toBe(1.0);
        // @ts-ignore
        expect(autoTagger.similarity('hello', 'world')).toBeLessThan(0.5);
        // @ts-ignore
        expect(autoTagger.similarity('test', 'tst')).toBe(0.75);
    });

    test('auditTrack should return no_match when no metadata found', async () => {
        const track = { id: 1, title: 'Unknown Song', artist_name: 'Unknown Artist' } as any;
        (metadataService.searchRecording as any).mockResolvedValue([]);
        const result = await autoTagger.auditTrack(track, { useAI: false });

        expect(result.status).toBe('no_match');
        expect(result.confidence).toBe(0);
    });

    test('auditTrack should repair track when high confidence match found', async () => {
        const track = { id: 1, title: 'Imagine', artist_name: 'John Lennon', genre: 'Library' } as any;
        const matches = [
            { 
                id: '123', 
                title: 'Imagine', 
                artist: 'John Lennon', 
                genre: 'Rock', 
                year: 1971 
            }
        ];
        (metadataService.searchRecording as any).mockResolvedValue(matches);
        (mockCatalogService.updateTrack as any).mockResolvedValue(undefined);

        const result = await autoTagger.auditTrack(track, { forceRepair: true });

        expect(result.status).toBe('repaired');
        expect(result.confidence).toBe(1.0);
        expect(result.changes?.genre.new).toBe('Rock');
        expect(mockCatalogService.updateTrack).toHaveBeenCalledWith(1, expect.objectContaining({
            genre: 'Rock',
            year: 1971
        }));
    });

    test('auditTrack should use AI when no provider match and useAI is true', async () => {
        const track = { id: 1, title: 'Obscure Song', artist_name: 'Obscure Artist' } as any;
        (metadataService.searchRecording as any).mockResolvedValue([]);
        (mockOpenRouter.enrichMetadata as any).mockResolvedValue({
            genre: 'Electronic',
            year: 2024
        });

        const result = await autoTagger.auditTrack(track, { useAI: true, forceRepair: true });

        expect(result.status).toBe('repaired');
        expect(result.changes?.genre.new).toBe('Electronic');
        expect(mockOpenRouter.enrichMetadata).toHaveBeenCalled();
    });

    test('isBetter should correctly identify better metadata', () => {
        // @ts-ignore
        expect(autoTagger.isBetter(null, 'Something')).toBe(true);
        // @ts-ignore
        expect(autoTagger.isBetter('Library', 'Rock')).toBe(true);
        // @ts-ignore
        expect(autoTagger.isBetter('Rock', 'Rock')).toBe(false);
        // @ts-ignore
        expect(autoTagger.isBetter('Unknown Artist', 'Pink Floyd')).toBe(true);
        // @ts-ignore
        expect(autoTagger.isBetter('Electronic', 'Techno')).toBe(false); // Same length, not necessarily better
        // @ts-ignore
        expect(autoTagger.isBetter('Pop', 'Synthpop')).toBe(true); // Longer is considered better
    });
});
