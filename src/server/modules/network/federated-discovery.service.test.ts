import { jest, describe, test, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import Database from 'better-sqlite3';

jest.unstable_mockModule('../../../utils/networkUtils.js', () => ({
    isSafeUrl: jest.fn<any>().mockResolvedValue(true)
}));

let createFederatedDiscoveryService: any;

beforeAll(async () => {
    ({ createFederatedDiscoveryService } = await import('./federated-discovery.service.js'));
});

interface PeerCfg { software: string; name: string; peers?: string[]; }

/** Builds a fetch mock that answers the federated-discovery endpoints per origin.
 *  Origins absent from the map reject (simulating an offline instance). */
function routeFetch(map: Record<string, PeerCfg>) {
    return jest.fn(async (url: string) => {
        const origin = new URL(url).origin;
        const cfg = map[origin];
        if (!cfg) throw new Error('ECONNREFUSED');

        if (url.endsWith('/.well-known/nodeinfo')) {
            return { ok: true, json: async () => ({ links: [{ rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1', href: `${origin}/nodeinfo/2.1` }] }) };
        }
        if (url.endsWith('/nodeinfo/2.1')) {
            return { ok: true, json: async () => ({ software: { name: cfg.software, version: '2.0.1' } }) };
        }
        if (url.endsWith('/api/community/instance')) {
            return { ok: true, json: async () => ({ name: cfg.name, description: 'desc', coverImage: null, artistName: null, communityLink: null }) };
        }
        if (url.endsWith('/api/community/peers')) {
            return { ok: true, json: async () => (cfg.peers || []) };
        }
        throw new Error('unexpected url ' + url);
    });
}

describe('FederatedDiscoveryService', () => {
    let db: InstanceType<typeof Database>;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        db = new Database(':memory:');
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        db.close();
    });

    test('discovers a valid TuneCamp peer from seeds and stores it', async () => {
        global.fetch = routeFetch({ 'https://a.example.com': { software: 'tunecamp', name: 'Peer A', peers: [] } }) as any;
        const svc = createFederatedDiscoveryService(db, { seeds: ['https://a.example.com'] });

        const found = await svc.crawl();

        expect(found).toBe(1);
        const sites = svc.getCommunitySites();
        expect(sites).toHaveLength(1);
        expect(sites[0].url).toBe('https://a.example.com');
        expect(sites[0].name).toBe('Peer A');
        expect(sites[0].version).toBe('2.0.1');

        const row = db.prepare('SELECT * FROM federated_instances').get() as any;
        expect(row.origin).toBe('https://a.example.com');
    });

    test('ignores hosts that are not TuneCamp instances', async () => {
        global.fetch = routeFetch({ 'https://m.example.com': { software: 'mastodon', name: 'Masto', peers: [] } }) as any;
        const svc = createFederatedDiscoveryService(db, { seeds: ['https://m.example.com'] });

        expect(await svc.crawl()).toBe(0);
        expect(svc.getCommunitySites()).toHaveLength(0);
    });

    test('offline seed yields no instances without throwing', async () => {
        global.fetch = routeFetch({}) as any;
        const svc = createFederatedDiscoveryService(db, { seeds: ['https://down.example.com'] });

        expect(await svc.crawl()).toBe(0);
        expect(svc.getCommunitySites()).toHaveLength(0);
    });

    test('expands the frontier through a peer\'s /peers list (gossip)', async () => {
        global.fetch = routeFetch({
            'https://a.example.com': { software: 'tunecamp', name: 'A', peers: ['https://b.example.com'] },
            'https://b.example.com': { software: 'tunecamp', name: 'B', peers: [] },
        }) as any;
        const svc = createFederatedDiscoveryService(db, { seeds: ['https://a.example.com'] });

        expect(await svc.crawl()).toBe(2);
        const urls = svc.getCommunitySites().map(s => s.url).sort();
        expect(urls).toEqual(['https://a.example.com', 'https://b.example.com']);
    });

    test('excludes our own origin from discovery', async () => {
        global.fetch = routeFetch({
            'https://me.example.com': { software: 'tunecamp', name: 'Me', peers: [] },
            'https://a.example.com': { software: 'tunecamp', name: 'A', peers: [] },
        }) as any;
        const svc = createFederatedDiscoveryService(db, {
            seeds: ['https://me.example.com', 'https://a.example.com'],
            getOwnOrigin: () => 'https://me.example.com',
        });

        await svc.crawl();
        expect(svc.getCommunitySites().map(s => s.url)).toEqual(['https://a.example.com']);
    });

    test('getPeers unions discovered + seeds and excludes own origin', async () => {
        global.fetch = routeFetch({ 'https://a.example.com': { software: 'tunecamp', name: 'A', peers: [] } }) as any;
        const svc = createFederatedDiscoveryService(db, {
            seeds: ['https://a.example.com', 'https://seed-only.example.com'],
            getOwnOrigin: () => 'https://me.example.com',
        });

        await svc.crawl();
        const peers = svc.getPeers();
        expect(peers).toContain('https://a.example.com');          // discovered + seed
        expect(peers).toContain('https://seed-only.example.com');  // seed even though unreachable
        expect(peers).not.toContain('https://me.example.com');     // own origin excluded
    });

    test('prune flags entries older than the hard expiry as offline instead of deleting them', () => {
        const svc = createFederatedDiscoveryService(db, {});
        const ancient = Date.now() - 2 * 24 * 60 * 60 * 1000; // 2d ago, expiry is 1d
        db.prepare(`INSERT INTO federated_instances
            (origin, name, description, cover_image, artist_name, community_link, version, last_seen, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run('https://dead.example.com', 'Dead', '', null, null, null, '2.0', ancient, ancient);

        svc.prune();

        const row = db.prepare('SELECT * FROM federated_instances WHERE origin = ?').get('https://dead.example.com') as any;
        expect(row).toBeTruthy();
        expect(row.offline_since).not.toBeNull();
        // Flagged offline, so it drops out of the served/gossip lists...
        expect(svc.getCommunitySites()).toHaveLength(0);
        // ...but stays queryable for admin visibility.
        const status = svc.getInstanceStatus('https://dead.example.com');
        expect(status).toEqual({ origin: 'https://dead.example.com', offline: true, offlineSince: expect.any(Number), lastSeen: ancient });
    });

    test('prune purges entries that have been offline past the purge window', () => {
        const svc = createFederatedDiscoveryService(db, {});
        const ancient = Date.now() - 40 * 24 * 60 * 60 * 1000; // 40d ago
        const longOffline = Date.now() - 31 * 24 * 60 * 60 * 1000; // flagged offline 31d ago
        db.prepare(`INSERT INTO federated_instances
            (origin, name, description, cover_image, artist_name, community_link, version, last_seen, fetched_at, offline_since)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run('https://longgone.example.com', 'Gone', '', null, null, null, '2.0', ancient, ancient, longOffline);

        svc.prune();

        const count = db.prepare('SELECT COUNT(*) as c FROM federated_instances').get() as any;
        expect(count.c).toBe(0);
    });

    test('a successful probe clears offline_since on an instance that came back', async () => {
        global.fetch = routeFetch({ 'https://a.example.com': { software: 'tunecamp', name: 'A', peers: [] } }) as any;
        const svc = createFederatedDiscoveryService(db, { seeds: ['https://a.example.com'] });
        const ancient = Date.now() - 2 * 24 * 60 * 60 * 1000;
        db.prepare(`INSERT INTO federated_instances
            (origin, name, description, cover_image, artist_name, community_link, version, last_seen, fetched_at, offline_since)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run('https://a.example.com', 'A', '', null, null, null, '2.0', ancient, ancient, ancient);

        await svc.crawl();

        expect(svc.getInstanceStatus('https://a.example.com')?.offline).toBe(false);
    });

    test('prune keeps entries refreshed within the last day', () => {
        const svc = createFederatedDiscoveryService(db, {});
        const recent = Date.now() - 12 * 60 * 60 * 1000; // 12h ago, inside the 1d expiry
        db.prepare(`INSERT INTO federated_instances
            (origin, name, description, cover_image, artist_name, community_link, version, last_seen, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run('https://alive.example.com', 'Alive', '', null, null, null, '2.0', recent, recent);

        svc.prune();

        const count = db.prepare('SELECT COUNT(*) as c FROM federated_instances').get() as any;
        expect(count.c).toBe(1);
    });
});
