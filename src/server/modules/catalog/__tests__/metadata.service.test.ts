import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('node-id3', () => ({
    default: {
        update: jest.fn()
    }
}));

jest.unstable_mockModule('../../../common/network.js', () => ({
    drainResponse: jest.fn()
}));

jest.unstable_mockModule('../../../core/provider.js', () => ({
    ProviderRegistry: jest.fn().mockImplementation(() => {
        let enabled = [] as any[];
        return {
            register: jest.fn(),
            getEnabled: jest.fn().mockImplementation(() => enabled),
            get: jest.fn(),
            isEnabled: jest.fn(),
            // Expose a helper to easily setup enabled providers for tests
            _setEnabled: (providers: any[]) => {
                enabled = providers;
            }
        };
    }),
    syncRegistryWithDatabase: jest.fn()
}));

jest.unstable_mockModule('../../media/ffmpeg.js', () => ({
    writeMetadata: jest.fn()
}));

jest.unstable_mockModule('../../../../utils/fileUtils.js', () => ({
    getFastFileHash: jest.fn().mockResolvedValue('new-hash')
}));

const mockProviders = {
    soundcloudMetadataProvider: { id: 'soundcloud', searchRelease: jest.fn(), searchRecording: jest.fn(), searchArtist: jest.fn() },
    itunesProvider: { id: 'itunes', searchRelease: jest.fn(), searchRecording: jest.fn(), searchArtist: jest.fn() },
    musicbrainzProvider: { id: 'musicbrainz', searchRelease: jest.fn(), searchRecording: jest.fn(), searchArtist: jest.fn(), getCoverUrl: jest.fn() },
    discogsProvider: { id: 'discogs', searchRelease: jest.fn(), searchRecording: jest.fn(), searchArtist: jest.fn(), setSettings: jest.fn() },
    theaudiodbProvider: { id: 'theaudiodb', searchRelease: jest.fn(), searchRecording: jest.fn(), searchArtist: jest.fn() },
    spotifyProvider: { id: 'spotify', searchRelease: jest.fn(), searchRecording: jest.fn(), searchArtist: jest.fn() },
    deezerProvider: { id: 'deezer', searchRelease: jest.fn(), searchRecording: jest.fn(), searchArtist: jest.fn() },
    bandcampMetadataProvider: { id: 'bandcamp', searchRelease: jest.fn(), searchRecording: jest.fn(), searchArtist: jest.fn() }
};

jest.unstable_mockModule('../../../core/providers.js', () => mockProviders);

// Global mock for fetch
const globalFetch = jest.fn();
global.fetch = globalFetch as any;

describe('MetadataService', () => {
    let MetadataService: any;
    let metadataService: any;
    let initMetadataService: any;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Reset fetch mock
        globalFetch.mockReset();

        // Import the service after mocks are set up
        const module = await import('../metadata.service.js');
        MetadataService = module.MetadataService;
        initMetadataService = module.initMetadataService;

        metadataService = new MetadataService();
    });

    describe('MetadataCache integration', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('should evict cache entries after TTL (1 hour)', async () => {
            const providerRegistry = metadataService.getRegistry();
            providerRegistry._setEnabled([mockProviders.itunesProvider]);
            mockProviders.itunesProvider.searchRelease.mockResolvedValue([{ id: '1', title: 'TTL Album' }]);

            // Initial call caches the result
            await metadataService.searchRelease('ttl query');
            expect(mockProviders.itunesProvider.searchRelease).toHaveBeenCalledTimes(1);

            // Advance time just under 1 hour
            jest.advanceTimersByTime(60 * 60 * 1000 - 1);
            await metadataService.searchRelease('ttl query');
            expect(mockProviders.itunesProvider.searchRelease).toHaveBeenCalledTimes(1); // Still cached

            // Advance time past 1 hour
            jest.advanceTimersByTime(2);
            await metadataService.searchRelease('ttl query');
            expect(mockProviders.itunesProvider.searchRelease).toHaveBeenCalledTimes(2); // Cache evicted, queried again
        });

        test('should evict oldest cache entries when MAX_SIZE is exceeded', async () => {
            const providerRegistry = metadataService.getRegistry();
            providerRegistry._setEnabled([mockProviders.itunesProvider]);
            mockProviders.itunesProvider.searchRelease.mockResolvedValue([{ id: '1', title: 'Max Size Album' }]);

            // Fill cache to MAX_SIZE (1000)
            for (let i = 0; i < 1000; i++) {
                await metadataService.searchRelease(`query ${i}`);
            }

            // Verify that 'query 0' is cached
            mockProviders.itunesProvider.searchRelease.mockClear();
            await metadataService.searchRelease('query 0');
            expect(mockProviders.itunesProvider.searchRelease).toHaveBeenCalledTimes(0); // Served from cache

            // Add 1001th item
            await metadataService.searchRelease('query 1000');

            // Verify that 'query 0' was evicted
            await metadataService.searchRelease('query 0');
            expect(mockProviders.itunesProvider.searchRelease).toHaveBeenCalledTimes(2); // Evicted, queried again (query 1000 + query 0)
        });
    });

    describe('searchRelease', () => {
        test('should return cached results if available', async () => {
            const providerRegistry = metadataService.getRegistry();
            providerRegistry._setEnabled([mockProviders.itunesProvider]);

            mockProviders.itunesProvider.searchRelease.mockResolvedValueOnce([{ id: '1', title: 'Album' }]);

            // First call - should query provider and cache
            const result1 = await metadataService.searchRelease('test query');
            expect(result1).toEqual([{ id: '1', title: 'Album' }]);
            expect(mockProviders.itunesProvider.searchRelease).toHaveBeenCalledTimes(1);
            expect(mockProviders.itunesProvider.searchRelease).toHaveBeenCalledWith('test query');

            // Second call - should use cache
            const result2 = await metadataService.searchRelease('test query');
            expect(result2).toEqual([{ id: '1', title: 'Album' }]);
            expect(mockProviders.itunesProvider.searchRelease).toHaveBeenCalledTimes(1); // Still 1
        });

        test('should handle provider errors gracefully', async () => {
            const providerRegistry = metadataService.getRegistry();
            providerRegistry._setEnabled([mockProviders.itunesProvider, mockProviders.musicbrainzProvider]);

            mockProviders.itunesProvider.searchRelease.mockRejectedValueOnce(new Error('API failure'));
            mockProviders.musicbrainzProvider.searchRelease.mockResolvedValueOnce([{ id: '2', title: 'MB Album' }]);

            const result = await metadataService.searchRelease('error query');
            expect(result).toEqual([{ id: '2', title: 'MB Album' }]);
        });
    });

    describe('searchRecording', () => {
        test('should prioritize providers and stop early on high confidence', async () => {
            const providerRegistry = metadataService.getRegistry();
            // Enable both
            providerRegistry._setEnabled([mockProviders.itunesProvider, mockProviders.soundcloudMetadataProvider]);

            // Return 3 matches from itunes (a prioritized provider)
            mockProviders.itunesProvider.searchRecording.mockResolvedValueOnce([
                { id: '1', title: 'Match 1' },
                { id: '2', title: 'Match 2' },
                { id: '3', title: 'Match 3' }
            ]);
            mockProviders.soundcloudMetadataProvider.searchRecording.mockResolvedValueOnce([
                { id: '4', title: 'Match 4' }
            ]);

            const result = await metadataService.searchRecording('prioritized query');

            expect(result).toEqual([
                { id: '1', title: 'Match 1' },
                { id: '2', title: 'Match 2' },
                { id: '3', title: 'Match 3' }
            ]);

            // Should stop early and not call soundcloud
            expect(mockProviders.itunesProvider.searchRecording).toHaveBeenCalledTimes(1);
            expect(mockProviders.soundcloudMetadataProvider.searchRecording).not.toHaveBeenCalled();
        });

        test('should cache searchRecording results', async () => {
            const providerRegistry = metadataService.getRegistry();
            providerRegistry._setEnabled([mockProviders.spotifyProvider]);

            mockProviders.spotifyProvider.searchRecording.mockResolvedValueOnce([{ id: 's1', title: 'Song' }]);

            await metadataService.searchRecording('cache query');
            expect(mockProviders.spotifyProvider.searchRecording).toHaveBeenCalledTimes(1);

            // Second call
            const result2 = await metadataService.searchRecording('cache query');
            expect(result2).toEqual([{ id: 's1', title: 'Song' }]);
            expect(mockProviders.spotifyProvider.searchRecording).toHaveBeenCalledTimes(1);
        });
    });

    describe('searchArtist', () => {
        test('should aggregate results from providers that support searchArtist', async () => {
            const providerRegistry = metadataService.getRegistry();
            providerRegistry._setEnabled([mockProviders.musicbrainzProvider, mockProviders.deezerProvider]);

            mockProviders.musicbrainzProvider.searchArtist.mockResolvedValueOnce([{ id: 'mb-artist-1', name: 'Artist 1' }]);
            // deezerProvider doesn't implement searchArtist in this mock to test the conditional, or returns empty
            mockProviders.deezerProvider.searchArtist.mockRejectedValueOnce(new Error('Fail'));

            const result = await metadataService.searchArtist('artist query');
            expect(result).toEqual([{ id: 'mb-artist-1', name: 'Artist 1' }]);
        });
    });

    describe('getCoverUrl', () => {
        test('should return cover URL if provider is enabled and supports it', async () => {
            const providerRegistry = metadataService.getRegistry();
            providerRegistry.get.mockReturnValue(mockProviders.musicbrainzProvider);
            providerRegistry.isEnabled.mockReturnValue(true);
            mockProviders.musicbrainzProvider.getCoverUrl.mockResolvedValueOnce('http://example.com/cover.jpg');

            const url = await metadataService.getCoverUrl('mb-id-1');
            expect(url).toBe('http://example.com/cover.jpg');
            expect(mockProviders.musicbrainzProvider.getCoverUrl).toHaveBeenCalledWith('mb-id-1');
        });

        test('should return null if provider is not found or not enabled', async () => {
            const providerRegistry = metadataService.getRegistry();
            providerRegistry.get.mockReturnValue(null);

            const url = await metadataService.getCoverUrl('mb-id-1');
            expect(url).toBeNull();
        });
    });

    describe('getLyrics', () => {
        test('should fetch lyrics successfully', async () => {
            globalFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ lyrics: 'Never gonna give you up' })
            });

            const result = await metadataService.getLyrics('Rick Astley', 'Never Gonna Give You Up');
            expect(result).toEqual({ lyrics: 'Never gonna give you up', source: 'lyrics.ovh' });
            expect(globalFetch).toHaveBeenCalledWith(expect.stringContaining('Rick%20Astley'));
        });

        test('should return null and drain response on non-ok status', async () => {
            const mockDrain = (await import('../../../common/network.js')).drainResponse;
            const mockResponse = { ok: false };
            globalFetch.mockResolvedValueOnce(mockResponse);

            const result = await metadataService.getLyrics('Unknown', 'Song');
            expect(result).toBeNull();
            expect(mockDrain).toHaveBeenCalledWith(mockResponse);
        });

        test('should handle fetch errors', async () => {
            globalFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await metadataService.getLyrics('Artist', 'Song');
            expect(result).toBeNull();
        });
    });

    describe('syncPhysicalTags', () => {
        test('should do nothing if path is missing', async () => {
            const storage = { pathExists: jest.fn().mockResolvedValue(false) };
            const db = { updateTrackHash: jest.fn() };

            await metadataService.syncPhysicalTags({ file_path: 'song.mp3' }, db as any, storage as any, '/music');

            expect(storage.pathExists).toHaveBeenCalledWith(expect.stringContaining('song.mp3'));
            const { writeMetadata } = await import('../../media/ffmpeg.js');
            expect(writeMetadata).not.toHaveBeenCalled();
        });

        test('should update mp3 tags with NodeID3', async () => {
            const storage = { pathExists: jest.fn().mockResolvedValue(true) };
            const db = { updateTrackHash: jest.fn() };

            await metadataService.syncPhysicalTags({ id: 1, file_path: 'song.mp3', title: 'Test Title' }, db as any, storage as any, '/music');

            const NodeID3 = (await import('node-id3')).default;
            expect(NodeID3.update).toHaveBeenCalled();
            expect(db.updateTrackHash).toHaveBeenCalledWith(1, 'new-hash');
        });

        test('should update flac tags with writeMetadata', async () => {
            const storage = { pathExists: jest.fn().mockResolvedValue(true) };
            const db = { updateTrackHash: jest.fn() };

            await metadataService.syncPhysicalTags({ id: 2, file_path: 'song.flac', title: 'FLAC Title' }, db as any, storage as any, '/music');

            const { writeMetadata } = await import('../../media/ffmpeg.js');
            expect(writeMetadata).toHaveBeenCalledWith(expect.stringContaining('song.flac'), expect.objectContaining({ title: 'FLAC Title' }));
            expect(db.updateTrackHash).toHaveBeenCalledWith(2, 'new-hash');
        });

        test('should update both lossy and lossless paths', async () => {
             const storage = { pathExists: jest.fn().mockResolvedValue(true) };
             const db = { updateTrackHash: jest.fn() };

             await metadataService.syncPhysicalTags({ id: 3, file_path: 'song.mp3', lossless_path: 'song.flac', title: 'Dual Title' }, db as any, storage as any, '/music');

             const NodeID3 = (await import('node-id3')).default;
             const { writeMetadata } = await import('../../media/ffmpeg.js');

             expect(NodeID3.update).toHaveBeenCalled();
             expect(writeMetadata).toHaveBeenCalled();
             expect(db.updateTrackHash).toHaveBeenCalledTimes(2);
        });
    });

    describe('initMetadataService', () => {
        test('should initialize service and set settings', async () => {
            const { syncRegistryWithDatabase } = await import('../../../core/provider.js');
            const db = {};

            const service = await initMetadataService(db);

            expect(service).toBeDefined();
            expect(mockProviders.discogsProvider.setSettings).toHaveBeenCalledWith(db);
            expect(syncRegistryWithDatabase).toHaveBeenCalled();
        });
    });
});
