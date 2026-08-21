import express from "express";
import request from "supertest";
import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { createSamplePacksRoutes } from "../sample-packs.js";
import { UserRole } from "../../../common/visibility.js";

describe("Sample Packs Routes", () => {
	let app: express.Express;

	// Mock repositories and services
	const mockSamplePacksRepo = {
		list: jest.fn(),
		getById: jest.fn(),
		create: jest.fn(),
		update: jest.fn(),
		delete: jest.fn(),
		setModeration: jest.fn(),
	};

	const mockSamplesRepo = {
		list: jest.fn(),
		create: jest.fn(),
		delete: jest.fn(),
	};

	const mockStorage = {
		ensureDir: jest.fn().mockImplementation(async () => {}),
		move: jest.fn().mockImplementation(async () => {}),
		remove: jest.fn().mockImplementation(async () => {}),
	};

	const mockIdentity = {
		getSetting: jest.fn().mockReturnValue("false"),
	};

	let currentUser: any = null;

	const mockAuthMiddleware = {
		requireUser: (req: any, res: any, next: any) => {
			if (!currentUser) {
				return res.status(401).json({ error: "Authentication required" });
			}
			req.userId = currentUser.id;
			req.username = currentUser.username;
			req.role = currentUser.role;
			req.artistId = currentUser.artistId;
			req.isAdmin = currentUser.role === "admin" || currentUser.role === "root_admin";
			req.isRootAdmin = currentUser.role === "root_admin";
			req.context = {
				userId: currentUser.id,
				username: currentUser.username,
				role: currentUser.role as UserRole,
				artistId: currentUser.artistId,
			};
			next();
		},
		optionalAuth: (req: any, _res: any, next: any) => {
			if (currentUser) {
				req.userId = currentUser.id;
				req.username = currentUser.username;
				req.role = currentUser.role;
				req.artistId = currentUser.artistId;
				req.isAdmin = currentUser.role === "admin" || currentUser.role === "root_admin";
				req.isRootAdmin = currentUser.role === "root_admin";
				req.context = {
					userId: currentUser.id,
					username: currentUser.username,
					role: currentUser.role as UserRole,
					artistId: currentUser.artistId,
				};
			}
			next();
		},
	};

	const mockContainer: any = {
		samplePacksRepository: mockSamplePacksRepo,
		samplesRepository: mockSamplesRepo,
		musicDir: "/tmp/music",
		storage: mockStorage,
		authMiddleware: mockAuthMiddleware,
		identity: mockIdentity,
	};

	beforeEach(() => {
		jest.clearAllMocks();
		currentUser = null;
		app = express();
		app.use(express.json());
		// Attach context middleware
		app.use((req: any, _res: any, next: any) => {
			if (currentUser) {
				req.userId = currentUser.id;
				req.username = currentUser.username;
				req.role = currentUser.role;
				req.artistId = currentUser.artistId;
				req.isAdmin = currentUser.role === "admin" || currentUser.role === "root_admin";
				req.isRootAdmin = currentUser.role === "root_admin";
				req.context = {
					userId: currentUser.id,
					username: currentUser.username,
					role: currentUser.role as UserRole,
					artistId: currentUser.artistId,
				};
			}
			next();
		});
		app.use("/api/sample-packs", createSamplePacksRoutes(mockContainer));
	});

	// ── GET /api/sample-packs ───────────────────────────────────────────────

	describe("GET /api/sample-packs", () => {
		test("lists approved sample packs for public requests", async () => {
			mockSamplePacksRepo.list.mockReturnValue([
				{ id: 1, title: "Drums Vol 1", status: "approved" },
			]);

			const res = await request(app).get("/api/sample-packs");
			expect(res.status).toBe(200);
			expect(res.body).toHaveLength(1);
			expect(mockSamplePacksRepo.list).toHaveBeenCalledWith(
				expect.objectContaining({ status: "approved" }),
			);
		});

		test("supports search, limit, and offset query parameters", async () => {
			mockSamplePacksRepo.list.mockReturnValue([]);

			await request(app).get("/api/sample-packs?q=synth&limit=10&offset=20");
			expect(mockSamplePacksRepo.list).toHaveBeenCalledWith({
				status: "approved",
				search: "synth",
				limit: 10,
				offset: 20,
			});
		});

		test("GET with ?mine=true returns user packs when authenticated", async () => {
			currentUser = { id: 5, username: "producer", role: UserRole.NORMAL_USER, artistId: 2 };
			mockSamplePacksRepo.list.mockReturnValue([
				{ id: 10, title: "My Pack", ownerId: 5 },
			]);

			const res = await request(app).get("/api/sample-packs?mine=true");
			expect(res.status).toBe(200);
			expect(mockSamplePacksRepo.list).toHaveBeenCalledWith(
				expect.objectContaining({ ownerId: 5 }),
			);
		});

		test("GET with ?mine=true rejects unauthenticated requests with 403", async () => {
			currentUser = null;
			const res = await request(app).get("/api/sample-packs?mine=true");
			expect(res.status).toBe(403);
		});
	});

	// ── Moderation pending ──────────────────────────────────────────────────

	describe("GET /api/sample-packs/moderation/pending", () => {
		test("forbids regular users from viewing pending packs", async () => {
			currentUser = { id: 2, username: "user", role: UserRole.NORMAL_USER };
			const res = await request(app).get("/api/sample-packs/moderation/pending");
			expect(res.status).toBe(403);
		});

		test("allows admin to view pending packs", async () => {
			currentUser = { id: 1, username: "admin", role: UserRole.ADMIN };
			mockSamplePacksRepo.list.mockReturnValue([
				{ id: 2, title: "Pending Pack", status: "pending" },
			]);

			const res = await request(app).get("/api/sample-packs/moderation/pending");
			expect(res.status).toBe(200);
			expect(mockSamplePacksRepo.list).toHaveBeenCalledWith({ status: "pending" });
		});
	});

	// ── GET /api/sample-packs/:id ───────────────────────────────────────────

	describe("GET /api/sample-packs/:id", () => {
		test("returns 404 for unknown pack", async () => {
			mockSamplePacksRepo.getById.mockReturnValue(null);
			const res = await request(app).get("/api/sample-packs/999");
			expect(res.status).toBe(404);
		});

		test("returns approved pack with its approved samples", async () => {
			mockSamplePacksRepo.getById.mockReturnValue({
				id: 1,
				title: "Approved Pack",
				status: "approved",
				ownerId: 10,
				artistId: 2,
			});
			mockSamplesRepo.list.mockReturnValue([
				{ id: 101, title: "Kick", packId: 1, status: "approved" },
			]);

			const res = await request(app).get("/api/sample-packs/1");
			expect(res.status).toBe(200);
			expect(res.body.title).toBe("Approved Pack");
			expect(res.body.samples).toHaveLength(1);
		});

		test("denies unapproved pack to anonymous users", async () => {
			currentUser = null;
			mockSamplePacksRepo.getById.mockReturnValue({
				id: 2,
				title: "Pending Pack",
				status: "pending",
				ownerId: 5,
				artistId: 3,
			});

			const res = await request(app).get("/api/sample-packs/2");
			expect(res.status).toBe(403);
		});

		test("allows owner to view their own pending pack", async () => {
			currentUser = { id: 5, username: "owner", role: UserRole.NORMAL_USER, artistId: 3 };
			mockSamplePacksRepo.getById.mockReturnValue({
				id: 2,
				title: "Pending Pack",
				status: "pending",
				ownerId: 5,
				artistId: 3,
			});
			mockSamplesRepo.list.mockReturnValue([]);

			const res = await request(app).get("/api/sample-packs/2");
			expect(res.status).toBe(200);
		});
	});

	// ── PUT /api/sample-packs/:id ───────────────────────────────────────────

	describe("PUT /api/sample-packs/:id", () => {
		test("requires authentication", async () => {
			currentUser = null;
			const res = await request(app).put("/api/sample-packs/1").send({ title: "New" });
			expect(res.status).toBe(401);
		});

		test("forbids non-owner from updating pack", async () => {
			currentUser = { id: 99, username: "stranger", role: UserRole.NORMAL_USER };
			mockSamplePacksRepo.getById.mockReturnValue({
				id: 1,
				title: "Pack",
				ownerId: 5,
				artistId: 2,
			});

			const res = await request(app).put("/api/sample-packs/1").send({ title: "Hacked" });
			expect(res.status).toBe(403);
		});

		test("allows owner to update metadata", async () => {
			currentUser = { id: 5, username: "owner", role: UserRole.NORMAL_USER, artistId: 2 };
			mockSamplePacksRepo.getById.mockReturnValue({
				id: 1,
				title: "Old Title",
				ownerId: 5,
				artistId: 2,
			});
			mockSamplePacksRepo.update.mockReturnValue({
				id: 1,
				title: "Updated Title",
				description: "New desc",
			});

			const res = await request(app)
				.put("/api/sample-packs/1")
				.send({ title: "Updated Title", description: "New desc" });

			expect(res.status).toBe(200);
			expect(mockSamplePacksRepo.update).toHaveBeenCalledWith(1, {
				title: "Updated Title",
				description: "New desc",
			});
		});
	});

	// ── DELETE /api/sample-packs/:id ────────────────────────────────────────

	describe("DELETE /api/sample-packs/:id", () => {
		test("requires authentication", async () => {
			currentUser = null;
			const res = await request(app).delete("/api/sample-packs/1");
			expect(res.status).toBe(401);
		});

		test("deletes pack and cascade removes sample files", async () => {
			currentUser = { id: 5, username: "owner", role: UserRole.NORMAL_USER, artistId: 2 };
			mockSamplePacksRepo.getById.mockReturnValue({
				id: 1,
				title: "To Delete",
				ownerId: 5,
				artistId: 2,
			});
			mockSamplesRepo.list.mockReturnValue([
				{ id: 10, filePath: "samples/sample1.wav" },
				{ id: 11, filePath: "samples/sample2.wav" },
			]);

			const res = await request(app).delete("/api/sample-packs/1");
			expect(res.status).toBe(204);
			expect(mockSamplesRepo.delete).toHaveBeenCalledTimes(2);
			expect(mockSamplePacksRepo.delete).toHaveBeenCalledWith(1);
		});
	});

	// ── Moderation: Approve & Reject ────────────────────────────────────────

	describe("POST /api/sample-packs/:id/approve & /reject", () => {
		test("regular user cannot approve pack", async () => {
			currentUser = { id: 2, username: "user", role: UserRole.NORMAL_USER };
			const res = await request(app).post("/api/sample-packs/1/approve");
			expect(res.status).toBe(403);
		});

		test("admin can approve pack", async () => {
			currentUser = { id: 1, username: "admin", role: UserRole.ADMIN };
			mockSamplePacksRepo.setModeration.mockReturnValue({
				id: 1,
				status: "approved",
			});

			const res = await request(app)
				.post("/api/sample-packs/1/approve")
				.send({ notes: "Looks great" });

			expect(res.status).toBe(200);
			expect(mockSamplePacksRepo.setModeration).toHaveBeenCalledWith(1, "approved", "Looks great");
		});

		test("admin can reject pack", async () => {
			currentUser = { id: 1, username: "admin", role: UserRole.ADMIN };
			mockSamplePacksRepo.setModeration.mockReturnValue({
				id: 1,
				status: "rejected",
			});

			const res = await request(app)
				.post("/api/sample-packs/1/reject")
				.send({ notes: "Audio quality issue" });

			expect(res.status).toBe(200);
			expect(mockSamplePacksRepo.setModeration).toHaveBeenCalledWith(1, "rejected", "Audio quality issue");
		});
	});

	// ── GET /api/sample-packs/:id/cover ─────────────────────────────────────

	describe("GET /api/sample-packs/:id/cover", () => {
		test("returns 404 if pack not found", async () => {
			mockSamplePacksRepo.getById.mockReturnValue(null);
			const res = await request(app).get("/api/sample-packs/999/cover");
			expect(res.status).toBe(404);
		});

		test("returns SVG placeholder if pack has no custom cover", async () => {
			mockSamplePacksRepo.getById.mockReturnValue({
				id: 1,
				title: "No Cover Pack",
				coverPath: null,
			});

			const res = await request(app).get("/api/sample-packs/1/cover");
			expect(res.status).toBe(200);
			expect(res.headers["content-type"]).toContain("image/svg+xml");
		});
	});
});
