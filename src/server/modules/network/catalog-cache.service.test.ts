import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';

jest.unstable_mockModule('../../../utils/networkUtils.js', () => ({
    isSafeUrl: jest.fn<any>().mockResolvedValue(true)
}));

const { createCatalogCacheService } = await import('./catalog-cache.service.js');

const SITE = { url: 'https://peer.example.com', name: 'Peer' };

const catalogResponse = (title: string) => ({
    ok: true,
    json: async () => ({
        releases: [{
            title: 'Album',
            artist_name: 'Artist',
            slug: 'album',
            tracks: [{ id: 1, title, duration: 100 }]
        }]
    })
});

describe('CatalogCacheService', () => {
    let db: InstanceType<typeof Database>;
    let mockFetch: any;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        db = new Database(':memory:');
        originalFetch = global.fetch;
        mockFetch = jest.fn();
        global.fetch = mockFetch as any;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        db.close();
    });

    test('first sight of a peer fetches live and caches the result', async () => {
        mockFetch.mockResolvedValue(catalogResponse('Song A'));
        const cache = createCatalogCacheService(db);

        const tracks = await cache.getTracks([SITE]);

        expect(tracks).toHaveLength(1);
        expect(tracks[0].title).toBe('Song A');
        expect(mockFetch).toHaveBeenCalledTimes(1);

        const row = db.prepare('SELECT * FROM peer_catalog_cache').get() as any;
        expect(row.site_url).toBe(SITE.url);
        expect(JSON.parse(row.tracks_json)).toHaveLength(1);
    });

    test('fresh cache is served without any network call', async () => {
        const cache = createCatalogCacheService(db);
        db.prepare('INSERT INTO peer_catalog_cache (site_url, tracks_json, fetched_at) VALUES (?, ?, ?)')
            .run(SITE.url, JSON.stringify([{ title: 'Cached Song' }]), Date.now());

        const tracks = await cache.getTracks([SITE]);

        expect(tracks).toHaveLength(1);
        expect(tracks[0].title).toBe('Cached Song');
        expect(mockFetch).not.toHaveBeenCalled();
    });

    test('stale cache is served immediately and revalidated in background', async () => {
        mockFetch.mockResolvedValue(catalogResponse('Fresh Song'));
        const cache = createCatalogCacheService(db);
        const staleTime = Date.now() - 2 * 60 * 60 * 1000; // 2h ago, TTL is 1h
        db.prepare('INSERT INTO peer_catalog_cache (site_url, tracks_json, fetched_at) VALUES (?, ?, ?)')
            .run(SITE.url, JSON.stringify([{ title: 'Stale Song' }]), staleTime);

        const tracks = await cache.getTracks([SITE]);

        // Served stale immediately
        expect(tracks[0].title).toBe('Stale Song');

        // Background refresh updates the cache
        await new Promise(r => setTimeout(r, 50));
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const row = db.prepare('SELECT * FROM peer_catalog_cache WHERE site_url = ?').get(SITE.url) as any;
        expect(JSON.parse(row.tracks_json)[0].title).toBe('Fresh Song');
        expect(row.fetched_at).toBeGreaterThan(staleTime);
    });

    test('offline peer keeps serving the last known catalog', async () => {
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
        const cache = createCatalogCacheService(db);
        const staleTime = Date.now() - 2 * 60 * 60 * 1000;
        db.prepare('INSERT INTO peer_catalog_cache (site_url, tracks_json, fetched_at) VALUES (?, ?, ?)')
            .run(SITE.url, JSON.stringify([{ title: 'Last Known Song' }]), staleTime);

        const tracks = await cache.getTracks([SITE]);

        expect(tracks).toHaveLength(1);
        expect(tracks[0].title).toBe('Last Known Song');

        // Failed refresh must not wipe the cached entry
        await new Promise(r => setTimeout(r, 50));
        const row = db.prepare('SELECT * FROM peer_catalog_cache WHERE site_url = ?').get(SITE.url) as any;
        expect(JSON.parse(row.tracks_json)[0].title).toBe('Last Known Song');
    });

    test('offline peer with no cache returns no tracks without throwing', async () => {
        mockFetch.mockRejectedValue(new Error('ETIMEDOUT'));
        const cache = createCatalogCacheService(db);

        const tracks = await cache.getTracks([SITE]);

        expect(tracks).toHaveLength(0);
    });

    test('prune drops entries older than the hard expiry', async () => {
        const cache = createCatalogCacheService(db);
        const ancient = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8d ago, expiry is 48h
        db.prepare('INSERT INTO peer_catalog_cache (site_url, tracks_json, fetched_at) VALUES (?, ?, ?)')
            .run('https://dead.example.com', '[]', ancient);

        cache.prune();

        const count = db.prepare('SELECT COUNT(*) as c FROM peer_catalog_cache').get() as any;
        expect(count.c).toBe(0);
    });

    test('entry past the hard expiry is not served and is dropped at request time', async () => {
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED')); // still offline
        const cache = createCatalogCacheService(db);
        const ancient = Date.now() - 3 * 24 * 60 * 60 * 1000; // 3d ago, expiry is 48h
        db.prepare('INSERT INTO peer_catalog_cache (site_url, tracks_json, fetched_at) VALUES (?, ?, ?)')
            .run(SITE.url, JSON.stringify([{ title: 'Long Dead Song' }]), ancient);

        const tracks = await cache.getTracks([SITE]);

        // Not served, and the stale entry is removed without waiting for a restart
        expect(tracks).toHaveLength(0);
        const row = db.prepare('SELECT * FROM peer_catalog_cache WHERE site_url = ?').get(SITE.url) as any;
        expect(row).toBeUndefined();
    });
});
