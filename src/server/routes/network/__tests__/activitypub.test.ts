import express from 'express';
import request from 'supertest';
import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { createActivityPubRoutes } from '../activitypub.js';
import { ActivityPubService } from '../../../modules/activitypub/activitypub.service.js';
import { ActivityPubRenderer } from '../../../modules/activitypub/activitypub.renderer.js';
import type { DatabaseService } from '../../../core/database.js';

const mockDb = {
    getPostBySlug: jest.fn(),
    getPost: jest.fn(),
    getAlbum: jest.fn(),
    getArtist: jest.fn(),
    getArtistBySlug: jest.fn(),
    removeFollower: jest.fn(),
    removeAllFollowers: jest.fn(),
    getSetting: jest.fn(),
    getFollowers: jest.fn(),
    getFollowerInboxes: jest.fn(),
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
        req.isAdmin = req.headers['x-is-admin'] !== 'false';
        req.isRootAdmin = req.headers['x-is-root-admin'] !== 'false';
        if (req.headers['x-artist-id'] === 'null') {
            req.artistId = null;
        } else if (req.headers['x-artist-id'] === 'undefined') {
            req.artistId = undefined;
        } else if (req.headers['x-artist-id']) {
            req.artistId = Number(req.headers['x-artist-id']);
        }
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

    test('GET /ap/article/post/:slug should extract and include markdown images in ActivityPub attachments', async () => {
        const mockPost = {
            id: 124,
            artist_id: 1,
            title: "Post with Images",
            summary: "Testing image rendering",
            content: "Check this image: ![Landscape](/api/posts/media/post-media-uuid.png) and another one: ![Portrait](https://example.com/portrait.jpg)",
            slug: "post-with-images",
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
            .get('/ap/article/post/post-with-images');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("attachment");
        expect(Array.isArray(response.body.attachment)).toBe(true);
        expect(response.body.attachment).toHaveLength(2);
        
        expect(response.body.attachment[0]).toEqual({
            type: "Document",
            mediaType: "image/png",
            url: "https://sudorecords.scobrudot.dev/api/posts/media/post-media-uuid.png",
            name: "Landscape"
        });
        expect(response.body.attachment[1]).toEqual({
            type: "Document",
            mediaType: "image/jpeg",
            url: "https://example.com/portrait.jpg",
            name: "Portrait"
        });

        // Images federate as attachments (above), not inline <img> — Mastodon strips inline
        // images, so the body is rendered without them to avoid double-rendering elsewhere.
        expect(response.body.content).not.toContain('<img');
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

    describe('DELETE /ap/note', () => {
        test('should allow root admin to delete any note', async () => {
            const mockNote = { note_id: "test-note", note_type: "post", content_id: 1, artist_id: 2 };
            (mockDb.getApNote as jest.Mock).mockReturnValue(mockNote);
            (mockDb.getPost as jest.Mock).mockReturnValue({ id: 1, title: "Test" });
            mockApService.broadcastPostDelete = jest.fn<any>().mockResolvedValue(undefined);

            const response = await request(app)
                .delete('/ap/note')
                .query({ id: "test-note" })
                .set('x-is-root-admin', 'true')
                .set('x-artist-id', '1');

            expect(response.status).toBe(200);
            expect(mockApService.broadcastPostDelete).toHaveBeenCalled();
        });

        test('should allow restricted admin to delete their own note', async () => {
            const mockNote = { note_id: "test-note-own", note_type: "post", content_id: 2, artist_id: 42 };
            (mockDb.getApNote as jest.Mock).mockReturnValue(mockNote);
            (mockDb.getPost as jest.Mock).mockReturnValue({ id: 2, title: "My Post" });
            mockApService.broadcastPostDelete = jest.fn<any>().mockResolvedValue(undefined);

            const response = await request(app)
                .delete('/ap/note')
                .query({ id: "test-note-own" })
                .set('x-is-root-admin', 'false')
                .set('x-artist-id', '42');

            expect(response.status).toBe(200);
            expect(mockApService.broadcastPostDelete).toHaveBeenCalled();
        });

        test('should reject restricted admin from deleting someone else\'s note', async () => {
            const mockNote = { note_id: "test-note-other", note_type: "post", content_id: 3, artist_id: 99 };
            (mockDb.getApNote as jest.Mock).mockReturnValue(mockNote);
            (mockDb.getPost as jest.Mock).mockReturnValue({ id: 3, title: "Other Post" });
            mockApService.broadcastPostDelete = jest.fn<any>().mockResolvedValue(undefined);

            const response = await request(app)
                .delete('/ap/note')
                .query({ id: "test-note-other" })
                .set('x-is-root-admin', 'false')
                .set('x-artist-id', '42');

            expect(response.status).toBe(403);
            expect(mockApService.broadcastPostDelete).not.toHaveBeenCalled();
        });


        test('should reject restricted admin from deleting if artistId is null', async () => {
            const mockNote = { note_id: "test-note-null", note_type: "post", content_id: 4, artist_id: 99 };
            (mockDb.getApNote as jest.Mock).mockReturnValue(mockNote);
            (mockDb.getPost as jest.Mock).mockReturnValue({ id: 4, title: "Null Post" });
            mockApService.broadcastPostDelete = jest.fn<any>().mockResolvedValue(undefined);

            const response = await request(app)
                .delete('/ap/note')
                .query({ id: "test-note-null" })
                .set('x-is-root-admin', 'false')
                .set('x-artist-id', 'null');

            expect(response.status).toBe(403);
            expect(mockApService.broadcastPostDelete).not.toHaveBeenCalled();
        });

        test('should reject restricted admin from deleting if artistId is undefined', async () => {
            const mockNote = { note_id: "test-note-undef", note_type: "post", content_id: 5, artist_id: 99 };
            (mockDb.getApNote as jest.Mock).mockReturnValue(mockNote);
            (mockDb.getPost as jest.Mock).mockReturnValue({ id: 5, title: "Undef Post" });
            mockApService.broadcastPostDelete = jest.fn<any>().mockResolvedValue(undefined);

            const response = await request(app)
                .delete('/ap/note')
                .query({ id: "test-note-undef" })
                .set('x-is-root-admin', 'false')
                .set('x-artist-id', 'undefined');

            expect(response.status).toBe(403);
            expect(mockApService.broadcastPostDelete).not.toHaveBeenCalled();
        });
        test('should return 400 if id is missing', async () => {
            const response = await request(app)
                .delete('/ap/note');
            expect(response.status).toBe(400);
        });

        test('should return 404 if note not found', async () => {
            (mockDb.getApNote as jest.Mock).mockReturnValue(undefined);
            const response = await request(app)
                .delete('/ap/note')
                .query({ id: "missing-note" });
            expect(response.status).toBe(404);
        });
    });
});
