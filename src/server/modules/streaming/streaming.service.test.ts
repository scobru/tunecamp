import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import type { StreamingProvider, StreamCandidate } from '../../core/provider.js';
import { StreamingService } from './streaming.service.js';

/** Builds a mock StreamingProvider with overridable behavior. */
function makeProvider(
    id: string,
    overrides: Partial<StreamingProvider> = {}
): StreamingProvider {
    return {
        id,
        name: `Provider ${id}`,
        version: '1.0.0',
        canHandle: () => true,
        getStreamUrl: jest.fn<StreamingProvider['getStreamUrl']>().mockResolvedValue(null),
        getStreamById: jest.fn<StreamingProvider['getStreamById']>().mockResolvedValue(null),
        ...overrides,
    };
}

/** Registers a provider into a service's registry as enabled. */
function register(service: StreamingService, provider: StreamingProvider) {
    const registry = service.getRegistry();
    registry.register(provider, true);
}

describe('StreamingService', () => {
    let service: StreamingService;

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        // The default soundcloud/bandcamp providers ship disabled, so a fresh
        // instance has no enabled providers until we register our mocks.
        service = new StreamingService();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('default registration', () => {
        test('ships soundcloud and bandcamp providers disabled', () => {
            const info = service.listProviders();
            const ids = info.map(p => p.id).sort();
            expect(ids).toEqual(['bandcamp', 'soundcloud']);
            expect(info.every(p => p.enabled === false)).toBe(true);
        });

        test('no enabled providers means search returns nothing', async () => {
            expect(await service.search('anything')).toEqual([]);
        });
    });

    describe('search', () => {
        test('aggregates candidates across enabled providers', async () => {
            const a: StreamCandidate[] = [{ id: 'a1', title: 'A', providerId: 'pa' } as any];
            const b: StreamCandidate[] = [{ id: 'b1', title: 'B', providerId: 'pb' } as any];
            register(service, makeProvider('pa', { search: jest.fn<any>().mockResolvedValue(a) }));
            register(service, makeProvider('pb', { search: jest.fn<any>().mockResolvedValue(b) }));

            const result = await service.search('query');
            expect(result).toEqual([...a, ...b]);
        });

        test('ignores providers that lack a search() method', async () => {
            register(service, makeProvider('no-search')); // no search defined
            register(service, makeProvider('has-search', {
                search: jest.fn<any>().mockResolvedValue([{ id: 'x', title: 'X' }]),
            }));

            const result = await service.search('query');
            expect(result).toEqual([{ id: 'x', title: 'X' }]);
        });

        test('a rejected provider does not abort the whole search', async () => {
            register(service, makeProvider('bad', {
                search: jest.fn<any>().mockRejectedValue(new Error('boom')),
            }));
            register(service, makeProvider('good', {
                search: jest.fn<any>().mockResolvedValue([{ id: 'g', title: 'G' }]),
            }));

            const result = await service.search('query');
            expect(result).toEqual([{ id: 'g', title: 'G' }]);
        });

        test('skips providers that are disabled', async () => {
            const disabledSearch = jest.fn<any>().mockResolvedValue([{ id: 'd', title: 'D' }]);
            const p = makeProvider('disabled', { search: disabledSearch });
            service.getRegistry().register(p, false);

            const result = await service.search('query');
            expect(result).toEqual([]);
            expect(disabledSearch).not.toHaveBeenCalled();
        });
    });

    describe('resolve', () => {
        test('returns the URL from the first provider that resolves', async () => {
            register(service, makeProvider('p1', {
                getStreamUrl: jest.fn<any>().mockResolvedValue('https://cdn/p1.mp3'),
            }));
            const url = await service.resolve('Song', 'Artist');
            expect(url).toBe('https://cdn/p1.mp3');
        });

        test('caches the resolved URL and serves the second call without hitting the provider', async () => {
            const getStreamUrl = jest.fn<any>().mockResolvedValue('https://cdn/cached.mp3');
            register(service, makeProvider('p1', { getStreamUrl }));

            const first = await service.resolve('Song', 'Artist');
            const second = await service.resolve('Song', 'Artist');

            expect(first).toBe('https://cdn/cached.mp3');
            expect(second).toBe('https://cdn/cached.mp3');
            expect(getStreamUrl).toHaveBeenCalledTimes(1);
        });

        test('falls through to the next provider when the first returns null', async () => {
            const first = jest.fn<any>().mockResolvedValue(null);
            const second = jest.fn<any>().mockResolvedValue('https://cdn/second.mp3');
            register(service, makeProvider('p1', { getStreamUrl: first }));
            register(service, makeProvider('p2', { getStreamUrl: second }));

            const url = await service.resolve('Song', 'Artist');
            expect(url).toBe('https://cdn/second.mp3');
            expect(first).toHaveBeenCalled();
            expect(second).toHaveBeenCalled();
        });

        test('returns null when no provider can resolve', async () => {
            register(service, makeProvider('p1', {
                getStreamUrl: jest.fn<any>().mockResolvedValue(null),
            }));
            expect(await service.resolve('Song', 'Artist')).toBeNull();
        });
    });

    describe('resolveById', () => {
        test('returns null for an unknown provider id', async () => {
            expect(await service.resolveById('nope', 'track-1')).toBeNull();
        });

        test('returns null when the provider exists but is disabled', async () => {
            const getStreamById = jest.fn<any>().mockResolvedValue('https://cdn/x.mp3');
            service.getRegistry().register(makeProvider('p1', { getStreamById }), false);

            expect(await service.resolveById('p1', 'track-1')).toBeNull();
            expect(getStreamById).not.toHaveBeenCalled();
        });

        test('resolves and caches by provider+track id', async () => {
            const getStreamById = jest.fn<any>().mockResolvedValue('https://cdn/byid.mp3');
            register(service, makeProvider('p1', { getStreamById }));

            const first = await service.resolveById('p1', 'track-1');
            const second = await service.resolveById('p1', 'track-1');

            expect(first).toBe('https://cdn/byid.mp3');
            expect(second).toBe('https://cdn/byid.mp3');
            expect(getStreamById).toHaveBeenCalledTimes(1);
        });
    });

    describe('retry and cache expiry (fake timers)', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('retries a transient failure before succeeding', async () => {
            const getStreamUrl = jest.fn<any>()
                .mockRejectedValueOnce(new Error('flaky'))
                .mockResolvedValueOnce('https://cdn/retry.mp3');
            register(service, makeProvider('p1', { getStreamUrl }));

            const promise = service.resolve('Song', 'Artist');
            await jest.runAllTimersAsync();
            const url = await promise;

            expect(url).toBe('https://cdn/retry.mp3');
            expect(getStreamUrl).toHaveBeenCalledTimes(2);
        });

        test('gives up after exhausting retries and tries the next provider', async () => {
            const failing = jest.fn<any>().mockRejectedValue(new Error('always fails'));
            const fallback = jest.fn<any>().mockResolvedValue('https://cdn/fallback.mp3');
            register(service, makeProvider('p1', { getStreamUrl: failing }));
            register(service, makeProvider('p2', { getStreamUrl: fallback }));

            const promise = service.resolve('Song', 'Artist');
            await jest.runAllTimersAsync();
            const url = await promise;

            expect(url).toBe('https://cdn/fallback.mp3');
            // 1 initial + 2 retries on the failing provider
            expect(failing).toHaveBeenCalledTimes(3);
        });

        test('expired cache entries trigger a fresh resolution', async () => {
            const getStreamUrl = jest.fn<any>()
                .mockResolvedValueOnce('https://cdn/first.mp3')
                .mockResolvedValueOnce('https://cdn/second.mp3');
            register(service, makeProvider('p1', { getStreamUrl }));

            const first = await service.resolve('Song', 'Artist');
            // Advance past the 5h TTL.
            jest.advanceTimersByTime(5 * 60 * 60 * 1000 + 1000);
            const second = await service.resolve('Song', 'Artist');

            expect(first).toBe('https://cdn/first.mp3');
            expect(second).toBe('https://cdn/second.mp3');
            expect(getStreamUrl).toHaveBeenCalledTimes(2);
        });
    });
});
