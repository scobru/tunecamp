import express from 'express';
import request from 'supertest';
import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { createActivityPubRoutes } from '../activitypub.js';
import { ActivityPubService } from '../../../modules/activitypub/activitypub.service.js';
import { ActivityPubRenderer } from '../../../modules/activitypub/activitypub.renderer.js';
import type { DatabaseService } from '../../../core/database.js';

const mockDb = {
    getPostBySlug: jest.fn(),
    getArtist: jest.fn(),
    getArtistBySlug: jest.fn(),
    removeFollower: jest.fn(),
    getSetting: jest.fn(),
    getFollowers: jest.fn(),
} as unknown as DatabaseService;

const mockApService = {
    getBaseUrl: () => "https://sudorecords.scobrudot.dev",
    generatePostArticle: (post: any, artist: any) => {
        const renderer = new ActivityPubRenderer("https://sudorecords.scobrudot.dev");
        return renderer.renderPostArticle(post, artist);
    },
    generateActor: (artist: any) => {
        const renderer = new ActivityPubRenderer("https://sudorecords.scobrudot.dev");
        return renderer.renderActor(artist);
    },
    verifySignature: jest.fn<any>().mockResolvedValue(true),
    acceptFollow: jest.fn<any>().mockResolvedValue(undefined),
    acceptFollowRequest: jest.fn<any>().mockResolvedValue(undefined),
    rejectFollowRequest: jest.fn<any>().mockResolvedValue(undefined),
} as unknown as ActivityPubService;

const mockAuthMiddleware = {
    requireAdmin: (req: any, res: any, next: any) => {
        req.isAdmin = true;
        req.isRootAdmin = true;
        next();
    },
    requireUser: (req: any, res: any, next: any) => {
        req.isAdmin = true;
        req.isRootAdmin = true;
        next();
    },
    optionalAuth: (req: any, res: any, next: any) => next(),
};

describe('ActivityPub Outbound Article Federation Tests', () => {
    let app: express.Express;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(express.json());
        app.use('/ap', createActivityPubRoutes({
            apService: mockApService,
            database: mockDb,
            authMiddleware: mockAuthMiddleware as any
        } as any));
    });

    test('GET /ap/article/post/:slug should resolve standard-compliant Article objects', async () => {
        const mockPost = {
            id: 123,
            artist_id: 1,
            title: "TuneCamp Innovation Log",
            summary: "Details of Phase 3 execution and federation updates.",
            content: "We have finalized long-form outbound federation support.",
            slug: "tunecamp-innovation-log",
            visibility: "public",
            created_at: "2026-06-02T08:00:00.000Z"
        };
        const mockArtist = {
            id: 1,
            name: "Homologo",
            slug: "homologo"
        };

        (mockDb.getPostBySlug as jest.Mock).mockReturnValue(mockPost);
        (mockDb.getArtist as jest.Mock).mockReturnValue(mockArtist);

        const response = await request(app)
            .get('/ap/article/post/tunecamp-innovation-log');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("@context", "https://www.w3.org/ns/activitystreams");
        expect(response.body).toHaveProperty("type", "Article");
        expect(response.body).toHaveProperty("name", "TuneCamp Innovation Log");
        expect(response.body).toHaveProperty("summary", "Details of Phase 3 execution and federation updates.");
        expect(response.body).toHaveProperty("content", "<h2>TuneCamp Innovation Log</h2><p><em>Details of Phase 3 execution and federation updates.</em></p><hr><p>We have finalized long-form outbound federation support.</p>");
        expect(response.body.id).toContain("/api/ap/article/post/tunecamp-innovation-log/");
    });

    test('GET /ap/note/post/:slug should maintain backwards-compatibility and resolve Articles', async () => {
        const mockPost = {
            id: 123,
            artist_id: 1,
            title: "Backward-Compatible Legacy Post",
            summary: "Checking if legacy URLs still resolve correctly.",
            content: "Legacy links are fully supported via Express path arrays.",
            slug: "backward-compatible-post",
            visibility: "public",
            created_at: "2026-06-02T08:00:00.000Z"
        };
        const mockArtist = {
            id: 1,
            name: "Homologo",
            slug: "homologo"
        };

        (mockDb.getPostBySlug as jest.Mock).mockReturnValue(mockPost);
        (mockDb.getArtist as jest.Mock).mockReturnValue(mockArtist);

        const response = await request(app)
            .get('/ap/note/post/backward-compatible-post');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("type", "Article");
        expect(response.body).toHaveProperty("name", "Backward-Compatible Legacy Post");
        expect(response.body).toHaveProperty("summary", "Checking if legacy URLs still resolve correctly.");
    });

    // Actor Profile Endpoint Tests
    test('GET /ap/users/:slug should serve spec-compliant Actor profile', async () => {
        const mockArtist = {
            id: 1,
            name: "Homologo",
            slug: "homologo",
            bio: "Electronic musician from Italy.",
            public_key: "MOCK_PUBLIC_KEY"
        };
        (mockDb.getArtistBySlug as jest.Mock).mockReturnValue(mockArtist);

        const response = await request(app)
            .get('/ap/users/homologo');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("type", "Person");
        expect(response.body).toHaveProperty("preferredUsername", "homologo");
        expect(response.body).toHaveProperty("name", "Homologo");
        expect(response.body.summary).toBe("Electronic musician from Italy.");
        expect(response.body.inbox).toContain("/users/homologo/inbox");
        expect(response.body.outbox).toContain("/users/homologo/outbox");
        expect(response.body.publicKey).toHaveProperty("publicKeyPem", "MOCK_PUBLIC_KEY");
    });

    // Followers Collection Endpoint Tests
    test('GET /ap/users/:slug/followers should serve followers list', async () => {
        const mockArtist = { id: 1, slug: "homologo" };
        const mockFollowers = [
            { actor_uri: "https://livellosegreto.it/users/alice" },
            { actor_uri: "https://mastodon.social/users/bob" }
        ];

        (mockDb.getArtistBySlug as jest.Mock).mockReturnValue(mockArtist);
        (mockDb.getFollowers as jest.Mock).mockReturnValue(mockFollowers);

        const response = await request(app)
            .get('/ap/users/homologo/followers');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("type", "OrderedCollection");
        expect(response.body).toHaveProperty("totalItems", 2);
        expect(response.body.orderedItems).toEqual([
            "https://livellosegreto.it/users/alice",
            "https://mastodon.social/users/bob"
        ]);
    });

    // Following Collection Endpoint Tests (Always empty for artists)
    test('GET /ap/users/:slug/following should serve empty following list', async () => {
        const mockArtist = { id: 1, slug: "homologo" };
        (mockDb.getArtistBySlug as jest.Mock).mockReturnValue(mockArtist);

        const response = await request(app)
            .get('/ap/users/homologo/following');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("type", "OrderedCollection");
        expect(response.body).toHaveProperty("totalItems", 0);
        expect(response.body.orderedItems).toEqual([]);
    });

    // Inbound Follow / Follow Request Tests
    test('POST /ap/users/:slug/inbox should process incoming Follow activity', async () => {
        const mockArtist = {
            id: 1,
            name: "Homologo",
            slug: "homologo"
        };
        (mockDb.getArtistBySlug as jest.Mock).mockReturnValue(mockArtist);

        const followActivity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: "https://livellosegreto.it/activities/follow-1",
            type: "Follow",
            actor: "https://livellosegreto.it/users/alice",
            object: "https://sudorecords.scobrudot.dev/users/homologo"
        };

        const response = await request(app)
            .post('/ap/users/homologo/inbox')
            .send(followActivity);

        expect(response.status).toBe(202);
        expect(mockApService.verifySignature).toHaveBeenCalled();
        expect(mockApService.acceptFollow).toHaveBeenCalledWith(mockArtist, followActivity);
    });

    // Inbound Undo Follow (Unfollow) activity Test
    test('POST /ap/users/:slug/inbox should process incoming Undo Follow (Unfollow) activity', async () => {
        const mockArtist = {
            id: 1,
            name: "Homologo",
            slug: "homologo"
        };
        (mockDb.getArtistBySlug as jest.Mock).mockReturnValue(mockArtist);

        const unfollowActivity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: "https://livellosegreto.it/activities/undo-1",
            type: "Undo",
            actor: "https://livellosegreto.it/users/alice",
            object: {
                id: "https://livellosegreto.it/activities/follow-1",
                type: "Follow",
                actor: "https://livellosegreto.it/users/alice",
                object: "https://sudorecords.scobrudot.dev/users/homologo"
            }
        };

        const response = await request(app)
            .post('/ap/users/homologo/inbox')
            .send(unfollowActivity);

        expect(response.status).toBe(200);
        expect(mockApService.verifySignature).toHaveBeenCalled();
        expect(mockDb.removeFollower).toHaveBeenCalledWith(mockArtist.id, "https://livellosegreto.it/users/alice");
    });

    test('POST /ap/followers/accept should accept a pending follow request', async () => {
        const mockArtist = {
            id: 1,
            name: "Homologo",
            slug: "homologo"
        };
        (mockDb.getArtist as jest.Mock).mockReturnValue(mockArtist);

        const response = await request(app)
            .post('/ap/followers/accept')
            .send({
                artistId: 1,
                actorUri: "https://livellosegreto.it/users/alice"
            });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, message: "Follower accepted" });
        expect(mockApService.acceptFollowRequest).toHaveBeenCalledWith(mockArtist, "https://livellosegreto.it/users/alice");
    });

    test('POST /ap/followers/reject should reject a pending follow request', async () => {
        const mockArtist = {
            id: 1,
            name: "Homologo",
            slug: "homologo"
        };
        (mockDb.getArtist as jest.Mock).mockReturnValue(mockArtist);

        const response = await request(app)
            .post('/ap/followers/reject')
            .send({
                artistId: 1,
                actorUri: "https://livellosegreto.it/users/bob"
            });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, message: "Follower rejected" });
        expect(mockApService.rejectFollowRequest).toHaveBeenCalledWith(mockArtist, "https://livellosegreto.it/users/bob");
    });
});
