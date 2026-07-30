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

const mockDbFull: any = {
    getAlbum: jest.fn(),
    getRelease: jest.fn(),
    promoteToRelease: jest.fn(),
    updateAlbumVisibility: jest.fn(),
    deleteAlbum: jest.fn(),
    getTrack: jest.fn(),
    deleteTrack: jest.fn(),
    getTracksByIds: jest.fn(() => []),
    starItem: jest.fn(),
    unstarItem: jest.fn(),
    setItemRating: jest.fn(),
    getSetting: jest.fn(() => undefined),
    getRemoteTracks: jest.fn(() => []),
    getRandomTracks: jest.fn(() => []),
    getArtistByName: jest.fn(),
    createArtist: jest.fn(),
    updateAlbum: jest.fn(),
};

const mockStorage: any = {
    pathExists: jest.fn(async () => false),
    remove: jest.fn(async () => undefined),
    move: jest.fn(async () => undefined),
    ensureDir: jest.fn(async () => undefined),
    writeFileStream: jest.fn(async () => undefined),
};

const mockPublishingFull = {
    syncRelease: jest.fn<any>().mockResolvedValue(undefined),
    unpublishReleaseFromAP: jest.fn<any>().mockResolvedValue(undefined),
};

const mockApService = {
    broadcastLike: jest.fn<any>().mockResolvedValue(undefined),
    broadcastUnlike: jest.fn<any>().mockResolvedValue(undefined),
};

describe('CatalogService library write operations', () => {
    let service: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockDbFull.getTracksByIds.mockReturnValue([]);
        mockDbFull.getSetting.mockReturnValue(undefined);
        mockDbFull.getRemoteTracks.mockReturnValue([]);
        mockDbFull.getRandomTracks.mockReturnValue([]);
        mockStorage.pathExists.mockResolvedValue(false);
        service = new CatalogService(
            mockDbFull, mockPublishingFull as any, mockStorage, '/music',
            {} as any, {} as any, mockApService as any
        );
    });

    test('promoteToRelease throws when album is missing', async () => {
        mockDbFull.getAlbum.mockReturnValue(undefined);
        await expect(service.promoteToRelease(1)).rejects.toThrow('Album not found');
    });

    test('promoteToRelease is a no-op when already a release', async () => {
        mockDbFull.getAlbum.mockReturnValue({ id: 1, is_release: true, title: 'X' });
        await service.promoteToRelease(1);
        expect(mockDbFull.promoteToRelease).not.toHaveBeenCalled();
    });

    test('promoteToRelease syncs publishing when the resulting release is public', async () => {
        mockDbFull.getAlbum.mockReturnValue({ id: 1, is_release: false, title: 'X' });
        mockDbFull.getRelease.mockReturnValue({ id: 1, visibility: 'public' });

        await service.promoteToRelease(1);

        expect(mockDbFull.promoteToRelease).toHaveBeenCalledWith(1);
        expect(mockPublishingFull.syncRelease).toHaveBeenCalledWith(1);
    });

    test('setVisibility is a no-op when visibility is unchanged', async () => {
        mockDbFull.getAlbum.mockReturnValue({ id: 1, visibility: 'public', title: 'X' });
        await service.setVisibility(1, 'public');
        expect(mockDbFull.updateAlbumVisibility).not.toHaveBeenCalled();
    });

    test('setVisibility updates and syncs for releases', async () => {
        mockDbFull.getAlbum.mockReturnValue({ id: 1, visibility: 'private', is_release: true, title: 'X' });
        await service.setVisibility(1, 'public');
        expect(mockDbFull.updateAlbumVisibility).toHaveBeenCalledWith(1, 'public');
        expect(mockPublishingFull.syncRelease).toHaveBeenCalledWith(1);
    });

    test('setVisibility skips sync for a plain (non-release) library album', async () => {
        mockDbFull.getAlbum.mockReturnValue({ id: 1, visibility: 'private', is_release: false, title: 'X' });
        await service.setVisibility(1, 'unlisted');
        expect(mockPublishingFull.syncRelease).not.toHaveBeenCalled();
    });

    test('deleteAlbum unpublishes from AP first when a published release is deleted', async () => {
        mockDbFull.getAlbum.mockReturnValue({ id: 1, is_release: true, published_to_ap: true, title: 'X' });
        await service.deleteAlbum(1);
        expect(mockPublishingFull.unpublishReleaseFromAP).toHaveBeenCalled();
        expect(mockDbFull.deleteAlbum).toHaveBeenCalledWith(1, false);
    });

    test('deleteAlbum is silent when the album does not exist', async () => {
        mockDbFull.getAlbum.mockReturnValue(undefined);
        mockDbFull.getRelease.mockReturnValue(undefined);
        await service.deleteAlbum(1);
        expect(mockDbFull.deleteAlbum).not.toHaveBeenCalled();
    });

    test('deleteTrack removes DB row only when deleteFile is false', async () => {
        mockDbFull.getTrack.mockReturnValue({ id: 5, file_path: 'a/b.mp3', album_id: 9 });
        await service.deleteTrack(5, false);
        expect(mockStorage.remove).not.toHaveBeenCalled();
        expect(mockDbFull.deleteTrack).toHaveBeenCalledWith(5);
        expect(mockPublishingFull.syncRelease).toHaveBeenCalledWith(9);
    });

    test('deleteTrack removes the physical file and its .wav companion when deleteFile is true', async () => {
        mockDbFull.getTrack.mockReturnValue({ id: 5, file_path: 'a/b.mp3', album_id: null });
        mockStorage.pathExists.mockResolvedValue(true);

        await service.deleteTrack(5, true);

        expect(mockStorage.remove).toHaveBeenCalledTimes(2);
        expect(mockPublishingFull.syncRelease).not.toHaveBeenCalled();
    });

    test('deleteTrack is a no-op when the track does not exist', async () => {
        mockDbFull.getTrack.mockReturnValue(undefined);
        await service.deleteTrack(5, true);
        expect(mockDbFull.deleteTrack).not.toHaveBeenCalled();
    });

    test('batchDeleteTracks denies non-owners and non-admins', async () => {
        mockDbFull.getTracksByIds.mockReturnValue([
            { id: 1, owner_id: 42, artist_id: null },
        ]);
        jest.spyOn(service, 'deleteTrack').mockResolvedValue(undefined);

        const res = await service.batchDeleteTracks([1], false, { userId: 1, isAdmin: false });

        expect(res.failed).toBe(1);
        expect(res.errors).toEqual(['Track 1: Access denied']);
        expect(service.deleteTrack).not.toHaveBeenCalled();
    });

    test('batchDeleteTracks deletes owned tracks', async () => {
        mockDbFull.getTracksByIds.mockReturnValue([
            { id: 1, owner_id: 1, artist_id: null },
        ]);
        jest.spyOn(service, 'deleteTrack').mockResolvedValue(undefined);

        const res = await service.batchDeleteTracks([1], true, { userId: 1, isAdmin: false });

        expect(res.success).toBe(1);
        expect(service.deleteTrack).toHaveBeenCalledWith(1, true);
    });

    test('starTrack throws for a missing track and broadcasts a Like for a valid one', async () => {
        mockDbFull.getTrack.mockReturnValue(undefined);
        await expect(service.starTrack('alice', 1)).rejects.toThrow('Track not found');

        mockDbFull.getTrack.mockReturnValue({ id: 1 });
        await service.starTrack('alice', 1);
        expect(mockDbFull.starItem).toHaveBeenCalledWith('alice', 'track', '1');
        expect(mockApService.broadcastLike).toHaveBeenCalledWith(1, 'alice');
    });

    test('unstarTrack is silent for a missing track', async () => {
        mockDbFull.getTrack.mockReturnValue(undefined);
        await service.unstarTrack('alice', 1);
        expect(mockDbFull.unstarItem).not.toHaveBeenCalled();
    });

    test('setTrackRating throws for a missing track', async () => {
        mockDbFull.getTrack.mockReturnValue(undefined);
        await expect(service.setTrackRating('alice', 1, 5)).rejects.toThrow('Track not found');
    });

    test('starAlbum / setAlbumRating throw when neither album nor release exists', async () => {
        mockDbFull.getAlbum.mockReturnValue(undefined);
        mockDbFull.getRelease.mockReturnValue(undefined);
        await expect(service.starAlbum('alice', 1)).rejects.toThrow('Album not found');
        await expect(service.setAlbumRating('alice', 1, 4)).rejects.toThrow('Album not found');
    });

    test('setAlbumRating delegates when the album exists', async () => {
        mockDbFull.getAlbum.mockReturnValue({ id: 1 });
        await service.setAlbumRating('alice', 1, 4);
        expect(mockDbFull.setItemRating).toHaveBeenCalledWith('alice', 'album', '1', 4);
    });
});

describe('CatalogService read helpers', () => {
    let service: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockDbFull.getSetting.mockReturnValue(undefined);
        service = new CatalogService(
            mockDbFull, mockPublishingFull as any, mockStorage, '/music',
            {} as any, {} as any
        );
    });

    test('getSettings falls back to documented defaults when nothing is stored', () => {
        const settings = service.getSettings();
        expect(settings.siteName).toBe('TuneCamp');
        expect(settings.mode).toBe('label');
        expect(settings.peerEnabled).toBe('false');
    });

    test('getSettings mirrors boardEnabled <-> chatEnabled when only one is set', () => {
        mockDbFull.getSetting.mockImplementation((k: string) => k === 'chatEnabled' ? 'true' : undefined);
        const settings = service.getSettings();
        expect(settings.boardEnabled).toBe('true');
    });

    test('getSettings parses donationLinks as JSON', () => {
        mockDbFull.getSetting.mockImplementation((k: string) => k === 'donationLinks' ? '["https://x.com"]' : undefined);
        const settings = service.getSettings();
        expect(settings.donationLinks).toEqual(['https://x.com']);
    });

    test('getLegalPages falls back to built-in templates when nothing is customized', () => {
        const pages = service.getLegalPages();
        expect(pages.termsIsDefault).toBe(true);
        expect(pages.privacyIsDefault).toBe(true);
        expect(pages.terms.length).toBeGreaterThan(0);
    });

    test('getLegalPages uses a custom template when the operator set one', () => {
        mockDbFull.getSetting.mockImplementation((k: string) => k === 'legalTerms' ? 'My Custom Terms' : undefined);
        const pages = service.getLegalPages();
        expect(pages.terms).toBe('My Custom Terms');
        expect(pages.termsIsDefault).toBe(false);
    });

    test('getRemoteTracks maps remote-content fields to the track shape', () => {
        mockDbFull.getRemoteTracks.mockReturnValue([
            { id: 1, artist_name: 'A', album_name: 'B', stream_url: 'http://x/a.mp3', cover_url: 'http://x/c.jpg', published_at: '2026-01-01' },
        ]);
        const [track] = service.getRemoteTracks();
        expect(track.artistName).toBe('A');
        expect(track.audioUrl).toBe('http://x/a.mp3');
        expect(track.addedAt).toBe('2026-01-01');
    });

    test('getRandomTracks delegates to the DB and maps track DTOs', () => {
        mockDbFull.getRandomTracks.mockReturnValue([{ id: 1, title: 'T' }]);
        const tracks = service.getRandomTracks(5, false);
        expect(mockDbFull.getRandomTracks).toHaveBeenCalledWith(5);
        expect(tracks[0].id).toBe(1);
    });
});

describe('CatalogService.updateAlbum', () => {
    let service: any;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new CatalogService(
            mockDbFull, mockPublishingFull as any, mockStorage, '/music',
            {} as any, {} as any
        );
    });

    test('throws when neither album nor release exists', async () => {
        mockDbFull.getAlbum.mockReturnValue(undefined);
        mockDbFull.getRelease.mockReturnValue(undefined);
        await expect(service.updateAlbum(1, {})).rejects.toThrow('Album not found');
    });

    test('resolves an existing artist by name', async () => {
        mockDbFull.getAlbum.mockReturnValue({ id: 1 });
        mockDbFull.getArtistByName.mockReturnValue({ id: 7 });

        await service.updateAlbum(1, { artist: 'Existing Artist' });

        expect(mockDbFull.createArtist).not.toHaveBeenCalled();
        expect(mockDbFull.updateAlbum).toHaveBeenCalledWith(1, expect.objectContaining({ artist_id: 7 }));
    });

    test('creates a new artist when the name is unknown', async () => {
        mockDbFull.getAlbum.mockReturnValue({ id: 1 });
        mockDbFull.getArtistByName.mockReturnValue(undefined);
        mockDbFull.createArtist.mockReturnValue(9);

        await service.updateAlbum(1, { artist: 'Brand New Artist' });

        expect(mockDbFull.createArtist).toHaveBeenCalledWith('Brand New Artist');
        expect(mockDbFull.updateAlbum).toHaveBeenCalledWith(1, expect.objectContaining({ artist_id: 9 }));
    });

    test('clears artist_id when the artist field is blank', async () => {
        mockDbFull.getAlbum.mockReturnValue({ id: 1 });

        await service.updateAlbum(1, { artist: '  ' });

        expect(mockDbFull.updateAlbum).toHaveBeenCalledWith(1, expect.objectContaining({ artist_id: null }));
    });

    test('syncs publishing after a successful update', async () => {
        mockDbFull.getAlbum.mockReturnValue({ id: 1 });
        await service.updateAlbum(1, { title: 'New Title' });
        expect(mockPublishingFull.syncRelease).toHaveBeenCalledWith(1);
    });
});
