import express from "express";
import request from "supertest";
import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { createDigRoutes } from "../dig.js";
import { errorHandler } from "../../../middleware/error-handling.js";

describe("Dig Routes", () => {
	let app: express.Express;

	const mockDigService = {
		logHistory: jest.fn(),
		searchSource: jest.fn(),
		dig: jest.fn(),
		listSessions: jest.fn(),
		createSession: jest.fn(),
		deleteSession: jest.fn(),
		getCrate: jest.fn(),
		addToCrate: jest.fn(),
		removeFromCrate: jest.fn(),
		getHistory: jest.fn(),
	};

	let currentUser: any = null;

	const mockContainer: any = {
		digService: mockDigService,
	};

	beforeEach(() => {
		jest.clearAllMocks();
		currentUser = null;
		app = express();
		app.use(express.json());
		app.use((req: any, _res: any, next: any) => {
			if (currentUser) {
				req.userId = currentUser.id;
				req.username = currentUser.username;
			}
			next();
		});
		app.use("/api/dig", createDigRoutes(mockContainer));
		app.use(errorHandler);
	});

	// ── GET /api/dig/search ─────────────────────────────────────────────────

	describe("GET /api/dig/search", () => {
		test("requires authentication (403 when unauthenticated)", async () => {
			const res = await request(app).get("/api/dig/search?q=ambient");
			expect(res.status).toBe(403);
		});

		test("rejects empty query with 400", async () => {
			currentUser = { id: 1, username: "user" };
			const res = await request(app).get("/api/dig/search?q=");
			expect(res.status).toBe(400);
			expect(res.body.error).toContain("Missing query");
		});

		test("searches source and records search history", async () => {
			currentUser = { id: 1, username: "user" };
			mockDigService.searchSource.mockResolvedValue([
				{ title: "Ambient Works", artist: "Aphex Twin", url: "https://aphex.bandcamp.com/album/saw" },
			]);

			const res = await request(app).get("/api/dig/search?q=aphex&source=bandcamp");
			expect(res.status).toBe(200);
			expect(res.body).toHaveLength(1);
			expect(mockDigService.logHistory).toHaveBeenCalledWith(1, "aphex", "bandcamp");
			expect(mockDigService.searchSource).toHaveBeenCalledWith("aphex", "bandcamp");
		});
	});

	// ── POST /api/dig/run ───────────────────────────────────────────────────

	describe("POST /api/dig/run", () => {
		test("rejects missing releaseUrl with 400", async () => {
			currentUser = { id: 1, username: "user" };
			const res = await request(app).post("/api/dig/run").send({});
			expect(res.status).toBe(400);
			expect(res.body.error).toContain("Missing releaseUrl");
		});

		test("runs digging graph exploration", async () => {
			currentUser = { id: 1, username: "user" };
			mockDigService.dig.mockResolvedValue({
				seedRelease: { title: "Album 1" },
				recommendations: [{ title: "Rec 1" }],
			});

			const res = await request(app)
				.post("/api/dig/run")
				.send({ releaseUrl: "https://artist.bandcamp.com/album/1", strategy: "balanced" });

			expect(res.status).toBe(200);
			expect(res.body.recommendations).toHaveLength(1);
			expect(mockDigService.dig).toHaveBeenCalledWith(
				"https://artist.bandcamp.com/album/1",
				"balanced",
			);
		});
	});

	// ── Sessions CRUD ───────────────────────────────────────────────────────

	describe("Sessions management", () => {
		test("GET /api/dig/sessions lists user sessions", async () => {
			currentUser = { id: 1, username: "user" };
			mockDigService.listSessions.mockReturnValue([
				{ id: 10, name: "Friday Crate Dig", userId: 1 },
			]);

			const res = await request(app).get("/api/dig/sessions");
			expect(res.status).toBe(200);
			expect(res.body).toHaveLength(1);
		});

		test("POST /api/dig/sessions creates a new session", async () => {
			currentUser = { id: 1, username: "user" };
			mockDigService.createSession.mockReturnValue({ id: 11, name: "Techno Dig", userId: 1 });

			const res = await request(app)
				.post("/api/dig/sessions")
				.send({ name: "Techno Dig" });

			expect(res.status).toBe(201);
			expect(res.body.name).toBe("Techno Dig");
		});

		test("DELETE /api/dig/sessions/:id deletes session", async () => {
			currentUser = { id: 1, username: "user" };
			const res = await request(app).delete("/api/dig/sessions/10");
			expect(res.status).toBe(200);
			expect(mockDigService.deleteSession).toHaveBeenCalledWith(1, 10);
		});
	});

	// ── Crate Items ─────────────────────────────────────────────────────────

	describe("Crate items management", () => {
		test("GET /api/dig/sessions/:id/crate returns crate items", async () => {
			currentUser = { id: 1, username: "user" };
			mockDigService.getCrate.mockReturnValue([
				{ id: 100, title: "Deep Track", artist: "Unknown" },
			]);

			const res = await request(app).get("/api/dig/sessions/5/crate");
			expect(res.status).toBe(200);
			expect(res.body).toHaveLength(1);
		});

		test("POST /api/dig/sessions/:id/crate adds item to crate", async () => {
			currentUser = { id: 1, username: "user" };
			mockDigService.addToCrate.mockReturnValue({
				id: 101,
				sessionId: 5,
				sourceUrl: "https://bandcamp.com/track/1",
				title: "Cool Track",
			});

			const res = await request(app)
				.post("/api/dig/sessions/5/crate")
				.send({ sourceUrl: "https://bandcamp.com/track/1", title: "Cool Track" });

			expect(res.status).toBe(201);
			expect(res.body.id).toBe(101);
		});

		test("DELETE /api/dig/sessions/:id/crate/:itemId removes item", async () => {
			currentUser = { id: 1, username: "user" };
			const res = await request(app).delete("/api/dig/sessions/5/crate/101");
			expect(res.status).toBe(200);
			expect(mockDigService.removeFromCrate).toHaveBeenCalledWith(1, 5, 101);
		});
	});

	// ── History ─────────────────────────────────────────────────────────────

	describe("GET /api/dig/history", () => {
		test("returns user search history", async () => {
			currentUser = { id: 1, username: "user" };
			mockDigService.getHistory.mockReturnValue([
				{ id: 1, query: "synth", source: "bandcamp" },
			]);

			const res = await request(app).get("/api/dig/history");
			expect(res.status).toBe(200);
			expect(res.body).toHaveLength(1);
		});
	});
});
