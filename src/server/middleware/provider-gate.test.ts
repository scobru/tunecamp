import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { initDownloadService, getDownloadService } from '../modules/catalog/download.service.js';
import { requireDownloadProvider, isDownloadProviderEnabled } from './provider-gate.js';

const mockSoulseek: any = { isConnected: () => false };
const mockTorrent: any = {};

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
        initDownloadService(mockSoulseek, mockTorrent);
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
