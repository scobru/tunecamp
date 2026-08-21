import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import { createDatabase } from "../../database.js";

describe("Social Manager", () => {
	let db: any;
	let logSpy: any;
	let warnSpy: any;
	let errorSpy: any;

	let artistId: number;
	let albumId: number;
	let trackId: number;
	let userId: number;

	beforeAll(() => {
		logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		db = createDatabase(":memory:");

		userId = db.createUser("social_user", "hashSoc", null, "user");
		artistId = db.createArtist("Social Artist");
		albumId = db.createAlbum({
			title: "Social Album",
			artist_id: artistId,
			owner_id: userId,
			visibility: "public",
		});
		trackId = db.createTrack({
			title: "Social Track",
			album_id: albumId,
			artist_id: artistId,
			duration: 180,
			file_path: "social/track.mp3",
		});
	});

	afterAll(() => {
		if (db?.db) db.db.close();
		logSpy.mockRestore();
		warnSpy.mockRestore();
		errorSpy.mockRestore();
	});

	// ── Starred Items ───────────────────────────────────────────────────────

	describe("Starred Items", () => {
		test("star, unstar, and check starred status", () => {
			expect(db.isStarred("social_user", "track", String(trackId))).toBe(false);

			db.starItem("social_user", "track", String(trackId));
			expect(db.isStarred("social_user", "track", String(trackId))).toBe(true);

			const starred = db.getStarredItems("social_user", "track");
			expect(starred.some((s: any) => s.item_id === String(trackId))).toBe(true);

			db.unstarItem("social_user", "track", String(trackId));
			expect(db.isStarred("social_user", "track", String(trackId))).toBe(false);
		});

		test("starItems and unstarItems batch", () => {
			const items = [
				{ type: "album", id: String(albumId) },
				{ type: "track", id: String(trackId) },
			];

			db.starItems("social_user", items);
			expect(db.isStarred("social_user", "album", String(albumId))).toBe(true);
			expect(db.isStarred("social_user", "track", String(trackId))).toBe(true);

			db.unstarItems("social_user", items);
			expect(db.isStarred("social_user", "album", String(albumId))).toBe(false);
		});
	});

	// ── Ratings ────────────────────────────────────────────────────────────
	describe("Ratings", () => {
		test("setItemRating and getItemRating", () => {
			db.setItemRating("social_user", "album", String(albumId), 5);
			expect(db.getItemRating("social_user", "album", String(albumId))).toBe(5);

			const ratings = db.getItemRatings("social_user", "album");
			expect(ratings.get(String(albumId))).toBe(5);
		});
	});

	// ── Play Counters & Stats ───────────────────────────────────────────────

	describe("Play Counters & Stats", () => {
		test("increment and get track play counts", () => {
			const initial = db.getTrackPlayCount(trackId);
			db.incrementTrackPlayCount(trackId);
			expect(db.getTrackPlayCount(trackId)).toBe(initial + 1);
		});

		test("increment and get track download counts", () => {
			const initial = db.getTrackDownloadCount(trackId);
			db.incrementTrackDownloadCount(trackId);
			expect(db.getTrackDownloadCount(trackId)).toBe(initial + 1);
		});

		test("recordPlay and getRecentPlays", () => {
			db.recordPlay(trackId, "web");
			const recent = db.getRecentPlays(10);
			expect(recent.length).toBeGreaterThanOrEqual(1);
			expect(recent.some((p: any) => p.track_id === trackId)).toBe(true);
		});

		test("getTopTracks and getTopArtists", () => {
			const topTracks = db.getTopTracks(10);
			expect(Array.isArray(topTracks)).toBe(true);

			const topArtists = db.getTopArtists(10);
			expect(Array.isArray(topArtists)).toBe(true);
		});
	});

	// ── Play Queue ──────────────────────────────────────────────────────────

	describe("Play Queue", () => {
		test("savePlayQueue and getPlayQueue roundtrip", () => {
			const trackIds = ["1", "2", "3"];
			db.savePlayQueue("social_user", trackIds, "2", 45000);

			const queue = db.getPlayQueue("social_user");
			expect(queue.trackIds).toEqual(trackIds);
			expect(queue.current).toBe("2");
			expect(queue.positionMs).toBe(45000);
		});
	});

	// ── Comments ────────────────────────────────────────────────────────────

	describe("Comments", () => {
		test("addComment, getComments, and deleteComment", () => {
			db.addComment(trackId, "social_user", "Great guitar solo!");
			const comments = db.getComments(trackId);
			expect(comments.length).toBeGreaterThanOrEqual(1);

			const comment = comments.find((c: any) => c.text === "Great guitar solo!");
			expect(comment).toBeDefined();

			db.deleteComment(comment.id, "social_user", false);
			const afterDelete = db.getComments(trackId);
			expect(afterDelete.some((c: any) => c.id === comment.id)).toBe(false);
		});
	});

	// ── Bookmarks ───────────────────────────────────────────────────────────

	describe("Bookmarks", () => {
		test("createBookmark, getBookmarks, getBookmark, and deleteBookmark", () => {
			db.createBookmark("social_user", String(trackId), 120000, "Timestamp note");

			const bookmark = db.getBookmark("social_user", String(trackId));
			expect(bookmark).toBeDefined();
			expect(bookmark.position_ms).toBe(120000);
			expect(bookmark.comment).toBe("Timestamp note");

			const all = db.getBookmarks("social_user");
			expect(all.some((b: any) => b.track_id === String(trackId))).toBe(true);

			db.deleteBookmark("social_user", String(trackId));
			expect(db.getBookmark("social_user", String(trackId))).toBeUndefined();
		});
	});

	// ── Posts ───────────────────────────────────────────────────────────────

	describe("Posts", () => {
		test("createPost, getPost, getPostBySlug, and updatePost", () => {
			const postId = db.createPost(artistId, "Check out our new release!", "public", "New Release", "Announcement");
			expect(postId).toBeGreaterThan(0);

			const post = db.getPost(postId);
			expect(post).toBeDefined();
			expect(post.content).toBe("Check out our new release!");
			expect(post.title).toBe("New Release");
			expect(post.slug).toBeDefined();

			const bySlug = db.getPostBySlug(post.slug);
			expect(bySlug).toBeDefined();
			expect(bySlug.id).toBe(postId);

			// Update
			db.updatePost(postId, "Updated content", "public", "Updated Title");
			const updated = db.getPost(postId);
			expect(updated.content).toBe("Updated content");
			expect(updated.title).toBe("Updated Title");

			// Delete
			db.deletePost(postId);
			expect(db.getPost(postId)).toBeUndefined();
		});
	});

	// ── Artist Live Events ──────────────────────────────────────────────────

	describe("Artist Live Events", () => {
		test("createEvent, getEvent, getEventsByArtist, and deleteEvent", () => {
			const eventId = db.createEvent(artistId, {
				title: "Live in Berlin",
				event_date: "2027-06-15",
				venue: "Berghain",
				city: "Berlin",
				country: "Germany",
			});
			expect(eventId).toBeGreaterThan(0);

			const event = db.getEvent(eventId);
			expect(event).toBeDefined();
			expect(event.title).toBe("Live in Berlin");
			expect(event.city).toBe("Berlin");

			const artistEvents = db.getEventsByArtist(artistId);
			expect(artistEvents.some((e: any) => e.id === eventId)).toBe(true);

			db.deleteEvent(eventId);
			expect(db.getEvent(eventId)).toBeUndefined();
		});
	});

	// ── ActivityPub Notes & Interactions ────────────────────────────────────

	describe("ActivityPub Notes, Interactions & Replies", () => {
		const noteId = "https://tunecamp.net/ap/notes/123";

		test("createApNote and getApNote", () => {
			db.createApNote(artistId, noteId, "post", 1, "post-slug", "Post Title");

			const note = db.getApNote(noteId);
			expect(note).toBeDefined();
			expect(note.note_id).toBe(noteId);
			expect(note.artist_id).toBe(artistId);
			expect(note.likes_count).toBe(0);
			expect(note.replies_count).toBe(0);
		});

		test("addApInteraction (like) increments likes_count, removeApInteraction decrements", () => {
			const actorUri = "https://mastodon.social/users/alice";
			const added = db.addApInteraction(noteId, actorUri, "like", "https://mastodon.social/activities/1");
			expect(added).toBe(true);

			let note = db.getApNote(noteId);
			expect(note.likes_count).toBe(1);

			const interactions = db.getApInteractions(noteId);
			expect(interactions).toHaveLength(1);
			expect(interactions[0].actor_uri).toBe(actorUri);

			const removed = db.removeApInteraction(noteId, actorUri, "like");
			expect(removed).toBe(true);

			note = db.getApNote(noteId);
			expect(note.likes_count).toBe(0);
		});

		test("addApReply increments replies_count, deleteApReply decrements", () => {
			const replyUri = "https://mastodon.social/notes/reply-1";
			const actorUri = "https://mastodon.social/users/bob";

			const added = db.addApReply(noteId, replyUri, actorUri, "Awesome song!", new Date().toISOString());
			expect(added).toBe(true);

			let note = db.getApNote(noteId);
			expect(note.replies_count).toBe(1);

			const replies = db.getApReplies(noteId);
			expect(replies).toHaveLength(1);
			expect(replies[0].content).toBe("Awesome song!");

			const deleted = db.deleteApReply(replyUri);
			expect(deleted).toBe(true);

			note = db.getApNote(noteId);
			expect(note.replies_count).toBe(0);
		});

		test("markApNoteDeleted hides note from getApNotes", () => {
			db.markApNoteDeleted(noteId);
			const activeNotes = db.getApNotes(artistId);
			expect(activeNotes.some((n: any) => n.note_id === noteId)).toBe(false);

			const allNotes = db.getApNotes(artistId, true);
			expect(allNotes.some((n: any) => n.note_id === noteId)).toBe(true);
		});
	});
});
