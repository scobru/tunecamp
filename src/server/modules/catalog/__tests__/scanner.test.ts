
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { Scanner, isArtworkOrAvatar } from '../scanner.js';

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
    mergeTracks: jest.fn(),
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

        // Dedup now delegates the keep/merge decision to database.mergeTracks,
        // which carries over lossless_path and deletes the redundant row.
        // Equal richness -> lowest id (track 1) is the keeper, track 2 merges into it.
        expect(mockDbService.mergeTracks).toHaveBeenCalledWith(2, 1);
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

describe('isArtworkOrAvatar helper', () => {
    test('should return true for artwork, folder, cover, and avatar files', () => {
        expect(isArtworkOrAvatar('music/cover.jpg')).toBe(true);
        expect(isArtworkOrAvatar('music/folder.png')).toBe(true);
        expect(isArtworkOrAvatar('music/artwork.png')).toBe(true);
        expect(isArtworkOrAvatar('music/avatar.jpg')).toBe(true);
    });

    test('should return true for files with auto-generated names or prefixes', () => {
        expect(isArtworkOrAvatar('music/cover-al490-1780265924899.jpg')).toBe(true);
        expect(isArtworkOrAvatar('music/avatar-12.png')).toBe(true);
        expect(isArtworkOrAvatar('music/track-12345-456.jpg')).toBe(true);
        expect(isArtworkOrAvatar('music/artwork-tr20-1780127924482.jpg')).toBe(true);
        expect(isArtworkOrAvatar('music/background.png')).toBe(true);
        expect(isArtworkOrAvatar('music/site-cover.jpg')).toBe(true);
        expect(isArtworkOrAvatar('music/site-logo.png')).toBe(true);
    });

    test('should return true if located in artwork or assets directories', () => {
        expect(isArtworkOrAvatar('music/releases/album/artwork/custom-cover.jpg')).toBe(true);
        expect(isArtworkOrAvatar('music/assets/random-pic.jpg')).toBe(true);
    });

    test('should return false for valid files or audio tracks', () => {
        expect(isArtworkOrAvatar('music/song.mp3')).toBe(false);
        expect(isArtworkOrAvatar('music/booklet.pdf')).toBe(false);
        expect(isArtworkOrAvatar('music/archive.zip')).toBe(false);
        expect(isArtworkOrAvatar('music/not-an-image.txt')).toBe(false);
        expect(isArtworkOrAvatar('music/random_image.png')).toBe(false);
    });
});
