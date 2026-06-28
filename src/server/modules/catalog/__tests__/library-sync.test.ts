import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../../../../utils/fileUtils.js', () => ({
    getFastFileHash: jest.fn().mockResolvedValue('mocked-hash'),
}));

jest.unstable_mockModule('../../media/ffmpeg.js', () => ({
    getDurationFromFfmpeg: jest.fn().mockResolvedValue(120),
}));

jest.unstable_mockModule('../../../../utils/audioUtils.js', () => ({
    slugify: jest.fn((str: string) => str.toLowerCase().replace(/\s+/g, '-')),
}));

describe('LibrarySync', () => {
    let librarySync: any;
    let mockDb: any;
    let mockAutotagger: any;

    beforeEach(async () => {
        jest.clearAllMocks();

        mockDb = {
            getTrackByHash: jest.fn(),
            getTrackByPath: jest.fn(),
            getTrackByMetadata: jest.fn(),
            getArtistByName: jest.fn(),
            createArtist: jest.fn().mockReturnValue(1),
            getAlbumByTitle: jest.fn(),
            getAlbumBySlug: jest.fn(),
            createAlbum: jest.fn().mockReturnValue(2),
            createTrack: jest.fn().mockReturnValue(10),
            getTrack: jest.fn().mockReturnValue({ id: 10, artist_name: 'Test Artist', album_id: 2 }),
            updateExistingTrack: jest.fn(),
            addTrackOwner: jest.fn(),
            addAlbumOwner: jest.fn(),
            updateTrackPath: jest.fn(),
            updateTrackHash: jest.fn(),
            updateTrackTitle: jest.fn(),
            updateTrackAlbum: jest.fn(),
            updateTrackArtist: jest.fn(),
            updateTrackDuration: jest.fn(),
            updateTrack: jest.fn(),
            getAlbum: jest.fn(),
            getArtist: jest.fn(),
            getReleaseBySlug: jest.fn(),
            db: {
                prepare: jest.fn().mockReturnValue({ all: jest.fn().mockReturnValue([]) })
            },
            deleteAlbumsBatch: jest.fn(),
            deleteArtistsBatch: jest.fn(),
            updateTrackLosslessPath: jest.fn(),
        };

        mockAutotagger = {
            auditTrack: jest.fn().mockResolvedValue(undefined)
        };

        const { LibrarySync } = await import('../library-sync.js');
        librarySync = new LibrarySync(mockDb, mockAutotagger, 1);
    });

    test('syncFile should create a new track when not existing', async () => {
        mockDb.getTrackByHash.mockReturnValue(null);
        mockDb.getTrackByPath.mockReturnValue(null);
        mockDb.getTrackByMetadata.mockReturnValue(null);

        const metadata = {
            common: {
                title: 'Test Song',
                artist: 'Test Artist',
                album: 'Test Album'
            },
            format: {
                duration: 180
            }
        };

        const options = {
            musicDir: '/music'
        };

        const result = await librarySync.syncFile('/music/artist/album/01-song.mp3', metadata, options);

        expect(result.action).toBe('created');
        expect(result.trackId).toBe(10);
        expect(mockDb.createArtist).toHaveBeenCalled();
        expect(mockDb.createAlbum).toHaveBeenCalled();
        expect(mockDb.createTrack).toHaveBeenCalled();
    });

    test('syncFile should move a track if hash matches but path differs', async () => {
        mockDb.getTrackByHash.mockReturnValue({
            id: 10,
            file_path: 'old/path.mp3',
            album_id: 2
        });

        const result = await librarySync.syncFile('/music/new/path.mp3', {}, { musicDir: '/music' });

        expect(result.action).toBe('moved');
        expect(result.trackId).toBe(10);
        expect(mockDb.updateTrackPath).toHaveBeenCalledWith(10, 'new/path.mp3', 2);
    });

    test('syncFile should update existing track when path matches', async () => {
        mockDb.getTrackByHash.mockReturnValue(null);
        mockDb.getTrackByPath.mockReturnValue({
            id: 10,
            file_path: 'artist/album/01-song.mp3',
            album_id: 2
        });

        const result = await librarySync.syncFile('/music/artist/album/01-song.mp3', {}, { musicDir: '/music' });

        expect(result.action).toBe('updated');
        expect(result.trackId).toBe(10);
        expect(mockDb.updateTrack).toHaveBeenCalled();
    });

    test('cleanupEmptyEntities should clean up empty albums and artists', async () => {
        let callCount = 0;
        mockDb.db.prepare.mockImplementation(() => {
            callCount++;
            if (callCount === 1) { // first query for empty albums
                return { all: () => [{ id: 1 }, { id: 2 }] };
            } else { // second query for empty artists
                return { all: () => [{ id: 3 }] };
            }
        });

        await librarySync.cleanupEmptyEntities();

        expect(mockDb.deleteAlbumsBatch).toHaveBeenCalledWith([1, 2]);
        expect(mockDb.deleteArtistsBatch).toHaveBeenCalledWith([3]);
    });

    test('syncFile should use normalizeFilenameTitle for deduplication fallback', async () => {
        mockDb.getTrackByHash.mockReturnValue(null);
        mockDb.getTrackByPath.mockReturnValue(null);

        // Return existing track only when normalized title is used
        mockDb.getTrackByMetadata.mockImplementation((title: string) => {
            if (title === 'Ordine Ovviamente') {
                return { id: 10, file_path: 'some/path.mp3', album_id: 2 };
            }
            return null;
        });

        const result = await librarySync.syncFile('/music/Homologo_-_Ordine_Ovviamente_mp3.mp3', {}, { musicDir: '/music' });

        // It should match the normalized title and update the existing track
        expect(result.action).toBe('updated');
        expect(result.trackId).toBe(10);
        expect(mockDb.updateTrack).toHaveBeenCalled();
    });

    test('syncFile should use folder-based album resolution if no tags or hints', async () => {
        mockDb.getTrackByHash.mockReturnValue(null);
        mockDb.getTrackByPath.mockReturnValue(null);
        mockDb.getTrackByMetadata.mockReturnValue(null);

        mockDb.getAlbumBySlug.mockImplementation((slug: string) => {
            if (slug === 'lib-my-folder') {
                return { id: 42 };
            }
            return null;
        });

        const result = await librarySync.syncFile('/music/my-folder/01-song.mp3', {}, { musicDir: '/music' });

        expect(result.action).toBe('created');
        expect(mockDb.createTrack).toHaveBeenCalledWith(expect.objectContaining({
            album_id: 42
        }));
    });
});
