import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { createSocialManager } from "../social.js";
import { UserRole } from "../../../common/visibility.js";
import type { SocialManager } from "../../database.types.js";

function setupDb(): DatabaseType {
    const db = new Database(":memory:");
    db.exec(`
        CREATE TABLE artists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            slug TEXT NOT NULL UNIQUE,
            visibility TEXT DEFAULT 'public',
            public_key TEXT,
            private_key TEXT,
            photo_path TEXT
        );
        CREATE TABLE settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
            title TEXT,
            summary TEXT,
            content TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            visibility TEXT DEFAULT 'public',
            published_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE artist_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            event_date TEXT NOT NULL,
            venue TEXT,
            city TEXT,
            country TEXT,
            ticket_url TEXT,
            description TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE ap_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
            note_id TEXT NOT NULL UNIQUE,
            note_type TEXT NOT NULL,
            content_id INTEGER NOT NULL,
            content_slug TEXT NOT NULL,
            content_title TEXT NOT NULL,
            published_at TEXT DEFAULT CURRENT_TIMESTAMP,
            deleted_at TEXT,
            likes_count INTEGER DEFAULT 0,
            announces_count INTEGER DEFAULT 0,
            replies_count INTEGER DEFAULT 0
        );
        CREATE TABLE ap_interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id TEXT NOT NULL,
            actor_uri TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('like', 'announce')),
            activity_id TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(note_id, actor_uri, type)
        );
        CREATE TABLE ap_replies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id TEXT NOT NULL,
            reply_uri TEXT NOT NULL UNIQUE,
            actor_uri TEXT NOT NULL,
            content TEXT NOT NULL,
            published_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            track_id TEXT NOT NULL,
            position_ms INTEGER NOT NULL,
            comment TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE remote_actors (
            uri TEXT PRIMARY KEY,
            is_followed INTEGER DEFAULT 0
        );
    `);
    return db;
}

function mockRepos() {
    const socialRepository = {
        getFollowers: jest.fn(() => []),
        getFollowerInboxes: jest.fn(() => []),
        getPendingFollowers: jest.fn(() => []),
        getFollower: jest.fn(() => undefined),
        addFollower: jest.fn(),
        acceptFollower: jest.fn(),
        acceptPendingFollowers: jest.fn(),
        rejectFollower: jest.fn(),
        removeFollower: jest.fn(),
        removeAllFollowers: jest.fn(),
        updateFollowerUri: jest.fn(),
        addFollowing: jest.fn(),
        removeFollowing: jest.fn(),
        isFollowing: jest.fn(() => false),
        starItem: jest.fn(),
        unstarItem: jest.fn(),
        getStarredItems: jest.fn(() => []),
        isStarred: jest.fn(() => false),
        setItemRating: jest.fn(),
        getItemRating: jest.fn(() => 0),
        getItemRatings: jest.fn(() => []),
        addLike: jest.fn(),
        removeLike: jest.fn(),
        getLikesCount: jest.fn(() => 0),
        hasLiked: jest.fn(() => false),
        getTrackPlayCount: jest.fn(() => 0),
        incrementTrackPlayCount: jest.fn(),
        getTrackDownloadCount: jest.fn(() => 0),
        incrementTrackDownloadCount: jest.fn(),
        getTrackLikeCount: jest.fn(() => 0),
        getReleaseDownloadCount: jest.fn(() => 0),
        incrementReleaseDownloadCount: jest.fn(),
        recordPlay: jest.fn(),
        getRecentPlays: jest.fn(() => []),
        getTopTracks: jest.fn(() => []),
        getTopArtists: jest.fn(() => []),
        addComment: jest.fn(),
        getComments: jest.fn(() => []),
        deleteComment: jest.fn(),
    };
    const remoteActorRepository = {
        getRemoteActor: jest.fn(() => undefined),
        getRemoteActors: jest.fn(() => []),
        getRemoteActorsByUris: jest.fn(() => []),
        getFollowedActors: jest.fn(() => []),
        upsertRemoteActor: jest.fn(),
        saveRemoteActor: jest.fn(),
    };
    const remoteContentRepository = {
        upsertRemoteContent: jest.fn(),
        upsertRemoteContentsBatch: jest.fn(),
        getRemoteContent: jest.fn(() => undefined),
        saveRemotePost: jest.fn(),
        deleteRemotePost: jest.fn(),
        deleteRemoteContent: jest.fn(),
        deleteRemoteContentByActorPrefix: jest.fn(),
    };
    const reportsRepository = {
        createReport: jest.fn(() => 1),
        getReports: jest.fn(() => []),
        deleteReport: jest.fn(),
    };
    return { socialRepository, remoteActorRepository, remoteContentRepository, reportsRepository };
}

describe("SocialManager", () => {
    let db: DatabaseType;
    let repos: ReturnType<typeof mockRepos>;
    let manager: SocialManager;

    beforeEach(() => {
        db = setupDb();
        repos = mockRepos();
        manager = createSocialManager(
            db,
            repos.socialRepository as any,
            repos.remoteActorRepository as any,
            repos.remoteContentRepository as any,
            repos.reportsRepository as any
        );
    });

    describe("delegation to repositories", () => {
        test("follower methods pass through with the same arguments", () => {
            manager.getFollowers(5);
            expect(repos.socialRepository.getFollowers).toHaveBeenCalledWith(5);

            manager.getFollowerInboxes(5);
            expect(repos.socialRepository.getFollowerInboxes).toHaveBeenCalledWith(5);

            manager.getPendingFollowers(5);
            expect(repos.socialRepository.getPendingFollowers).toHaveBeenCalledWith(5);

            manager.getFollower(5, "https://actor");
            expect(repos.socialRepository.getFollower).toHaveBeenCalledWith(5, "https://actor");

            manager.acceptFollower(5, "https://actor");
            expect(repos.socialRepository.acceptFollower).toHaveBeenCalledWith(5, "https://actor");

            manager.acceptPendingFollowers(5);
            expect(repos.socialRepository.acceptPendingFollowers).toHaveBeenCalledWith(5);

            manager.rejectFollower(5, "https://actor");
            expect(repos.socialRepository.rejectFollower).toHaveBeenCalledWith(5, "https://actor");

            manager.removeFollower(5, "https://actor");
            expect(repos.socialRepository.removeFollower).toHaveBeenCalledWith(5, "https://actor");

            manager.removeAllFollowers("https://actor");
            expect(repos.socialRepository.removeAllFollowers).toHaveBeenCalledWith("https://actor");

            manager.updateFollowerUri("old", "new", "inbox");
            expect(repos.socialRepository.updateFollowerUri).toHaveBeenCalledWith("old", "new", "inbox", undefined);

            manager.addFollowing(5, "https://actor", "https://inbox");
            expect(repos.socialRepository.addFollowing).toHaveBeenCalledWith(5, "https://actor", "https://inbox");

            manager.removeFollowing(5, "https://actor");
            expect(repos.socialRepository.removeFollowing).toHaveBeenCalledWith(5, "https://actor");

            manager.isFollowing(5, "https://actor");
            expect(repos.socialRepository.isFollowing).toHaveBeenCalledWith(5, "https://actor");
        });

        test("star/rating/like methods pass through", () => {
            manager.starItem("bob", "track", "10");
            expect(repos.socialRepository.starItem).toHaveBeenCalledWith("bob", "track", "10");

            manager.unstarItem("bob", "track", "10");
            expect(repos.socialRepository.unstarItem).toHaveBeenCalledWith("bob", "track", "10");

            manager.getStarredItems("bob", "track");
            expect(repos.socialRepository.getStarredItems).toHaveBeenCalledWith("bob", "track");

            manager.isStarred("bob", "track", "10");
            expect(repos.socialRepository.isStarred).toHaveBeenCalledWith("bob", "track", "10");

            manager.setItemRating("bob", "track", "10", 5);
            expect(repos.socialRepository.setItemRating).toHaveBeenCalledWith("bob", "track", "10", 5);

            manager.getItemRating("bob", "track", "10");
            expect(repos.socialRepository.getItemRating).toHaveBeenCalledWith("bob", "track", "10");

            manager.getItemRatings("bob", "track");
            expect(repos.socialRepository.getItemRatings).toHaveBeenCalledWith("bob", "track");

            manager.addLike("bob", "track", 10);
            expect(repos.socialRepository.addLike).toHaveBeenCalledWith("bob", "track", 10);

            manager.removeLike("bob", "track", 10);
            expect(repos.socialRepository.removeLike).toHaveBeenCalledWith("bob", "track", 10);

            manager.getLikesCount("track", 10);
            expect(repos.socialRepository.getLikesCount).toHaveBeenCalledWith("track", 10);

            manager.hasLiked("bob", "track", 10);
            expect(repos.socialRepository.hasLiked).toHaveBeenCalledWith("bob", "track", 10);
        });

        test("starItems/unstarItems batch through a transaction", () => {
            const items = [{ type: "track", id: "1" }, { type: "track", id: "2" }];
            manager.starItems("bob", items);
            expect(repos.socialRepository.starItem).toHaveBeenCalledWith("bob", "track", "1");
            expect(repos.socialRepository.starItem).toHaveBeenCalledWith("bob", "track", "2");

            manager.unstarItems("bob", items);
            expect(repos.socialRepository.unstarItem).toHaveBeenCalledWith("bob", "track", "1");
            expect(repos.socialRepository.unstarItem).toHaveBeenCalledWith("bob", "track", "2");
        });

        test("stats counters pass through", () => {
            manager.getTrackPlayCount(1);
            expect(repos.socialRepository.getTrackPlayCount).toHaveBeenCalledWith(1);
            manager.incrementTrackPlayCount(1);
            expect(repos.socialRepository.incrementTrackPlayCount).toHaveBeenCalledWith(1);
            manager.getTrackDownloadCount(1);
            expect(repos.socialRepository.getTrackDownloadCount).toHaveBeenCalledWith(1);
            manager.incrementTrackDownloadCount(1);
            expect(repos.socialRepository.incrementTrackDownloadCount).toHaveBeenCalledWith(1);
            manager.getTrackLikeCount(1);
            expect(repos.socialRepository.getTrackLikeCount).toHaveBeenCalledWith(1);
            manager.getReleaseDownloadCount("slug");
            expect(repos.socialRepository.getReleaseDownloadCount).toHaveBeenCalledWith("slug");
            manager.incrementReleaseDownloadCount("slug");
            expect(repos.socialRepository.incrementReleaseDownloadCount).toHaveBeenCalledWith("slug");
            manager.recordPlay(1, "prov");
            expect(repos.socialRepository.recordPlay).toHaveBeenCalledWith(1, "prov");
            manager.getRecentPlays(10);
            expect(repos.socialRepository.getRecentPlays).toHaveBeenCalledWith(10);
            manager.getTopTracks(5, 7, "all");
            expect(repos.socialRepository.getTopTracks).toHaveBeenCalledWith(5, 7, "all");
            manager.getTopArtists(5, 7, "all");
            expect(repos.socialRepository.getTopArtists).toHaveBeenCalledWith(5, 7, "all");
        });

        test("comment methods pass through", () => {
            manager.addComment(1, "bob", "nice track");
            expect(repos.socialRepository.addComment).toHaveBeenCalledWith(1, "bob", "nice track");
            manager.getComments(1);
            expect(repos.socialRepository.getComments).toHaveBeenCalledWith(1);
            manager.deleteComment(1, "bob", false);
            expect(repos.socialRepository.deleteComment).toHaveBeenCalledWith(1, "bob", false);
        });

        test("remote actor/content methods pass through", () => {
            manager.getRemoteActor("uri");
            expect(repos.remoteActorRepository.getRemoteActor).toHaveBeenCalledWith("uri");
            manager.getRemoteActors();
            expect(repos.remoteActorRepository.getRemoteActors).toHaveBeenCalled();
            manager.getRemoteActorsByUris(["uri"]);
            expect(repos.remoteActorRepository.getRemoteActorsByUris).toHaveBeenCalledWith(["uri"]);
            manager.getFollowedActors();
            expect(repos.remoteActorRepository.getFollowedActors).toHaveBeenCalled();
            manager.upsertRemoteActor({ uri: "uri" });
            expect(repos.remoteActorRepository.upsertRemoteActor).toHaveBeenCalledWith({ uri: "uri" });
            manager.upsertRemoteContent({ id: "1" });
            expect(repos.remoteContentRepository.upsertRemoteContent).toHaveBeenCalledWith({ id: "1" });
            manager.upsertRemoteContentsBatch([{ id: "1" }]);
            expect(repos.remoteContentRepository.upsertRemoteContentsBatch).toHaveBeenCalledWith([{ id: "1" }]);
            manager.getRemoteContent("1");
            expect(repos.remoteContentRepository.getRemoteContent).toHaveBeenCalledWith("1");
            manager.saveRemoteActor({ uri: "uri" });
            expect(repos.remoteActorRepository.saveRemoteActor).toHaveBeenCalledWith({ uri: "uri" });
            manager.saveRemotePost({ id: "1" });
            expect(repos.remoteContentRepository.saveRemotePost).toHaveBeenCalledWith({ id: "1" });
            manager.deleteRemotePost("1");
            expect(repos.remoteContentRepository.deleteRemotePost).toHaveBeenCalledWith("1");
            manager.deleteRemoteContent("1");
            expect(repos.remoteContentRepository.deleteRemoteContent).toHaveBeenCalledWith("1");
            manager.deleteRemoteContentByActorPrefix("prefix");
            expect(repos.remoteContentRepository.deleteRemoteContentByActorPrefix).toHaveBeenCalledWith("prefix");
        });

        test("report methods pass through", () => {
            manager.createReport({ reason: "spam" } as any);
            expect(repos.reportsRepository.createReport).toHaveBeenCalledWith({ reason: "spam" });
            manager.getReports();
            expect(repos.reportsRepository.getReports).toHaveBeenCalled();
            manager.deleteReport(1);
            expect(repos.reportsRepository.deleteReport).toHaveBeenCalledWith(1);
        });
    });

    describe("addFollower self-healing site actor", () => {
        test("recreates the virtual site actor (id -1) when missing before delegating", () => {
            db.prepare("INSERT INTO settings (key, value) VALUES ('site_public_key', 'pub')").run();
            db.prepare("INSERT INTO settings (key, value) VALUES ('site_private_key', 'priv')").run();
            db.prepare("INSERT INTO settings (key, value) VALUES ('siteHandle', 'myinstance')").run();
            db.prepare("INSERT INTO settings (key, value) VALUES ('siteName', 'My Instance')").run();

            manager.addFollower(-1, "https://actor", "https://actor/inbox");

            const siteActor = db.prepare("SELECT * FROM artists WHERE id = -1").get() as any;
            expect(siteActor).toBeTruthy();
            expect(siteActor.name).toBe("My Instance");
            expect(siteActor.slug).toBe("myinstance");
            expect(repos.socialRepository.addFollower).toHaveBeenCalledWith(-1, "https://actor", "https://actor/inbox", undefined, undefined);
        });

        test("does not touch artists table for a regular artist id", () => {
            manager.addFollower(5, "https://actor", "https://actor/inbox");
            const siteActor = db.prepare("SELECT * FROM artists WHERE id = -1").get();
            expect(siteActor).toBeUndefined();
            expect(repos.socialRepository.addFollower).toHaveBeenCalledWith(5, "https://actor", "https://actor/inbox", undefined, undefined);
        });

        test("does not recreate the site actor if it already exists", () => {
            db.prepare("INSERT INTO artists (id, name, slug) VALUES (-1, 'Existing', 'existing')").run();
            manager.addFollower(-1, "https://actor", "https://actor/inbox");
            const siteActor = db.prepare("SELECT * FROM artists WHERE id = -1").get() as any;
            expect(siteActor.name).toBe("Existing");
        });
    });

    test("unfollowActor clears the is_followed flag on the remote actor", () => {
        db.prepare("INSERT INTO remote_actors (uri, is_followed) VALUES ('https://actor', 1)").run();
        manager.unfollowActor("https://actor");
        const row = db.prepare("SELECT is_followed FROM remote_actors WHERE uri = ?").get("https://actor") as any;
        expect(row.is_followed).toBe(0);
    });

    test("play queue is persisted and restored as JSON", () => {
        expect(manager.getPlayQueue("bob")).toEqual({ trackIds: [], current: null, positionMs: 0 });
        manager.savePlayQueue("bob", ["1", "2"], "1", 1500);
        expect(manager.getPlayQueue("bob")).toEqual({ trackIds: ["1", "2"], current: "1", positionMs: 1500 });
    });

    describe("bookmarks", () => {
        test("create, list, get and delete a bookmark", () => {
            manager.createBookmark("bob", "10", 5000, "great part");
            expect(manager.getBookmark("bob", "10")).toMatchObject({ username: "bob", track_id: "10", position_ms: 5000, comment: "great part" });
            expect(manager.getBookmarks("bob")).toHaveLength(1);
            manager.deleteBookmark("bob", "10");
            expect(manager.getBookmark("bob", "10")).toBeUndefined();
        });
    });

    describe("posts", () => {
        beforeEach(() => {
            db.prepare("INSERT INTO artists (id, name, slug) VALUES (1, 'Artist', 'artist')").run();
        });

        test("createPost generates a slug from the title and sets published_at for public posts", () => {
            const id = manager.createPost(1, "hello world", "public", "My Title");
            const post = manager.getPost(id) as any;
            expect(post.slug).toMatch(/^my-title-[a-f0-9]{6}$/);
            expect(post.published_at).not.toBeNull();
            expect(post.visibility).toBe("public");
        });

        test("createPost leaves published_at null for private posts", () => {
            const id = manager.createPost(1, "hello world", "private");
            const post = manager.getPost(id) as any;
            expect(post.published_at).toBeNull();
        });

        test("createPost self-heals the site actor for artist id -1", () => {
            const id = manager.createPost(-1, "site announcement");
            const siteActor = db.prepare("SELECT * FROM artists WHERE id = -1").get();
            expect(siteActor).toBeTruthy();
            expect(manager.getPost(id)).toBeTruthy();
        });

        test("getPostBySlug finds a post by its slug", () => {
            const id = manager.createPost(1, "hello world", "public", "Findable");
            const bySlug = manager.getPostBySlug((manager.getPost(id) as any).slug) as any;
            expect(bySlug.id).toBe(id);
        });

        test("updatePost only changes the provided fields", () => {
            const id = manager.createPost(1, "original", "public", "Original Title", "Original summary");
            manager.updatePost(id, "updated content");
            let post = manager.getPost(id) as any;
            expect(post.content).toBe("updated content");
            expect(post.title).toBe("Original Title");

            manager.updatePost(id, "updated content", "unlisted", "New Title", "New summary");
            post = manager.getPost(id) as any;
            expect(post.visibility).toBe("unlisted");
            expect(post.title).toBe("New Title");
            expect(post.summary).toBe("New summary");
        });

        test("updatePostVisibility and deletePost", () => {
            const id = manager.createPost(1, "content", "private");
            manager.updatePostVisibility(id, "public");
            expect((manager.getPost(id) as any).visibility).toBe("public");
            manager.deletePost(id);
            expect(manager.getPost(id)).toBeUndefined();
        });

        test("getPostsByArtist hides non-public posts from guests but shows them to authenticated viewers", () => {
            manager.createPost(1, "public post", "public");
            manager.createPost(1, "private post", "private");

            const guestPosts = manager.getPostsByArtist(1, { role: UserRole.GUEST });
            expect(guestPosts).toHaveLength(1);

            const ownerPosts = manager.getPostsByArtist(1, { role: UserRole.ADMIN });
            expect(ownerPosts).toHaveLength(2);
        });

        test("getPublicPosts joins artist metadata and excludes non-public posts", () => {
            manager.createPost(1, "public post", "public");
            manager.createPost(1, "private post", "private");
            const posts = manager.getPublicPosts() as any[];
            expect(posts).toHaveLength(1);
            expect(posts[0].artist_name).toBe("Artist");
            expect(posts[0].artist_slug).toBe("artist");
        });
    });

    describe("artist events", () => {
        beforeEach(() => {
            db.prepare("INSERT INTO artists (id, name, slug) VALUES (1, 'Artist', 'artist')").run();
        });

        test("create, list, update and delete an event", () => {
            const id = manager.createEvent(1, { title: "Live show", event_date: "2030-01-01", venue: "The Venue" });
            expect(manager.getEvent(id)).toMatchObject({ title: "Live show", venue: "The Venue" });

            manager.updateEvent(id, { title: "Updated show", event_date: "2030-02-01" });
            expect((manager.getEvent(id) as any).title).toBe("Updated show");

            expect(manager.getEventsByArtist(1)).toHaveLength(1);

            manager.deleteEvent(id);
            expect(manager.getEvent(id)).toBeUndefined();
        });

        test("getEventsByArtist(upcomingOnly) filters out past events", () => {
            manager.createEvent(1, { title: "Past show", event_date: "2000-01-01" });
            manager.createEvent(1, { title: "Future show", event_date: "2099-01-01" });
            const upcoming = manager.getEventsByArtist(1, true);
            expect(upcoming).toHaveLength(1);
            expect((upcoming[0] as any).title).toBe("Future show");
        });
    });

    describe("AP notes, interactions and replies", () => {
        beforeEach(() => {
            db.prepare("INSERT INTO artists (id, name, slug) VALUES (1, 'Artist', 'artist')").run();
        });

        test("createApNote is idempotent (INSERT OR IGNORE) and can be looked up multiple ways", () => {
            const id1 = manager.createApNote(1, "note-1", "post", 10, "slug", "Title");
            const id2 = manager.createApNote(1, "note-1", "post", 10, "slug", "Title");
            // INSERT OR IGNORE on a duplicate is a no-op: lastInsertRowid still reports the first insert's id.
            expect(id2).toBe(id1);

            expect(manager.getApNote("note-1")).toBeTruthy();
            expect(manager.getApNoteByContent(1, "post", 10)).toBeTruthy();
            expect(manager.getApNotes(1)).toHaveLength(1);
            expect(id1).toBeGreaterThan(0);
        });

        test("markApNoteDeleted hides the note from getApNotes by default but not when including deleted", () => {
            manager.createApNote(1, "note-1", "post", 10, "slug", "Title");
            manager.markApNoteDeleted("note-1");
            expect(manager.getApNotes(1)).toHaveLength(0);
            expect(manager.getApNotes(1, true)).toHaveLength(1);
        });

        test("deleteApNote removes the row entirely", () => {
            manager.createApNote(1, "note-1", "post", 10, "slug", "Title");
            manager.deleteApNote("note-1");
            expect(manager.getApNote("note-1")).toBeUndefined();
        });

        test("getApNotesByArtistIds returns [] for an empty list and dedupes/chunks ids otherwise", () => {
            expect(manager.getApNotesByArtistIds([])).toEqual([]);
            manager.createApNote(1, "note-1", "post", 10, "slug", "Title");
            expect(manager.getApNotesByArtistIds([1, 1])).toHaveLength(1);
        });

        test("addApInteraction increments likes_count once and rejects duplicates", () => {
            manager.createApNote(1, "note-1", "post", 10, "slug", "Title");
            expect(manager.addApInteraction("note-1", "https://actor", "like")).toBe(true);
            expect(manager.addApInteraction("note-1", "https://actor", "like")).toBe(false);
            const note = manager.getApNote("note-1") as any;
            expect(note.likes_count).toBe(1);
            expect(manager.getApInteractions("note-1")).toHaveLength(1);
        });

        test("removeApInteraction decrements likes_count and floors at zero", () => {
            manager.createApNote(1, "note-1", "post", 10, "slug", "Title");
            manager.addApInteraction("note-1", "https://actor", "like");
            expect(manager.removeApInteraction("note-1", "https://actor", "like")).toBe(true);
            expect((manager.getApNote("note-1") as any).likes_count).toBe(0);
            expect(manager.removeApInteraction("note-1", "https://actor", "like")).toBe(false);
            expect((manager.getApNote("note-1") as any).likes_count).toBe(0);
        });

        test("addApReply/getApReplies/getApReply increment replies_count", () => {
            manager.createApNote(1, "note-1", "post", 10, "slug", "Title");
            expect(manager.addApReply("note-1", "https://reply/1", "https://actor", "nice!")).toBe(true);
            expect(manager.addApReply("note-1", "https://reply/1", "https://actor", "nice!")).toBe(false);
            expect((manager.getApNote("note-1") as any).replies_count).toBe(1);
            expect(manager.getApReplies("note-1")).toHaveLength(1);
            expect(manager.getApReply("https://reply/1")).toBeTruthy();
        });

        test("deleteApReply decrements replies_count", () => {
            manager.createApNote(1, "note-1", "post", 10, "slug", "Title");
            manager.addApReply("note-1", "https://reply/1", "https://actor", "nice!");
            expect(manager.deleteApReply("https://reply/1")).toBe(true);
            expect((manager.getApNote("note-1") as any).replies_count).toBe(0);
            expect(manager.deleteApReply("https://reply/1")).toBe(false);
        });
    });
});
