import { describe, test, expect, beforeEach, beforeAll, jest } from '@jest/globals';

// We must use unstable_mockModule before any other imports in ESM
jest.unstable_mockModule('../metadata.service.js', () => {
    return {
        metadataService: {
            searchRecording: jest.fn(),
            searchRelease: jest.fn(),
            searchArtist: jest.fn(),
        }
    };
});

// Dynamic imports are required for mocked modules in ESM
let MaintenanceService: any;
let metadataService: any;

// Mock dependencies
const mockDb = {
    getTracksByIds: jest.fn(),
    getTracksMissingMetadata: jest.fn(),
    getTrack: jest.fn(),
    getAlbum: jest.fn(),
    getAlbumByTitle: jest.fn(),
    createAlbum: jest.fn(),
    updateArtist: jest.fn(),
    getTracks: jest.fn(),
};

const mockCatalogService = {
    updateTrack: jest.fn(),
    updateAlbum: jest.fn(),
    analyzeFingerprint: jest.fn(),
};

const mockOpenRouter = {
    enrichMetadata: jest.fn(),
    identifyArtist: jest.fn(),
    identifyAlbum: jest.fn(),
};

const mockFingerprinting = {};
const mockZendb = {
    getFingerprintMetadata: jest.fn(),
    shareFingerprint: jest.fn(),
};

const mockAutotagger = {
    startAudit: jest.fn(),
    getStatus: jest.fn(),
    stopAudit: jest.fn(),
};

describe('MaintenanceService', () => {
    let maintenanceService: any;

    beforeAll(async () => {
        const maintenanceModule = await import('../maintenance.service.js');
        const metadataModule = await import('../metadata.service.js');
        MaintenanceService = maintenanceModule.MaintenanceService;
        metadataService = metadataModule.metadataService;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        maintenanceService = new MaintenanceService(
            mockDb as any,
            mockCatalogService as any,
            mockOpenRouter as any,
            mockFingerprinting as any,
            mockZendb as any,
            mockAutotagger as any
        );
    });

    test('getTracksWithMissingMetadata should call DB with correct filter', () => {
        maintenanceService.getTracksWithMissingMetadata('genre');
        expect(mockDb.getTracksMissingMetadata).toHaveBeenCalledWith('genre');
    });

    test('applyMetadataToTrack should update DB and create album if missing', async () => {
        const trackId = 1;
        const metadata = {
            genre: 'Rock',
            year: 1971,
            albumTitle: 'New Album'
        };
        const track = { id: 1, artist_id: 10, owner_id: 100 };
        
        (mockDb.getTrack as any).mockReturnValue(track);
        (mockDb.getAlbumByTitle as any).mockReturnValue(null);
        (mockDb.createAlbum as any).mockReturnValue(50);

        await maintenanceService.applyMetadataToTrack(trackId, metadata);

        expect(mockDb.createAlbum).toHaveBeenCalled();
        expect(mockCatalogService.updateTrack).toHaveBeenCalledWith(trackId, expect.objectContaining({
            genre: 'Rock',
            year: 1971,
            albumId: 50
        }));
    });

    test('autofillMetadata should process tracks and skip if no match', async () => {
        const trackIds = [1];
        const tracks = [{ id: 1, title: 'Song', artist_name: 'Artist' }];
        (mockDb.getTracksByIds as any).mockReturnValue(tracks);
        (metadataService.searchRecording as any).mockResolvedValue([]);

        const result = await maintenanceService.autofillMetadata(trackIds, { fields: ['genre'] });

        expect(result.skipped).toBe(1);
        expect(mockCatalogService.updateTrack).not.toHaveBeenCalled();
    });

    test('fingerprintLookup should return metadata from ZenDB', async () => {
        const trackId = 1;
        const track = { id: 1, fingerprint: 'f123' };
        (mockDb.getTrack as any).mockReturnValue(track);
        (mockZendb.getFingerprintMetadata as any).mockResolvedValue({ title: 'Matched' });

        const result = await maintenanceService.fingerprintLookup(trackId);

        expect(result.title).toBe('Matched');
        expect(mockZendb.getFingerprintMetadata).toHaveBeenCalledWith('f123');
    });

    test('batchIdentifyTracks should process in chunks', async () => {
        const tracks = [
            { id: 1, file_path: 'p1' },
            { id: 2, file_path: 'p2' }
        ];
        (mockDb.getTracks as any).mockReturnValue(tracks);
        (mockCatalogService.analyzeFingerprint as any).mockResolvedValue('f');
        (mockZendb.getFingerprintMetadata as any).mockResolvedValue(null);

        const result = await maintenanceService.batchIdentifyTracks();

        expect(result.processed).toBe(2);
        expect(mockCatalogService.analyzeFingerprint).toHaveBeenCalledTimes(2);
    });
});
