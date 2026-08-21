import express from "express";
import request from "supertest";
import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { createLifecycleRoutes } from "../lifecycle.js";

describe("Lifecycle Routes", () => {
	let app: express.Express;

	const mockLifecycleService = {
		requestPromotion: jest.fn(),
		approvePromotion: jest.fn(),
		finalizeRelease: jest.fn(),
		rejectPromotion: jest.fn(),
	};

	let autoPublish = false;
	const mockIdentity = {
		getSetting: jest.fn().mockImplementation((k: string) => k === "listenerSelfPublish" ? String(autoPublish) : null),
	};

	let currentUser: any = null;

	const mockContainer: any = {
		lifecycleService: mockLifecycleService,
		identity: mockIdentity,
	};

	beforeEach(() => {
		jest.clearAllMocks();
		autoPublish = false;
		currentUser = { id: 1, artistId: 2, role: "user" };
		app = express();
		app.use((req: any, _res: any, next: any) => {
			if (currentUser) {
				req.userId = currentUser.id;
				req.artistId = currentUser.artistId;
				req.role = currentUser.role;
			}
			next();
		});
		app.use("/api/lifecycle", createLifecycleRoutes(mockContainer));
	});

	// ── POST /promote/:id ───────────────────────────────────────────────────

	describe("POST /api/lifecycle/promote/:id", () => {
		test("requests promotion when listenerSelfPublish is disabled", async () => {
			autoPublish = false;
			const res = await request(app).post("/api/lifecycle/promote/42");

			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
			expect(res.body.message).toContain("Awaiting Admin approval");
			expect(mockLifecycleService.requestPromotion).toHaveBeenCalledWith(
				42,
				{ userId: 1, artistId: 2, role: "user" },
				false,
			);
		});

		test("auto-publishes when listenerSelfPublish is enabled", async () => {
			autoPublish = true;
			const res = await request(app).post("/api/lifecycle/promote/42");

			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
			expect(res.body.message).toContain("published successfully");
			expect(mockLifecycleService.requestPromotion).toHaveBeenCalledWith(
				42,
				{ userId: 1, artistId: 2, role: "user" },
				true,
			);
		});
	});

	// ── POST /approve/:id ───────────────────────────────────────────────────

	describe("POST /api/lifecycle/approve/:id", () => {
		test("calls approvePromotion", async () => {
			currentUser = { id: 10, role: "admin" };
			const res = await request(app).post("/api/lifecycle/approve/42");

			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
			expect(mockLifecycleService.approvePromotion).toHaveBeenCalledWith(
				42,
				{ userId: 10, role: "admin" },
			);
		});
	});

	// ── POST /finalize/:id ──────────────────────────────────────────────────

	describe("POST /api/lifecycle/finalize/:id", () => {
		test("calls finalizeRelease", async () => {
			const res = await request(app).post("/api/lifecycle/finalize/42");

			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
			expect(mockLifecycleService.finalizeRelease).toHaveBeenCalledWith(
				42,
				{ userId: 1, artistId: 2, role: "user" },
			);
		});
	});

	// ── POST /reject/:id ────────────────────────────────────────────────────

	describe("POST /api/lifecycle/reject/:id", () => {
		test("calls rejectPromotion with reason", async () => {
			currentUser = { id: 10, role: "admin" };
			const res = await request(app)
				.post("/api/lifecycle/reject/42")
				.send({ reason: "Low bitrate" });

			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
			expect(mockLifecycleService.rejectPromotion).toHaveBeenCalledWith(
				42,
				"Low bitrate",
				{ userId: 10, role: "admin" },
			);
		});
	});
});
