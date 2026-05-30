
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { Scanner } from '../scanner.js';

// Mock fs-extra to avoid file system operations
jest.mock('fs-extra', () => ({
    ensureDir: jest.fn(),
    remove: jest.fn(),
    pathExists: jest.fn().mockResolvedValue(true as never),
    readdir: jest.fn().mockResolvedValue([] as never),
    readFile: jest.fn().mockResolvedValue('' as never),
    existsSync: jest.fn().mockReturnValue(true as never),
}));

// Mock database.js
const mockDbService = {
    db: {
        prepare: jest.fn(),
        close: jest.fn(),
    },
    getTracks: jest.fn(),
    getTrack: jest.fn(),
    iterateTracks: jest.fn(),
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

jest.mock('../../../core/database.js', () => ({
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

describe('Scanner Core Logic', () => {
    let scanner: Scanner;

    beforeEach(() => {
        jest.clearAllMocks();
        scanner = new Scanner(mockDbService as any, mockStorageEngine as any);
    });

    test('deduplicateLibraryTracks should merge duplicates', async () => {
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

        (mockDbService as any).iterateTracks = jest.fn(() => tracks.values());
        (mockDbService as any).getTrack = jest.fn((id: number) => tracks.find(t => t.id === id));

        // @ts-ignore
        await scanner.deduplicateLibraryTracks();

        expect(mockDbService.updateTrackLosslessPath).toHaveBeenCalledWith(1, 'tracks/track1.wav');
        expect(mockDbService.deleteTrack).toHaveBeenCalledWith(2);
    });

    test('cleanupStaleLibraryTracks should remove missing files', async () => {
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

        (mockDbService as any).iterateTracks = jest.fn(() => tracks.values());
        const knownFiles = new Set<string>(['tracks/valid.mp3']);

        // @ts-ignore
        await scanner.cleanupStaleLibraryTracks('/music', knownFiles);

        expect(mockDbService.deleteTrack).toHaveBeenCalledWith(2);
        expect(mockDbService.deleteTrack).not.toHaveBeenCalledWith(1);
    });
});
