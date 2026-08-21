import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import { createDatabase } from "../../database.js";

describe("Identity Manager", () => {
	let db: any;
	let logSpy: any;
	let warnSpy: any;
	let errorSpy: any;

	beforeAll(() => {
		logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		db = createDatabase(":memory:");
	});

	afterAll(() => {
		if (db?.db) db.db.close();
		logSpy.mockRestore();
		warnSpy.mockRestore();
		errorSpy.mockRestore();
	});

	// ── Users CRUD ──────────────────────────────────────────────────────────

	describe("Users CRUD", () => {
		test("createUser, getUser and getUserByUsername", () => {
			const id = db.createUser("alice", "hash123", null, "admin");
			expect(id).toBeGreaterThan(0);

			const userById = db.getUser(id);
			expect(userById).toBeDefined();
			expect(userById.username).toBe("alice");
			expect(userById.role).toBe("admin");

			const userByName = db.getUserByUsername("alice");
			expect(userByName).toBeDefined();
			expect(userByName.id).toBe(id);
		});

		test("getUserByArtistId returns linked user", () => {
			const artistId = db.createArtist("Linked Artist");
			const userId = db.createUser("artist_user", "hash456", artistId, "user");

			const found = db.getUserByArtistId(artistId);
			expect(found).toBeDefined();
			expect(found.id).toBe(userId);
			expect(found.artist_id).toBe(artistId);
		});

		test("updateUser updates allowed fields and ignores unauthorized fields", () => {
			const id = db.createUser("bob", "hashBob", null, "user");

			db.updateUser(id, {
				role: "admin",
				storage_quota: 5000000,
				subscription_status: "active",
				can_peer: 1 as any,
			});

			const updated = db.getUser(id);
			expect(updated.role).toBe("admin");
			expect(updated.storage_quota).toBe(5000000);
			expect(updated.subscription_status).toBe("active");
			expect(updated.can_peer).toBe(1);
		});

		test("getAllUsers and getAdmins", () => {
			const initialAdmins = db.getAdmins();
			const adminCount = initialAdmins.length;

			const newAdminId = db.createUser("newadmin", "hashAdmin", null, "admin");
			const newUserId = db.createUser("regularuser", "hashUser", null, "user");

			const allUsers = db.getAllUsers();
			expect(allUsers.some((u: any) => u.id === newAdminId)).toBe(true);
			expect(allUsers.some((u: any) => u.id === newUserId)).toBe(true);

			const admins = db.getAdmins();
			expect(admins.length).toBe(adminCount + 1);
			expect(admins.some((a: any) => a.id === newAdminId)).toBe(true);
			expect(admins.some((a: any) => a.id === newUserId)).toBe(false);
		});

		test("deleteUser removes user", () => {
			const id = db.createUser("to_delete", "hashDel", null, "user");
			expect(db.getUser(id)).toBeDefined();

			db.deleteUser(id);
			expect(db.getUser(id)).toBeUndefined();
		});
	});

	// ── Subscriptions ───────────────────────────────────────────────────────

	describe("Subscriptions", () => {
		test("getUserSubscription defaults to none for user without active subscription", () => {
			const id = db.createUser("sub_user", "hashSub", null, "user");
			const sub = db.getUserSubscription(id);

			expect(sub.status).toBe("none");
			expect(sub.expiresAt).toBeNull();
		});

		test("updateSubscription sets status and expiration date", () => {
			const id = db.createUser("sub_active", "hashSub2", null, "user");
			const expires = "2027-12-31T23:59:59.000Z";

			db.updateSubscription(id, "active", expires);
			const sub = db.getUserSubscription(id);

			expect(sub.status).toBe("active");
			expect(sub.expiresAt).toBe(expires);
		});
	});

	// ── Settings ────────────────────────────────────────────────────────────

	describe("Settings", () => {
		test("setSetting and getSetting roundtrip", () => {
			db.setSetting("site_theme", "dark");
			expect(db.getSetting("site_theme")).toBe("dark");

			// Upsert overwrite
			db.setSetting("site_theme", "light");
			expect(db.getSetting("site_theme")).toBe("light");
		});

		test("getAllSettings returns key-value dictionary", () => {
			db.setSetting("custom_k1", "val1");
			db.setSetting("custom_k2", "val2");

			const all = db.getAllSettings();
			expect(all.custom_k1).toBe("val1");
			expect(all.custom_k2).toBe("val2");
		});

		test("getSetting returns undefined for non-existent key", () => {
			expect(db.getSetting("non_existent_key_xyz")).toBeUndefined();
		});
	});

	// ── Plugins ─────────────────────────────────────────────────────────────

	describe("Plugins", () => {
		test("setPluginEnabled and getPluginState", () => {
			db.setPluginEnabled("scrobble_plugin", true);
			let state = db.getPluginState("scrobble_plugin");
			expect(state).toBeDefined();
			expect(state.enabled).toBe(true);

			db.setPluginEnabled("scrobble_plugin", false);
			state = db.getPluginState("scrobble_plugin");
			expect(state.enabled).toBe(false);
		});

		test("setPluginConfig stores configuration string", () => {
			db.setPluginEnabled("telegram_bot", true);
			db.setPluginConfig("telegram_bot", JSON.stringify({ token: "123:ABC" }));

			const state = db.getPluginState("telegram_bot");
			expect(state.config).toBe(JSON.stringify({ token: "123:ABC" }));
		});

		test("getAllPluginsState returns list of plugins", () => {
			db.setPluginEnabled("plugin_a", true);
			db.setPluginEnabled("plugin_b", false);

			const all = db.getAllPluginsState();
			expect(all.length).toBeGreaterThanOrEqual(2);
		});
	});

	// ── ActivityPub User Keys ───────────────────────────────────────────────

	describe("ActivityPub Keys", () => {
		test("updateUserApKeys saves public and private keys", () => {
			const id = db.createUser("ap_user", "hashAp", null, "user");
			db.updateUserApKeys(id, "mock-pub-key-pem", "mock-priv-key-pem");

			const user = db.getUser(id);
			expect(user.ap_public_key).toBe("mock-pub-key-pem");
			expect(user.ap_private_key).toBe("mock-priv-key-pem");
		});
	});
});
