import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { initDownloadService, getDownloadService } from '../modules/catalog/download.service.js';
import { requireDownloadProvider, requireDownloadProviderParam, isDownloadProviderEnabled } from './provider-gate.js';

// P2P providers are no longer registered by initDownloadService — they
// self-register at startup via registerBuiltInDownloadProviders(). The gate
// logic under test only needs providers present in the registry, so we
// register minimal mocks directly, disabled by default like the real ones.
const mockProvider = (id: string): any => ({
    id,
    name: id,
    version: '0.0.0',
    isAvailable: async () => true,
    search: async () => [],
    download: async () => '/tmp/file'
});

const runMiddleware = (providerId: string) => {
    const middleware = requireDownloadProvider(providerId);
    const res: any = {
        statusCode: 0,
        body: null,
        status(code: number) { this.statusCode = code; return this; },
        json(payload: any) { this.body = payload; return this; }
    };
    const next = jest.fn();
    middleware({} as any, res, next);
    return { res, next };
};

describe('Grey-source provider gating', () => {
    beforeEach(() => {
        const service = initDownloadService();
        service.getRegistry().register(mockProvider('soulseek'), false);
        service.getRegistry().register(mockProvider('torrent'), false);
    });

    test('soulseek and torrent are disabled by default', () => {
        const registry = getDownloadService()!.getRegistry();
        expect(registry.isEnabled('soulseek')).toBe(false);
        expect(registry.isEnabled('torrent')).toBe(false);
        expect(isDownloadProviderEnabled('soulseek')).toBe(false);
        expect(isDownloadProviderEnabled('torrent')).toBe(false);
    });

    test('middleware blocks requests while the provider is disabled', () => {
        const { res, next } = runMiddleware('soulseek');
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
        expect(res.body.error).toMatch(/disabled/);
    });

    test('middleware lets requests through once the admin opts in', async () => {
        await getDownloadService()!.getRegistry().enable('torrent');
        const { res, next } = runMiddleware('torrent');
        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBe(0);
    });

    test('disabled providers are excluded from download searches', async () => {
        const results = await getDownloadService()!.search('artist - title');
        expect(results).toEqual([]);
    });

    test('download() refuses results from disabled providers', async () => {
        await expect(getDownloadService()!.download({
            id: '1', title: 't', filename: 'f', sizeBytes: 1, source: 'soulseek'
        })).rejects.toThrow(/disabled/);
    });
});

describe('Param-based provider gating (generic /content/provider/:providerId routes)', () => {
    const runParamMiddleware = (providerId?: string) => {
        const middleware = requireDownloadProviderParam();
        const res: any = {
            statusCode: 0,
            body: null,
            status(code: number) { this.statusCode = code; return this; },
            json(payload: any) { this.body = payload; return this; }
        };
        const next = jest.fn();
        middleware({ params: providerId ? { providerId } : {} } as any, res, next);
        return { res, next };
    };

    beforeEach(() => {
        const service = initDownloadService();
        service.getRegistry().register(mockProvider('community-dl'), false);
    });

    test('404s a provider that is not registered at all', () => {
        const { res, next } = runParamMiddleware('nonexistent');
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(404);
    });

    test('404s when the param is missing', () => {
        const { res, next } = runParamMiddleware(undefined);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(404);
    });

    test('403s a registered but disabled provider', () => {
        const { res, next } = runParamMiddleware('community-dl');
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
        expect(res.body.error).toMatch(/disabled/);
    });

    test('lets requests through once the provider is enabled', async () => {
        await getDownloadService()!.getRegistry().enable('community-dl');
        const { res, next } = runParamMiddleware('community-dl');
        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBe(0);
    });
});
