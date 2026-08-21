import express from "express";
import request from "supertest";
import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { createRadioRoutes } from "../radio.js";
import { UserRole } from "../../../common/visibility.js";

describe("Radio Routes", () => {
	let app: express.Express;

	const mockRadioService = {
		getStatus: jest.fn(),
		start: jest.fn(),
		stop: jest.fn(),
	};

	let currentUser: any = null;

	const mockAuthMiddleware = {
		requireAdmin: (req: any, res: any, next: any) => {
			if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "root_admin")) {
				return res.status(403).json({ error: "Admin access required" });
			}
			req.userId = currentUser.id;
			req.username = currentUser.username;
			req.role = currentUser.role;
			next();
		},
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
		radioService: mockRadioService,
		authMiddleware: mockAuthMiddleware,
	};

	beforeEach(() => {
		jest.clearAllMocks();
		currentUser = null;
		app = express();
		app.use(express.json());
		app.use("/api/radio", createRadioRoutes(mockContainer));
		// Route starts with /start and /stop mounted on router, note /api/radio or /api/admin/radio
	});

	// ── GET /api/radio ──────────────────────────────────────────────────────

	describe("GET /api/radio", () => {
		test("returns active radio status", async () => {
			mockRadioService.getStatus.mockReturnValue({
				active: true,
				name: "Synthwave 24/7",
				hlsUrl: "/api/radio/hls/stream.m3u8",
				listenerCount: 12,
				currentTrack: { title: "Nightcall", artist_name: "Kavinsky", id: 10 },
			});

			const res = await request(app).get("/api/radio");
			expect(res.status).toBe(200);
			expect(res.body.active).toBe(true);
			expect(res.body.name).toBe("Synthwave 24/7");
		});

		test("returns fallback object if radioService is unavailable", async () => {
			const appWithoutService = express();
			appWithoutService.use("/api/radio", createRadioRoutes({ authMiddleware: mockAuthMiddleware } as any));

			const res = await request(appWithoutService).get("/api/radio");
			expect(res.status).toBe(200);
			expect(res.body.active).toBe(false);
		});
	});

	// ── POST /start ─────────────────────────────────────────────────────────

	describe("POST /api/radio/start", () => {
		test("forbids non-admin users", async () => {
			currentUser = { id: 2, username: "user", role: UserRole.NORMAL_USER };
			const res = await request(app)
				.post("/api/radio/start")
				.send({ name: "My Station", playlistId: 1 });

			expect(res.status).toBe(403);
		});

		test("rejects missing radio name with 400", async () => {
			currentUser = { id: 1, username: "admin", role: UserRole.ADMIN };
			const res = await request(app)
				.post("/api/radio/start")
				.send({ playlistId: 1 });

			expect(res.status).toBe(400);
			expect(res.body.error).toContain("Radio name is required");
		});

		test("rejects request without track sources with 400", async () => {
			currentUser = { id: 1, username: "admin", role: UserRole.ADMIN };
			const res = await request(app)
				.post("/api/radio/start")
				.send({ name: "Empty Radio" });

			expect(res.status).toBe(400);
			expect(res.body.error).toContain("Provide at least one source");
		});

		test("starts radio successfully with playlist source", async () => {
			currentUser = { id: 1, username: "admin", role: UserRole.ADMIN };
			mockRadioService.getStatus.mockReturnValue({ active: true, name: "Chill Lounge" });

			const res = await request(app)
				.post("/api/radio/start")
				.send({ name: "Chill Lounge", playlistId: 5, shuffle: true });

			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
			expect(mockRadioService.start).toHaveBeenCalledWith({
				name: "Chill Lounge",
				playlistId: 5,
				trackIds: undefined,
				sources: undefined,
				shuffle: true,
			});
		});
	});

	// ── POST /stop ──────────────────────────────────────────────────────────

	describe("POST /api/radio/stop", () => {
		test("stops active radio when called by admin", async () => {
			currentUser = { id: 1, username: "admin", role: UserRole.ADMIN };
			const res = await request(app).post("/api/radio/stop");

			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
			expect(mockRadioService.stop).toHaveBeenCalled();
		});
	});

	// ── GET /stream.m3u ─────────────────────────────────────────────────────

	describe("GET /api/radio/stream.m3u", () => {
		test("returns 404 when radio is not active", async () => {
			mockRadioService.getStatus.mockReturnValue({ active: false });
			const res = await request(app).get("/api/radio/stream.m3u");
			expect(res.status).toBe(404);
		});

		test("returns M3U playlist format when radio is active", async () => {
			mockRadioService.getStatus.mockReturnValue({
				active: true,
				name: "Lo-Fi Beats",
				hlsUrl: "/api/radio/hls/stream.m3u8",
				currentTrack: { title: "Study Track", artist_name: "ChilledCow" },
			});

			const res = await request(app).get("/api/radio/stream.m3u");
			expect(res.status).toBe(200);
			expect(res.headers["content-type"]).toContain("audio/x-mpegurl");
			const content = res.text || res.body?.toString() || "";
			expect(content).toContain("#EXTM3U");
			expect(content).toContain("ChilledCow - Study Track");
		});
	});

	// ── GET /feed.rss ───────────────────────────────────────────────────────

	describe("GET /api/radio/feed.rss", () => {
		test("returns offline RSS feed when radio is inactive", async () => {
			mockRadioService.getStatus.mockReturnValue({ active: false });
			const res = await request(app).get("/api/radio/feed.rss");
			expect(res.status).toBe(200);
			expect(res.headers["content-type"]).toContain("application/rss+xml");
			expect(res.text).toContain("Radio is currently offline");
		});

		test("returns podcast RSS feed with HLS enclosure when active", async () => {
			mockRadioService.getStatus.mockReturnValue({
				active: true,
				name: "Indie Rock Live",
				hlsUrl: "/api/radio/hls/stream.m3u8",
				startedAt: new Date().toISOString(),
				currentTrack: { id: 42, title: "Reptilia", artist_name: "The Strokes" },
			});

			const res = await request(app).get("/api/radio/feed.rss");
			expect(res.status).toBe(200);
			expect(res.headers["content-type"]).toContain("application/rss+xml");
			expect(res.text).toContain("Indie Rock Live");
			expect(res.text).toContain("The Strokes — Reptilia");
		});
	});
});
