import express from "express";
import request from "supertest";
import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import { createLabAppsRoutes } from "../lab-apps.js";
import { createDatabase } from "../../../core/database.js";
import { UserRole } from "../../../common/visibility.js";

describe("Lab Apps Routes", () => {
	let app: express.Express;
	let dbService: any;
	let logSpy: any;
	let warnSpy: any;
	let errorSpy: any;

	let currentUser: any = null;

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

	const mockAuthService: any = {
		getUserByUsername: jest.fn().mockImplementation((username: string) => {
			if (currentUser && currentUser.username === username) {
				return { ...currentUser, is_active: 1, token_version: 0 };
			}
			return undefined;
		}),
		verifyToken: jest.fn().mockImplementation((token: string) => {
			if (currentUser && token === "valid-token") {
				return {
					userId: currentUser.id,
					username: currentUser.username,
					role: currentUser.role,
					isRootAdmin: currentUser.role === "root_admin",
					isAdmin: currentUser.role === "admin" || currentUser.role === "root_admin",
					isActive: true,
				};
			}
			throw new Error("Invalid token");
		}),
	};

	beforeEach(() => {
		currentUser = null;
		app = express();
		app.use("/api/lab-apps", createLabAppsRoutes({
			database: dbService,
			authService: mockAuthService,
		} as any));
	});

	// ── Public GET / ────────────────────────────────────────────────────────

	describe("GET /api/lab-apps", () => {
		test("returns only enabled lab apps for public callers", async () => {
			const res = await request(app).get("/api/lab-apps");
			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBeGreaterThanOrEqual(1);
			expect(res.body.every((a: any) => a.enabled === true)).toBe(true);
		});
	});

	// ── Admin Endpoints ─────────────────────────────────────────────────────

	describe("Admin Lab Apps CRUD", () => {
		test("GET /all requires root admin (401/403 for unauthorized)", async () => {
			const res = await request(app).get("/api/lab-apps/all");
			expect([401, 403]).toContain(res.status);
		});

		test("GET /all returns all apps when authenticated as root admin", async () => {
			currentUser = { id: 1, username: "root", role: "root_admin" };
			const res = await request(app)
				.get("/api/lab-apps/all")
				.set("Authorization", "Bearer valid-token");

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
		});

		test("POST / creates a new lab app", async () => {
			currentUser = { id: 1, username: "root", role: "root_admin" };
			const res = await request(app)
				.post("/api/lab-apps")
				.set("Authorization", "Bearer valid-token")
				.send({
					name: "Synth Playground",
					description: "A fun web synth",
					src: "https://synth.example.com",
					category: "instruments",
					permissions: ["audio"],
				});

			expect(res.status).toBe(201);
			expect(res.body.name).toBe("Synth Playground");
			expect(res.body.src).toBe("https://synth.example.com");
			expect(res.body.permissions).toEqual(["audio"]);
		});

		test("POST / rejects missing name or src with 400", async () => {
			currentUser = { id: 1, username: "root", role: "root_admin" };
			const res = await request(app)
				.post("/api/lab-apps")
				.set("Authorization", "Bearer valid-token")
				.send({ description: "Missing name and src" });

			expect(res.status).toBe(400);
		});

		test("PUT /:id updates existing app", async () => {
			currentUser = { id: 1, username: "root", role: "root_admin" };

			// App 1 is seeded by database.ts
			const res = await request(app)
				.put("/api/lab-apps/1")
				.set("Authorization", "Bearer valid-token")
				.send({
					name: "4-Track Recorder Pro",
					src: "https://tunecamp-4-track-recorder.vercel.app",
					enabled: false,
				});

			expect(res.status).toBe(200);
			expect(res.body.name).toBe("4-Track Recorder Pro");
			expect(res.body.enabled).toBe(false);
		});

		test("DELETE /:id removes app", async () => {
			currentUser = { id: 1, username: "root", role: "root_admin" };
			const res = await request(app)
				.delete("/api/lab-apps/1")
				.set("Authorization", "Bearer valid-token");

			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
		});
	});
});
