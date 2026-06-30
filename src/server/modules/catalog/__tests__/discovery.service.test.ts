import { describe, test, expect, beforeEach, beforeAll, jest } from '@jest/globals';

// discovery.service pulls in the catalog mappers which are pure; the service
// itself only touches the injected database for getFederationCatalog, so a
// minimal mock suffices. Dynamic import keeps the module graph loading under ESM.
let DiscoveryService: any;

const mockDb = {
    getReleases: jest.fn(),
    getReleaseTracks: jest.fn(),
    getTracksByAlbum: jest.fn(),
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
