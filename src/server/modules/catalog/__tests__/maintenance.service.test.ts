import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { MaintenanceService } from '../maintenance.service.js';

const mockRepo = {};

const mockDb = {
    getTracksMissingMetadata: jest.fn(),
    getAlbumsMissingMetadata: jest.fn(),
    getArtistsMissingMetadata: jest.fn(),
    getTracks: jest.fn(),
    getTracksByAlbum: jest.fn(),
};

const mockCatalogService = {
    updateTrack: jest.fn(),
    updateAlbum: jest.fn(),
};

describe('MaintenanceService', () => {
    let maintenanceService: MaintenanceService;

    beforeEach(() => {
        jest.clearAllMocks();
        maintenanceService = new MaintenanceService(
            mockRepo as any,
            mockDb as any,
            mockCatalogService as any,
            '/tmp'
        );
    });

    test('getTracksWithMissingMetadata calls DB with correct filter', () => {
        maintenanceService.getTracksWithMissingMetadata('genre');
        expect(mockDb.getTracksMissingMetadata).toHaveBeenCalledWith('genre');
    });

    test('getTracksWithGenericTitles identifies generic track titles', () => {
        (mockDb.getTracks as any).mockReturnValue([
            { id: 1, title: 'AudioTrack 01' },
            { id: 2, title: 'Track 16' },
            { id: 3, title: 'Untitled' },
            { id: 4, title: '04' },
            { id: 5, title: 'Bluvertigo - Altre forme di vita' },
        ]);

        const generic = maintenanceService.getTracksWithGenericTitles();
        expect(generic.map(t => t.id)).toEqual([1, 2, 3, 4]);
    });

    test('propagateAlbumMetadataToTracks only fills missing fields unless forced', async () => {
        (mockDb.getTracksByAlbum as any).mockReturnValue([
            { id: 1, genre: 'Library', year: 0 },
            { id: 2, genre: 'Electronic', year: 1995 },
        ]);

        await maintenanceService.propagateAlbumMetadataToTracks(10, { genre: 'Rock', year: 1995 }, false);

        expect(mockCatalogService.updateTrack).toHaveBeenCalledTimes(1);
        expect(mockCatalogService.updateTrack).toHaveBeenCalledWith(1, { genre: 'Rock', year: 1995 });
    });
});
