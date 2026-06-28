import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { DownloadService } from '../download.service.js';
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
});
