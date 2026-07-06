import { describe, test, expect, beforeEach, beforeAll, jest } from '@jest/globals';

const mockSpotifyProvider = {
    id: 'spotify',
    name: 'Spotify',
    version: '1.0.0',
    canHandlePlaylist: jest.fn(),
    fetchPlaylistByUrl: jest.fn(),
};

const mockDeezerProvider = {
    id: 'deezer',
    name: 'Deezer',
    version: '1.0.0',
    canHandlePlaylist: jest.fn(),
    fetchPlaylistByUrl: jest.fn(),
};

const mockProviderRegistry = {
    register: jest.fn(),
    getEnabled: jest.fn(),
    get: jest.fn(),
};

jest.unstable_mockModule('../../../core/provider.js', () => ({
    ProviderRegistry: jest.fn().mockImplementation(() => mockProviderRegistry),
    syncRegistryWithDatabase: jest.fn().mockResolvedValue(undefined as never),
}));

jest.unstable_mockModule('../../../providers/metadata/spotify.provider.js', () => ({
    SpotifyProvider: jest.fn().mockImplementation(() => mockSpotifyProvider),
}));

jest.unstable_mockModule('../../../providers/playlists/deezer.playlist.js', () => ({
    DeezerProvider: jest.fn().mockImplementation(() => mockDeezerProvider),
}));

let PlaylistService: any;
let initPlaylistService: any;
let getPlaylistService: any;

describe('PlaylistService', () => {
    beforeAll(async () => {
        const mod = await import('../playlist.service.js');
        PlaylistService = mod.PlaylistService;
        initPlaylistService = mod.initPlaylistService;
        getPlaylistService = mod.getPlaylistService;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockProviderRegistry.getEnabled.mockReturnValue([
            mockSpotifyProvider,
            mockDeezerProvider,
        ]);
        mockSpotifyProvider.canHandlePlaylist.mockReturnValue(false);
        mockDeezerProvider.canHandlePlaylist.mockReturnValue(false);
    });

    describe('getProviderForUrl', () => {
        test('should return SpotifyProvider for spotify URL', () => {
            mockSpotifyProvider.canHandlePlaylist.mockReturnValue(true);
            const service = new PlaylistService();

            const provider = service.getProviderForUrl('https://open.spotify.com/playlist/xyz');

            expect(provider).toBe(mockSpotifyProvider);
            expect(mockSpotifyProvider.canHandlePlaylist).toHaveBeenCalledWith('https://open.spotify.com/playlist/xyz');
            expect(mockDeezerProvider.canHandlePlaylist).not.toHaveBeenCalled();
        });

        test('should return DeezerProvider for deezer URL', () => {
            mockDeezerProvider.canHandlePlaylist.mockReturnValue(true);
            const service = new PlaylistService();

            const provider = service.getProviderForUrl('https://www.deezer.com/en/playlist/xyz');

            expect(provider).toBe(mockDeezerProvider);
            expect(mockSpotifyProvider.canHandlePlaylist).toHaveBeenCalledWith('https://www.deezer.com/en/playlist/xyz');
            expect(mockDeezerProvider.canHandlePlaylist).toHaveBeenCalledWith('https://www.deezer.com/en/playlist/xyz');
        });

        test('should return null for unsupported URL', () => {
            const service = new PlaylistService();

            const provider = service.getProviderForUrl('https://example.com/playlist');

            expect(provider).toBeNull();
        });
    });

    describe('fetchExternalPlaylist', () => {
        test('should return fetched playlist from appropriate provider', async () => {
            mockSpotifyProvider.canHandlePlaylist.mockReturnValue(true);
            const mockPlaylist = { id: 'xyz', title: 'Test Playlist', tracks: [] };
            mockSpotifyProvider.fetchPlaylistByUrl.mockResolvedValue(mockPlaylist);
            const service = new PlaylistService();

            const result = await service.fetchExternalPlaylist('https://open.spotify.com/playlist/xyz');

            expect(result).toBe(mockPlaylist);
            expect(mockSpotifyProvider.fetchPlaylistByUrl).toHaveBeenCalledWith('https://open.spotify.com/playlist/xyz');
        });

        test('should throw Error if no provider found', async () => {
            const service = new PlaylistService();

            await expect(service.fetchExternalPlaylist('https://example.com/playlist'))
                .rejects.toThrow('No enabled provider found for URL: https://example.com/playlist');
        });
    });

    describe('getRegistry', () => {
        test('should return the provider registry', () => {
            const service = new PlaylistService();

            const registry = service.getRegistry();

            expect(registry).toBe(mockProviderRegistry);
        });
    });

    describe('Initialization', () => {
        test('initPlaylistService should create and sync registry, returning singleton', async () => {
            const { syncRegistryWithDatabase } = await import('../../../core/provider.js');
            const mockDb = {} as any;

            const service = await initPlaylistService(mockDb);

            expect(service).toBeInstanceOf(PlaylistService);
            expect(syncRegistryWithDatabase).toHaveBeenCalledWith(mockProviderRegistry, mockDb);

            const retrievedService = getPlaylistService();
            expect(retrievedService).toBe(service);
        });

        test('getPlaylistService should correctly return the initialized singleton instance', async () => {
             const mockDb = {} as any;
             const initService = await initPlaylistService(mockDb);

             const retrievedService = getPlaylistService();
             expect(retrievedService).toBeDefined();
             expect(retrievedService).toBe(initService);
             expect(retrievedService).toBeInstanceOf(PlaylistService);
             expect(typeof retrievedService.getProviderForUrl).toBe('function');
        });

        test('getPlaylistService should return undefined when uninitialized', async () => {
            await jest.isolateModulesAsync(async () => {
                const mod = await import('../playlist.service.js');
                // @ts-ignore
                expect(mod.getPlaylistService()).toBeUndefined();
            });
        });
    });
});
