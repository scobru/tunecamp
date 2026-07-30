import { describe, test, expect, beforeEach, beforeAll, jest } from '@jest/globals';
import { UserRole } from '../../../common/visibility.js';

// discovery.service pulls in the catalog mappers which are pure; the service
// itself only touches the injected database for getFederationCatalog, so a
// minimal mock suffices. Dynamic import keeps the module graph loading under ESM.
let DiscoveryService: any;

const mockDb: any = {
    getTrack: jest.fn(),
    getTracks: jest.fn(() => []),
    getTracksByIds: jest.fn(() => []),
    getReleases: jest.fn(),
    getReleaseTracks: jest.fn(),
    getTracksByAlbum: jest.fn(),
    getStats: jest.fn(async () => ({ tracks: 0, totalTracks: 0, albums: 0, genres: [], genresCount: 0 })),
    getAlbums: jest.fn(() => []),
    getPublicTracksCount: jest.fn(() => 0),
    getGenres: jest.fn(() => []),
    search: jest.fn(() => ({ artists: [], albums: [], tracks: [] })),
    getTracksByOwner: jest.fn(() => []),
    getPrimaryAdminId: jest.fn(() => null),
    getTracksByArtist: jest.fn(() => []),
    getAlbum: jest.fn(),
    getAlbumBySlug: jest.fn(),
    getAlbumOwners: jest.fn(() => []),
    getTracksByReleaseId: jest.fn(() => []),
    isStarred: jest.fn(() => false),
    getItemRating: jest.fn(() => 0),
    db: { prepare: jest.fn(() => ({ get: jest.fn(() => undefined) })) },
};

describe('DiscoveryService.getFederationCatalog track fallback', () => {
    let service: any;

    beforeAll(async () => {
        const mod = await import('../discovery.service.js');
        DiscoveryService = mod.DiscoveryService;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        service = new DiscoveryService(mockDb as any, {} as any, {} as any);
    });

    test('falls back to album tracks when a release has no release_tracks rows', () => {
        // A promoted library album: tracks linked by album_id only, release_tracks empty.
        (mockDb.getReleases as jest.Mock).mockReturnValue([{ id: 42, title: 'Orphan Release', visibility: 'public' }]);
        (mockDb.getReleaseTracks as jest.Mock).mockReturnValue([]);
        (mockDb.getTracksByAlbum as jest.Mock).mockReturnValue([
            { id: 1, title: 'Amorevole Crollo', album_id: 42 },
            { id: 2, title: 'Chirichetto', album_id: 42 },
        ]);

        const { releases } = service.getFederationCatalog(false);

        expect(mockDb.getTracksByAlbum).toHaveBeenCalledWith(42, expect.anything());
        expect(releases).toHaveLength(1);
        // The release must federate its tracks instead of an empty (invisible) list.
        expect(releases[0].tracks).toHaveLength(2);
        expect(releases[0].tracks.map((t: any) => t.title)).toEqual(['Amorevole Crollo', 'Chirichetto']);
    });

    test('uses release_tracks rows directly when present (no album fallback)', () => {
        (mockDb.getReleases as jest.Mock).mockReturnValue([{ id: 7, title: 'Formal Release', visibility: 'public' }]);
        (mockDb.getReleaseTracks as jest.Mock).mockReturnValue([
            { id: 10, title: 'Track A' },
        ]);

        const { releases } = service.getFederationCatalog(false);

        expect(mockDb.getTracksByAlbum).not.toHaveBeenCalled();
        expect(releases[0].tracks).toHaveLength(1);
        expect(releases[0].tracks[0].title).toBe('Track A');
    });

    test('release tracks inherit a cover URL so they fall back to the album art', () => {
        (mockDb.getReleases as jest.Mock).mockReturnValue([{ id: 7, title: 'Formal Release', visibility: 'public' }]);
        (mockDb.getReleaseTracks as jest.Mock).mockReturnValue([
            { id: 10, title: 'No Artwork Track' },
        ]);

        const { releases } = service.getFederationCatalog(false);

        // /api/tracks/:id/cover resolves track-art → album-cover → placeholder, so a
        // track without its own artwork still federates with a usable cover URL.
        expect(releases[0].tracks[0].coverUrl).toBe('/api/tracks/10/cover');
    });
});

describe('DiscoveryService.getAiRecommendations', () => {
    let service: any;
    let mockOpenRouter: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOpenRouter = { isEnabled: jest.fn(() => true), suggestRelatedTracks: jest.fn(async () => []) };
        service = new DiscoveryService(mockDb, mockOpenRouter, {} as any);
    });

    test('throws when the target track does not exist', async () => {
        (mockDb.getTrack as jest.Mock).mockReturnValue(undefined);
        await expect(service.getAiRecommendations(999)).rejects.toThrow('Track not found');
    });

    test('returns empty array when OpenRouter is disabled', async () => {
        (mockDb.getTrack as jest.Mock).mockReturnValue({ id: 1, genre: 'rock' });
        mockOpenRouter.isEnabled.mockReturnValue(false);

        const result = await service.getAiRecommendations(1);
        expect(result).toEqual([]);
        expect(mockDb.getTracks).not.toHaveBeenCalled();
    });

    test('falls back to same-genre candidates when the model suggests nothing', async () => {
        (mockDb.getTrack as jest.Mock).mockReturnValue({ id: 1, genre: 'rock' });
        (mockDb.getTracks as jest.Mock).mockReturnValue([
            { id: 2, genre: 'rock' },
            { id: 3, genre: 'jazz' },
        ]);
        mockOpenRouter.suggestRelatedTracks.mockResolvedValue([]);

        const result = await service.getAiRecommendations(1, 5);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(2);
    });

    test('maps model-suggested tracks, dropping any id outside the visible candidate set', async () => {
        (mockDb.getTrack as jest.Mock).mockReturnValue({ id: 1, genre: 'rock' });
        (mockDb.getTracks as jest.Mock).mockReturnValue([
            { id: 2, genre: 'rock' },
            { id: 3, genre: 'jazz' },
        ]);
        mockOpenRouter.suggestRelatedTracks.mockResolvedValue([2, 999]);
        (mockDb.getTracksByIds as jest.Mock).mockReturnValue([{ id: 2, genre: 'rock' }, { id: 999, genre: 'x' }]);

        const result = await service.getAiRecommendations(1, 5);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(2);
    });
});

describe('DiscoveryService.getOverview / getGenres / search', () => {
    let service: any;

    beforeEach(() => {
        jest.clearAllMocks();
        (mockDb.getReleases as jest.Mock).mockReturnValue([]);
        service = new DiscoveryService(mockDb, {} as any, {} as any);
    });

    test('getOverview keeps DB stats as-is for admins', async () => {
        (mockDb.getStats as jest.Mock).mockResolvedValue({ tracks: 100, totalTracks: 100, albums: 10, genres: ['rock'], genresCount: 1 });
        (mockDb.getAlbums as jest.Mock).mockReturnValue([{ id: 1, created_at: '2026-01-01' }]);

        const overview = await service.getOverview(true);
        expect(overview.stats.tracks).toBe(100);
        expect(mockDb.getPublicTracksCount).not.toHaveBeenCalled();
    });

    test('getOverview recomputes public-facing stats for non-admins', async () => {
        (mockDb.getStats as jest.Mock).mockResolvedValue({ tracks: 100, totalTracks: 100, albums: 10, genres: [], genresCount: 0 });
        (mockDb.getAlbums as jest.Mock).mockReturnValue([{ id: 1, created_at: '2026-01-01' }]);
        (mockDb.getPublicTracksCount as jest.Mock).mockReturnValue(3);
        (mockDb.getGenres as jest.Mock).mockReturnValue(['rock', 'jazz']);

        const overview = await service.getOverview(false);
        expect(overview.stats.albums).toBe(1);
        expect(overview.stats.tracks).toBe(3);
        expect(overview.stats.genresCount).toBe(2);
    });

    test('getGenres delegates to the DB with the right visibility profile', () => {
        service.getGenres(true);
        service.getGenres(false);
        expect((mockDb.getGenres as jest.Mock).mock.calls).toHaveLength(2);
        expect((mockDb.getGenres as jest.Mock).mock.calls[0][0]).not.toBe((mockDb.getGenres as jest.Mock).mock.calls[1][0]);
    });

    test('search short-circuits on an empty query without touching the DB', async () => {
        const result = await service.search('', false);
        expect(result).toEqual({ artists: [], albums: [], tracks: [] });
        expect(mockDb.search).not.toHaveBeenCalled();
    });

    test('search maps artists/albums/tracks from the DB result', async () => {
        (mockDb.search as jest.Mock).mockReturnValue({
            artists: [{ id: 5, name: 'Artist' }],
            albums: [{ id: 6, title: 'Album' }],
            tracks: [{ id: 7, title: 'Track' }],
        });

        const result = await service.search('query', false);
        expect(result.artists[0].coverImage).toBe('/api/artists/5/cover');
        expect(result.albums[0].id).toBe(6);
        expect(result.tracks[0].id).toBe(7);
    });
});

describe('DiscoveryService.getTracksForUser', () => {
    let service: any;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new DiscoveryService(mockDb, {} as any, {} as any);
    });

    test('non-mineOnly delegates directly to getTracks and filters non-audio files', async () => {
        (mockDb.getTracks as jest.Mock).mockReturnValue([
            { id: 1, mime_type: 'audio/mpeg' },
            { id: 2, mime_type: 'image/png' },
        ]);

        const result = await service.getTracksForUser({ userId: 1, role: UserRole.NORMAL_USER });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(1);
    });

    test('mineOnly merges owned, artist-linked, and (for admins) primary-admin-owned tracks, deduped', async () => {
        (mockDb.getTracksByOwner as jest.Mock).mockImplementation((ownerId: number) =>
            ownerId === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 2 }, { id: 3 }]
        );
        (mockDb.getPrimaryAdminId as jest.Mock).mockReturnValue(9);
        (mockDb.getTracksByArtist as jest.Mock).mockReturnValue([{ id: 4 }]);

        const result = await service.getTracksForUser(
            { userId: 1, artistId: 5, role: UserRole.ADMIN },
            { mineOnly: true }
        );

        expect(mockDb.getTracksByOwner).toHaveBeenCalledWith(9, expect.anything());
        expect(result.map((t: any) => t.id).sort()).toEqual([1, 2, 3, 4]);
    });

    test('mineOnly for a plain listener does not query the primary admin', async () => {
        (mockDb.getTracksByOwner as jest.Mock).mockReturnValue([{ id: 1 }]);

        await service.getTracksForUser({ userId: 1, role: UserRole.NORMAL_USER }, { mineOnly: true });
        expect(mockDb.getPrimaryAdminId).not.toHaveBeenCalled();
    });
});

describe('DiscoveryService.getAlbumForUser', () => {
    let service: any;
    let mockMetadata: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockMetadata = { searchRelease: jest.fn(async () => []) };
        service = new DiscoveryService(mockDb, {} as any, mockMetadata);
    });

    test('looks up by numeric id', async () => {
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 1, is_release: true, visibility: 'public' });
        (mockDb.getTracksByReleaseId as jest.Mock).mockReturnValue([]);
        (mockDb.getTracksByAlbum as jest.Mock).mockReturnValue([]);

        const result = await service.getAlbumForUser(1, {});
        expect(mockDb.getAlbum).toHaveBeenCalledWith(1);
        expect(result.id).toBe(1);
    });

    test('looks up an "ext:" id via a direct external_id query', async () => {
        const getSpy = jest.fn(() => ({ id: 2, external_id: 'ext:mb:abc', is_release: true, visibility: 'public' }));
        (mockDb.db.prepare as jest.Mock).mockReturnValue({ get: getSpy });
        (mockDb.getTracksByReleaseId as jest.Mock).mockReturnValue([]);
        (mockDb.getTracksByAlbum as jest.Mock).mockReturnValue([]);

        const result = await service.getAlbumForUser('ext:mb:abc', {});
        expect(getSpy).toHaveBeenCalledWith('ext:mb:abc');
        expect(result.id).toBe(2);
    });

    test('looks up by slug for non-numeric, non-ext ids', async () => {
        (mockDb.getAlbumBySlug as jest.Mock).mockReturnValue({ id: 3, slug: 'my-album', is_release: true, visibility: 'public' });
        (mockDb.getTracksByReleaseId as jest.Mock).mockReturnValue([]);
        (mockDb.getTracksByAlbum as jest.Mock).mockReturnValue([]);

        const result = await service.getAlbumForUser('my-album', {});
        expect(mockDb.getAlbumBySlug).toHaveBeenCalledWith('my-album');
        expect(result.id).toBe(3);
    });

    test('falls back to metadata search results for an unknown slug', async () => {
        (mockDb.getAlbumBySlug as jest.Mock).mockReturnValue(undefined);
        mockMetadata.searchRelease.mockResolvedValue([{ source: 'musicbrainz', id: 'abc', title: 'Found', artist: 'Someone', coverUrl: 'x.jpg' }]);

        const result = await service.getAlbumForUser('unknown-album', { username: undefined });
        expect(result.isExternal).toBe(true);
        expect(result.id).toBe('ext:search:musicbrainz:abc');
    });

    test('throws Album not found when nothing matches and metadata search is empty', async () => {
        (mockDb.getAlbumBySlug as jest.Mock).mockReturnValue(undefined);
        mockMetadata.searchRelease.mockResolvedValue([]);

        await expect(service.getAlbumForUser('unknown-album', {})).rejects.toThrow('Album not found');
    });

    test('denies a private release to a non-owner, non-admin, non-starred viewer', async () => {
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 4, is_release: true, visibility: 'private', owner_id: 99, artist_id: 50 });
        (mockDb.getAlbumOwners as jest.Mock).mockReturnValue([]);

        await expect(service.getAlbumForUser(4, { userId: 1, role: UserRole.NORMAL_USER }))
            .rejects.toThrow('Release not found');
    });

    test('grants access to the owner even when the album is private', async () => {
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 4, is_release: true, visibility: 'private', owner_id: 1 });
        (mockDb.getAlbumOwners as jest.Mock).mockReturnValue([]);
        (mockDb.getTracksByReleaseId as jest.Mock).mockReturnValue([{ id: 1, mime_type: 'audio/mpeg' }]);

        const result = await service.getAlbumForUser(4, { userId: 1, role: UserRole.NORMAL_USER });
        expect(result.tracks).toHaveLength(1);
    });

    test('falls back to album tracks when a release has no release_tracks rows', async () => {
        (mockDb.getAlbum as jest.Mock).mockReturnValue({ id: 4, is_release: true, is_public: true, visibility: 'public' });
        (mockDb.getAlbumOwners as jest.Mock).mockReturnValue([]);
        (mockDb.getTracksByReleaseId as jest.Mock).mockReturnValue([]);
        (mockDb.getTracksByAlbum as jest.Mock).mockReturnValue([{ id: 2, mime_type: 'audio/mpeg' }]);

        const result = await service.getAlbumForUser(4, {});
        expect(mockDb.getTracksByAlbum).toHaveBeenCalledWith(4, expect.anything());
        expect(result.tracks).toHaveLength(1);
    });
});
