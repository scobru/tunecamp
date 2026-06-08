import { createDatabase } from '../../../core/database.js';
import { createAuthService } from '../../../modules/auth/auth.service.js';
import { createSubsonicRouter } from '../subsonic.js';
import { SubsonicService } from '../../../modules/subsonic/subsonic.service.js';
import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import fs from 'fs-extra';
import path from 'path';

describe('Subsonic Podcast API', () => {
    let database: any;
    let authService: any;
    let app: any;
    let subsonicService: any;
    let adminPassHash: string;
    let userPassHash: string;
    let podcastId1: number;
    let podcastId2: number;
    let trackId1: number;
    let trackId2: number;
    const dbPath = './test-subsonic-podcast.db';

    beforeAll(async () => {
        try {
            database = createDatabase(dbPath);
            authService = createAuthService(database.db, 'test-secret');
            await authService.init();

            // Create admin user (update if already created by authService.init)
            adminPassHash = await authService.hashPassword('adminpass');
            const hasAdmin = database.db.prepare("SELECT 1 FROM admin WHERE username = 'admin'").get();
            if (hasAdmin) {
                database.db.prepare("UPDATE admin SET password_hash = ?, role = 'admin' WHERE username = 'admin'").run(adminPassHash);
            } else {
                database.db.prepare("INSERT INTO admin (username, password_hash, role) VALUES (?, ?, ?)").run('admin', adminPassHash, 'admin');
            }

            // Create normal user
            userPassHash = await authService.hashPassword('userpass');
            database.db.prepare("INSERT OR IGNORE INTO admin (username, password_hash, role) VALUES (?, ?, ?)").run('user', userPassHash, 'user');

            app = express();
            app.use(express.json());

            subsonicService = new SubsonicService(database);

            app.use('/rest', createSubsonicRouter({
                database: database,
                authService: authService,
                musicDir: './music',
                zendbService: {},
                scrobbleService: {},
                subsonicService: subsonicService
            } as any));

            // Seed database with some podcasts
            const artistId = database.library.createArtist('Podcaster Joe', 'Joe bio', undefined, undefined, undefined, undefined, 'public');

            // Podcast 1: Public Podcast
            podcastId1 = database.library.createAlbum({
                title: 'Joe Audio Show',
                slug: 'joe-audio-show',
                artist_id: artistId,
                visibility: 'public',
                is_release: true, // required to be public/released
                status: 'released',
                product_type: 'podcast',
                podcast_author: 'Joe',
                podcast_email: 'joe@joe.com',
                podcast_category: 'Technology',
                podcast_explicit: 0
            } as any);

            // Episode 1 (Track in Podcast 1)
            trackId1 = database.library.createTrack({
                title: 'Episode 1: AI Future',
                album_id: podcastId1,
                artist_id: artistId,
                track_num: 1,
                duration: 600,
                file_path: 'ai-future.mp3',
                format: 'mp3',
                description: 'We talk about the future of Artificial Intelligence.',
                podcast_episode_num: 1,
                podcast_season_num: 1,
                podcast_episode_type: 'full'
            } as any);

            // Podcast 2: Private Podcast
            podcastId2 = database.library.createAlbum({
                title: 'Joe Secret Show',
                slug: 'joe-secret-show',
                artist_id: artistId,
                visibility: 'private',
                is_release: false,
                status: 'draft',
                product_type: 'podcast',
                podcast_author: 'Joe Secret',
                podcast_email: 'secret@joe.com',
                podcast_category: 'Leaked',
                podcast_explicit: 1
            } as any);

            // Episode 2 (Track in Podcast 2)
            trackId2 = database.library.createTrack({
                title: 'Episode 2: Classified Tech',
                album_id: podcastId2,
                artist_id: artistId,
                track_num: 1,
                duration: 900,
                file_path: 'classified.mp3',
                format: 'mp3',
                description: 'Top secret technical details.',
                podcast_episode_num: 2,
                podcast_season_num: 1,
                podcast_episode_type: 'full'
            } as any);

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

    it('should return public podcast channels for normal users', async () => {
        const authQuery = 'u=user&p=userpass&v=1.16.1&c=test&f=json';
        const response = await request(app)
            .get(`/rest/getPodcasts.view?${authQuery}`);

        expect(response.status).toBe(200);
        const podcasts = response.body['subsonic-response'].podcasts;
        expect(podcasts).toBeDefined();
        
        // Should only return Joe Audio Show (public), not Joe Secret Show
        const channels = Array.isArray(podcasts.channel) ? podcasts.channel : [podcasts.channel].filter(Boolean);
        expect(channels.length).toBe(1);
        expect(channels[0].title).toBe('Joe Audio Show');
        expect(channels[0].author).toBe('Joe');
        expect(channels[0].category).toBe('Technology');
        expect(channels[0].explicit).toBe('false');

        // Should include episode
        const episodes = Array.isArray(channels[0].episode) ? channels[0].episode : [channels[0].episode].filter(Boolean);
        expect(episodes.length).toBe(1);
        expect(episodes[0].title).toBe('Episode 1: AI Future');
        expect(episodes[0].description).toBe('We talk about the future of Artificial Intelligence.');
    });

    it('should return all podcast channels (including private) for admin users', async () => {
        const authQuery = 'u=admin&p=adminpass&v=1.16.1&c=test&f=json';
        const response = await request(app)
            .get(`/rest/getPodcasts.view?${authQuery}`);

        expect(response.status).toBe(200);
        const podcasts = response.body['subsonic-response'].podcasts;
        expect(podcasts).toBeDefined();

        const channels = Array.isArray(podcasts.channel) ? podcasts.channel : [podcasts.channel].filter(Boolean);
        expect(channels.length).toBe(2);

        const titles = channels.map((c: any) => c.title);
        expect(titles).toContain('Joe Audio Show');
        expect(titles).toContain('Joe Secret Show');
    });

    it('should filter by specific podcast id', async () => {
        const authQuery = `u=admin&p=adminpass&v=1.16.1&c=test&f=json&id=al_${podcastId2}`;
        const response = await request(app)
            .get(`/rest/getPodcasts.view?${authQuery}`);

        expect(response.status).toBe(200);
        const podcasts = response.body['subsonic-response'].podcasts;
        expect(podcasts).toBeDefined();

        const channels = Array.isArray(podcasts.channel) ? podcasts.channel : [podcasts.channel].filter(Boolean);
        expect(channels.length).toBe(1);
        expect(channels[0].title).toBe('Joe Secret Show');
    });

    it('should respect includeEpisodes=false', async () => {
        const authQuery = `u=user&p=userpass&v=1.16.1&c=test&f=json&includeEpisodes=false`;
        const response = await request(app)
            .get(`/rest/getPodcasts.view?${authQuery}`);

        expect(response.status).toBe(200);
        const podcasts = response.body['subsonic-response'].podcasts;
        expect(podcasts).toBeDefined();

        const channels = Array.isArray(podcasts.channel) ? podcasts.channel : [podcasts.channel].filter(Boolean);
        expect(channels.length).toBe(1);
        expect(channels[0].episode).toBeUndefined();
    });

    it('should return 404/70 if specified podcast is private or not found for user', async () => {
        const authQuery = `u=user&p=userpass&v=1.16.1&c=test&f=json&id=al_${podcastId2}`;
        const response = await request(app)
            .get(`/rest/getPodcasts.view?${authQuery}`);

        expect(response.status).toBe(200);
        expect(response.body['subsonic-response'].status).toBe('failed');
        expect(response.body['subsonic-response'].error.code).toBe('70');
    });

    it('should return newest podcast episodes', async () => {
        const authQuery = `u=user&p=userpass&v=1.16.1&c=test&f=json`;
        const response = await request(app)
            .get(`/rest/getNewestPodcasts.view?${authQuery}`);

        expect(response.status).toBe(200);
        const newest = response.body['subsonic-response'].newestPodcasts;
        expect(newest).toBeDefined();

        const episodes = Array.isArray(newest.episode) ? newest.episode : [newest.episode].filter(Boolean);
        expect(episodes.length).toBe(1);
        expect(episodes[0].title).toBe('Episode 1: AI Future');
    });
});
