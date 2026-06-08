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
    getApReply: jest.fn(),
    getApNote: jest.fn(),
    addApReply: jest.fn(),
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
    cacheRemoteActor: jest.fn<any>().mockResolvedValue(undefined),
    deleteReply: jest.fn<any>().mockResolvedValue(undefined),
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

    // Outbound Reply Note Dereferencing Tests
    test('GET /ap/note/reply/:id should resolve a stored reply as an AS2 Note', async () => {
        const replyUri = "https://sudorecords.scobrudot.dev/api/ap/note/reply/abc-123";
        const mockReply = {
            id: 7,
            note_id: "https://sudorecords.scobrudot.dev/api/ap/note/post/some-post/1700000000000",
            reply_uri: replyUri,
            actor_uri: "https://sudorecords.scobrudot.dev/users/homologo",
            content: "<p>Thanks for listening!</p>",
            published_at: "2026-06-02T08:00:00.000Z",
            created_at: "2026-06-02T08:00:01.000Z"
        };
        (mockDb.getApReply as jest.Mock).mockReturnValue(mockReply);

        const response = await request(app)
            .get('/ap/note/reply/abc-123');

        expect(mockDb.getApReply).toHaveBeenCalledWith(replyUri);
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain("application/activity+json");
        expect(response.body).toHaveProperty("@context", "https://www.w3.org/ns/activitystreams");
        expect(response.body).toHaveProperty("type", "Note");
        expect(response.body).toHaveProperty("id", replyUri);
        expect(response.body).toHaveProperty("attributedTo", mockReply.actor_uri);
        expect(response.body).toHaveProperty("inReplyTo", mockReply.note_id);
        expect(response.body).toHaveProperty("content", "<p>Thanks for listening!</p>");
        expect(response.body).toHaveProperty("published", "2026-06-02T08:00:00.000Z");
        expect(response.body.to).toEqual(["https://www.w3.org/ns/activitystreams#Public"]);
        expect(response.body.cc).toEqual([`${mockReply.actor_uri}/followers`]);
    });

    test('GET /ap/note/reply/:id should return 404 for an unknown reply', async () => {
        (mockDb.getApReply as jest.Mock).mockReturnValue(undefined);

        const response = await request(app)
            .get('/ap/note/reply/does-not-exist');

        expect(response.status).toBe(404);
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

    test('POST /ap/users/:slug/inbox should process incoming direct reply (Create Note)', async () => {
        const mockArtist = { id: 1, slug: "homologo" };
        const mockParentNote = { note_id: "https://sudorecords.scobrudot.dev/api/ap/note/post/some-post" };
        
        (mockDb.getArtistBySlug as jest.Mock).mockReturnValue(mockArtist);
        (mockDb.getApNote as jest.Mock).mockReturnValue(mockParentNote);
        (mockDb.getApReply as jest.Mock).mockReturnValue(undefined);

        const createReplyActivity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: "https://mastodon.social/activities/create-reply-1",
            type: "Create",
            actor: "https://mastodon.social/users/bob",
            object: {
                id: "https://mastodon.social/users/bob/statuses/1",
                type: "Note",
                inReplyTo: "https://sudorecords.scobrudot.dev/api/ap/note/post/some-post",
                content: "<p>Nice post!</p>",
                published: "2026-06-08T10:00:00Z"
            }
        };

        const response = await request(app)
            .post('/ap/users/homologo/inbox')
            .send(createReplyActivity);

        expect(response.status).toBe(200);
        expect(mockDb.getApNote).toHaveBeenCalledWith("https://sudorecords.scobrudot.dev/api/ap/note/post/some-post");
        expect(mockDb.addApReply).toHaveBeenCalledWith(
            "https://sudorecords.scobrudot.dev/api/ap/note/post/some-post",
            "https://mastodon.social/users/bob/statuses/1",
            "https://mastodon.social/users/bob",
            "<p>Nice post!</p>",
            "2026-06-08T10:00:00Z"
        );
    });

    test('POST /ap/users/:slug/inbox should process incoming nested reply to another reply', async () => {
        const mockArtist = { id: 1, slug: "homologo" };
        const rootNoteUri = "https://sudorecords.scobrudot.dev/api/ap/note/post/some-post";
        const parentReplyUri = "https://mastodon.social/users/bob/statuses/1";
        
        const mockParentReply = {
            note_id: rootNoteUri,
            reply_uri: parentReplyUri
        };
        const mockParentNote = { note_id: rootNoteUri };

        (mockDb.getArtistBySlug as jest.Mock).mockReturnValue(mockArtist);
        (mockDb.getApNote as jest.Mock).mockImplementation((uri) => {
            if (uri === rootNoteUri) return mockParentNote;
            return undefined;
        });
        (mockDb.getApReply as jest.Mock).mockImplementation((uri) => {
            if (uri === parentReplyUri) return mockParentReply;
            return undefined;
        });

        const nestedReplyActivity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: "https://mastodon.social/activities/create-reply-2",
            type: "Create",
            actor: "https://mastodon.social/users/charlie",
            object: {
                id: "https://mastodon.social/users/charlie/statuses/1",
                type: "Note",
                inReplyTo: parentReplyUri,
                content: "<p>Replying to Bob</p>",
                published: "2026-06-08T11:00:00Z"
            }
        };

        const response = await request(app)
            .post('/ap/users/homologo/inbox')
            .send(nestedReplyActivity);

        expect(response.status).toBe(200);
        expect(mockDb.getApReply).toHaveBeenCalledWith(parentReplyUri);
        expect(mockDb.getApNote).toHaveBeenCalledWith(rootNoteUri);
        expect(mockDb.addApReply).toHaveBeenCalledWith(
            rootNoteUri,
            "https://mastodon.social/users/charlie/statuses/1",
            "https://mastodon.social/users/charlie",
            "<p>Replying to Bob</p>",
            "2026-06-08T11:00:00Z"
        );
    });

    // Reply deletion (author-only)
    test('DELETE /ap/note/reply should delete a reply the artist authored', async () => {
        const rootNoteUri = "https://sudorecords.scobrudot.dev/api/ap/note/post/some-post";
        const replyUri = "https://sudorecords.scobrudot.dev/api/ap/note/reply/own-1";
        (mockDb.getApReply as jest.Mock).mockReturnValue({
            note_id: rootNoteUri,
            reply_uri: replyUri,
            actor_uri: "https://sudorecords.scobrudot.dev/users/homologo"
        });
        (mockDb.getApNote as jest.Mock).mockReturnValue({ note_id: rootNoteUri, artist_id: 1 });
        (mockDb.getArtist as jest.Mock).mockReturnValue({ id: 1, slug: "homologo", name: "Homologo" });

        const response = await request(app)
            .delete('/ap/note/reply')
            .query({ uri: replyUri });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true });
        expect(mockApService.deleteReply).toHaveBeenCalledWith(
            expect.objectContaining({ id: 1, slug: "homologo" }),
            replyUri
        );
    });

    test('DELETE /ap/note/reply should reject deleting a reply authored by someone else', async () => {
        const rootNoteUri = "https://sudorecords.scobrudot.dev/api/ap/note/post/some-post";
        const replyUri = "https://mastodon.social/users/bob/statuses/1";
        (mockDb.getApReply as jest.Mock).mockReturnValue({
            note_id: rootNoteUri,
            reply_uri: replyUri,
            actor_uri: "https://mastodon.social/users/bob"
        });
        (mockDb.getApNote as jest.Mock).mockReturnValue({ note_id: rootNoteUri, artist_id: 1 });
        (mockDb.getArtist as jest.Mock).mockReturnValue({ id: 1, slug: "homologo", name: "Homologo" });

        const response = await request(app)
            .delete('/ap/note/reply')
            .query({ uri: replyUri });

        expect(response.status).toBe(403);
        expect(mockApService.deleteReply).not.toHaveBeenCalled();
    });

    test('DELETE /ap/note/reply should return 404 for an unknown reply', async () => {
        (mockDb.getApReply as jest.Mock).mockReturnValue(undefined);

        const response = await request(app)
            .delete('/ap/note/reply')
            .query({ uri: "https://sudorecords.scobrudot.dev/api/ap/note/reply/missing" });

        expect(response.status).toBe(404);
    });
});
