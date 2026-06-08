import { createDatabase } from '../../../core/database.js';
import { createMiscRoutes } from '../misc.js';
import request from 'supertest';
import express from 'express';
import fs from 'fs-extra';
import { VisibilityProfile } from '../../../common/visibility.js';

describe('RSS Feeds', () => {
    let database: any;
    let app: any;
    const dbPath = './test-rss-feed.db';

    beforeAll(async () => {
        try {
            database = createDatabase(dbPath);
            app = express();
            app.use(express.json());

            const mockMiddleware = (req: any, res: any, next: any) => next();
            const authMiddleware = {
                requireAdmin: mockMiddleware,
                requireUser: mockMiddleware,
                requireRootAdmin: mockMiddleware,
                optionalAuth: mockMiddleware
            };

            const container = {
                database,
                identity: database.identity,
                library: database.library,
                social: database.social,
                integration: database.integration,
                authMiddleware,
                config: {
                    publicUrl: 'http://test-server',
                    siteName: 'Test Server Name',
                    siteDescription: 'Test Server Description'
                },
                musicDir: './music'
            } as any;

            app.use('/', createMiscRoutes(container));
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

    it('should generate global and artist RSS feeds with correct XML output', async () => {
        // Create an artist
        const artistId = database.library.createArtist('Rss Artist', 'Rss Bio', undefined, undefined, undefined, undefined, 'public', 'rss-artist');
        const artist = database.library.getArtist(artistId);
        expect(artist).toBeDefined();

        // Create a public album/release and a track in it
        const publicAlbumId = database.library.createAlbum({
            title: 'Public Album',
            slug: 'public-album',
            artist_id: artistId,
            visibility: 'public',
            status: 'released',
            is_release: true,
            product_type: 'music'
        } as any);

        const publicTrackId = database.library.createTrack({
            title: 'Public Track Title',
            album_id: publicAlbumId,
            artist_id: artistId,
            artist_name: 'Rss Artist',
            track_num: 1,
            duration: 185,
            file_path: 'public-track.mp3',
            format: 'MP3',
            bitrate: 320000,
            sample_rate: 44100,
            mime_type: 'audio/mpeg',
            file_size: 5000000,
            created_at: new Date('2026-06-08T12:00:00.000Z').toISOString()
        } as any);

        // Create a private album/release and a track in it to verify filtering
        const privateAlbumId = database.library.createAlbum({
            title: 'Private Album',
            slug: 'private-album',
            artist_id: artistId,
            visibility: 'private',
            status: 'draft',
            is_release: false,
            product_type: 'music'
        } as any);

        const privateTrackId = database.library.createTrack({
            title: 'Private Track Title',
            album_id: privateAlbumId,
            artist_id: artistId,
            artist_name: 'Rss Artist',
            track_num: 1,
            duration: 200,
            file_path: 'private-track.mp3',
            format: 'MP3',
            bitrate: 320000,
            sample_rate: 44100,
            mime_type: 'audio/mpeg',
            file_size: 6000000,
            created_at: new Date('2026-06-08T13:00:00.000Z').toISOString()
        } as any);

        // 1. Verify Global Feed
        const globalRes = await request(app).get('/feed.xml');
        expect(globalRes.status).toBe(200);
        expect(globalRes.headers['content-type']).toContain('text/xml');
        
        const globalXml = globalRes.text;
        expect(globalXml).toContain('<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">');
        expect(globalXml).toContain('<title>Test Server Name</title>');
        expect(globalXml).toContain('<description>Test Server Description</description>');
        expect(globalXml).toContain('<link>http://test-server</link>');
        
        // Public track must be present
        expect(globalXml).toContain('<title>Public Track Title</title>');
        expect(globalXml).toContain('<enclosure url="http://test-server/api/tracks/' + publicTrackId + '/stream" length="5000000" type="audio/mpeg"/>');
        expect(globalXml).toContain('<itunes:duration>3:05</itunes:duration>');
        
        // Private track must NOT be present
        expect(globalXml).not.toContain('Private Track Title');
        expect(globalXml).not.toContain('private-track.mp3');

        // 2. Verify Artist Feed
        const artistRes = await request(app).get(`/artists/${artist.slug}/feed.xml`);
        expect(artistRes.status).toBe(200);
        expect(artistRes.headers['content-type']).toContain('text/xml');

        const artistXml = artistRes.text;
        expect(artistXml).toContain(`<title>${artist.name} - TuneCamp Feed</title>`);
        expect(artistXml).toContain('<description>Rss Bio</description>');
        
        // Public track must be present
        expect(artistXml).toContain('<title>Public Track Title</title>');
        expect(artistXml).toContain('<enclosure url="http://test-server/api/tracks/' + publicTrackId + '/stream" length="5000000" type="audio/mpeg"/>');
        
        // Private track must NOT be present
        expect(artistXml).not.toContain('Private Track Title');
    });

    it('should return 404 for unknown artist feed', async () => {
        const res = await request(app).get('/artists/unknown-artist/feed.xml');
        expect(res.status).toBe(404);
        expect(res.text).toBe('Artist not found');
    });
});
