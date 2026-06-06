import { createDatabase } from '../../../core/database.js';
import { createAuthService } from '../../../modules/auth/auth.service.js';
import { createSubsonicRouter } from '../subsonic.js';
import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import fs from 'fs-extra';
import path from 'path';

describe('Subsonic Security', () => {
    let database: any;
    let authService: any;
    let app: any;
    let testArtistId: number;
    let testAlbumId: number;
    const dbPath = './test-subsonic-security.db';

    beforeAll(async () => {
        database = createDatabase(dbPath);
        authService = createAuthService(database.db, 'test-secret');
        await authService.init();

        // Create a dummy user
        // 'password' in bcrypt: b0.Z.T1/R1S1y6G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G (abbreviated/mock)
        database.db.prepare("INSERT OR IGNORE INTO admin (username, password_hash) VALUES (?, ?)").run('user', '$2b0.Z.T1/R1S1y6G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G.G');

        try { testArtistId = database.library.createArtist('Test Artist'); } catch (e) { testArtistId = database.db.prepare("SELECT id FROM artists WHERE name = 'Test Artist'").get().id; }
        testAlbumId = database.library.createAlbum({ title: 'Test Album', artist_id: testArtistId });

        app = express();
        app.use(express.json());
        app.use('/rest', createSubsonicRouter({
            database: database,
            authService: authService,
            musicDir: path.resolve('./music') // make it absolute for the test
        } as any));
    });

    afterAll(async () => {
        if (database && database.db) {
            database.db.close();
        }
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    });

    it('should handle multiple id parameters gracefully in getMusicDirectory (DoS prevention)', async () => {
        const authQuery = 'u=user&p=password&v=1.16.1&c=test';
        const response = await request(app)
            .get(`/rest/getMusicDirectory.view?${authQuery}&id=ar_1&id=ar_2`);

        // Should not crash and should probably return 404 or process the first ID
        expect(response.status).toBe(200);
    });

    it('should handle multiple id parameters gracefully in getCoverArt', async () => {
        const authQuery = 'u=user&p=password&v=1.16.1&c=test';
        const response = await request(app)
            .get(`/rest/getCoverArt.view?${authQuery}&id=ar_1&id=ar_2`);
        expect(response.status).toBe(200);
    });

    it('should handle multiple f parameters gracefully (JSON/XML detection)', async () => {
        const authQuery = 'u=user&p=password&v=1.16.1&c=test';
        const response = await request(app)
            .get(`/rest/ping.view?${authQuery}&f=json&f=xml`);

        expect(response.status).toBe(200);
        // Should either be JSON or XML, but not crash
        const isJson = response.headers['content-type']?.includes('application/json');
        const isXml = response.headers['content-type']?.includes('text/xml');
        expect(isJson || isXml).toBe(true);
    });

    it('should handle multiple authentication parameters gracefully', async () => {
        // Multiple 'u' parameters could cause issues if not handled
        const response = await request(app)
            .get(`/rest/ping.view?u=user&u=attacker&p=password&v=1.16.1&c=test`);

        expect(response.status).toBe(200);
    });

    it('should prevent path traversal in getCoverArt.view', async () => {
        // Create an album with a traversal path
        const albumId = database.library.createAlbum({
            title: 'Malicious Album',
            artist_id: testArtistId,
            cover_path: '../package.json'
        });

        const authQuery = 'u=user&p=password&v=1.16.1&c=test';
        const response = await request(app)
            .get(`/rest/getCoverArt.view?${authQuery}&id=al_${albumId}`);

        // If vulnerable, it might return 200 and the content of package.json
        // If fixed, it should return 404 or an error
        // The API returns 200 with an XML error payload if it fails
        if (response.status === 200) {
            expect(response.text).toContain('error');
            expect(response.text).not.toContain('name="tunecamp"'); // Ensure it didn't leak package.json
        } else {
            expect(response.status).not.toBe(200);
        }
    });

    it('should prevent path traversal in stream.view', async () => {
        // Create a track with a traversal path
        const trackId = database.library.createTrack({
            title: 'Malicious Track',
            album_id: testAlbumId,
            artist_id: testArtistId,
            file_path: '../package.json'
        });

        const authQuery = 'u=user&p=password&v=1.16.1&c=test';
        const response = await request(app)
            .get(`/rest/stream.view?${authQuery}&id=tr_${trackId}`);

        // The API returns 200 with an XML error payload if it fails
        if (response.status === 200) {
            expect(response.text).toContain('error');
            expect(response.text).not.toContain('name="tunecamp"'); // Ensure it didn't leak package.json
        } else {
            expect(response.status).not.toBe(200);
        }
    });
});

