import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';

// Mock networkUtils for ESM
jest.unstable_mockModule('../../../../utils/networkUtils.js', () => ({
    isSafeUrl: jest.fn()
}));

const { isSafeUrl } = await import('../../../../utils/networkUtils.js');
const { createStatsRoutes } = await import('../stats.js');

describe('Stats Routes', () => {
    let app: express.Express;
    let mockZenDBService: any;
    let mockDbService: any;
    let mockConfig: any;
    let consoleErrorSpy: any;
    let originalFetch: typeof globalThis.fetch;
    let mockFetch: any;

    beforeEach(() => {
        mockZenDBService = {
            getCommunitySites: jest.fn<any>().mockResolvedValue([]),
            getPeerCount: jest.fn().mockReturnValue(0)
        };

        mockDbService = {
            db: new Database(':memory:'),
            getSetting: jest.fn<any>().mockImplementation((key: string) => {
                if (key === 'publicUrl') return 'https://localinstance.com';
                if (key === 'siteName') return 'Local site';
                if (key === 'siteDescription') return 'Local desc';
                return null;
            }),
            // Local stats counters (Phase 0: replaces Zen stats)
            getReleaseDownloadCount: jest.fn().mockReturnValue(0),
            incrementReleaseDownloadCount: jest.fn().mockReturnValue(1),
            getTrackDownloadCount: jest.fn().mockReturnValue(0),
            incrementTrackDownloadCount: jest.fn().mockReturnValue(1),
            getTrackPlayCount: jest.fn().mockReturnValue(0),
            incrementTrackPlayCount: jest.fn().mockReturnValue(1),
            getFollowedActors: jest.fn().mockReturnValue([]),
            getRemoteActors: jest.fn().mockReturnValue([]),
            getRemoteTracks: jest.fn().mockReturnValue([]),
            getRemotePosts: jest.fn().mockReturnValue([]),
            getReleases: jest.fn().mockReturnValue([]),
            getTracksByReleaseId: jest.fn().mockReturnValue([]),
            getPublicPosts: jest.fn().mockReturnValue([])
        };

        mockConfig = {
            publicUrl: 'https://localinstance.com',
            port: 3000
        };

        app = express();
        app.use(express.json());
        app.use('/api/stats', createStatsRoutes({
            zendbService: mockZenDBService,
            database: mockDbService,
            config: mockConfig
        } as any));

        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Mock global fetch
        originalFetch = global.fetch;
        mockFetch = jest.fn();
        global.fetch = mockFetch as any;
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        global.fetch = originalFetch;
    });

    describe('GET /api/stats/release/:slug', () => {
        test('returns download count on success', async () => {
            mockDbService.getReleaseDownloadCount.mockReturnValue(42);

            const res = await request(app).get('/api/stats/release/test-slug');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ slug: 'test-slug', downloads: 42 });
            expect(mockDbService.getReleaseDownloadCount).toHaveBeenCalledWith('test-slug');
        });

        test('returns 500 on failure', async () => {
            mockDbService.getReleaseDownloadCount.mockImplementation(() => { throw new Error('DB Error'); });

            const res = await request(app).get('/api/stats/release/test-slug');

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Failed to get download count');
        });
    });

    describe('POST /api/stats/release/:slug/download', () => {
        test('increments and returns download count', async () => {
            mockDbService.incrementReleaseDownloadCount.mockReturnValue(10);

            const res = await request(app).post('/api/stats/release/test-slug/download');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ slug: 'test-slug', downloads: 10 });
            expect(mockDbService.incrementReleaseDownloadCount).toHaveBeenCalledWith('test-slug');
        });
    });

    describe('GET /api/stats/track/:releaseSlug/:trackId', () => {
        test('returns track download count', async () => {
            mockDbService.getTrackDownloadCount.mockReturnValue(7);

            const res = await request(app).get('/api/stats/track/release-slug/123');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ releaseSlug: 'release-slug', trackId: '123', downloads: 7 });
            expect(mockDbService.getTrackDownloadCount).toHaveBeenCalledWith(123);
        });
    });

    describe('POST /api/stats/track/:releaseSlug/:trackId/download', () => {
        test('increments and returns track download count', async () => {
            mockDbService.incrementTrackDownloadCount.mockReturnValue(8);

            const res = await request(app).post('/api/stats/track/release-slug/123/download');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ releaseSlug: 'release-slug', trackId: '123', downloads: 8 });
            expect(mockDbService.incrementTrackDownloadCount).toHaveBeenCalledWith(123);
        });
    });

    describe('GET /api/stats/track/:releaseSlug/:trackId/plays', () => {
        test('returns track play count', async () => {
            mockDbService.getTrackPlayCount.mockReturnValue(99);

            const res = await request(app).get('/api/stats/track/release-slug/123/plays');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ releaseSlug: 'release-slug', trackId: '123', plays: 99 });
            expect(mockDbService.getTrackPlayCount).toHaveBeenCalledWith(123);
        });
    });

    describe('POST /api/stats/track/:releaseSlug/:trackId/play', () => {
        test('increments and returns track play count', async () => {
            mockDbService.incrementTrackPlayCount.mockReturnValue(100);

            const res = await request(app).post('/api/stats/track/release-slug/123/play');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ releaseSlug: 'release-slug', trackId: '123', plays: 100 });
            expect(mockDbService.incrementTrackPlayCount).toHaveBeenCalledWith(123);
        });
    });

    describe('GET /api/stats/network/sites', () => {
        test('returns community and local sites combined', async () => {
            mockZenDBService.getCommunitySites.mockResolvedValue([
                { url: 'https://sitea.com', name: 'Site A', description: 'Desc A', version: '2.0', lastSeen: 'today' }
            ]);
            mockDbService.getFollowedActors.mockReturnValue([
                { uri: 'https://siteb.com/actor', name: 'Actor B', username: 'site', summary: 'Summary B', last_seen: 'yesterday' }
            ]);
            // The followed AP site-actor is health-checked via /api/catalog.
            (isSafeUrl as any).mockResolvedValue(true);
            mockFetch.mockResolvedValue({ ok: true, json: async () => ({ releases: [] }) });

            const res = await request(app).get('/api/stats/network/sites');

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(3); // local + gun + ap
            expect(res.body[0].federation).toBe('local');
            expect(res.body[1].federation).toBe('zen');
            expect(res.body[2].federation).toBe('activitypub');
        });

        test('a dead followed AP instance is dropped from the directory', async () => {
            mockZenDBService.getCommunitySites.mockResolvedValue([]);
            mockDbService.getFollowedActors.mockReturnValue([
                { uri: 'https://dead-ap.com/actor', name: 'Dead', username: 'site', summary: '', last_seen: 'long ago' }
            ]);
            // Domain answers HTTP but is not a live TuneCamp (no catalog shape).
            (isSafeUrl as any).mockResolvedValue(true);
            mockFetch.mockResolvedValue({ ok: true, json: async () => ({ message: 'hello from nginx' }) });

            const res = await request(app).get('/api/stats/network/sites');

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1); // local only
            expect(res.body.some((s: any) => s.federation === 'activitypub')).toBe(false);
        });
    });

    describe('GET /api/stats/network/tracks', () => {
        test('returns local and federated tracks and posts', async () => {
            mockZenDBService.getCommunitySites.mockResolvedValue([
                { url: 'https://remotesite.com', name: 'Remote' }
            ]);
            (isSafeUrl as any).mockResolvedValue(true);

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    releases: [{
                        title: 'Remote Album',
                        artist_name: 'Remote Artist',
                        slug: 'remote-album',
                        tracks: [{ id: 1, title: 'Remote Song', duration: 180 }]
                    }]
                })
            });

            mockDbService.getRemoteTracks.mockReturnValue([
                { ap_id: 'ap-track', title: 'AP Track', artist_name: 'AP Artist', album_name: 'AP Album' }
            ]);

            mockDbService.getReleases.mockReturnValue([
                { id: 10, slug: 'local-release', title: 'Local Album', artist_name: 'Local Artist' }
            ]);
            mockDbService.getTracksByReleaseId.mockReturnValue([
                { id: 101, title: 'Local Song', duration: 200 }
            ]);

            mockDbService.getPublicPosts.mockReturnValue([
                { slug: 'post-slug', content: '<p>Hello</p>', artist_name: 'Artist A', artist_slug: 'artist-a', published_at: 'now' }
            ]);

            const res = await request(app).get('/api/stats/network/tracks');

            expect(res.status).toBe(200);
            expect(res.body.length).toBeGreaterThanOrEqual(4); // HTTP + AP track + Local release + Local post
            expect(res.body.some((item: any) => item.federation === 'http')).toBe(true);
            expect(res.body.some((item: any) => item.federation === 'activitypub')).toBe(true);
            expect(res.body.some((item: any) => item.federation === 'local' && item.type === 'release')).toBe(true);
            expect(res.body.some((item: any) => item.federation === 'local' && item.type === 'post')).toBe(true);
        });
    });

    describe('GET /api/stats/network/status', () => {
        test('returns network status counts', async () => {
            mockZenDBService.getCommunitySites.mockResolvedValue([{}, {}]);
            mockDbService.getFollowedActors.mockReturnValue([{ username: 'site' }]);
            mockDbService.getRemoteTracks.mockReturnValue([{}, {}]);
            mockDbService.getReleases.mockReturnValue([{}]);
            mockZenDBService.getPeerCount.mockReturnValue(5);

            const res = await request(app).get('/api/stats/network/status');

            expect(res.status).toBe(200);
            expect(res.body.sites).toBe(4); // 2 gun + 1 ap + 1 local
            expect(res.body.tracks).toBe(3); // 2 ap + 1 local
            expect(res.body.zen.peers).toBe(5);
            expect(res.body.activitypub.enabled).toBe(true);
        });
    });
});
