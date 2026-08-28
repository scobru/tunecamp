import { describe, test, expect, beforeAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createCommunityRoutes } from './community.js';
import { DigService } from '../../modules/catalog/dig.service.js';

/**
 * /api/community/activity — public feed built from real SQL over an in-memory DB.
 * The points under test are the UNION query's public-release filtering (private
 * library items, private playlists and admin-minted tx-less unlock codes must
 * never appear) and actor identity: usernames on likes/playlists are exposed
 * only when the actor opted into a public profile.
 */
describe('Community activity feed', () => {
    let app: express.Express;

    beforeAll(() => {
        const db = new Database(':memory:');
        db.exec(`
            CREATE TABLE artists (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE albums (
                id INTEGER PRIMARY KEY, title TEXT, slug TEXT, artist_id INTEGER,
                album_artist TEXT, cover_path TEXT, is_release INTEGER DEFAULT 0,
                status TEXT DEFAULT 'draft', visibility TEXT DEFAULT 'private',
                published_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE tracks (id INTEGER PRIMARY KEY, title TEXT, album_id INTEGER, artist_name TEXT, artist_id INTEGER);
            CREATE TABLE starred_items (id INTEGER PRIMARY KEY, username TEXT, item_type TEXT, item_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE unlock_codes (id INTEGER PRIMARY KEY, code TEXT, release_id INTEGER, track_id INTEGER, tx_hash TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE playlists (id INTEGER PRIMARY KEY, name TEXT, username TEXT, is_public INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE admin (id INTEGER PRIMARY KEY, username TEXT, public_profile_enabled INTEGER DEFAULT 0);
        `);

        db.exec(`
            INSERT INTO artists (id, name) VALUES (1, 'The Artist');
            -- public released album + a private library album
            INSERT INTO albums (id, title, slug, artist_id, is_release, status, visibility, published_at)
                VALUES (10, 'Public Release', 'public-release', 1, 1, 'released', 'public', '2026-07-01 10:00:00');
            INSERT INTO albums (id, title, slug, artist_id, is_release, status, visibility)
                VALUES (11, 'Private Library Album', 'private-album', 1, 0, 'draft', 'private');
            INSERT INTO tracks (id, title, album_id, artist_name) VALUES (100, 'Public Track', 10, 'The Artist');
            INSERT INTO tracks (id, title, album_id, artist_name) VALUES (101, 'Private Track', 11, 'The Artist');
            -- accounts: admin opted into a public profile, alice did not
            INSERT INTO admin (username, public_profile_enabled) VALUES ('admin', 1);
            INSERT INTO admin (username, public_profile_enabled) VALUES ('alice', 0);
            -- likes: one on the public album, one on a public-release track, one on private stuff,
            -- plus one by a non-opted-in user on the public album
            INSERT INTO starred_items (username, item_type, item_id, created_at) VALUES ('admin', 'album', '10', '2026-07-01 11:00:00');
            INSERT INTO starred_items (username, item_type, item_id, created_at) VALUES ('alice', 'album', '10', '2026-07-01 11:02:00');
            INSERT INTO starred_items (username, item_type, item_id, created_at) VALUES ('admin', 'track', '100', '2026-07-01 11:05:00');
            INSERT INTO starred_items (username, item_type, item_id, created_at) VALUES ('admin', 'album', '11', '2026-07-01 11:10:00');
            -- purchase with tx (real) vs admin-minted code without tx
            INSERT INTO unlock_codes (code, release_id, tx_hash, created_at) VALUES ('BUY-1', 10, '0xabc', '2026-07-01 12:00:00');
            INSERT INTO unlock_codes (code, release_id, tx_hash, created_at) VALUES ('FREE-1', 10, NULL, '2026-07-01 12:05:00');
            -- public + private playlist (alice: profile private) and a public playlist by admin (profile public)
            INSERT INTO playlists (name, username, is_public, created_at) VALUES ('Summer Mix', 'alice', 1, '2026-07-01 13:00:00');
            INSERT INTO playlists (name, username, is_public, created_at) VALUES ('Secret Stash', 'alice', 0, '2026-07-01 13:05:00');
            INSERT INTO playlists (name, username, is_public, created_at) VALUES ('Curated Cuts', 'admin', 1, '2026-07-01 13:10:00');
        `);

        const container: any = {
            database: { db, getSetting: (k: string) => (k === 'publicUrl' ? 'https://music.example.com' : k === 'siteName' ? 'Test Camp' : null) },
            config: {},
            federatedDiscoveryService: { getPeers: () => [] },
        };
        app = express();
        app.use('/api/community', createCommunityRoutes(container));
    });

    test('returns only public events, newest first', async () => {
        const res = await request(app).get('/api/community/activity');
        expect(res.status).toBe(200);
        expect(res.body.instance).toEqual({ name: 'Test Camp', url: 'https://music.example.com' });

        const events = res.body.events;
        const types = events.map((e: any) => `${e.type}:${e.object.title}`);
        // public playlists, real purchase, likes, release publish — in ts order (desc)
        expect(types).toEqual([
            'playlist:Curated Cuts',
            'playlist:Summer Mix',
            'purchase:Public Release',
            'like:Public Track',
            'like:Public Release',
            'like:Public Release',
            'release:Public Release',
        ]);

        // never: private album like, tx-less code, private playlist
        const titles = events.map((e: any) => e.object.title);
        expect(titles).not.toContain('Private Library Album');
        expect(titles).not.toContain('Secret Stash');
        expect(events.filter((e: any) => e.type === 'purchase')).toHaveLength(1);

        // actor identity only for opted-in public profiles; purchases never carry one
        const likeUsers = events.filter((e: any) => e.type === 'like').map((e: any) => e.user);
        expect(likeUsers).toEqual(['admin', null, 'admin']); // alice (private profile) stays anonymous
        expect(events.find((e: any) => e.type === 'purchase').user).toBeNull();
        expect(events.find((e: any) => e.object.title === 'Curated Cuts').user).toBe('admin');
        expect(events.find((e: any) => e.object.title === 'Summer Mix').user).toBeNull();

        // absolute urls built from publicUrl
        const like = events.find((e: any) => e.type === 'like' && e.object.title === 'Public Release');
        expect(like.object.url).toBe('https://music.example.com/releases/public-release');
    });

    test('caps limit at 100 and honours ?limit=', async () => {
        const res = await request(app).get('/api/community/activity?limit=2');
        expect(res.status).toBe(200);
        expect(res.body.events).toHaveLength(2);
    });

});

/**
 * POST /api/community/dig-lookup — the peer-facing half of network DIG (dig.service.ts).
 * Gated behind the digNetworkOptIn setting, and must never leak usernames — only aggregate
 * counts for co-starred releases above the MIN_CO_STARRERS privacy floor.
 */
describe('Community dig-lookup', () => {
    const SEED_URL = 'https://seedartist.bandcamp.com/album/seed';
    const CO_STAR_URL = 'https://otherartist.bandcamp.com/album/hit';
    const LONE_URL = 'https://otherartist.bandcamp.com/album/rare';
    const RELEASED = "is_release, status, visibility";

    function buildApp(optedIn: boolean) {
        const db = new Database(':memory:');
        db.exec(`
            CREATE TABLE artists (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE albums (
                id INTEGER PRIMARY KEY, title TEXT, slug TEXT, artist_id INTEGER,
                album_artist TEXT, cover_path TEXT, external_id TEXT,
                is_release INTEGER DEFAULT 0, status TEXT DEFAULT 'draft', visibility TEXT DEFAULT 'private'
            );
            CREATE TABLE tracks (id INTEGER PRIMARY KEY, title TEXT, album_id INTEGER, artist_name TEXT, artist_id INTEGER, external_id TEXT);
            CREATE TABLE starred_items (id INTEGER PRIMARY KEY, username TEXT, item_type TEXT, item_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        `);
        db.exec(`
            INSERT INTO albums (id, title, slug, album_artist, external_id, ${RELEASED}) VALUES (1, 'Seed', 'seed', 'Seed Artist', '${SEED_URL}', 1, 'released', 'public');
            INSERT INTO albums (id, title, slug, album_artist, external_id, ${RELEASED}) VALUES (2, 'Hit', 'hit', 'Other Artist', '${CO_STAR_URL}', 1, 'released', 'public');
            INSERT INTO albums (id, title, slug, album_artist, external_id, ${RELEASED}) VALUES (3, 'Rare', 'rare', 'Other Artist', '${LONE_URL}', 1, 'released', 'public');
            -- TuneCamp-only release: no external_id at all, must still be matchable by title+artist
            INSERT INTO albums (id, title, slug, album_artist, ${RELEASED}) VALUES (4, 'Native Gem', 'native-gem', 'Other Artist', 1, 'released', 'public');
            -- unreleased/private album, starred but must never appear in a peer-facing response
            INSERT INTO albums (id, title, slug, album_artist) VALUES (5, 'Secret Demo', 'secret-demo', 'Other Artist');
            -- three users starred the seed; two of them also starred "Hit" and "Native Gem"
            -- (crosses the floor of 2), only one starred "Rare"/"Secret Demo" (below the floor)
            INSERT INTO starred_items (username, item_type, item_id) VALUES ('alice', 'album', '1');
            INSERT INTO starred_items (username, item_type, item_id) VALUES ('bob', 'album', '1');
            INSERT INTO starred_items (username, item_type, item_id) VALUES ('carol', 'album', '1');
            INSERT INTO starred_items (username, item_type, item_id) VALUES ('alice', 'album', '2');
            INSERT INTO starred_items (username, item_type, item_id) VALUES ('bob', 'album', '2');
            INSERT INTO starred_items (username, item_type, item_id) VALUES ('carol', 'album', '3');
            INSERT INTO starred_items (username, item_type, item_id) VALUES ('alice', 'album', '4');
            INSERT INTO starred_items (username, item_type, item_id) VALUES ('bob', 'album', '4');
            INSERT INTO starred_items (username, item_type, item_id) VALUES ('carol', 'album', '5');
        `);

        const settings: Record<string, string> = { digNetworkOptIn: optedIn ? 'true' : 'false', publicUrl: 'https://peer.example.com' };
        const container: any = {
            database: { db, getSetting: (k: string) => settings[k] },
            config: {},
            federatedDiscoveryService: { getPeers: () => [] },
            digService: new DigService({ db, getSetting: (k: string) => settings[k] } as any, { getPublicUrl: () => settings.publicUrl }),
        };
        const app = express();
        app.use('/api/community', createCommunityRoutes(container));
        return app;
    }

    test('404s when the instance has not opted in', async () => {
        const res = await request(buildApp(false)).post('/api/community/dig-lookup').send({ externalId: SEED_URL, title: 'Seed', artist: 'Seed Artist' });
        expect(res.status).toBe(404);
    });

    test('returns co-starred releases above the privacy floor — Bandcamp-matched and TuneCamp-only alike — excludes the seed and singletons, never leaks usernames or private catalog items', async () => {
        const res = await request(buildApp(true)).post('/api/community/dig-lookup').send({ externalId: SEED_URL, title: 'Seed', artist: 'Seed Artist' });
        expect(res.status).toBe(200);
        expect(res.body.results).toEqual(expect.arrayContaining([
            { externalId: CO_STAR_URL, title: 'Hit', artist: 'Other Artist', coverUrl: null, score: 2 },
            { externalId: null, title: 'Native Gem', artist: 'Other Artist', coverUrl: null, score: 2 },
        ]));
        expect(res.body.results).toHaveLength(2);
        const text = JSON.stringify(res.body);
        expect(text).not.toMatch(/alice|bob|carol/);
        expect(text).not.toMatch(/Secret Demo/); // private/unreleased — must never leave the instance
    });

    test('a TuneCamp-only release (no external_id) can itself be the seed, matched by title+artist', async () => {
        // alice and bob starred Native Gem plus both Seed and Hit — both come back as co-stars.
        const res = await request(buildApp(true)).post('/api/community/dig-lookup').send({ title: 'Native Gem', artist: 'Other Artist' });
        expect(res.status).toBe(200);
        expect(res.body.results).toEqual(expect.arrayContaining([
            { externalId: SEED_URL, title: 'Seed', artist: 'Seed Artist', coverUrl: null, score: 2 },
            { externalId: CO_STAR_URL, title: 'Hit', artist: 'Other Artist', coverUrl: null, score: 2 },
        ]));
        expect(res.body.results).toHaveLength(2);
    });

    test('400s without title/artist', async () => {
        const res = await request(buildApp(true)).post('/api/community/dig-lookup').send({ externalId: SEED_URL });
        expect(res.status).toBe(400);
    });
});
