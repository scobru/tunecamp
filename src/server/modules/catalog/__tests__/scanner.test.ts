
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import chokidar from 'chokidar';
import { Scanner, isArtworkOrAvatar } from '../scanner.js';

// Mock chokidar to test watcher logic
const mockWatcher = {
    on: jest.fn<any>().mockReturnThis(),
    close: jest.fn<any>().mockResolvedValue(undefined as never),
};

jest.mock('chokidar', () => ({
    default: {
        watch: jest.fn(() => mockWatcher),
    },
    watch: jest.fn(() => mockWatcher),
}));

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
    getTracksByIds: jest.fn(),
    iterateTracks: jest.fn(),
    createArtist: jest.fn(),
    createAlbum: jest.fn(),
    createTrack: jest.fn(),
    updateTrackLosslessPath: jest.fn(),
    deleteTrack: jest.fn(),
    deleteTracksBatch: jest.fn(),
    updateTracksLosslessPathBatch: jest.fn(),
    updateTracksPathsBatch: jest.fn(),
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
        (mockDbService as any).getTracksByIds = jest.fn((ids: number[]) => tracks.filter(t => ids.includes(t.id)));

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

        expect(mockDbService.deleteTracksBatch).toHaveBeenCalledWith([2]);
        expect(mockDbService.deleteTracksBatch).not.toHaveBeenCalledWith([1]);
    });
});

describe('isArtworkOrAvatar helper', () => {
    test('should return true for artwork, folder, cover, and avatar files', () => {
        expect(isArtworkOrAvatar('music/cover.jpg')).toBe(true);
        expect(isArtworkOrAvatar('music/cover.png')).toBe(true);
        expect(isArtworkOrAvatar('music/folder.png')).toBe(true);
        expect(isArtworkOrAvatar('music/artwork.png')).toBe(true);
        expect(isArtworkOrAvatar('music/avatar.jpg')).toBe(true);
        expect(isArtworkOrAvatar('music/cover.jpeg')).toBe(true);
        expect(isArtworkOrAvatar('music/folder.webp')).toBe(true);
        expect(isArtworkOrAvatar('music/artwork.gif')).toBe(true);
        expect(isArtworkOrAvatar('music/avatar.avif')).toBe(true);
    });

    test('should throw TypeError for null or undefined input', () => {
        // @ts-ignore
        expect(() => isArtworkOrAvatar(null)).toThrow();
        // @ts-ignore
        expect(() => isArtworkOrAvatar(undefined)).toThrow();
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

    test('should return false if extension is not in the whitelist', () => {
        expect(isArtworkOrAvatar('music/cover.mp3')).toBe(false);
        expect(isArtworkOrAvatar('music/artwork.txt')).toBe(false);
        expect(isArtworkOrAvatar('music/avatar.pdf')).toBe(false);
    });

    test('should be case insensitive', () => {
        expect(isArtworkOrAvatar('music/COVER.JPG')).toBe(true);
        expect(isArtworkOrAvatar('music/FOLDER.PNG')).toBe(true);
        expect(isArtworkOrAvatar('music/folder.PNG')).toBe(true);
        expect(isArtworkOrAvatar('music/ArtWork.jpeg')).toBe(true);
        expect(isArtworkOrAvatar('music/AVATAR.WebP')).toBe(true);
    });

    test('should handle edge case file names correctly', () => {
        // No extension
        expect(isArtworkOrAvatar('music/cover')).toBe(false);
        // Hidden files
        expect(isArtworkOrAvatar('music/.cover.jpg')).toBe(false);
        // Only extension
        expect(isArtworkOrAvatar('music/.jpg')).toBe(false);
    });

    test('should return false for valid files or audio tracks', () => {
        expect(isArtworkOrAvatar('music/song.mp3')).toBe(false);
        expect(isArtworkOrAvatar('music/booklet.pdf')).toBe(false);
        expect(isArtworkOrAvatar('music/archive.zip')).toBe(false);
        expect(isArtworkOrAvatar('music/not-an-image.txt')).toBe(false);
        expect(isArtworkOrAvatar('music/random_image.png')).toBe(false);
    });
});

describe('Library Watcher (startWatching / stopWatching)', () => {
    let scanner: Scanner;

    beforeEach(() => {
        jest.clearAllMocks();
        mockWatcher.on.mockReturnThis();
        mockWatcher.close.mockResolvedValue(undefined as never);
        (chokidar.watch as any).mockReturnValue(mockWatcher);
        scanner = new Scanner(mockDbService as any, mockStorageEngine as any);
    });

    test('startWatching should initialize chokidar with awaitWriteFinish and proper ignore rules', () => {
        scanner.startWatching('/test/music');

        expect(chokidar.watch).toHaveBeenCalledWith('/test/music', expect.objectContaining({
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: expect.objectContaining({
                stabilityThreshold: 2000,
                pollInterval: 250,
            }),
        }));
        expect(mockWatcher.on).toHaveBeenCalledWith('add', expect.any(Function));
        expect(mockWatcher.on).toHaveBeenCalledWith('change', expect.any(Function));
        expect(mockWatcher.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    test('startWatching should close existing watcher before opening a new one', () => {
        scanner.startWatching('/test/music1');
        scanner.startWatching('/test/music2');

        expect(mockWatcher.close).toHaveBeenCalledTimes(1);
    });

    test('stopWatching should close active watcher', () => {
        scanner.startWatching('/test/music');
        scanner.stopWatching();

        expect(mockWatcher.close).toHaveBeenCalledTimes(1);
    });

    test('stopWatching should safely no-op if no watcher is active', () => {
        expect(() => scanner.stopWatching()).not.toThrow();
    });

    test('watcher add callback should invoke processAudioFile for audio tracks and skip artwork', async () => {
        const processSpy = jest.spyOn(scanner, 'processAudioFile').mockResolvedValue(null);
        let addHandler: ((file: string) => void) | undefined;

        mockWatcher.on.mockImplementation((event: string, handler: any) => {
            if (event === 'add') addHandler = handler;
            return mockWatcher;
        });

        scanner.startWatching('/test/music');
        expect(addHandler).toBeDefined();

        // 1. Artwork should be skipped
        addHandler!('/test/music/cover.jpg');
        expect(processSpy).not.toHaveBeenCalled();

        // 2. Audio track should trigger processAudioFile
        addHandler!('/test/music/song.flac');
        expect(processSpy).toHaveBeenCalledWith(
            '/test/music/song.flac',
            '/test/music',
            undefined,
            undefined
        );
    });
});

