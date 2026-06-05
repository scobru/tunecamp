
import { createDatabase } from '../../../core/database.js';
import { createAuthService } from '../../../modules/auth/auth.service.js';
import { createSubsonicRouter } from '../subsonic.js';
import { jest } from '@jest/globals';
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
    let mockZendbService: any;
    const dbPath = './test-subsonic-scrobble.db';

    beforeAll(async () => {
        try {
            database = createDatabase(dbPath);
            authService = createAuthService(database.db, 'test-secret');
            await authService.init();

            // Create a dummy user
            const passHash = await authService.hashPassword('password');
            database.db.prepare("INSERT OR IGNORE INTO admin (username, password_hash) VALUES (?, ?)").run('user', passHash);

            mockZendbService = {
                incrementTrackPlayCount: jest.fn().mockReturnValue(Promise.resolve(1)),
                getTrackPlayCount: jest.fn().mockReturnValue(Promise.resolve(1))
            };

            app = express();
            app.use(express.json()); // Add JSON parser for testing
            app.use('/rest', createSubsonicRouter({
                db: database,
                auth: authService,
                musicDir: './music',
                zendbService: mockZendbService
            }));
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

    it('should record a scrobble in the database and GunDB', async () => {
        const artistId = database.createArtist('Test Artist');
        const albumId = database.createAlbum({
            title: 'Test Album',
            slug: 'test-album',
            artist_id: artistId,
            visibility: 'public',
            is_release: true
        } as any);
        const trackId = database.createTrack({
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

        const recentPlays = database.getRecentPlays(1);
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

        const recentPlays = database.getRecentPlays(5);
        // 1 from previous test + 2 from this test
        expect(recentPlays.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle now playing notification (submission=false)', async () => {
        const trackId = 1;
        const authQuery = 'u=user&p=enc:70617373776f7264&v=1.16.1&c=test';

        const playsBefore = database.getRecentPlays(100).length;
        const response = await request(app)
            .get(`/rest/scrobble.view?${authQuery}&id=tr_${trackId}&submission=false`);

        expect(response.status).toBe(200);
        const playsAfter = database.getRecentPlays(100).length;
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

    it('should return 404 error in JSON for unknown endpoints', async () => {
        const authQuery = 'u=user&p=password&v=1.16.1&c=test';
        const response = await request(app)
            .get(`/rest/unknown.view?${authQuery}&f=json`);

        expect(response.status).toBe(200); // Subsonic often returns 200 with error inside
        expect(response.body['subsonic-response'].status).toBe('failed');
        expect(response.body['subsonic-response'].error.code).toBe('0');
    });
});

