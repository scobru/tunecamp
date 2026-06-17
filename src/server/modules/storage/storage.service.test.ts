import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import type { StorageProvider } from '../../core/provider.js';
import { StorageService } from './storage.service.js';

function makeProvider(id: string, overrides: Partial<StorageProvider> = {}): StorageProvider {
    return {
        id,
        name: `Provider ${id}`,
        version: '1.0.0',
        upload: jest.fn<StorageProvider['upload']>().mockResolvedValue(`remote://${id}/file`),
        download: jest.fn<StorageProvider['download']>().mockResolvedValue(undefined),
        getUrl: jest.fn<StorageProvider['getUrl']>().mockResolvedValue(`https://${id}/url`),
        exists: jest.fn<StorageProvider['exists']>().mockResolvedValue(true),
        delete: jest.fn<StorageProvider['delete']>().mockResolvedValue(undefined),
        ...overrides,
    };
}

describe('StorageService', () => {
    let service: StorageService;

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        service = new StorageService();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('with no provider registered', () => {
        test('upload throws', async () => {
            await expect(service.upload('/tmp/a', 'remote/a')).rejects.toThrow('No storage provider');
        });

        test('download throws', async () => {
            await expect(service.download('remote/a', '/tmp/a')).rejects.toThrow('No storage provider');
        });

        test('getUrl returns null', async () => {
            expect(await service.getUrl('remote/a')).toBeNull();
        });

        test('exists returns false', async () => {
            expect(await service.exists('remote/a')).toBe(false);
        });

        test('listProviders is empty', () => {
            expect(service.listProviders()).toEqual([]);
        });
    });

    describe('with a registered provider', () => {
        let provider: StorageProvider;

        beforeEach(() => {
            provider = makeProvider('gdrive');
            service.getRegistry().register(provider);
        });

        test('upload delegates to the provider and returns its remote path', async () => {
            const result = await service.upload('/tmp/song.mp3', 'music/song.mp3');
            expect(provider.upload).toHaveBeenCalledWith('/tmp/song.mp3', 'music/song.mp3');
            expect(result).toBe('remote://gdrive/file');
        });

        test('download delegates to the provider', async () => {
            await service.download('music/song.mp3', '/tmp/song.mp3');
            expect(provider.download).toHaveBeenCalledWith('music/song.mp3', '/tmp/song.mp3');
        });

        test('getUrl delegates to the provider', async () => {
            expect(await service.getUrl('music/song.mp3')).toBe('https://gdrive/url');
            expect(provider.getUrl).toHaveBeenCalledWith('music/song.mp3');
        });

        test('exists delegates to the provider', async () => {
            (provider.exists as any).mockResolvedValue(false);
            expect(await service.exists('music/song.mp3')).toBe(false);
        });

        test('listProviders surfaces id/name/version', () => {
            expect(service.listProviders()).toEqual([
                { id: 'gdrive', name: 'Provider gdrive', version: '1.0.0' },
            ]);
        });
    });

    describe('with multiple providers', () => {
        test('uses the first registered provider (getFirstAvailable)', async () => {
            const first = makeProvider('first');
            const second = makeProvider('second');
            service.getRegistry().register(first);
            service.getRegistry().register(second);

            await service.upload('/tmp/a', 'remote/a');

            expect(first.upload).toHaveBeenCalled();
            expect(second.upload).not.toHaveBeenCalled();
        });
    });
});
