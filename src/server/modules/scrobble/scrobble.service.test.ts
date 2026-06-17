import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import type { ScrobbleProvider } from '../../core/provider.js';
import { ScrobbleService, getScrobbleService } from './scrobble.service.js';

const TRACK = { artist: 'Artist', title: 'Song', album: 'Album', duration: 200 };

function makeProvider(id: string, overrides: Partial<ScrobbleProvider> = {}): ScrobbleProvider {
    return {
        id,
        name: `Provider ${id}`,
        version: '1.0.0',
        isConfigured: jest.fn<ScrobbleProvider['isConfigured']>().mockResolvedValue(true),
        scrobble: jest.fn<ScrobbleProvider['scrobble']>().mockResolvedValue(undefined),
        nowPlaying: jest.fn<NonNullable<ScrobbleProvider['nowPlaying']>>().mockResolvedValue(undefined),
        ...overrides,
    };
}

describe('ScrobbleService', () => {
    let service: ScrobbleService;

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        service = new ScrobbleService();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('scrobble', () => {
        test('submits to every configured enabled provider', async () => {
            const a = makeProvider('a');
            const b = makeProvider('b');
            service.register(a);
            service.register(b);

            await service.scrobble(TRACK);

            expect(a.scrobble).toHaveBeenCalledWith(TRACK);
            expect(b.scrobble).toHaveBeenCalledWith(TRACK);
        });

        test('skips providers that are not configured', async () => {
            const configured = makeProvider('on');
            const unconfigured = makeProvider('off', {
                isConfigured: jest.fn<ScrobbleProvider['isConfigured']>().mockResolvedValue(false),
            });
            service.register(configured);
            service.register(unconfigured);

            await service.scrobble(TRACK);

            expect(configured.scrobble).toHaveBeenCalled();
            expect(unconfigured.scrobble).not.toHaveBeenCalled();
        });

        test('a failing provider does not stop the others', async () => {
            const bad = makeProvider('bad', {
                scrobble: jest.fn<ScrobbleProvider['scrobble']>().mockRejectedValue(new Error('boom')),
            });
            const good = makeProvider('good');
            service.register(bad);
            service.register(good);

            await expect(service.scrobble(TRACK)).resolves.toBeUndefined();
            expect(good.scrobble).toHaveBeenCalled();
        });

        test('does not call disabled providers', async () => {
            const provider = makeProvider('disabled');
            service.getRegistry().register(provider, false);

            await service.scrobble(TRACK);

            expect(provider.isConfigured).not.toHaveBeenCalled();
            expect(provider.scrobble).not.toHaveBeenCalled();
        });
    });

    describe('updateNowPlaying', () => {
        const NOW = { artist: 'Artist', title: 'Song', album: 'Album' };

        test('calls nowPlaying on configured providers that support it', async () => {
            const provider = makeProvider('a');
            service.register(provider);

            await service.updateNowPlaying(NOW);

            expect(provider.nowPlaying).toHaveBeenCalledWith(NOW);
        });

        test('skips providers without a nowPlaying method', async () => {
            const provider = makeProvider('no-np', { nowPlaying: undefined });
            service.register(provider);

            await expect(service.updateNowPlaying(NOW)).resolves.toBeUndefined();
            expect(provider.isConfigured).toHaveBeenCalled();
        });

        test('skips unconfigured providers', async () => {
            const provider = makeProvider('off', {
                isConfigured: jest.fn<ScrobbleProvider['isConfigured']>().mockResolvedValue(false),
            });
            service.register(provider);

            await service.updateNowPlaying(NOW);

            expect(provider.nowPlaying).not.toHaveBeenCalled();
        });

        test('a failing provider does not stop the others', async () => {
            const bad = makeProvider('bad', {
                nowPlaying: jest.fn<NonNullable<ScrobbleProvider['nowPlaying']>>().mockRejectedValue(new Error('fail')),
            });
            const good = makeProvider('good');
            service.register(bad);
            service.register(good);

            await expect(service.updateNowPlaying(NOW)).resolves.toBeUndefined();
            expect(good.nowPlaying).toHaveBeenCalled();
        });
    });

    describe('getScrobbleService', () => {
        test('returns a stable singleton', () => {
            expect(getScrobbleService()).toBe(getScrobbleService());
        });
    });
});
