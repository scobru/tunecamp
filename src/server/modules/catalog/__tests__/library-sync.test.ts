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

    test('syncFile handles hash generation error', async () => {
        const { getFastFileHash } = await import('../../../../utils/fileUtils.js');
        (getFastFileHash as jest.Mock).mockRejectedValueOnce(new Error('Hash error'));

        mockDb.getTrackByPath.mockReturnValue({
            id: 10,
            file_path: 'artist/album/01-song.mp3',
            album_id: 2
        });

        const result = await librarySync.syncFile('/music/artist/album/01-song.mp3', {}, { musicDir: '/music' });
        expect(result.action).toBe('updated');
    });

    test('syncFile handles FFmpeg duration fallback failure', async () => {
        mockDb.getTrackByHash.mockReturnValue(null);
        mockDb.getTrackByPath.mockReturnValue(null);
        mockDb.getTrackByMetadata.mockReturnValue(null);

        const { getDurationFromFfmpeg } = await import('../../media/ffmpeg.js');
        (getDurationFromFfmpeg as jest.Mock).mockRejectedValueOnce(new Error('FFmpeg error'));

        const metadata = { format: {} };
        const result = await librarySync.syncFile('/music/01-song.mp3', metadata, { musicDir: '/music' });

        expect(result.action).toBe('created');
        expect(mockDb.createTrack).toHaveBeenCalledWith(expect.objectContaining({ duration: null }));
    });

    test('handleHashMatch adds owner to track and album', async () => {
        mockDb.getTrackByHash.mockReturnValue({
            id: 10,
            file_path: 'artist/album/01-song.mp3',
            album_id: 2
        });

        const result = await librarySync.syncFile('/music/artist/album/01-song.mp3', {}, { musicDir: '/music', ownerId: 5 });

        expect(result.action).toBe('unchanged');
        expect(mockDb.addTrackOwner).toHaveBeenCalledWith(10, 5);
        expect(mockDb.addAlbumOwner).toHaveBeenCalledWith(2, 5);
    });

    test('resolveAlbum should create album based on metadata hints', async () => {
        mockDb.getTrackByHash.mockReturnValue(null);
        mockDb.getTrackByPath.mockReturnValue(null);
        mockDb.getTrackByMetadata.mockReturnValue(null);

        const hints = { album: 'Hint Album', year: 2024 };
        const result = await librarySync.syncFile('/music/artist/album/01-song.mp3', {}, { musicDir: '/music', metadataHints: hints, suggestedCoverPath: '/music/cover.jpg' });

        expect(mockDb.createAlbum).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Hint Album',
            year: 2024,
            cover_path: 'cover.jpg'
        }));
    });

    test('resolveAlbum should handle release folder matching', async () => {
        mockDb.getTrackByHash.mockReturnValue(null);
        mockDb.getTrackByPath.mockReturnValue(null);
        mockDb.getTrackByMetadata.mockReturnValue(null);

        mockDb.getReleaseBySlug.mockImplementation((slug) => {
            if (slug === 'my-release') return { id: 99 };
            return null;
        });

        const result = await librarySync.syncFile('/music/releases/my-release/01-song.mp3', {}, { musicDir: '/music' });
        expect(mockDb.createTrack).toHaveBeenCalledWith(expect.objectContaining({ album_id: 99 }));
    });

    test('updateExistingTrack should protect existing track titles when no hints are present', async () => {
        mockDb.getTrackByHash.mockReturnValue(null);
        mockDb.getTrackByPath.mockReturnValue({
            id: 10,
            title: 'Protected Title',
            file_path: 'artist/album/01-song.mp3',
            album_id: 2
        });

        const result = await librarySync.syncFile('/music/artist/album/01-song.mp3', { common: { title: 'New Title' } }, { musicDir: '/music' });

        expect(result.action).toBe('updated');
        expect(mockDb.updateTrackTitle).not.toHaveBeenCalled();
    });

    test('updateExistingTrack should update title if existing is Untitled', async () => {
        mockDb.getTrackByHash.mockReturnValue(null);
        mockDb.getTrackByPath.mockReturnValue({
            id: 10,
            title: 'Untitled',
            file_path: 'artist/album/01-song.mp3',
            album_id: 2
        });

        const result = await librarySync.syncFile('/music/artist/album/01-song.mp3', { common: { title: 'New Title' } }, { musicDir: '/music' });

        expect(result.action).toBe('updated');
        expect(mockDb.updateTrackTitle).toHaveBeenCalledWith(10, 'New Title');
    });

    test('createNewTrack catches autotagger audit error', async () => {
        mockDb.getTrackByHash.mockReturnValue(null);
        mockDb.getTrackByPath.mockReturnValue(null);
        mockDb.getTrackByMetadata.mockReturnValue(null);
        mockDb.getTrack.mockReturnValue({ id: 10, artist_name: 'Unknown Artist', album_id: null });

        mockAutotagger.auditTrack.mockRejectedValueOnce(new Error('Audit error'));

        const result = await librarySync.syncFile('/music/01-song.mp3', {}, { musicDir: '/music' });
        expect(result.action).toBe('created');
        // The error should be caught internally
    });

    test('getMimeType covers different extensions', async () => {
        const types = [
            { ext: '.mp3', mime: 'audio/mpeg' },
            { ext: '.wav', mime: 'audio/wav' },
            { ext: '.flac', mime: 'audio/flac' },
            { ext: '.ogg', mime: 'audio/ogg' },
            { ext: '.opus', mime: 'audio/opus' },
            { ext: '.m4a', mime: 'audio/mp4' },
            { ext: '.aac', mime: 'audio/aac' },
            { ext: '.unknown', mime: 'application/octet-stream' }
        ];

        mockDb.getTrackByHash.mockReturnValue(null);
        mockDb.getTrackByPath.mockReturnValue(null);
        mockDb.getTrackByMetadata.mockReturnValue(null);

        for (const { ext, mime } of types) {
            await librarySync.syncFile(`/music/song${ext}`, {}, { musicDir: '/music' });
            expect(mockDb.createTrack).toHaveBeenCalledWith(expect.objectContaining({ mime_type: mime }));
        }
    });

    test('getMimeType uses formatMimeType if provided', async () => {
        mockDb.getTrackByHash.mockReturnValue(null);
        mockDb.getTrackByPath.mockReturnValue(null);
        mockDb.getTrackByMetadata.mockReturnValue(null);

        const metadata = { format: { mimeType: 'audio/custom' } };
        await librarySync.syncFile('/music/song.mp3', metadata, { musicDir: '/music' });

        expect(mockDb.createTrack).toHaveBeenCalledWith(expect.objectContaining({ mime_type: 'audio/custom' }));
    });

    test('resolveArtist falls back to Unknown Artist for invalid names', async () => {
        mockDb.getTrackByHash.mockReturnValue(null);
        mockDb.getTrackByPath.mockReturnValue(null);
        mockDb.getTrackByMetadata.mockReturnValue(null);
        mockDb.getArtistByName.mockReturnValue(null); // Trigger createArtist

        const metadata = { common: { artist: 'null' } };
        await librarySync.syncFile('/music/song.mp3', metadata, { musicDir: '/music' });

        expect(mockDb.createArtist).toHaveBeenCalledWith('Unknown Artist', undefined, undefined, undefined, undefined, undefined, 'private');
    });

    test('updateExistingTrack updates lossless_path for lossless files if missing', async () => {
        mockDb.getTrackByHash.mockReturnValue(null);
        mockDb.getTrackByPath.mockReturnValue({
            id: 10,
            title: 'Lossless Song',
            file_path: 'song.flac',
            album_id: 2,
            lossless_path: null
        });

        await librarySync.syncFile('/music/song.flac', {}, { musicDir: '/music' });

        expect(mockDb.updateTrackLosslessPath).toHaveBeenCalledWith(10, 'song.flac');
    });
});
