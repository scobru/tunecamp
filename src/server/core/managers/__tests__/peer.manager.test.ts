import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import { createDatabase } from "../../database.js";

describe("Peer Manager", () => {
	let db: any;
	let logSpy: any;
	let warnSpy: any;
	let errorSpy: any;

	let peerUserId: number;

	beforeAll(() => {
		logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		db = createDatabase(":memory:");

		peerUserId = db.createUser("peer_user", "hashPeer", null, "user");
	});

	afterAll(() => {
		if (db?.db) db.db.close();
		logSpy.mockRestore();
		warnSpy.mockRestore();
		errorSpy.mockRestore();
	});

	// ── Peer Sessions ───────────────────────────────────────────────────────

	describe("Peer Sessions", () => {
		test("createPeerSession and getPeerSession", () => {
			const sessionId = "sess-12345";
			db.createPeerSession(sessionId, peerUserId, "192.168.1.50", true);

			const session = db.getPeerSession(sessionId);
			expect(session).toBeDefined();
			expect(session.id).toBe(sessionId);
			expect(session.user_id).toBe(peerUserId);
			expect(session.ip_address).toBe("192.168.1.50");
			expect(session.allow_downloads).toBe(true);
			expect(session.username).toBe("peer_user");
		});

		test("updatePeerSessionHeartbeat updates last_seen", () => {
			const sessionId = "sess-heartbeat";
			db.createPeerSession(sessionId, peerUserId, null, false);

			const before = db.getPeerSession(sessionId).last_seen;
			// Manually simulate time passing
			db.db.prepare("UPDATE peer_sessions SET last_seen = ? WHERE id = ?").run(before - 10000, sessionId);

			db.updatePeerSessionHeartbeat(sessionId);
			const after = db.getPeerSession(sessionId).last_seen;
			expect(after).toBeGreaterThan(before - 10000);
		});

		test("getActivePeerSessions filters by staleThresholdMs", () => {
			const activeSess = "sess-active";
			const staleSess = "sess-stale";

			db.createPeerSession(activeSess, peerUserId, null, true);
			db.createPeerSession(staleSess, peerUserId, null, true);

			// Make staleSess 1 hour old
			db.db.prepare("UPDATE peer_sessions SET last_seen = ? WHERE id = ?").run(Date.now() - 3600000, staleSess);

			const freshOnly = db.getActivePeerSessions(60000); // 1 minute threshold
			expect(freshOnly.some((s: any) => s.id === activeSess)).toBe(true);
			expect(freshOnly.some((s: any) => s.id === staleSess)).toBe(false);
		});

		test("deletePeerSession removes session and its tracks", () => {
			const sessionId = "sess-del";
			db.createPeerSession(sessionId, peerUserId, null, true);
			db.replacePeerTracks(sessionId, [
				{ id: "track-1", title: "Shared Track" },
			]);

			expect(db.getPeerSession(sessionId)).toBeDefined();
			expect(db.getTracksByPeerSession(sessionId)).toHaveLength(1);

			db.deletePeerSession(sessionId);
			expect(db.getPeerSession(sessionId)).toBeUndefined();
			expect(db.getTracksByPeerSession(sessionId)).toHaveLength(0);
		});

		test("deleteStaleSessions removes older sessions", () => {
			const oldSession = "sess-very-old";
			db.createPeerSession(oldSession, peerUserId, null, true);
			db.db.prepare("UPDATE peer_sessions SET last_seen = ? WHERE id = ?").run(Date.now() - 1000000, oldSession);

			db.deleteStaleSessions(500000);
			expect(db.getPeerSession(oldSession)).toBeUndefined();
		});
	});

	// ── Peer Tracks ─────────────────────────────────────────────────────────

	describe("Peer Tracks", () => {
		const sessionId = "sess-tracks";

		beforeEach(() => {
			db.createPeerSession(sessionId, peerUserId, "10.0.0.1", true);
		});

		test("replacePeerTracks stores tracks for a session", () => {
			const tracks = [
				{ id: "t1", title: "Ambient Morning", artist: "Brian", album: "Music for Airports", duration: 300, allow_download: true },
				{ id: "t2", title: "Techno Night", artist: "Carl", album: "Live 98", duration: 420, allow_download: false },
			];

			db.replacePeerTracks(sessionId, tracks);

			const saved = db.getTracksByPeerSession(sessionId);
			expect(saved).toHaveLength(2);

			const t1 = db.getPeerTrack(sessionId, "t1");
			expect(t1).toBeDefined();
			expect(t1.title).toBe("Ambient Morning");
			expect(t1.artist).toBe("Brian");
			expect(t1.allow_download).toBe(true);
		});

		test("searchPeerTracks finds tracks by title, artist, or album", () => {
			db.replacePeerTracks(sessionId, [
				{ id: "s1", title: "Unique Track Name", artist: "Unknown Artist", album: "Some Album" },
				{ id: "s2", title: "Another Track", artist: "Unique Artist Name", album: "Another Album" },
			]);

			const titleMatches = db.searchPeerTracks("Unique Track");
			expect(titleMatches.some((t: any) => t.id === "s1")).toBe(true);

			const artistMatches = db.searchPeerTracks("Unique Artist");
			expect(artistMatches.some((t: any) => t.id === "s2")).toBe(true);
		});

		test("getTracksByPeerSessions handles multiple session IDs and empty array", () => {
			expect(db.getTracksByPeerSessions([])).toEqual([]);

			const sess2 = "sess-tracks-2";
			db.createPeerSession(sess2, peerUserId, null, true);
			db.replacePeerTracks(sess2, [{ id: "t3", title: "Sess 2 Track" }]);

			const combined = db.getTracksByPeerSessions([sessionId, sess2]);
			expect(combined.length).toBeGreaterThanOrEqual(1);
			expect(combined.some((t: any) => t.id === "t3")).toBe(true);
		});
	});
});
