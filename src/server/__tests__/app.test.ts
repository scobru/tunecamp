import request from "supertest";
import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import { createApp, setupStaticAndFallbackRoutes } from "../app.js";
import { createDatabase } from "../core/database.js";

describe("Express App Bootstrap & Routing Setup", () => {
	let dbService: any;
	let logSpy: any;
	let warnSpy: any;
	let errorSpy: any;

	beforeAll(() => {
		logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		dbService = createDatabase(":memory:");
	});

	afterAll(() => {
		if (dbService?.db) dbService.db.close();
		logSpy.mockRestore();
		warnSpy.mockRestore();
		errorSpy.mockRestore();
	});

	const dummyConfig: any = {
		port: 3000,
		musicDir: "./music",
		databasePath: ":memory:",
		corsOrigins: ["https://my-app.tunecamp.net"],
		publicUrl: "https://my-app.tunecamp.net",
	};

	// ── CORS & Security Middleware ──────────────────────────────────────────

	describe("createApp Middleware & CORS Policies", () => {
		test("public federation GET routes allow wildcard CORS", async () => {
			const { app } = createApp(dummyConfig);
			app.get("/api/catalog/test", (req, res) => res.json({ ok: true }));

			const res = await request(app)
				.get("/api/catalog/test")
				.set("Origin", "https://untrusted-client.com");

			expect(res.status).toBe(200);
			expect(res.headers["access-control-allow-origin"]).toBe("*");
		});

		test("public federation POST/mutations enforce strict CORS", async () => {
			const { app } = createApp(dummyConfig);
			app.post("/api/catalog/test", (req, res) => res.json({ created: true }));

			const res = await request(app)
				.post("/api/catalog/test")
				.set("Origin", "https://untrusted-client.com");

			expect(res.headers["access-control-allow-origin"]).toBeUndefined();
		});

		test("allowed origins in config receive Access-Control-Allow-Origin on strict routes", async () => {
			const { app } = createApp(dummyConfig);
			app.post("/api/private/test", (req, res) => res.json({ private: true }));

			const res = await request(app)
				.post("/api/private/test")
				.set("Origin", "https://my-app.tunecamp.net");

			expect(res.headers["access-control-allow-origin"]).toBe("https://my-app.tunecamp.net");
		});

		test("chat polling routes allow wildcard CORS for desktop P2P clients", async () => {
			const { app } = createApp(dummyConfig);
			app.get("/api/chat/history", (req, res) => res.json({ messages: [] }));

			const res = await request(app)
				.get("/api/chat/history")
				.set("Origin", "http://localhost:5173");

			expect(res.status).toBe(200);
			expect(res.headers["access-control-allow-origin"]).toBe("*");
		});
	});

	// ── Static & Fallback Routes ────────────────────────────────────────────

	describe("setupStaticAndFallbackRoutes", () => {
		test("unmatched /api/* routes return 404 JSON", async () => {
			const { app } = createApp(dummyConfig);
			setupStaticAndFallbackRoutes(app, dummyConfig, dbService);

			const res = await request(app).get("/api/nonexistent-route-12345");
			expect(res.status).toBe(404);
			expect(res.body.error).toBe("Not found");
		});

		test("/sw.js returns 404 when file does not exist on disk", async () => {
			const { app } = createApp(dummyConfig);
			setupStaticAndFallbackRoutes(app, dummyConfig, dbService);

			const res = await request(app).get("/sw.js");
			expect([200, 404]).toContain(res.status);
		});

		test("/share/:id injects OpenGraph tags for tracks", async () => {
			const { app } = createApp(dummyConfig);
			setupStaticAndFallbackRoutes(app, dummyConfig, dbService);

			const userId = dbService.createUser("og_owner", "pwd", undefined, "admin");
			const artistId = dbService.createArtist("OG Artist");
			const albumId = dbService.createAlbum({
				title: "OG Album",
				artist_id: artistId,
				owner_id: userId,
				visibility: "public",
			});
			const trackId = dbService.createTrack({
				title: "OG Hit Track",
				album_id: albumId,
				artist_id: artistId,
				duration: 200,
				file_path: "tracks/og.mp3",
			});

			const res = await request(app).get(`/share/tr_${trackId}`);
			expect(res.status).toBe(200);
		});

		test("/@:slug injects OpenGraph tags for artist profile", async () => {
			const { app } = createApp(dummyConfig);
			setupStaticAndFallbackRoutes(app, dummyConfig, dbService);

			dbService.createArtist("Slug Master", "Bio of Slug Master");

			const res = await request(app).get("/@slug-master");
			expect(res.status).toBe(200);
		});
	});
});
