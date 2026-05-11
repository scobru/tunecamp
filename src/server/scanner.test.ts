
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { Scanner } from './modules/catalog/scanner.js';

// Mock fs-extra to avoid file system operations
jest.mock('fs-extra', () => ({
    ensureDir: jest.fn(),
    remove: jest.fn(),
    pathExists: jest.fn().mockResolvedValue(true as never),
    readdir: jest.fn().mockResolvedValue([] as never),
    readFile: jest.fn().mockResolvedValue('' as never),
}));

// Mock database.js
const mockDbService = {
    db: {
        prepare: jest.fn(),
        close: jest.fn(),
    },
    getTracks: jest.fn(),
    createArtist: jest.fn(),
    createAlbum: jest.fn(),
    createTrack: jest.fn(),
    updateTrackLosslessPath: jest.fn(),
    deleteTrack: jest.fn(),
    getArtistByName: jest.fn(),
    getAlbumBySlug: jest.fn(),
    getAlbum: jest.fn(),
    updateAlbumArtist: jest.fn(),
    updateAlbumDownload: jest.fn(),
    updateAlbumLinks: jest.fn(),
    updateAlbumCover: jest.fn(),
    getTrackByMetadata: jest.fn(),
    getTrackByPath: jest.fn(),
    updateTrackPath: jest.fn(),
    updateTrackAlbum: jest.fn(),
    updateTrackWaveform: jest.fn(),
};

jest.mock('./database.js', () => ({
    createDatabase: jest.fn(() => mockDbService),
}));

const mockStorageEngine = {
    pathExists: jest.fn().mockResolvedValue(true as never),
    readdir: jest.fn().mockResolvedValue([] as never),
    readFile: jest.fn().mockResolvedValue('' as never),
    remove: jest.fn(),
    move: jest.fn(),
    ensureDir: jest.fn(),
    writeFile: jest.fn()
};

describe('Scanner Deduplication and Cleanup Verification', () => {
    let scanner: any;

    beforeEach(() => {
        jest.clearAllMocks();
        scanner = new Scanner(mockDbService as any, mockStorageEngine as any);
    });

    test('deduplicateTracks should merge duplicates and update in-memory objects', async () => {
        // Setup mock tracks
        const tracks = [
            {
                id: 1,
                title: 'Track 1',
                album_id: 1,
                artist_id: 1,
                file_path: 'tracks/track1.mp3',
                lossless_path: null,
            },
            {
                id: 2,
                title: 'Track 1',
                album_id: 1,
                artist_id: 1,
                file_path: 'tracks/track1.wav',
                lossless_path: null,
            }
        ];

        // Call deduplicateTracks
        const resultTracks = await (scanner as any).deduplicateTracks(tracks);

        // Verify result
        expect(resultTracks).toHaveLength(1);
        expect(resultTracks[0].id).toBe(1);
        expect(resultTracks[0].lossless_path).toBe('tracks/track1.wav'); // Should be updated in memory

        // Verify DB calls
        expect(mockDbService.updateTrackLosslessPath).toHaveBeenCalledWith(1, 'tracks/track1.wav');
        expect(mockDbService.deleteTrack).toHaveBeenCalledWith(2);
    });

    test('cleanupStaleTracks should remove missing files using passed tracks list', async () => {
        const tracks = [
            {
                id: 1,
                title: 'Valid Track',
                file_path: 'tracks/valid.mp3',
                lossless_path: null,
            },
            {
                id: 2,
                title: 'Stale Track',
                file_path: 'tracks/stale.mp3',
                lossless_path: null,
            }
        ];

        const knownFiles = new Set<string>(['tracks/valid.mp3']);

        // Run cleanup
        await (scanner as any).cleanupStaleTracks('/music', knownFiles, tracks);

        // Verify DB calls
        expect(mockDbService.deleteTrack).toHaveBeenCalledWith(2);
        expect(mockDbService.deleteTrack).not.toHaveBeenCalledWith(1);
    });
});
