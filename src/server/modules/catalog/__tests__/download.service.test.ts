import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DownloadService, getDownloadService, initDownloadService } from '../download.service.js';
import type { DownloadProvider, DownloadResult } from '../../../core/provider.js';

class MockDownloadProvider implements DownloadProvider {
    id: string;
    name: string;
    version: string;
    description?: string;

    private available: boolean;
    private searchResults: DownloadResult[];
    private shouldThrow: boolean;

    constructor(id: string, name: string, version: string, available = true, searchResults: DownloadResult[] = [], shouldThrow = false) {
        this.id = id;
        this.name = name;
        this.version = version;
        this.available = available;
        this.searchResults = searchResults;
        this.shouldThrow = shouldThrow;
    }

    async isAvailable(): Promise<boolean> {
        return this.available;
    }

    async search(query: string): Promise<DownloadResult[]> {
        if (this.shouldThrow) {
            throw new Error(`Search failed for ${this.name}`);
        }
        return this.searchResults;
    }

    async download(result: DownloadResult): Promise<string> {
        return `/mock/path/${result.filename}`;
    }
}

describe('DownloadService', () => {
    let service: DownloadService;

    beforeEach(() => {
        service = new DownloadService();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('search', () => {
        test('merges results from all available providers', async () => {
            const provider1 = new MockDownloadProvider('p1', 'Provider 1', '1.0.0', true, [
                { id: '1', title: 'Track 1', filename: 'track1.mp3', sizeBytes: 100, source: 'p1' }
            ]);
            const provider2 = new MockDownloadProvider('p2', 'Provider 2', '1.0.0', true, [
                { id: '2', title: 'Track 2', filename: 'track2.mp3', sizeBytes: 200, source: 'p2' }
            ]);

            service.getRegistry().register(provider1, true);
            service.getRegistry().register(provider2, true);

            const results = await service.search('query');
            expect(results).toHaveLength(2);
            expect(results[0].source).toBe('p1');
            expect(results[1].source).toBe('p2');
        });

        test('skips unavailable providers', async () => {
            const provider1 = new MockDownloadProvider('p1', 'Provider 1', '1.0.0', true, [
                { id: '1', title: 'Track 1', filename: 'track1.mp3', sizeBytes: 100, source: 'p1' }
            ]);
            const provider2 = new MockDownloadProvider('p2', 'Provider 2', '1.0.0', false, [
                { id: '2', title: 'Track 2', filename: 'track2.mp3', sizeBytes: 200, source: 'p2' }
            ]);

            service.getRegistry().register(provider1, true);
            service.getRegistry().register(provider2, true);

            const results = await service.search('query');
            expect(results).toHaveLength(1);
            expect(results[0].source).toBe('p1');
        });

        test('merges results when one provider fails and another succeeds (waterfall strategy)', async () => {
            const successProvider1 = new MockDownloadProvider('p1', 'Provider 1', '1.0.0', true, [
                { id: '1', title: 'Track 1', filename: 'track1.mp3', sizeBytes: 100, source: 'p1' }
            ]);
            const failingProvider = new MockDownloadProvider('p2', 'Provider 2', '1.0.0', true, [], true);
            const successProvider2 = new MockDownloadProvider('p3', 'Provider 3', '1.0.0', true, [
                { id: '2', title: 'Track 2', filename: 'track2.mp3', sizeBytes: 200, source: 'p3' }
            ]);

            service.getRegistry().register(successProvider1, true);
            service.getRegistry().register(failingProvider, true);
            service.getRegistry().register(successProvider2, true);

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const results = await service.search('query');

            // Should still return results from the successful providers
            expect(results).toHaveLength(2);
            expect(results[0].source).toBe('p1');
            expect(results[1].source).toBe('p3');
            expect(consoleErrorSpy).toHaveBeenCalledWith(`[DownloadService] ❌ Provider "Provider 2" search failed:`, expect.any(Error));

            consoleErrorSpy.mockRestore();
        });

        test('returns empty array if all providers fail', async () => {
            const failingProvider1 = new MockDownloadProvider('p1', 'Provider 1', '1.0.0', true, [], true);
            const failingProvider2 = new MockDownloadProvider('p2', 'Provider 2', '1.0.0', true, [], true);

            service.getRegistry().register(failingProvider1, true);
            service.getRegistry().register(failingProvider2, true);

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const results = await service.search('query');

            expect(results).toHaveLength(0);
            expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

            consoleErrorSpy.mockRestore();
        });

        test('handles errors from providers gracefully', async () => {
            const provider1 = new MockDownloadProvider('p1', 'Provider 1', '1.0.0', true, [
                { id: '1', title: 'Track 1', filename: 'track1.mp3', sizeBytes: 100, source: 'p1' }
            ]);
            const provider2 = new MockDownloadProvider('p2', 'Provider 2', '1.0.0', true, [], true);

            service.getRegistry().register(provider1, true);
            service.getRegistry().register(provider2, true);

            const results = await service.search('query');
            expect(results).toHaveLength(1);
            expect(results[0].source).toBe('p1');
        });

        test('skips disabled providers', async () => {
             const provider1 = new MockDownloadProvider('p1', 'Provider 1', '1.0.0', true, [
                { id: '1', title: 'Track 1', filename: 'track1.mp3', sizeBytes: 100, source: 'p1' }
            ]);
            const provider2 = new MockDownloadProvider('p2', 'Provider 2', '1.0.0', true, [
                { id: '2', title: 'Track 2', filename: 'track2.mp3', sizeBytes: 200, source: 'p2' }
            ]);

            service.getRegistry().register(provider1, true);
            service.getRegistry().register(provider2, false);

            const results = await service.search('query');
            expect(results).toHaveLength(1);
            expect(results[0].source).toBe('p1');
        });

        test('waterfall strategy correctly merges results with simultaneous successes and failures', async () => {
            // Three providers simulating simultaneous parallel requests
            const providerFastSuccess = new MockDownloadProvider('p1', 'Provider Fast', '1.0.0', true, [
                { id: '1', title: 'Track 1', filename: 'track1.mp3', sizeBytes: 100, source: 'p1' }
            ]);
            const providerError = new MockDownloadProvider('p2', 'Provider Error', '1.0.0', true, [], true);
            const providerUnavailable = new MockDownloadProvider('p3', 'Provider Unavailable', '1.0.0', false, []);
            const providerSlowSuccess = new MockDownloadProvider('p4', 'Provider Slow', '1.0.0', true, [
                { id: '2', title: 'Track 2', filename: 'track2.mp3', sizeBytes: 200, source: 'p4' }
            ]);

            service.getRegistry().register(providerFastSuccess, true);
            service.getRegistry().register(providerError, true);
            service.getRegistry().register(providerUnavailable, true);
            service.getRegistry().register(providerSlowSuccess, true);

            // Mock console.error to avoid test output noise, and console.log to verify skipping
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            const results = await service.search('query');

            expect(results).toHaveLength(2);
            // Verify results are merged correctly despite errors/unavailability
            expect(results.some(r => r.source === 'p1')).toBe(true);
            expect(results.some(r => r.source === 'p4')).toBe(true);

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                `[DownloadService] ❌ Provider "Provider Error" search failed:`,
                expect.any(Error)
            );

            expect(consoleLogSpy).toHaveBeenCalledWith(
                `[DownloadService] ⏭️ Skipping "Provider Unavailable" (not available)`
            );

            consoleErrorSpy.mockRestore();
            consoleLogSpy.mockRestore();
        });
    });

    describe('download', () => {
        test('downloads from the correct provider', async () => {
            const provider1 = new MockDownloadProvider('p1', 'Provider 1', '1.0.0', true, []);
            service.getRegistry().register(provider1, true);

            const result: DownloadResult = { id: '1', title: 'Track 1', filename: 'track1.mp3', sizeBytes: 100, source: 'p1' };
            const filePath = await service.download(result);
            expect(filePath).toBe('/mock/path/track1.mp3');
        });

        test('throws if provider is not registered', async () => {
            const result: DownloadResult = { id: '1', title: 'Track 1', filename: 'track1.mp3', sizeBytes: 100, source: 'p1' };
            await expect(service.download(result)).rejects.toThrow(/No provider registered/);
        });

        test('throws if provider is disabled', async () => {
            const provider1 = new MockDownloadProvider('p1', 'Provider 1', '1.0.0', true, []);
            service.getRegistry().register(provider1, false);

            const result: DownloadResult = { id: '1', title: 'Track 1', filename: 'track1.mp3', sizeBytes: 100, source: 'p1' };
            await expect(service.download(result)).rejects.toThrow(/is disabled/);
        });
    });

    describe('listProviders', () => {
        test('returns a list of providers', () => {
            const provider1 = new MockDownloadProvider('p1', 'Provider 1', '1.0.0', true, []);
            const provider2 = new MockDownloadProvider('p2', 'Provider 2', '2.0.0', true, []);

            service.getRegistry().register(provider1, true);
            service.getRegistry().register(provider2, false);

            const list = service.listProviders();
            expect(list).toHaveLength(2);
            expect(list[0]).toEqual({ id: 'p1', name: 'Provider 1', version: '1.0.0' });
            expect(list[1]).toEqual({ id: 'p2', name: 'Provider 2', version: '2.0.0' });
        });
    });

    describe('Singleton functions', () => {
        test('initDownloadService and getDownloadService', async () => {
            const soulseekService = {} as any;
            const service = initDownloadService(soulseekService);
            expect(service).toBeInstanceOf(DownloadService);
            expect(getDownloadService()).toBe(service);

            const registry = service.getRegistry();
            expect(registry.get('soulseek')).toBeDefined();
            expect(registry.isEnabled('soulseek')).toBe(false);
            expect(registry.get('torrent')).toBeUndefined();
        });

        test('initDownloadService with torrentService', () => {
            const soulseekService = {} as any;
            const torrentService = {} as any;
            const service = initDownloadService(soulseekService, torrentService, 1);

            const registry = service.getRegistry();
            expect(registry.get('torrent')).toBeDefined();
            expect(registry.isEnabled('torrent')).toBe(false);
        });

        test('initDownloadService with db sync success', async () => {
            const soulseekService = {} as any;
            const db = {
                getAllPluginsState: jest.fn().mockReturnValue([
                    { id: 'soulseek', enabled: 1 }
                ])
            };
            const service = initDownloadService(soulseekService, undefined, 1, db);

            // Allow the async syncRegistryWithDatabase to complete
            await new Promise(process.nextTick);

            const registry = service.getRegistry();
            expect(registry.isEnabled('soulseek')).toBe(true);
        });

        test('initDownloadService with db sync failure', async () => {
            const soulseekService = {} as any;
            const db = {
                getAllPluginsState: jest.fn().mockImplementation(() => {
                    throw new Error('DB Error');
                })
            };

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            initDownloadService(soulseekService, undefined, 1, db);

            // Allow the promise catch block to run
            await new Promise(process.nextTick);

            expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to sync download registry:', expect.any(Error));
            consoleErrorSpy.mockRestore();
        });
    });
});
