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

