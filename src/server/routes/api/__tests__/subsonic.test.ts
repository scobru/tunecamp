import { jest } from '@jest/globals';
jest.setTimeout(30000);

import { createDatabase } from '../../../core/database.js';
import { createAuthService } from '../../../modules/auth/auth.service.js';
import { createSubsonicRouter } from '../subsonic.js';
import request from 'supertest';
import express from 'express';
import fs from 'fs-extra';
import path from 'path';

describe('Subsonic Scrobbling', () => {
    let database: any;
    let authService: any;
    let app: any;
    let testArtistId: number;
    let testAlbumId: number;
    const dbPath = './test-subsonic-scrobble.db';

    beforeAll(async () => {
        try {
            database = createDatabase(dbPath);
            authService = createAuthService(database.db, 'test-secret');
            await authService.init();

            // Create a dummy user
            const passHash = await authService.hashPassword('password');
            database.db.prepare("INSERT OR IGNORE INTO admin (username, password_hash) VALUES (?, ?)").run('user', passHash);



            app = express();
            app.use(express.json()); // Add JSON parser for testing
            const mockScrobbleService = {
                updateNowPlaying: jest.fn<any>().mockReturnValue(Promise.resolve()),
                scrobble: jest.fn<any>().mockReturnValue(Promise.resolve())
            };

            app.use('/rest', createSubsonicRouter({
                database: database,
                authService: authService,
                musicDir: './music',
                scrobbleService: mockScrobbleService
            } as any));
        } catch (e) {
            console.error('FAILED beforeAll:', e);
            throw e;
        }
    });

    afterAll(async () => {
        if (database && database.db) {
            database.db.close();
        }
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
        if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    });

    it('should record a scrobble in the database and ZenDB', async () => {
        const artistId = database.library.createArtist('Test Artist');
        const albumId = database.library.createAlbum({
            title: 'Test Album',
            slug: 'test-album',
            artist_id: artistId,
            visibility: 'public',
            is_release: true
        } as any);
        const trackId = database.library.createTrack({
            title: 'Test Track',
            album_id: albumId,
            artist_id: artistId,
            track_num: 1,
            duration: 180,
            file_path: 'test.mp3'
        } as any);

        const nowSeconds = Math.floor(Date.now() / 1000);
        const authQuery = 'u=user&p=enc:70617373776f7264&v=1.16.1&c=test';

        const response = await request(app)
            .get(`/rest/scrobble.view?${authQuery}&id=tr_${trackId}&submission=true&timestamp=${nowSeconds}`);

        expect(response.status).toBe(200);

        const recentPlays = database.social.getRecentPlays(1);
        expect(recentPlays.length).toBe(1);
        expect(recentPlays[0].track_id).toBe(trackId);
        // SQLite stores ISO string. We compare them by creating Date objects.
        expect(Math.abs(new Date(recentPlays[0].played_at).getTime() - nowSeconds * 1000)).toBeLessThan(30000);
    });

    it('should handle multiple scrobbles in one request', async () => {
        const trackId = 1;
        const nowSeconds = Math.floor(Date.now() / 1000);
        const authQuery = 'u=user&p=enc:70617373776f7264&v=1.16.1&c=test';

        const response = await request(app)
            .get(`/rest/scrobble.view?${authQuery}&id=tr_${trackId}&id=tr_${trackId}&submission=true&timestamp=${nowSeconds}&timestamp=${nowSeconds - 10}`);

        expect(response.status).toBe(200);

        const recentPlays = database.social.getRecentPlays(5);
        // 1 from previous test + 2 from this test
        expect(recentPlays.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle now playing notification (submission=false)', async () => {
        const trackId = 1;
        const authQuery = 'u=user&p=enc:70617373776f7264&v=1.16.1&c=test';

        const playsBefore = database.social.getRecentPlays(100).length;
        const response = await request(app)
            .get(`/rest/scrobble.view?${authQuery}&id=tr_${trackId}&submission=false`);

        expect(response.status).toBe(200);
        const playsAfter = database.social.getRecentPlays(100).length;
        expect(playsAfter).toBe(playsBefore);
    });

    it('should return JSON when f=json is provided', async () => {
        const authQuery = 'u=user&p=enc:70617373776f7264&v=1.16.1&c=test';
        const response = await request(app)
            .get(`/rest/ping.view?${authQuery}&f=json`);

        expect(response.status).toBe(200);
        expect(response.body['subsonic-response']).toBeDefined();
        expect(response.body['subsonic-response'].status).toBe('ok');
    });

    it('should handle clear-text password authentication', async () => {
        const authQuery = 'u=user&p=password&v=1.16.1&c=test';
        const response = await request(app)
            .get(`/rest/ping.view?${authQuery}&f=json`);

        expect(response.status).toBe(200);
        expect(response.body['subsonic-response'].status).toBe('ok');
    });

    it('should return OpenSubsonic extensions', async () => {
        const authQuery = 'u=user&p=password&v=1.16.1&c=test';
        const response = await request(app)
            .get(`/rest/getOpenSubsonicExtensions.view?${authQuery}&f=json`);

        expect(response.status).toBe(200);
        expect(response.body['subsonic-response'].status).toBe('ok');
        expect(response.body['subsonic-response'].openSubsonicExtensions).toBeDefined();
        const extensions = response.body['subsonic-response'].openSubsonicExtensions.extension;
        expect(extensions.some((e: any) => e.name === 'openSubsonic')).toBe(true);
    });

    it('should manage bookmarks (create, get, delete)', async () => {
        const authQuery = 'u=user&p=password&v=1.16.1&c=test';
        
        // 1. Create bookmark
        const createRes = await request(app)
            .get(`/rest/createBookmark.view?${authQuery}&id=tr_1&position=45000&comment=GoodPart&f=json`);
        expect(createRes.status).toBe(200);
        expect(createRes.body['subsonic-response'].status).toBe('ok');

        // 2. Get bookmarks
        const getRes = await request(app)
            .get(`/rest/getBookmarks.view?${authQuery}&f=json`);
        expect(getRes.status).toBe(200);
        expect(getRes.body['subsonic-response'].status).toBe('ok');
        const bookmarks = getRes.body['subsonic-response'].bookmarks.bookmark;
        expect(bookmarks).toBeDefined();

        // 3. Delete bookmark
        const delRes = await request(app)
            .get(`/rest/deleteBookmark.view?${authQuery}&id=tr_1&f=json`);
        expect(delRes.status).toBe(200);
        expect(delRes.body['subsonic-response'].status).toBe('ok');
    });

    it('should manage play queue (save and get)', async () => {
        const authQuery = 'u=user&p=password&v=1.16.1&c=test';
        
        // 1. Save play queue
        const saveRes = await request(app)
            .get(`/rest/savePlayQueue.view?${authQuery}&id=tr_1&current=tr_1&position=15000&f=json`);
        expect(saveRes.status).toBe(200);
        expect(saveRes.body['subsonic-response'].status).toBe('ok');

        // 2. Get play queue
        const getRes = await request(app)
            .get(`/rest/getPlayQueue.view?${authQuery}&f=json`);
        expect(getRes.status).toBe(200);
        expect(getRes.body['subsonic-response'].status).toBe('ok');
        expect(getRes.body['subsonic-response'].playQueue).toBeDefined();
        expect(getRes.body['subsonic-response'].playQueue.current).toBe('tr_1');
        expect(getRes.body['subsonic-response'].playQueue.position).toBe(15000);
    });

    it('should return avatar SVG fallback when no image file exists', async () => {
        const authQuery = 'u=user&p=password&v=1.16.1&c=test';
        const response = await request(app)
            .get(`/rest/getAvatar.view?${authQuery}&username=user`);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('image/svg+xml');
    });
});


/**
 * The Subsonic surface addresses playlists by bare id and authenticates with a
 * `u=` the token paths never verified. Both are authorization boundaries the
 * REST twins (`/api/playlists`) have always enforced, so these cases pin the two
 * surfaces to the same rules.
 */
describe('Subsonic authorization', () => {
    let database: any;
    let authService: any;
    let app: any;
    const dbPath = './test-subsonic-authz.db';

    beforeAll(async () => {
        database = createDatabase(dbPath);
        authService = createAuthService(database.db, 'test-secret');
        await authService.init();
        const passHash = await authService.hashPassword('password');
        for (const name of ['alice', 'mallory']) {
            database.db.prepare(
                "INSERT OR IGNORE INTO admin (username, password_hash, role, is_active) VALUES (?, ?, 'user', 1)"
            ).run(name, passHash);
        }
        app = express();
        app.use('/rest', createSubsonicRouter({
            database,
            authService,
            musicDir: './music',
            scrobbleService: {
                updateNowPlaying: jest.fn<any>().mockReturnValue(Promise.resolve()),
                scrobble: jest.fn<any>().mockReturnValue(Promise.resolve())
            }
        } as any));
    });

    afterAll(() => {
        if (database?.db) database.db.close();
        for (const suffix of ['', '-shm', '-wal']) {
            if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
        }
    });

    const as = (user: string) => `u=${user}&p=password&v=1.16.1&c=test&f=json`;
    const body = (res: any) => res.body['subsonic-response'];

    describe('playlist ownership', () => {
        it("refuses to delete another user's playlist", async () => {
            const id = database.library.createPlaylist('Alice Private', 'alice', '', false);

            const res = await request(app).get(`/rest/deletePlaylist.view?${as('mallory')}&id=pl_${id}`);

            expect(body(res).status).toBe('failed');
            expect(database.library.getPlaylist(id)).toBeTruthy();
        });

        it("refuses to rewrite another user's playlist", async () => {
            const id = database.library.createPlaylist('Alice Private 2', 'alice', '', false);

            const res = await request(app)
                .get(`/rest/updatePlaylist.view?${as('mallory')}&playlistId=pl_${id}&public=true`);

            expect(body(res).status).toBe('failed');
            expect(database.library.getPlaylist(id).isPublic).toBeFalsy();
        });

        it("refuses to read another user's private playlist", async () => {
            const id = database.library.createPlaylist('Alice Private 3', 'alice', '', false);

            const res = await request(app).get(`/rest/getPlaylist.view?${as('mallory')}&id=pl_${id}`);

            expect(body(res).status).toBe('failed');
            expect(res.text).not.toContain('Alice Private 3');
        });

        it('lets the owner read, rewrite and delete their own playlist', async () => {
            const id = database.library.createPlaylist('Alice Own', 'alice', '', false);

            const read = await request(app).get(`/rest/getPlaylist.view?${as('alice')}&id=pl_${id}`);
            expect(body(read).status).toBe('ok');
            expect(body(read).playlist.name).toBe('Alice Own');

            const update = await request(app)
                .get(`/rest/updatePlaylist.view?${as('alice')}&playlistId=pl_${id}&public=true`);
            expect(body(update).status).toBe('ok');
            expect(database.library.getPlaylist(id).isPublic).toBeTruthy();

            const del = await request(app).get(`/rest/deletePlaylist.view?${as('alice')}&id=pl_${id}`);
            expect(body(del).status).toBe('ok');
            expect(database.library.getPlaylist(id)).toBeFalsy();
        });

        it('lets anyone read a public playlist', async () => {
            const id = database.library.createPlaylist('Alice Public', 'alice', '', true);

            const res = await request(app).get(`/rest/getPlaylist.view?${as('mallory')}&id=pl_${id}`);

            expect(body(res).status).toBe('ok');
            expect(body(res).playlist.name).toBe('Alice Public');
        });

        it("lists the caller's own private playlists alongside public ones", async () => {
            const mine = database.library.createPlaylist('Mallory Private', 'mallory', '', false);
            const theirs = database.library.createPlaylist('Alice Private 4', 'alice', '', false);
            const shared = database.library.createPlaylist('Alice Shared', 'alice', '', true);

            const res = await request(app).get(`/rest/getPlaylists.view?${as('mallory')}`);

            const names = body(res).playlists.playlist.map((p: any) => p.name);
            expect(names).toContain('Mallory Private');
            expect(names).toContain('Alice Shared');
            expect(names).not.toContain('Alice Private 4');
            expect([mine, theirs, shared].every((id) => typeof id === 'number')).toBe(true);
        });
    });

    describe('token authentication', () => {
        const tokenFor = (username: string) => {
            const row: any = database.db
                .prepare('SELECT id, token_version, artist_id FROM admin WHERE username = ?')
                .get(username);
            return authService.generateToken({
                userId: row.id,
                username,
                isAdmin: false,
                artistId: row.artist_id ?? null,
                role: 'user',
                isActive: true,
                tokenVersion: row.token_version
            });
        };

        it('acts as the account the token names, not as whatever u= claims', async () => {
            const token = tokenFor('mallory');

            const res = await request(app).get(
                `/rest/createPlaylist.view?u=alice&p=${token}&v=1.16.1&c=test&f=json&name=WhoOwnsMe`
            );

            expect(body(res).status).toBe('ok');
            expect(body(res).playlist.owner).toBe('mallory');
            const row: any = database.db
                .prepare('SELECT username FROM playlists WHERE name = ?')
                .get('WhoOwnsMe');
            expect(row.username).toBe('mallory');
        });

        it('still honours u= when the password path verified it', async () => {
            const res = await request(app).get(`/rest/createPlaylist.view?${as('alice')}&name=AlicesOwn`);

            expect(body(res).status).toBe('ok');
            expect(body(res).playlist.owner).toBe('alice');
        });
    });
});
