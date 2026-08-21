import express from "express";
import request from "supertest";
import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { createCollabRoutes } from "../collab.js";
import { UserRole } from "../../../common/visibility.js";

describe("Collab Routes", () => {
	let app: express.Express;

	const mockCollabRepo = {
		list: jest.fn(),
		getById: jest.fn(),
		create: jest.fn(),
		delete: jest.fn(),
		listVersions: jest.fn(),
		createVersion: jest.fn(),
		listStems: jest.fn(),
		createStem: jest.fn(),
	};

	const mockStorage = {
		ensureDir: jest.fn().mockImplementation(async () => {}),
		move: jest.fn().mockImplementation(async () => {}),
		remove: jest.fn().mockImplementation(async () => {}),
	};

	let currentUser: any = null;

	const mockContainer: any = {
		collabRepository: mockCollabRepo,
		musicDir: "/tmp/music",
		storage: mockStorage,
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
				req.role = currentUser.role;
				req.artistId = currentUser.artistId;
				req.context = {
					userId: currentUser.id,
					username: currentUser.username,
					role: currentUser.role as UserRole,
					artistId: currentUser.artistId,
				};
			}
			next();
		});
		app.use("/api/collab", createCollabRoutes(mockContainer));
	});

	// ── GET /api/collab ─────────────────────────────────────────────────────

	describe("GET /api/collab", () => {
		test("returns shared projects by default", async () => {
			mockCollabRepo.list.mockReturnValue([
				{ id: 1, title: "Shared Jam", visibility: "shared" },
			]);

			const res = await request(app).get("/api/collab");
			expect(res.status).toBe(200);
			expect(res.body).toHaveLength(1);
			expect(mockCollabRepo.list).toHaveBeenCalledWith({ visibility: "shared" });
		});

		test("returns mine projects when ?mine=true and authenticated", async () => {
			currentUser = { id: 7, username: "musician", role: UserRole.NORMAL_USER, artistId: 3 };
			mockCollabRepo.list.mockReturnValue([
				{ id: 2, title: "My Private Jam", ownerId: 7 },
			]);

			const res = await request(app).get("/api/collab?mine=true");
			expect(res.status).toBe(200);
			expect(mockCollabRepo.list).toHaveBeenCalledWith({ ownerId: 7 });
		});
	});

	// ── GET /api/collab/:id ─────────────────────────────────────────────────

	describe("GET /api/collab/:id", () => {
		test("returns 404 for non-existent project", async () => {
			mockCollabRepo.getById.mockReturnValue(null);
			const res = await request(app).get("/api/collab/999");
			expect(res.status).toBe(404);
		});

		test("returns shared project with versions and stems", async () => {
			mockCollabRepo.getById.mockReturnValue({
				id: 1,
				title: "Shared Track",
				visibility: "shared",
				ownerId: 5,
			});
			mockCollabRepo.listVersions.mockReturnValue([
				{ id: 10, version: 1, note: "Initial draft" },
			]);
			mockCollabRepo.listStems.mockReturnValue([
				{ id: 100, name: "Bassline.wav" },
			]);

			const res = await request(app).get("/api/collab/1");
			expect(res.status).toBe(200);
			expect(res.body.title).toBe("Shared Track");
			expect(res.body.versions).toHaveLength(1);
			expect(res.body.stems).toHaveLength(1);
		});

		test("forbids private project to non-owners", async () => {
			currentUser = { id: 99, username: "other", role: UserRole.NORMAL_USER };
			mockCollabRepo.getById.mockReturnValue({
				id: 2,
				title: "Secret Track",
				visibility: "private",
				ownerId: 5,
			});

			const res = await request(app).get("/api/collab/2");
			expect(res.status).toBe(403);
		});

		test("allows owner to view their private project", async () => {
			currentUser = { id: 5, username: "owner", role: UserRole.NORMAL_USER, artistId: 1 };
			mockCollabRepo.getById.mockReturnValue({
				id: 2,
				title: "Secret Track",
				visibility: "private",
				ownerId: 5,
			});
			mockCollabRepo.listVersions.mockReturnValue([]);
			mockCollabRepo.listStems.mockReturnValue([]);

			const res = await request(app).get("/api/collab/2");
			expect(res.status).toBe(200);
		});
	});

	// ── POST /api/collab ────────────────────────────────────────────────────

	describe("POST /api/collab", () => {
		test("requires publishing capability (artist profile or admin)", async () => {
			// Normal listener without artistId cannot publish
			currentUser = { id: 2, username: "listener", role: UserRole.NORMAL_USER };
			const res = await request(app)
				.post("/api/collab")
				.send({ title: "New Collab" });
			expect(res.status).toBe(403);
		});

		test("rejects missing title with 400", async () => {
			currentUser = { id: 1, username: "artist", role: UserRole.NORMAL_USER, artistId: 10 };
			const res = await request(app)
				.post("/api/collab")
				.send({ description: "No title provided" });
			expect(res.status).toBe(400);
		});

		test("creates project with valid data", async () => {
			currentUser = { id: 1, username: "artist", role: UserRole.NORMAL_USER, artistId: 10 };
			mockCollabRepo.create.mockReturnValue({
				id: 5,
				title: "Awesome Collab",
				ownerId: 1,
				description: "A fun track",
			});

			const res = await request(app)
				.post("/api/collab")
				.send({ title: "Awesome Collab", description: "A fun track" });

			expect(res.status).toBe(201);
			expect(res.body.id).toBe(5);
			expect(mockCollabRepo.create).toHaveBeenCalledWith({
				title: "Awesome Collab",
				description: "A fun track",
				ownerId: 1,
			});
		});
	});

	// ── DELETE /api/collab/:id ──────────────────────────────────────────────

	describe("DELETE /api/collab/:id", () => {
		test("returns 404 for unknown project", async () => {
			currentUser = { id: 1, username: "admin", role: UserRole.ADMIN };
			mockCollabRepo.getById.mockReturnValue(null);
			const res = await request(app).delete("/api/collab/999");
			expect(res.status).toBe(404);
		});

		test("forbids non-owner from deleting project", async () => {
			currentUser = { id: 2, username: "other", role: UserRole.NORMAL_USER };
			mockCollabRepo.getById.mockReturnValue({
				id: 5,
				ownerId: 1,
			});

			const res = await request(app).delete("/api/collab/5");
			expect(res.status).toBe(403);
		});

		test("allows owner to delete project and removes stems files", async () => {
			currentUser = { id: 1, username: "owner", role: UserRole.NORMAL_USER, artistId: 1 };
			mockCollabRepo.getById.mockReturnValue({
				id: 5,
				ownerId: 1,
			});
			mockCollabRepo.listStems.mockReturnValue([
				{ id: 1, filePath: "collab/5/stem1.wav" },
			]);

			const res = await request(app).delete("/api/collab/5");
			expect(res.status).toBe(204);
			expect(mockCollabRepo.delete).toHaveBeenCalledWith(5);
		});
	});

	// ── POST /api/collab/:id/versions ───────────────────────────────────────

	describe("POST /api/collab/:id/versions", () => {
		test("rejects missing state with 400", async () => {
			currentUser = { id: 1, username: "artist", role: UserRole.NORMAL_USER, artistId: 1 };
			mockCollabRepo.getById.mockReturnValue({
				id: 5,
				visibility: "shared",
				ownerId: 1,
			});

			const res = await request(app)
				.post("/api/collab/5/versions")
				.send({ note: "Missing state" });
			expect(res.status).toBe(400);
		});

		test("creates version for shared project", async () => {
			currentUser = { id: 1, username: "artist", role: UserRole.NORMAL_USER, artistId: 1 };
			mockCollabRepo.getById.mockReturnValue({
				id: 5,
				visibility: "shared",
				ownerId: 1,
			});
			mockCollabRepo.createVersion.mockReturnValue({
				id: 1,
				projectId: 5,
				version: 1,
				state: '{"tracks":[]}',
				note: "First take",
			});

			const res = await request(app)
				.post("/api/collab/5/versions")
				.send({ state: { tracks: [] }, note: "First take" });

			expect(res.status).toBe(201);
			expect(res.body.id).toBe(1);
		});
	});
});
