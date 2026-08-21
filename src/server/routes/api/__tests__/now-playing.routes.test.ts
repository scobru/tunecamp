import express from "express";
import request from "supertest";
import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { createNowPlayingRoutes } from "../now-playing.js";
import { UserRole } from "../../../common/visibility.js";

describe("Now Playing Routes", () => {
	let app: express.Express;

	let optInMap: Record<number, boolean> = {};
	let currentUser: any = null;

	const mockAuthService = {
		getNowPlayingEnabled: jest.fn().mockImplementation((uid: number) => !!optInMap[uid]),
		setNowPlayingEnabled: jest.fn().mockImplementation((uid: number, val: boolean) => {
			optInMap[uid] = val;
		}),
		getUserProfile: jest.fn().mockImplementation((username: string) => ({
			alias: `${username}_alias`,
			avatar: "/avatars/user.png",
		})),
	};

	const mockLibrary = {
		isPublicReleaseTrack: jest.fn().mockImplementation((tid: number) => tid === 10),
	};

	const mockDatabase = {
		getSetting: jest.fn().mockReturnValue("https://instance.tunecamp.net"),
	};

	const mockAuthMiddleware = {
		requireUser: (req: any, res: any, next: any) => {
			if (!currentUser) {
				return res.status(401).json({ error: "Authentication required" });
			}
			req.userId = currentUser.id;
			req.username = currentUser.username;
			req.role = currentUser.role;
			next();
		},
	};

	const mockContainer: any = {
		authMiddleware: mockAuthMiddleware,
		authService: mockAuthService,
		library: mockLibrary,
		database: mockDatabase,
		config: { publicUrl: "https://instance.tunecamp.net", siteName: "TuneCamp" },
	};

	beforeEach(() => {
		jest.clearAllMocks();
		optInMap = {};
		currentUser = null;
		app = express();
		app.use("/api/now-playing", createNowPlayingRoutes(mockContainer));
	});

	// ── Preferences ─────────────────────────────────────────────────────────

	describe("GET & PUT /api/now-playing/preference", () => {
		test("requires authentication for preference check", async () => {
			const res = await request(app).get("/api/now-playing/preference");
			expect(res.status).toBe(401);
		});

		test("GET /preference returns default false", async () => {
			currentUser = { id: 1, username: "alice", role: UserRole.NORMAL_USER };
			const res = await request(app).get("/api/now-playing/preference");
			expect(res.status).toBe(200);
			expect(res.body.enabled).toBe(false);
		});

		test("PUT /preference updates opt-in flag", async () => {
			currentUser = { id: 1, username: "alice", role: UserRole.NORMAL_USER };
			const res = await request(app)
				.put("/api/now-playing/preference")
				.send({ enabled: true });

			expect(res.status).toBe(200);
			expect(res.body.enabled).toBe(true);
			expect(optInMap[1]).toBe(true);
		});

		test("PUT /preference rejects non-boolean with 400", async () => {
			currentUser = { id: 1, username: "alice", role: UserRole.NORMAL_USER };
			const res = await request(app)
				.put("/api/now-playing/preference")
				.send({ enabled: "yes" });

			expect(res.status).toBe(400);
		});
	});

	// ── Heartbeat & Listeners ───────────────────────────────────────────────

	describe("POST & GET /api/now-playing", () => {
		test("POST / returns recorded=false if user is not opted-in", async () => {
			currentUser = { id: 2, username: "bob", role: UserRole.NORMAL_USER };
			const res = await request(app)
				.post("/api/now-playing")
				.send({ trackId: 10, title: "Nightcall", artist: "Kavinsky" });

			expect(res.status).toBe(200);
			expect(res.body.recorded).toBe(false);
		});

		test("POST / records track when opted-in and GET / lists active listener", async () => {
			currentUser = { id: 1, username: "alice", role: UserRole.NORMAL_USER };
			optInMap[1] = true;

			// Post listening status
			const postRes = await request(app)
				.post("/api/now-playing")
				.send({ trackId: 10, title: "Nightcall", artist: "Kavinsky" });

			expect(postRes.status).toBe(200);
			expect(postRes.body.recorded).toBe(true);

			// Member list
			const getRes = await request(app).get("/api/now-playing");
			expect(getRes.status).toBe(200);
			expect(getRes.body.listeners).toHaveLength(1);
			expect(getRes.body.listeners[0].username).toBe("alice");
			expect(getRes.body.listeners[0].title).toBe("Nightcall");
		});

		test("GET /public only surfaces public release tracks", async () => {
			currentUser = { id: 1, username: "alice", role: UserRole.NORMAL_USER };
			optInMap[1] = true;

			// Private track (id != 10)
			await request(app)
				.post("/api/now-playing")
				.send({ trackId: 999, title: "Secret Unreleased", artist: "Alice" });

			const publicRes = await request(app).get("/api/now-playing/public");
			expect(publicRes.status).toBe(200);
			expect(publicRes.body.listeners).toHaveLength(0); // Filtered out

			// Public release track (id === 10)
			await request(app)
				.post("/api/now-playing")
				.send({ trackId: 10, title: "Public Hit", artist: "Alice" });

			const publicRes2 = await request(app).get("/api/now-playing/public");
			expect(publicRes2.status).toBe(200);
			expect(publicRes2.body.listeners).toHaveLength(1);
			expect(publicRes2.body.listeners[0].title).toBe("Public Hit");
		});
	});
});
