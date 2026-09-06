import { createAdminRoutes } from "../admin.js";
import express from "express";
import request from "supertest";
import { jest } from "@jest/globals";
import { mockStripeInstance } from "stripe";
import type { DatabaseService } from "../../../core/database.js";
import type { ScannerService } from "../../../modules/catalog/scanner.service.js";
import type { ServerConfig } from "../../../core/config.js";
import type { PublishingService } from "../../../modules/publishing/publishing.service.js";
import type { AuthService } from "../../../modules/auth/auth.service.js";

// Mock dependencies
const mockDatabase = {
	getSetting: jest.fn(),
	setSetting: jest.fn(),
	getStats: jest.fn(),
	getAllSettings: jest.fn(),
	getArtists: jest.fn(),
	getAlbums: jest.fn(),
	getAlbum: jest.fn(),
	updateAlbumVisibility: jest.fn(),
	getTracks: jest.fn(),
	getPost: jest.fn(),
	updatePost: jest.fn(),
	createPost: jest.fn(),
	updateTracksOrder: jest.fn(),
	deletePost: jest.fn(),
} as unknown as DatabaseService;

const mockScanner = {
	scanDirectory: jest.fn(),
	scanAll: jest.fn(),
	getRegistry: jest.fn(() => ({ getEnabled: () => [] })),
} as unknown as ScannerService;

const mockConfig = {
	publicUrl: "http://localhost",
	siteName: "Test Site",
} as unknown as ServerConfig;

const mockAuthService = {
	isRootAdmin: jest.fn(),
	listAdmins: jest.fn(),
	getAdminById: jest.fn(),
	changePassword: jest.fn(),
	createAdmin: jest.fn(),
	createUser: jest.fn(),
	updateAdmin: jest.fn(),
	deleteAdmin: jest.fn(),
	updateTrackQuota: jest.fn(),
} as unknown as AuthService;

const mockPublishingService = {
	publishReleaseToZen: jest.fn(),
	unpublishReleaseFromZen: jest.fn(),
	publishReleaseToAP: jest.fn(),
	unpublishReleaseFromAP: jest.fn(),
	syncRelease: jest.fn(),
	publishPostToAP: jest.fn(),
	unpublishPostFromAP: jest.fn(),
	syncPost: jest.fn(),
} as unknown as PublishingService;

const mockMaintenanceService = {
	syncAllTagsFromDb: jest.fn(),
	startLibraryAudit: jest.fn(),
	stopLibraryAudit: jest.fn(),
} as any;

/**
 * Builds a test Express app with a simulated viewer context.
 * role/userId/artistId map directly to VisibilityGuardian inputs.
 */
function buildApp(viewer: {
	role: string;
	userId?: number;
	artistId?: number;
}) {
	const app = express();
	app.use(express.json());
	app.use((req: any, _res, next) => {
		req.username = "testuser";
		req.isRootAdmin = viewer.role === "root_admin";
		req.role = viewer.role;
		req.userId = viewer.userId ?? null;
		req.artistId = viewer.artistId ?? null;
		req.context = {
			role: viewer.role as any,
			userId: viewer.userId ?? null,
			artistId: viewer.artistId ?? null,
		};
		next();
	});
	const router = createAdminRoutes({
		database: mockDatabase,
		library: mockDatabase,
		identity: mockDatabase,
		social: mockDatabase,
		integration: mockDatabase,
		scannerService: mockScanner,
		musicDir: "/tmp/music",
		config: mockConfig,
		authService: mockAuthService,
		publishingService: mockPublishingService,
		apService: {} as any,
		telegramBotService: {} as any,
		metadataService: {} as any,
		streamingService: {} as any,
		gdriveService: undefined,
		playlistService: undefined,
		scrobbleService: undefined,
		maintenanceService: mockMaintenanceService,
	} as any);
	app.use("/admin", router);
	return app;
}

describe("Artist release permission gates", () => {
	beforeEach(() => jest.clearAllMocks());

	// An artist is a regular user (role='user') with an artistId linked to their account.
	const artist = { role: "user", userId: 42, artistId: 7 };
	// A listener has no artistId — they may not create or manage releases.
	const listener = { role: "user", userId: 99, artistId: undefined };

	test("Artist: POST /releases is not blocked by the restriction middleware (passes through to releaseRouter)", async () => {
		const app = buildApp(artist);
		const res = await request(app)
			.post("/admin/releases")
			.send({ title: "My Track" });
		// The admin router has no POST /releases handler — it falls through to the next middleware.
		// We just need to confirm the middleware did NOT return 403.
		expect(res.status).not.toBe(403);
	});

	test("Listener: POST /releases is blocked with 403", async () => {
		const app = buildApp(listener);
		const res = await request(app)
			.post("/admin/releases")
			.send({ title: "Sneaky" });
		expect(res.status).toBe(403);
	});

	test("Artist: PUT /releases/:id/visibility is not blocked", async () => {
		(mockDatabase as any).getRelease = jest
			.fn()
			.mockReturnValue({
				id: 10,
				owner_id: 42,
				artist_id: 7,
				visibility: "private",
			});
		(mockDatabase as any).updateAlbum = jest.fn().mockReturnValue(true);
		(mockDatabase as any).updateRelease = jest.fn().mockReturnValue(true);
		const app = buildApp(artist);
		const res = await request(app)
			.put("/admin/releases/10/visibility")
			.send({ isPublic: true });
		expect(res.status).not.toBe(403);
	});

	test("Listener: PUT /releases/:id/visibility is blocked with 403", async () => {
		const app = buildApp(listener);
		const res = await request(app)
			.put("/admin/releases/10/visibility")
			.send({ isPublic: true });
		expect(res.status).toBe(403);
	});

	test("Artist: POST /releases/:id/tracks/add sub-path is not blocked", async () => {
		const app = buildApp(artist);
		const res = await request(app)
			.post("/admin/releases/10/tracks/add")
			.send({ trackId: 5 });
		// No handler exists for this route in the admin router → 404, not 403
		expect(res.status).not.toBe(403);
	});

	test("Listener: POST /releases/:id/tracks/add is blocked with 403", async () => {
		const app = buildApp(listener);
		const res = await request(app)
			.post("/admin/releases/10/tracks/add")
			.send({ trackId: 5 });
		expect(res.status).toBe(403);
	});

	test("Artist: PUT /releases/batch/visibility is blocked (batch stays admin-only)", async () => {
		const app = buildApp(artist);
		const res = await request(app)
			.put("/admin/releases/batch/visibility")
			.send({ ids: [1, 2], visibility: "public" });
		expect(res.status).toBe(403);
	});

	test("Artist: admin-only settings route is blocked with 403", async () => {
		const app = buildApp(artist);
		const res = await request(app)
			.put("/admin/settings")
			.send({ siteName: "Hacked" });
		expect(res.status).toBe(403);
	});
});

describe("Curator (super_user) and Manager (admin) permission boundaries", () => {
	beforeEach(() => jest.clearAllMocks());

	// Curator: super_user role. Has MANAGE_PRIVATE_LIBRARY but NOT MANAGE_ALL_CONTENT.
	// They can only manage content they own (owner_id / artist_id match).
	const curatorWithArtist = { role: "super_user", userId: 10, artistId: 3 };
	const curatorNoArtist = {
		role: "super_user",
		userId: 11,
		artistId: undefined,
	};

	// Manager: admin role. Has MANAGE_ALL_CONTENT — can manage any release.
	const manager = { role: "admin", userId: 20, artistId: undefined };

	// ── Middleware gate ──────────────────────────────────────────────────────────

	test("Curator passes the admin restriction middleware for release routes", async () => {
		const app = buildApp(curatorWithArtist);
		// The admin router has no POST /releases handler — falls through to releaseRouter.
		// We just need to confirm the middleware does NOT return 403.
		const res = await request(app)
			.post("/admin/releases")
			.send({ title: "Test" });
		expect(res.status).not.toBe(403);
	});

	test("Manager passes the admin restriction middleware for all non-GET routes", async () => {
		const app = buildApp(manager);
		const res = await request(app)
			.post("/admin/releases")
			.send({ title: "Test" });
		expect(res.status).not.toBe(403);
	});

	// ── Curator visibility-toggle: middleware passes; handler enforces ownership ─

	test("Curator can toggle visibility of a release they own (owner_id matches)", async () => {
		(mockDatabase as any).getRelease = jest.fn().mockReturnValue({
			id: 10,
			owner_id: 10,
			artist_id: 3,
			visibility: "private",
			is_release: 1,
		});
		(mockDatabase as any).updateAlbum = jest.fn().mockReturnValue(true);
		(mockDatabase as any).updateRelease = jest.fn().mockReturnValue(true);
		const app = buildApp(curatorWithArtist);
		const res = await request(app)
			.put("/admin/releases/10/visibility")
			.send({ isPublic: true });
		expect(res.status).not.toBe(403);
	});

	test("Curator is blocked from toggling visibility of a release owned by someone else", async () => {
		(mockDatabase as any).getRelease = jest.fn().mockReturnValue({
			id: 20,
			owner_id: 999,
			artist_id: 999,
			visibility: "private",
			is_release: 1,
		});
		(mockDatabase as any).getAlbum = jest.fn().mockReturnValue(null);
		(mockDatabase as any).updateAlbum = jest.fn();
		(mockDatabase as any).updateRelease = jest.fn();
		const app = buildApp(curatorWithArtist);
		const res = await request(app)
			.put("/admin/releases/20/visibility")
			.send({ isPublic: true });
		// Handler enforces MANAGE_ALL_CONTENT for cross-owner edits; Curator has only
		// MANAGE_PRIVATE_LIBRARY so it gets 403.
		expect(res.status).toBe(403);
	});

	test("Manager can toggle visibility of a release owned by someone else", async () => {
		(mockDatabase as any).getRelease = jest.fn().mockReturnValue({
			id: 20,
			owner_id: 999,
			artist_id: 999,
			visibility: "private",
			is_release: 1,
		});
		(mockDatabase as any).getAlbum = jest.fn().mockReturnValue(null);
		(mockDatabase as any).updateAlbum = jest.fn().mockReturnValue(true);
		(mockDatabase as any).updateRelease = jest.fn().mockReturnValue(true);
		(mockPublishingService.syncRelease as any).mockResolvedValue(undefined);
		const app = buildApp(manager);
		const res = await request(app)
			.put("/admin/releases/20/visibility")
			.send({ isPublic: true });
		// Manager has MANAGE_ALL_CONTENT → bypasses ownership check
		expect(res.status).not.toBe(403);
	});

	// ── additional_artworks persistence (image deletion) ─────────────────────────
	// The editor sends the full desired booklet list on every save. A deletion is a
	// shorter list. The full PUT /releases/:id handler whitelists fields into an
	// `updates` object; additional_artworks must be included or removals are dropped.

	test("PUT /releases/:id persists additional_artworks (image deletions)", async () => {
		(mockDatabase as any).getRelease = jest.fn().mockReturnValue({
			id: 30,
			owner_id: 999,
			artist_id: 5,
			visibility: "private",
			is_release: 1,
			additional_artworks: '["artwork/a.jpg","artwork/b.jpg"]',
		});
		(mockDatabase as any).getAlbum = jest.fn().mockReturnValue(null);
		(mockDatabase as any).getAlbumOwners = jest.fn().mockReturnValue([]);
		(mockDatabase as any).getArtistSimple = jest
			.fn()
			.mockReturnValue({ can_sell: 1 });
		(mockDatabase as any).transaction = jest.fn((fn: any) => fn());
		(mockDatabase as any).updateRelease = jest.fn();
		(mockDatabase as any).updateAlbum = jest.fn();

		const app = buildApp({ role: "root_admin", userId: 1 });
		// User removed "b.jpg", keeping only "a.jpg".
		const res = await request(app)
			.put("/admin/releases/30")
			.send({ additional_artworks: '["artwork/a.jpg"]' });

		expect(res.status).not.toBe(403);
		expect((mockDatabase as any).updateRelease).toHaveBeenCalledWith(
			30,
			expect.objectContaining({ additional_artworks: '["artwork/a.jpg"]' }),
		);
	});

	test("PUT /releases/:id persists clearing all additional_artworks", async () => {
		(mockDatabase as any).getRelease = jest.fn().mockReturnValue({
			id: 31,
			owner_id: 999,
			artist_id: 5,
			visibility: "private",
			is_release: 1,
			additional_artworks: '["artwork/a.jpg"]',
		});
		(mockDatabase as any).getAlbum = jest.fn().mockReturnValue(null);
		(mockDatabase as any).getAlbumOwners = jest.fn().mockReturnValue([]);
		(mockDatabase as any).getArtistSimple = jest
			.fn()
			.mockReturnValue({ can_sell: 1 });
		(mockDatabase as any).transaction = jest.fn((fn: any) => fn());
		(mockDatabase as any).updateRelease = jest.fn();
		(mockDatabase as any).updateAlbum = jest.fn();

		const app = buildApp({ role: "root_admin", userId: 1 });
		const res = await request(app)
			.put("/admin/releases/31")
			.send({ additional_artworks: "[]" });

		expect(res.status).not.toBe(403);
		expect((mockDatabase as any).updateRelease).toHaveBeenCalledWith(
			31,
			expect.objectContaining({ additional_artworks: "[]" }),
		);
	});

	// ── canPublishContent gate (inside releaseRouter POST handler) ────────────────
	// The admin restriction middleware lets Curator through, but canPublishContent
	// inside the releaseRouter handler still blocks Curators without an artistId.
	// These tests document that contract via the middleware layer only
	// (the releaseRouter is not mounted in this test app, so we can only confirm
	// the middleware passes — the handler-level check is tested in releases.test.ts).

	test("Curator without artistId: middleware does not block (handler enforces canPublish)", async () => {
		const app = buildApp(curatorNoArtist);
		const res = await request(app)
			.post("/admin/releases")
			.send({ title: "Test" });
		// 404 = no matching route in admin router; 403 would mean middleware blocked it
		expect(res.status).not.toBe(403);
	});

	// ── System-level routes stay out of reach for Curator ───────────────────────

	test("Curator cannot create system users (route-level admin check)", async () => {
		const app = buildApp(curatorWithArtist);
		const res = await request(app)
			.post("/admin/system/users")
			.send({ username: "hacker", password: "pw" });
		expect(res.status).toBe(403);
	});

	test("Curator cannot change global settings (route-level root-admin check)", async () => {
		(mockDatabase.setSetting as jest.Mock).mockImplementation(() => {});
		const app = buildApp(curatorWithArtist);
		const res = await request(app)
			.put("/admin/settings")
			.send({ siteName: "Hacked" });
		expect(res.status).toBe(403);
	});

	test("Manager cannot change root-admin-only settings", async () => {
		(mockDatabase.setSetting as jest.Mock).mockImplementation(() => {});
		const app = buildApp(manager);
		const res = await request(app)
			.put("/admin/settings")
			.send({ siteName: "Hacked" });
		expect(res.status).toBe(403);
	});
});

describe("Admin Routes Vulnerability Check", () => {
	let app: express.Express;

	beforeEach(() => {
		jest.clearAllMocks();

		(mockAuthService.listAdmins as jest.Mock).mockReturnValue([
			{ id: 1, username: "root", role: "admin" },
			{ id: 2, username: "other", role: "admin" },
		]);
		(mockAuthService.getAdminById as jest.Mock).mockImplementation(
			(id: any) => {
				if (id === 1) return { id: 1, username: "root", role: "admin" };
				if (id === 2) return { id: 2, username: "other", role: "admin" };
				return undefined;
			},
		);

		app = express();
		app.use(express.json());

		// Simple auth middleware mock
		app.use((req: any, _res, next) => {
			req.username = req.headers["x-username"] || "admin";
			req.isRootAdmin = mockAuthService.isRootAdmin(req.username);
			req.role =
				req.headers["x-role"] || (req.isRootAdmin ? "root_admin" : "admin");
			req.context = {
				role: req.role as any,
				userId: req.username === "root" ? 1 : 2,
				artistId: req.headers["x-artist-id"]
					? parseInt(req.headers["x-artist-id"] as string)
					: undefined,
			};
			next();
		});

		const router = createAdminRoutes({
			database: mockDatabase,
			library: mockDatabase.library || mockDatabase,
			identity: mockDatabase.identity || mockDatabase,
			social: mockDatabase.social || mockDatabase,
			integration: mockDatabase.integration || mockDatabase,
			scannerService: mockScanner,
			musicDir: "/tmp/music",
			config: mockConfig,
			authService: mockAuthService,
			publishingService: mockPublishingService,
			apService: {} as any,
			telegramBotService: {} as any,
			metadataService: {} as any,
			streamingService: {} as any,
			gdriveService: undefined,
			playlistService: undefined,
			scrobbleService: undefined,
			maintenanceService: mockMaintenanceService,
		} as any);
		app.use("/admin", router);
	});

	test("Non-root admin CANNOT change root admin password", async () => {
		// Setup:
		// root admin (id=1, username='root')
		// other admin (id=2, username='other')

		const admins = [
			{
				id: 1,
				username: "root",
				is_root: true,
				artist_id: null,
				created_at: "",
				artist_name: null,
			},
			{
				id: 2,
				username: "other",
				is_root: false,
				artist_id: null,
				created_at: "",
				artist_name: null,
			},
		];

		(mockAuthService.listAdmins as jest.Mock).mockReturnValue(admins);
		(mockAuthService.isRootAdmin as jest.Mock).mockImplementation(
			(username) => username === "root",
		);
		(mockAuthService.changePassword as jest.Mock).mockImplementation(
			async () => {},
		);

		// Act: specific user 'other' tries to change password of user 'root' (id=1)
		const response = await request(app)
			.put("/admin/system/users/1/password")
			.set("x-username", "other") // Authenticated as 'other'
			.send({ password: "newpassword123" });

		// Assert:
		// Currently (vulnerable): 200 OK
		// Expected (fixed): 403 Forbidden

		expect(response.status).toBe(403);
		expect(mockAuthService.changePassword).not.toHaveBeenCalled();
	});

	test("Root admin CAN change other admin password", async () => {
		const admins = [
			{
				id: 1,
				username: "root",
				is_root: true,
				artist_id: null,
				created_at: "",
				artist_name: null,
			},
			{
				id: 2,
				username: "other",
				is_root: false,
				artist_id: null,
				created_at: "",
				artist_name: null,
			},
		];

		(mockAuthService.listAdmins as jest.Mock).mockReturnValue(admins);
		(mockAuthService.isRootAdmin as jest.Mock).mockImplementation(
			(username) => username === "root",
		);
		(mockAuthService.changePassword as jest.Mock).mockImplementation(
			async () => {},
		);

		const response = await request(app)
			.put("/admin/system/users/2/password")
			.set("x-username", "root")
			.send({ password: "newpassword123" });

		expect(response.status).toBe(200);
		expect(mockAuthService.changePassword).toHaveBeenCalledWith(
			"other",
			"newpassword123",
		);
	});

	test("User CAN change own password", async () => {
		const admins = [
			{
				id: 1,
				username: "root",
				is_root: true,
				artist_id: null,
				created_at: "",
				artist_name: null,
			},
			{
				id: 2,
				username: "other",
				is_root: false,
				artist_id: null,
				created_at: "",
				artist_name: null,
			},
		];

		(mockAuthService.listAdmins as jest.Mock).mockReturnValue(admins);
		(mockAuthService.isRootAdmin as jest.Mock).mockImplementation(
			(username) => username === "root",
		);
		(mockAuthService.changePassword as jest.Mock).mockImplementation(
			async () => {},
		);

		const response = await request(app)
			.put("/admin/system/users/2/password")
			.set("x-username", "other")
			.send({ password: "newpassword123" });

		expect(response.status).toBe(200);
		expect(mockAuthService.changePassword).toHaveBeenCalledWith(
			"other",
			"newpassword123",
		);
	});

	test("Root admin CAN update settings with mode", async () => {
		(mockAuthService.isRootAdmin as jest.Mock).mockReturnValue(true);
		(mockDatabase.setSetting as jest.Mock).mockImplementation(() => {});
		(mockDatabase.getArtists as jest.Mock).mockReturnValue([]);
		(mockDatabase.getAlbums as jest.Mock).mockReturnValue([]);

		const response = await request(app)
			.put("/admin/settings")
			.set("x-username", "root")
			.send({ mode: "personal", siteName: "My Library", hideCollab: true });

		expect(response.status).toBe(200);
		expect(mockDatabase.setSetting).toHaveBeenCalledWith("mode", "personal");
		expect(mockDatabase.setSetting).toHaveBeenCalledWith(
			"siteName",
			"My Library",
		);
		expect(mockDatabase.setSetting).toHaveBeenCalledWith("hideCollab", "true");
	});

	describe("Super User Restriction", () => {
		beforeEach(() => {
			(mockAuthService.isRootAdmin as jest.Mock).mockImplementation(
				(username) => username === "root",
			);
		});

		test("Super user CAN perform GET requests", async () => {
			(mockDatabase.getStats as jest.Mock).mockReturnValue({
				artists: 0,
				albums: 0,
				tracks: 0,
			});

			const response = await request(app)
				.get("/admin/stats")
				.set("x-username", "readonly")
				.set("x-role", "super_user");

			expect(response.status).toBe(200);
		});

		test("Super user CANNOT perform PUT requests", async () => {
			const response = await request(app)
				.put("/admin/settings")
				.set("x-username", "readonly")
				.set("x-role", "super_user")
				.send({ siteName: "Hacked" });

			expect(response.status).toBe(403);
			expect(response.body.error).toMatch(/Access denied|Only root admin/i);
			expect(mockDatabase.setSetting).not.toHaveBeenCalled();
		});

		test("Super user CANNOT perform POST requests", async () => {
			const response = await request(app)
				.post("/admin/system/users")
				.set("x-username", "readonly")
				.set("x-role", "super_user")
				.send({ username: "attacker", password: "password123" });

			expect(response.status).toBe(403);
			expect(mockAuthService.createAdmin).not.toHaveBeenCalled();
		});

		test("Super user CANNOT perform DELETE requests", async () => {
			const response = await request(app)
				.delete("/admin/system/users/2")
				.set("x-username", "readonly")
				.set("x-role", "super_user");

			expect(response.status).toBe(403);
			expect(mockAuthService.deleteAdmin).not.toHaveBeenCalled();
		});
	});

	describe("System Maintenance", () => {
		beforeEach(() => {
			(mockAuthService.isRootAdmin as jest.Mock).mockImplementation(
				(username) => username === "root",
			);
		});

		test("Root admin CAN trigger sync-tags", async () => {
			(mockMaintenanceService.syncAllTagsFromDb as any).mockResolvedValue({
				success: 10,
				failed: 0,
			});

			const response = await request(app)
				.post("/admin/system/sync-tags")
				.set("x-username", "root")
				.send({});

			expect(response.status).toBe(200);
			expect(response.body.message).toMatch(
				/Tag synchronization started in background/i,
			);

			// Wait a bit for the background promise to be called (though it's not awaited in the route)
			expect(mockMaintenanceService.syncAllTagsFromDb).toHaveBeenCalled();
		});

		test("Non-root admin CANNOT trigger sync-tags", async () => {
			const response = await request(app)
				.post("/admin/system/sync-tags")
				.set("x-username", "other")
				.send({});

			expect(response.status).toBe(403);
			expect(mockMaintenanceService.syncAllTagsFromDb).not.toHaveBeenCalled();
		});
	});

	describe("Track quota", () => {
		beforeEach(() => {
			(mockAuthService.isRootAdmin as jest.Mock).mockImplementation(
				(username) => username === "root",
			);
		});

		test("POST /system/users applies trackQuota override for a listener", async () => {
			(mockAuthService.createUser as any).mockResolvedValue({ id: 42 });

			const response = await request(app)
				.post("/admin/system/users")
				.set("x-username", "root")
				.send({
					username: "listener1",
					password: "password123",
					trackQuota: 25,
				});

			expect(response.status).toBe(200);
			expect(mockAuthService.updateTrackQuota).toHaveBeenCalledWith(42, 25);
		});

		test("POST /system/users does not touch track quota when omitted", async () => {
			(mockAuthService.createUser as any).mockResolvedValue({ id: 43 });

			const response = await request(app)
				.post("/admin/system/users")
				.set("x-username", "root")
				.send({ username: "listener2", password: "password123" });

			expect(response.status).toBe(200);
			expect(mockAuthService.updateTrackQuota).not.toHaveBeenCalled();
		});

		test("PUT /system/users/:id applies trackQuota override", async () => {
			const response = await request(app)
				.put("/admin/system/users/2")
				.set("x-username", "root")
				.send({ trackQuota: 50 });

			expect(response.status).toBe(200);
			expect(mockAuthService.updateTrackQuota).toHaveBeenCalledWith(2, 50);
		});

		test("PUT /system/users/:id passes 0 through as unlimited", async () => {
			const response = await request(app)
				.put("/admin/system/users/2")
				.set("x-username", "root")
				.send({ trackQuota: 0 });

			expect(response.status).toBe(200);
			expect(mockAuthService.updateTrackQuota).toHaveBeenCalledWith(2, 0);
		});

		test("Non-root admin cannot set trackQuota via PUT /system/users/:id", async () => {
			const response = await request(app)
				.put("/admin/system/users/2")
				.set("x-username", "other")
				.send({ trackQuota: 50 });

			expect(response.status).toBe(403);
			expect(mockAuthService.updateTrackQuota).not.toHaveBeenCalled();
		});

		test("Root admin CAN update listenerTrackCap and trackcap topup settings", async () => {
			(mockDatabase.setSetting as jest.Mock).mockImplementation(() => {});

			const response = await request(app)
				.put("/admin/settings")
				.set("x-username", "root")
				.send({
					listenerTrackCap: 30,
					trackcapTopupPriceUsd: 4.99,
					trackcapTopupTracksGranted: 10,
				});

			expect(response.status).toBe(200);
			expect(mockDatabase.setSetting).toHaveBeenCalledWith(
				"listenerTrackCap",
				"30",
			);
			expect(mockDatabase.setSetting).toHaveBeenCalledWith(
				"trackcapTopupPriceUsd",
				"4.99",
			);
			expect(mockDatabase.setSetting).toHaveBeenCalledWith(
				"trackcapTopupTracksGranted",
				"10",
			);
		});

		test("rejects a negative listenerTrackCap", async () => {
			const response = await request(app)
				.put("/admin/settings")
				.set("x-username", "root")
				.send({ listenerTrackCap: -1 });

			expect(response.status).toBe(400);
			expect(mockDatabase.setSetting).not.toHaveBeenCalledWith(
				"listenerTrackCap",
				expect.anything(),
			);
		});

		test("rejects a non-positive trackcapTopupTracksGranted", async () => {
			const response = await request(app)
				.put("/admin/settings")
				.set("x-username", "root")
				.send({ trackcapTopupTracksGranted: 0 });

			expect(response.status).toBe(400);
		});

		test("rejects a negative trackcapTopupPriceUsd", async () => {
			const response = await request(app)
				.put("/admin/settings")
				.set("x-username", "root")
				.send({ trackcapTopupPriceUsd: -5 });

			expect(response.status).toBe(400);
		});
	});
});

describe("Listener → Artist approval flow (POST /system/users/:id/approve-artist)", () => {
	beforeEach(() => jest.clearAllMocks());

	const rootAdmin = { role: "root_admin", userId: 1 };
	const manager = { role: "admin", userId: 20 };
	const pendingUser = {
		id: 42,
		username: "hopeful",
		role: "user",
		artist_id: null,
	};

	test("rejects a non-root-admin caller with 403", async () => {
		const app = buildApp(manager);
		const res = await request(app).post(
			"/admin/system/users/42/approve-artist",
		);
		expect(res.status).toBe(403);
		expect(mockAuthService.getAdminById).not.toHaveBeenCalled();
	});

	test("returns 404 when the target user does not exist", async () => {
		(mockAuthService.getAdminById as jest.Mock).mockReturnValue(undefined);
		const app = buildApp(rootAdmin);
		const res = await request(app).post(
			"/admin/system/users/999/approve-artist",
		);
		expect(res.status).toBe(404);
	});

	test("returns 400 and clears the pending request when the user already has an artist profile", async () => {
		(mockAuthService.getAdminById as jest.Mock).mockReturnValue({
			...pendingUser,
			artist_id: 7,
		});
		(mockAuthService as any).setArtistRequest = jest.fn();
		const app = buildApp(rootAdmin);
		const res = await request(app).post(
			"/admin/system/users/42/approve-artist",
		);
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("User already has an artist profile");
		expect((mockAuthService as any).setArtistRequest).toHaveBeenCalledWith(
			42,
			false,
		);
	});

	test("creates a new (unsellable) artist, keeps the user's role, and grants the configured quota", async () => {
		(mockAuthService.getAdminById as jest.Mock).mockReturnValue(pendingUser);
		(mockDatabase as any).getArtistByName = jest.fn().mockReturnValue(null);
		(mockDatabase as any).createArtist = jest.fn().mockReturnValue(101);
		(mockDatabase as any).setArtistCanSell = jest.fn();
		(mockDatabase.getSetting as jest.Mock).mockImplementation((k: string) =>
			k === "listenerSelfPublishQuota" ? "256" : null,
		);
		(mockAuthService as any).setArtistRequest = jest.fn();

		const app = buildApp(rootAdmin);
		const res = await request(app).post(
			"/admin/system/users/42/approve-artist",
		);

		expect(res.status).toBe(200);
		expect(res.body.artistId).toBe(101);
		expect((mockDatabase as any).createArtist).toHaveBeenCalledWith(
			"hopeful",
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			"public",
		);
		expect((mockDatabase as any).setArtistCanSell).toHaveBeenCalledWith(
			101,
			false,
		);
		expect(mockAuthService.updateAdmin).toHaveBeenCalledWith(
			42,
			101,
			"user",
			256 * 1024 * 1024,
		);
		expect((mockAuthService as any).setArtistRequest).toHaveBeenCalledWith(
			42,
			false,
		);
	});

	test("defaults to a 1GB quota when listenerSelfPublishQuota is not configured", async () => {
		(mockAuthService.getAdminById as jest.Mock).mockReturnValue(pendingUser);
		(mockDatabase as any).getArtistByName = jest.fn().mockReturnValue(null);
		(mockDatabase as any).createArtist = jest.fn().mockReturnValue(101);
		(mockDatabase as any).setArtistCanSell = jest.fn();
		// Real getSetting() returns `undefined` for an unconfigured key (not
		// `null`) — Number(null) is 0, which would wrongly satisfy the
		// `>= 0` finite check below and skip the 1024 MB default.
		(mockDatabase.getSetting as jest.Mock).mockReturnValue(undefined);
		(mockAuthService as any).setArtistRequest = jest.fn();

		const app = buildApp(rootAdmin);
		const res = await request(app).post(
			"/admin/system/users/42/approve-artist",
		);

		expect(res.status).toBe(200);
		expect(mockAuthService.updateAdmin).toHaveBeenCalledWith(
			42,
			101,
			"user",
			1024 * 1024 * 1024,
		);
	});

	test("reuses an existing artist row matching the username instead of creating a duplicate", async () => {
		(mockAuthService.getAdminById as jest.Mock).mockReturnValue(pendingUser);
		(mockDatabase as any).getArtistByName = jest
			.fn()
			.mockReturnValue({ id: 55, name: "hopeful" });
		(mockDatabase as any).createArtist = jest.fn();
		(mockDatabase as any).setArtistCanSell = jest.fn();
		(mockDatabase.getSetting as jest.Mock).mockReturnValue(undefined);
		(mockAuthService as any).setArtistRequest = jest.fn();

		const app = buildApp(rootAdmin);
		const res = await request(app).post(
			"/admin/system/users/42/approve-artist",
		);

		expect(res.status).toBe(200);
		expect(res.body.artistId).toBe(55);
		expect((mockDatabase as any).createArtist).not.toHaveBeenCalled();
		expect((mockDatabase as any).setArtistCanSell).toHaveBeenCalledWith(
			55,
			false,
		);
	});
});

describe("DELETE /system/users/:id/artist-request (dismiss)", () => {
	beforeEach(() => jest.clearAllMocks());

	test("rejects a non-root-admin caller with 403", async () => {
		const app = buildApp({ role: "admin", userId: 20 });
		const res = await request(app).delete(
			"/admin/system/users/42/artist-request",
		);
		expect(res.status).toBe(403);
	});

	test("root admin dismisses the pending request without creating an artist", async () => {
		(mockAuthService as any).setArtistRequest = jest.fn();
		const app = buildApp({ role: "root_admin", userId: 1 });
		const res = await request(app).delete(
			"/admin/system/users/42/artist-request",
		);
		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect((mockAuthService as any).setArtistRequest).toHaveBeenCalledWith(
			42,
			false,
		);
	});
});

describe("Stripe Connect onboarding (artist accounts)", () => {
	beforeEach(() => jest.clearAllMocks());

	const manager = { role: "admin", userId: 20 };
	const ownArtist = { role: "user", userId: 7, artistId: 7 };
	const otherArtist = { role: "user", userId: 8, artistId: 8 };
	const listener = { role: "user", userId: 99, artistId: undefined };

	const withStripeConfigured = () => {
		(mockDatabase.getSetting as jest.Mock).mockImplementation((k: string) =>
			k === "stripe_secret_key" ? "sk_test_admin" : null,
		);
	};

	describe("POST /artists/:id/stripe-connect/onboard", () => {
		test("rejects an invalid artist id", async () => {
			withStripeConfigured();
			const app = buildApp(manager);
			const res = await request(app).post(
				"/admin/artists/0/stripe-connect/onboard",
			);
			expect(res.status).toBe(400);
		});

		test("denies a listener with no matching artist profile", async () => {
			withStripeConfigured();
			const app = buildApp(listener);
			const res = await request(app).post(
				"/admin/artists/7/stripe-connect/onboard",
			);
			expect(res.status).toBe(403);
		});

		test("denies an artist trying to onboard a different artist's account", async () => {
			withStripeConfigured();
			const app = buildApp(otherArtist);
			const res = await request(app).post(
				"/admin/artists/7/stripe-connect/onboard",
			);
			expect(res.status).toBe(403);
		});

		test("returns 501 when Stripe is not configured", async () => {
			(mockDatabase.getSetting as jest.Mock).mockReturnValue(null);
			const app = buildApp(manager);
			const res = await request(app).post(
				"/admin/artists/7/stripe-connect/onboard",
			);
			expect(res.status).toBe(501);
		});

		test("returns 404 when the artist does not exist", async () => {
			withStripeConfigured();
			(mockDatabase as any).getArtistSimple = jest.fn().mockReturnValue(null);
			const app = buildApp(manager);
			const res = await request(app).post(
				"/admin/artists/7/stripe-connect/onboard",
			);
			expect(res.status).toBe(404);
		});

		test("creates a new Express account when the artist has none and persists it", async () => {
			withStripeConfigured();
			(mockDatabase as any).getArtistSimple = jest
				.fn()
				.mockReturnValue({ id: 7, name: "Artist Seven", stripe_account_id: null });
			(mockDatabase as any).setArtistStripeAccountId = jest.fn();
			(mockStripeInstance.accounts.create as jest.Mock).mockResolvedValue({
				id: "acct_new123",
			});
			(mockStripeInstance as any).accountLinks = {
				create: jest.fn().mockResolvedValue({ url: "https://connect.stripe.com/setup/new123" }),
			};

			const app = buildApp(ownArtist);
			const res = await request(app)
				.post("/admin/artists/7/stripe-connect/onboard")
				.send({});

			expect(res.status).toBe(200);
			expect(res.body.accountId).toBe("acct_new123");
			expect(res.body.url).toBe("https://connect.stripe.com/setup/new123");
			expect(mockStripeInstance.accounts.create).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "express",
					metadata: { artistId: "7", artistName: "Artist Seven" },
				}),
			);
			expect((mockDatabase as any).setArtistStripeAccountId).toHaveBeenCalledWith(
				7,
				"acct_new123",
			);
		});

		test("reuses an existing connected account without creating a new one", async () => {
			withStripeConfigured();
			(mockDatabase as any).getArtistSimple = jest.fn().mockReturnValue({
				id: 7,
				name: "Artist Seven",
				stripe_account_id: "acct_existing",
			});
			(mockDatabase as any).setArtistStripeAccountId = jest.fn();
			(mockStripeInstance as any).accountLinks = {
				create: jest.fn().mockResolvedValue({ url: "https://connect.stripe.com/setup/existing" }),
			};

			const app = buildApp(ownArtist);
			const res = await request(app)
				.post("/admin/artists/7/stripe-connect/onboard")
				.send({});

			expect(res.status).toBe(200);
			expect(res.body.accountId).toBe("acct_existing");
			expect(mockStripeInstance.accounts.create).not.toHaveBeenCalled();
			expect((mockDatabase as any).setArtistStripeAccountId).not.toHaveBeenCalled();
		});

		test("ignores an absolute returnTo and falls back to /admin (open-redirect guard)", async () => {
			withStripeConfigured();
			(mockDatabase as any).getArtistSimple = jest.fn().mockReturnValue({
				id: 7,
				name: "Artist Seven",
				stripe_account_id: "acct_existing",
			});
			const linkCreate = jest.fn().mockResolvedValue({ url: "https://connect.stripe.com/setup/x" });
			(mockStripeInstance as any).accountLinks = { create: linkCreate };

			const app = buildApp(ownArtist);
			await request(app)
				.post("/admin/artists/7/stripe-connect/onboard")
				.send({ returnTo: "https://evil.example/steal" });

			const [args] = linkCreate.mock.calls;
			expect(args[0].return_url).not.toContain("evil.example");
			expect(args[0].return_url.endsWith("/admin")).toBe(true);
		});

		test("ignores a protocol-relative returnTo and falls back to /admin", async () => {
			withStripeConfigured();
			(mockDatabase as any).getArtistSimple = jest.fn().mockReturnValue({
				id: 7,
				name: "Artist Seven",
				stripe_account_id: "acct_existing",
			});
			const linkCreate = jest.fn().mockResolvedValue({ url: "https://connect.stripe.com/setup/x" });
			(mockStripeInstance as any).accountLinks = { create: linkCreate };

			const app = buildApp(ownArtist);
			await request(app)
				.post("/admin/artists/7/stripe-connect/onboard")
				.send({ returnTo: "//evil.example/steal" });

			const [args] = linkCreate.mock.calls;
			expect(args[0].return_url).not.toContain("evil.example");
			expect(args[0].return_url.endsWith("/admin")).toBe(true);
		});

		test("accepts a safe same-origin relative returnTo path", async () => {
			withStripeConfigured();
			(mockDatabase as any).getArtistSimple = jest.fn().mockReturnValue({
				id: 7,
				name: "Artist Seven",
				stripe_account_id: "acct_existing",
			});
			const linkCreate = jest.fn().mockResolvedValue({ url: "https://connect.stripe.com/setup/x" });
			(mockStripeInstance as any).accountLinks = { create: linkCreate };

			const app = buildApp(ownArtist);
			await request(app)
				.post("/admin/artists/7/stripe-connect/onboard")
				.send({ returnTo: "/profile" });

			const [args] = linkCreate.mock.calls;
			expect(args[0].return_url.endsWith("/profile")).toBe(true);
		});
	});

	describe("GET /artists/:id/stripe-connect/status", () => {
		test("denies access to an unrelated listener", async () => {
			const app = buildApp(listener);
			const res = await request(app).get(
				"/admin/artists/7/stripe-connect/status",
			);
			expect(res.status).toBe(403);
		});

		test("returns 404 when the artist does not exist", async () => {
			(mockDatabase as any).getArtistSimple = jest.fn().mockReturnValue(null);
			const app = buildApp(manager);
			const res = await request(app).get(
				"/admin/artists/7/stripe-connect/status",
			);
			expect(res.status).toBe(404);
		});

		test("reports connected:false when no account is linked", async () => {
			(mockDatabase as any).getArtistSimple = jest
				.fn()
				.mockReturnValue({ id: 7, stripe_account_id: null });
			const app = buildApp(manager);
			const res = await request(app).get(
				"/admin/artists/7/stripe-connect/status",
			);
			expect(res.status).toBe(200);
			expect(res.body).toEqual({ connected: false });
		});

		test("reports full onboarding status for a connected account", async () => {
			withStripeConfigured();
			(mockDatabase as any).getArtistSimple = jest
				.fn()
				.mockReturnValue({ id: 7, stripe_account_id: "acct_existing" });
			(mockStripeInstance.accounts.retrieve as jest.Mock).mockResolvedValue({
				id: "acct_existing",
				charges_enabled: true,
				payouts_enabled: false,
				details_submitted: true,
				country: "US",
			});

			const app = buildApp(ownArtist);
			const res = await request(app).get(
				"/admin/artists/7/stripe-connect/status",
			);

			expect(res.status).toBe(200);
			expect(res.body).toEqual({
				connected: true,
				accountId: "acct_existing",
				chargesEnabled: true,
				payoutsEnabled: false,
				detailsSubmitted: true,
				country: "US",
			});
		});
	});

	describe("DELETE /artists/:id/stripe-connect", () => {
		test("denies access to an unrelated listener", async () => {
			const app = buildApp(listener);
			const res = await request(app).delete("/admin/artists/7/stripe-connect");
			expect(res.status).toBe(403);
		});

		test("returns 404 when the artist does not exist", async () => {
			(mockDatabase as any).getArtistSimple = jest.fn().mockReturnValue(null);
			const app = buildApp(manager);
			const res = await request(app).delete("/admin/artists/7/stripe-connect");
			expect(res.status).toBe(404);
		});

		test("unlinks the connected account without deleting it on Stripe", async () => {
			(mockDatabase as any).getArtistSimple = jest
				.fn()
				.mockReturnValue({ id: 7, stripe_account_id: "acct_existing" });
			(mockDatabase as any).setArtistStripeAccountId = jest.fn();

			const app = buildApp(ownArtist);
			const res = await request(app).delete("/admin/artists/7/stripe-connect");

			expect(res.status).toBe(200);
			expect(res.body).toEqual({ success: true });
			expect((mockDatabase as any).setArtistStripeAccountId).toHaveBeenCalledWith(
				7,
				null,
			);
		});
	});
});
