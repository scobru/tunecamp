import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { UserRole, VisibilityProfile } from '../../../common/visibility.js';

// Mock node-fetch
const mockFetch = jest.fn() as any;
jest.unstable_mockModule('node-fetch', () => ({
    default: mockFetch
}));

// Mock isSafeUrl to avoid DNS query dependency
jest.unstable_mockModule('../../../../utils/networkUtils.js', () => ({
    isSafeUrl: jest.fn(async () => true)
}));

// Dynamically import code under test
const { createAdminRoutes } = await import('../admin.js');
const { createProxyRoutes } = await import('../../network/proxy.js');
const { createDatabase } = await import('../../../core/database.js');

describe('External Tracks & Self-Healing Integration Test', () => {
    let app: express.Express;
    let database: any;
    let artistId: number;

    beforeEach(async () => {
        // Create an in-memory database
        database = createDatabase(':memory:');

        // Create a test artist in the database
        artistId = database.library.createArtist('Test Artist', 'Bio', 'photo.jpg', null, null, '0x123', 'public');

        // Insert admin user with ID 1 to avoid foreign key/ownership warnings
        database.db.prepare("INSERT INTO admin (id, username, password_hash, role) VALUES (?, ?, ?, ?)").run(1, 'admin', 'hashed', 'admin');

        const mockAuthMiddleware = {
            requireAdmin: jest.fn().mockImplementation((req: any, res: any, next: any) => {
                req.username = 'admin';
                req.role = UserRole.ADMIN;
                req.userId = 1;
                req.context = { role: UserRole.ADMIN, userId: 1, artistId };
                next();
            }),
            requireUser: jest.fn().mockImplementation((req: any, res: any, next: any) => {
                req.username = 'admin';
                req.role = UserRole.ADMIN;
                req.userId = 1;
                req.context = { role: UserRole.ADMIN, userId: 1, artistId };
                next();
            })
        };

        const container: any = {
            database,
            library: database,
            social: database,
            integration: database,
            authService: {},
            authMiddleware: mockAuthMiddleware,
            publishingService: {
                syncPost: jest.fn(() => Promise.resolve())
            }
        };

        app = express();
        app.use(express.json());

        // Pre-populate req.context for admin routes
        app.use('/api/admin', (req: any, res, next) => {
            req.username = 'admin';
            req.role = UserRole.ADMIN;
            req.userId = 1;
            req.isAdmin = true;
            req.isActive = true;
            req.context = { role: UserRole.ADMIN, userId: 1, artistId };
            next();
        });

        app.use('/api/admin', createAdminRoutes(container));
        app.use('/api/proxy', createProxyRoutes(container));

        mockFetch.mockReset();
    });

    afterEach(() => {
        if (database) {
            database.db.close();
        }
    });

    it('should parse external audio URLs from posts and register them as external tracks', async () => {
        // 1. Create a post with a public audio link
        const postRes = await request(app)
            .post('/api/admin/posts')
            .send({
                artistId,
                title: 'New Demo Post',
                content: 'Check out my new track here: https://example.com/my-test-song.mp3 and another link http://example.org/cool-groove.wav!',
                visibility: 'public'
            });

        expect(postRes.status).toBe(201);

        // 2. Check if the tracks were registered in the database
        const tracks = database.library.getTracksByArtist(artistId, VisibilityProfile.ALL_ACCESS);
        expect(tracks).toHaveLength(2);

        const track1 = tracks.find((t: any) => t.url === 'https://example.com/my-test-song.mp3');
        expect(track1).toBeDefined();
        expect(track1.title).toBe('my test song'); // Derived from filename
        expect(track1.file_path).toBeNull();
        expect(track1.service).toBe('link');
        expect(track1.external_id).toBe('ext:link:https://example.com/my-test-song.mp3');

        const track2 = tracks.find((t: any) => t.url === 'http://example.org/cool-groove.wav');
        expect(track2).toBeDefined();
        expect(track2.title).toBe('cool groove');
    });

    it('should automatically delete the track (self-heal) when the proxy returns 404', async () => {
        const testUrl = 'https://example.com/missing-track.mp3';

        // Manually insert an external track
        database.library.createTrack({
            title: 'Missing Track',
            album_id: null,
            artist_id: artistId,
            owner_id: 1,
            artist_name: 'Test Artist',
            track_num: 1,
            duration: 120,
            file_path: null,
            format: 'mp3',
            bitrate: 320,
            sample_rate: 44100,
            price: 0,
            price_usdc: 0,
            currency: 'ETH',
            waveform: null,
            url: testUrl,
            service: 'link',
            external_artwork: null,
            lyrics: null,
            lossless_path: null,
            external_id: `ext:link:${testUrl}`,
            hash: null,
            fingerprint: null,
            genre: 'Rock',
            year: 2026,
            mime_type: 'audio/mpeg',
            file_size: 1000,
            file_hash: null,
            version: null,
            description: 'Test track'
        });

        // Verify it was added
        let tracks = database.library.getTracksByArtist(artistId, VisibilityProfile.ALL_ACCESS);
        expect(tracks).toHaveLength(1);

        // Mock fetch response to be 404 Not Found
        mockFetch.mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found'
        });

        // Request streaming via proxy
        const res = await request(app)
            .get(`/api/proxy/stream?url=${encodeURIComponent(testUrl)}`);

        expect(res.status).toBe(404);

        // Verify the track has been deleted (self-healing)
        tracks = database.library.getTracksByArtist(artistId, VisibilityProfile.ALL_ACCESS);
        expect(tracks).toHaveLength(0);
    });

    it('should automatically delete the track (self-heal) on proxy fetch connection failure', async () => {
        const testUrl = 'https://example.com/song-connection-fail.mp3';

        // Manually insert an external track
        database.library.createTrack({
            title: 'Broken Track',
            album_id: null,
            artist_id: artistId,
            owner_id: 1,
            artist_name: 'Test Artist',
            track_num: 1,
            duration: 120,
            file_path: null,
            format: 'mp3',
            bitrate: 320,
            sample_rate: 44100,
            price: 0,
            price_usdc: 0,
            currency: 'ETH',
            waveform: null,
            url: testUrl,
            service: 'link',
            external_artwork: null,
            lyrics: null,
            lossless_path: null,
            external_id: `ext:link:${testUrl}`,
            hash: null,
            fingerprint: null,
            genre: 'Rock',
            year: 2026,
            mime_type: 'audio/mpeg',
            file_size: 1000,
            file_hash: null,
            version: null,
            description: 'Test track'
        });

        // Verify it was added
        let tracks = database.library.getTracksByArtist(artistId, VisibilityProfile.ALL_ACCESS);
        expect(tracks).toHaveLength(1);

        // Mock fetch to fail with connection error
        const mockError: any = new Error('getaddrinfo ENOTFOUND example.com');
        mockError.code = 'ENOTFOUND';
        mockFetch.mockRejectedValue(mockError);

        // Request streaming via proxy
        const res = await request(app)
            .get(`/api/proxy/stream?url=${encodeURIComponent(testUrl)}`);

        expect(res.status).toBe(500);

        // Verify the track has been deleted (self-healing)
        tracks = database.library.getTracksByArtist(artistId, VisibilityProfile.ALL_ACCESS);
        expect(tracks).toHaveLength(0);
    });
});
