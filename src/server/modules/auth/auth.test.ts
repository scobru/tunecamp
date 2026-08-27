import {
	createAuthService,
	encryptZenPrivHelper,
	decryptZenPrivHelper,
} from "./auth.service.js";
import sqlite3 from "better-sqlite3";
import { jest } from "@jest/globals";
jest.setTimeout(30000);
import jwt from "jsonwebtoken";
import { createDatabase } from "../../core/database.js";

const Database = sqlite3;

describe("AuthService", () => {
	let db: any;
	let authService: any;

	beforeEach(async () => {
		db = new Database(":memory:");
		db.exec(`
            CREATE TABLE IF NOT EXISTS zen_users (
                pub TEXT PRIMARY KEY,
                epub TEXT NOT NULL,
                alias TEXT UNIQUE NOT NULL
            );
        `);
		authService = createAuthService(db, "secret", "admin", "tunecamp");
		await authService.init();
	});

	afterEach(() => {
		if (db) db.close();
	});

	test("init creates default admin if configured", async () => {
		const admin = db
			.prepare("SELECT * FROM admin WHERE username = ?")
			.get("admin");
		expect(admin).toBeDefined();
		expect(admin.username).toBe("admin");
		expect(admin.role).toBe("root_admin");
	});

	test("isDefaultPassword returns true for default password tunecamp", async () => {
		const isDefault = await authService.isDefaultPassword("admin");
		expect(isDefault).toBe(true);
	});

	test("isDefaultPassword returns false for changed password", async () => {
		await authService.changePassword("admin", "newpassword");
		const isDefault = await authService.isDefaultPassword("admin");
		expect(isDefault).toBe(false);
	});

	test("isDefaultPassword returns false for non-existent user", async () => {
		const isDefault = await authService.isDefaultPassword("nouser");
		expect(isDefault).toBe(false);
	});

	test("isDefaultPassword returns true for built-in default password 'admin'", async () => {
		const adminDb = new Database(":memory:");
		adminDb.exec(`
            CREATE TABLE IF NOT EXISTS zen_users (
                pub TEXT PRIMARY KEY,
                epub TEXT NOT NULL,
                alias TEXT UNIQUE NOT NULL
            );
        `);
		const svc = createAuthService(adminDb, "secret", "admin", "admin");
		await svc.init();
		expect(await svc.isDefaultPassword("admin")).toBe(true);
		await svc.changePassword("admin", "a-strong-passphrase");
		expect(await svc.isDefaultPassword("admin")).toBe(false);
		adminDb.close();
	});

	describe("Token Management", () => {
		const payload = {
			isAdmin: true,
			username: "admin",
			artistId: 1,
			role: "admin" as const,
			isActive: true,
			userId: 1,
			tokenVersion: 0,
		};
		const secret = "secret";

		test("generateToken and verifyToken (happy path)", async () => {
			const token = authService.generateToken(payload);
			expect(token).toBeDefined();

			const decoded = await authService.verifyToken(token);
			expect(decoded).toMatchObject(payload);
		});

		test("generateToken and verifyToken with null artistId", async () => {
			// Create user first to satisfy DB check in verifyToken
			await authService.createUser(
				"user",
				"password",
				null,
				0,
				undefined,
				"user",
			);
			const nullArtistPayload = {
				isAdmin: false,
				username: "user",
				artistId: null,
				role: "user" as const,
				isActive: true,
				userId: 2,
				tokenVersion: 0,
			};

			const token = authService.generateToken(nullArtistPayload);
			const decoded = await authService.verifyToken(token);
			expect(decoded).toMatchObject(nullArtistPayload);
		});

		test("verifyToken returns null for invalid token", async () => {
			const decoded = await authService.verifyToken("not-a-valid-jwt");
			expect(decoded).toBeNull();
		});

		test("verifyToken returns null for token signed with different secret", async () => {
			const differentSecretToken = jwt.sign(payload, "wrong-secret");
			const decoded = await authService.verifyToken(differentSecretToken);
			expect(decoded).toBeNull();
		});

		test("verifyToken returns null for expired token", async () => {
			// Create a token that expires in 0 seconds
			const expiredToken = jwt.sign(payload, secret, { expiresIn: -1 });
			const decoded = await authService.verifyToken(expiredToken);
			expect(decoded).toBeNull();
		});

		test("revokeTokens invalidates existing tokens", async () => {
			const token = authService.generateToken(payload);
			let decoded = await authService.verifyToken(token);
			expect(decoded).not.toBeNull();

			authService.revokeTokens(payload.userId);

			decoded = await authService.verifyToken(token);
			expect(decoded).toBeNull();
		});
	});

	describe("updateAdmin and outstanding tokens", () => {
		/**
		 * A token carries the role it was issued with. Without this, demoting an
		 * account leaves its existing token spending the old privilege until it
		 * expires — up to seven days.
		 */
		test("changing a role invalidates that account's existing tokens", async () => {
			const { id } = await authService.createUser("mover", "pw", null);
			const user = db.prepare("SELECT * FROM admin WHERE id = ?").get(id);
			const token = authService.generateToken({
				username: user.username,
				userId: id,
				role: user.role,
				tokenVersion: user.token_version,
			});
			expect(await authService.verifyToken(token)).not.toBeNull();

			authService.updateAdmin(id, null, "super_user");

			expect(await authService.verifyToken(token)).toBeNull();
		});

		test("editing the artist link or quota leaves tokens alone", async () => {
			const { id } = await authService.createUser("stayer", "pw", null);
			const user = db.prepare("SELECT * FROM admin WHERE id = ?").get(id);
			const token = authService.generateToken({
				username: user.username,
				userId: id,
				role: user.role,
				tokenVersion: user.token_version,
			});

			// Same role passed back in, plus an unrelated quota change: nobody
			// should be logged out for having their storage adjusted.
			authService.updateAdmin(id, null, user.role, 5_000_000);

			expect(await authService.verifyToken(token)).not.toBeNull();
		});
	});

	describe("encryptZenPrivHelper", () => {
		const TEST_SECRET = "super-secret-key-12345";
		const TEST_DATA = { user: "test", id: 42 };

		test("should return a string in the format IV:Data:AuthTag", () => {
			const encrypted = encryptZenPrivHelper(TEST_DATA, TEST_SECRET);
			expect(typeof encrypted).toBe("string");
			const parts = encrypted.split(":");
			expect(parts.length).toBe(3);
			// IV is 12 bytes -> 24 hex chars
			expect(parts[0].length).toBe(24);
			// AuthTag is 16 bytes -> 32 hex chars
			expect(parts[2].length).toBe(32);
			// Data length varies, just ensure it's not empty
			expect(parts[1].length).toBeGreaterThan(0);
		});

		test("should generate different IVs for the same data and secret", () => {
			const encrypted1 = encryptZenPrivHelper(TEST_DATA, TEST_SECRET);
			const encrypted2 = encryptZenPrivHelper(TEST_DATA, TEST_SECRET);
			expect(encrypted1).not.toBe(encrypted2);
			const iv1 = encrypted1.split(":")[0];
			const iv2 = encrypted2.split(":")[0];
			expect(iv1).not.toBe(iv2);
		});

		test("encrypted data should be decryptable by decryptZenPrivHelper", () => {
			const encrypted = encryptZenPrivHelper(TEST_DATA, TEST_SECRET);
			const decrypted = decryptZenPrivHelper(encrypted, TEST_SECRET);
			expect(decrypted).toEqual(TEST_DATA);
		});

		test("should handle string data correctly", () => {
			const stringData = "just a simple string";
			const encrypted = encryptZenPrivHelper(stringData, TEST_SECRET);
			const decrypted = decryptZenPrivHelper(encrypted, TEST_SECRET);
			expect(decrypted).toBe(stringData);
		});

		test("should handle arrays correctly", () => {
			const arrayData = [1, 2, 3, "four"];
			const encrypted = encryptZenPrivHelper(arrayData, TEST_SECRET);
			const decrypted = decryptZenPrivHelper(encrypted, TEST_SECRET);
			expect(decrypted).toEqual(arrayData);
		});

		test("should handle null data correctly", () => {
			const nullData = null;
			const encrypted = encryptZenPrivHelper(nullData, TEST_SECRET);
			const decrypted = decryptZenPrivHelper(encrypted, TEST_SECRET);
			expect(decrypted).toBeNull();
		});
	});
});

describe("AuthService - track quota", () => {
	let database: any;
	let authService: any;
	let userId: number;

	beforeEach(async () => {
		database = createDatabase(":memory:");
		authService = createAuthService(database.db, "secret", "admin", "tunecamp");
		await authService.init();
		const passHash = await authService.hashPassword("password");
		userId = Number(
			database.db
				.prepare("INSERT INTO admin (username, password_hash) VALUES (?, ?)")
				.run("quotauser", passHash).lastInsertRowid,
		);
	});

	afterEach(() => {
		if (database && database.db) database.db.close();
	});

	test("getTrackQuotaInfo returns null quota and zero floor by default", () => {
		const info = authService.getTrackQuotaInfo(userId);
		expect(info).toEqual({ track_quota: null, track_quota_floor: 0 });
	});

	test("getTrackQuotaInfo returns null for a non-existent user", () => {
		expect(authService.getTrackQuotaInfo(999999)).toBeUndefined();
	});

	test("updateTrackQuota sets the override when there is no floor", () => {
		authService.updateTrackQuota(userId, 20);
		expect(authService.getTrackQuotaInfo(userId)).toEqual({
			track_quota: 20,
			track_quota_floor: 0,
		});
	});

	test("updateTrackQuota allows setting quota to unlimited (0)", () => {
		authService.updateTrackQuota(userId, 20);
		authService.updateTrackQuota(userId, 0);
		expect(authService.getTrackQuotaInfo(userId)?.track_quota).toBe(0);
	});

	test("updateTrackQuota allows clearing the override back to null", () => {
		authService.updateTrackQuota(userId, 20);
		authService.updateTrackQuota(userId, null);
		expect(authService.getTrackQuotaInfo(userId)?.track_quota).toBeNull();
	});

	test("updateTrackQuota clamps a quota below the purchased floor up to the floor", () => {
		authService.addPurchasedTracks(userId, 10, 0); // floor becomes 10
		authService.updateTrackQuota(userId, 5); // attempt to lower below floor
		expect(authService.getTrackQuotaInfo(userId)).toEqual({
			track_quota: 10,
			track_quota_floor: 10,
		});
	});

	test("addPurchasedTracks raises both track_quota and track_quota_floor", () => {
		authService.addPurchasedTracks(userId, 10, 5);
		expect(authService.getTrackQuotaInfo(userId)).toEqual({
			track_quota: 15,
			track_quota_floor: 15,
		});
	});

	test("addPurchasedTracks accumulates across multiple purchases", () => {
		authService.addPurchasedTracks(userId, 10, 0);
		const afterFirst = authService.getTrackQuotaInfo(userId);
		authService.addPurchasedTracks(userId, 5, afterFirst.track_quota);
		expect(authService.getTrackQuotaInfo(userId)).toEqual({
			track_quota: 15,
			track_quota_floor: 15,
		});
	});
});

describe("AuthService - zen_auth_mode", () => {
	let database: any;
	let authService: any;

	beforeEach(async () => {
		database = new Database(":memory:");
		database.exec(`
            CREATE TABLE IF NOT EXISTS zen_users (
                pub TEXT PRIMARY KEY,
                epub TEXT NOT NULL,
                alias TEXT UNIQUE NOT NULL
            );
        `);
		authService = createAuthService(database, "secret", "admin", "tunecamp");
		await authService.init();
	});

	afterEach(() => {
		if (database) database.close();
	});

	test("createAdmin sets zen_auth_mode to hybrid when password and zenPubKey are provided", async () => {
		const { id } = await authService.createAdmin(
			"alice",
			"password123",
			null,
			"admin",
			"zenPub123",
		);
		const user = database
			.prepare("SELECT zen_auth_mode, zen_pub FROM admin WHERE id = ?")
			.get(id);
		expect(user.zen_auth_mode).toBe("hybrid");
		expect(user.zen_pub).toBe("zenPub123");
	});

	test("createAdmin sets zen_auth_mode to zen when only zenPubKey is provided", async () => {
		const { id } = await authService.createAdmin(
			"bob",
			null,
			null,
			"admin",
			"zenPub456",
		);
		const user = database
			.prepare("SELECT zen_auth_mode, zen_pub FROM admin WHERE id = ?")
			.get(id);
		expect(user.zen_auth_mode).toBe("zen");
		expect(user.zen_pub).toBe("zenPub456");
	});

	test("createAdmin sets zen_auth_mode to local when only password is provided", async () => {
		const { id } = await authService.createAdmin(
			"carol",
			"password123",
			null,
			"admin",
		);
		const user = database
			.prepare("SELECT zen_auth_mode, zen_pub FROM admin WHERE id = ?")
			.get(id);
		expect(user.zen_auth_mode).toBe("local");
		expect(user.zen_pub).toBeNull();
	});

	test("createUser sets zen_auth_mode correctly", async () => {
		const { id } = await authService.createUser(
			"dave",
			null,
			null,
			0,
			"zenPub789",
			"user",
		);
		const user = database
			.prepare("SELECT zen_auth_mode, zen_pub FROM admin WHERE id = ?")
			.get(id);
		expect(user.zen_auth_mode).toBe("zen");
		expect(user.zen_pub).toBe("zenPub789");
	});

	test("changePassword throws for ZEN-only account", async () => {
		await authService.createAdmin("eve", null, null, "admin", "zenPub999");
		await expect(authService.changePassword("eve", "newpass")).rejects.toThrow(
			"Cannot reset password for ZEN-only account",
		);
	});

	test("changePassword succeeds for local account", async () => {
		const { id } = await authService.createAdmin(
			"frank",
			"password123",
			null,
			"admin",
		);
		await expect(
			authService.changePassword("frank", "newpass"),
		).resolves.toBeUndefined();
		const user = database
			.prepare("SELECT password_hash FROM admin WHERE id = ?")
			.get(id);
		expect(user.password_hash).not.toBe("password123");
	});

	test("authenticateUser returns zenAuthMode", async () => {
		const passHash = await authService.hashPassword("password123");
		database
			.prepare(
				"INSERT INTO admin (username, password_hash, zen_auth_mode, role) VALUES (?, ?, ?, ?)",
			)
			.run("grace", passHash, "hybrid", "user");
		const result = await authService.authenticateUser("grace", "password123");
		expect(result).not.toBe(false);
		expect(result.zenAuthMode).toBe("hybrid");
	});
});

// A FID-only account carries an empty password_hash and is meant to be reachable
// only through its Zen keypair. Any path that writes password_hash would hand it
// a working local password, so each one must refuse.
describe("AuthService - FID-only accounts reject every password write", () => {
	// The full schema is needed here: `email`, the security-question columns and
	// `password_reset_tokens` all come from createDatabase, not from the auth
	// service's own migration.
	let database: any;
	let authService: any;

	beforeEach(async () => {
		database = createDatabase(":memory:").db;
		authService = createAuthService(database, "secret", "admin", "tunecamp");
		await authService.init();
	});

	afterEach(() => {
		if (database) database.close();
	});

	const createFidOnlyUser = async (username: string) =>
		authService.createAdmin(username, null, null, "admin", `zenPub-${username}`);

	test("setSecurityQuestions throws, so the recovery path can never be armed", async () => {
		const { id } = await createFidOnlyUser("heidi");
		await expect(
			authService.setSecurityQuestions(id, "q1", "a1", "q2", "a2"),
		).rejects.toThrow("Cannot set security questions for a FID-only account");
	});

	test("resetPasswordWithSecurityQuestions refuses even with correct answers", async () => {
		const { id } = await createFidOnlyUser("ivan");
		// Arm the recovery path directly in the DB, bypassing the service guard, to
		// prove the reset itself refuses rather than relying on setSecurityQuestions.
		const a1 = await authService.hashPassword("blue");
		const a2 = await authService.hashPassword("rome");
		database
			.prepare(
				"UPDATE admin SET security_q1 = ?, security_a1_hash = ?, security_q2 = ?, security_a2_hash = ? WHERE id = ?",
			)
			.run("colour?", a1, "city?", a2, id);

		await expect(
			authService.resetPasswordWithSecurityQuestions(
				"ivan",
				"blue",
				"rome",
				"newpass",
			),
		).resolves.toBe(false);
		const user = database
			.prepare("SELECT password_hash FROM admin WHERE id = ?")
			.get(id);
		expect(user.password_hash).toBe("");
	});

	test("createPasswordResetToken issues nothing for a FID-only account", async () => {
		const { id } = await createFidOnlyUser("judy");
		database
			.prepare("UPDATE admin SET email = ? WHERE id = ?")
			.run("judy@example.com", id);
		expect(authService.createPasswordResetToken("judy@example.com")).toBeNull();
	});

	test("resetPasswordWithToken refuses a token minted before the account became FID-only", async () => {
		const { id } = await authService.createAdmin(
			"karl",
			"password123",
			null,
			"admin",
		);
		database
			.prepare("UPDATE admin SET email = ? WHERE id = ?")
			.run("karl@example.com", id);
		const issued = authService.createPasswordResetToken("karl@example.com");
		expect(issued).not.toBeNull();

		database
			.prepare(
				"UPDATE admin SET zen_auth_mode = 'zen', password_hash = '' WHERE id = ?",
			)
			.run(id);

		await expect(
			authService.resetPasswordWithToken(issued.token, "newpass"),
		).resolves.toBe(false);
		const user = database
			.prepare("SELECT password_hash FROM admin WHERE id = ?")
			.get(id);
		expect(user.password_hash).toBe("");
	});

	test("a local account keeps working through every recovery path", async () => {
		const { id } = await authService.createAdmin(
			"laura",
			"password123",
			null,
			"admin",
		);
		database
			.prepare("UPDATE admin SET email = ? WHERE id = ?")
			.run("laura@example.com", id);

		await expect(
			authService.setSecurityQuestions(id, "q1", "a1", "q2", "a2"),
		).resolves.toBeUndefined();

		const issued = authService.createPasswordResetToken("laura@example.com");
		expect(issued).not.toBeNull();
		await expect(
			authService.resetPasswordWithToken(issued.token, "newpass456"),
		).resolves.toBe(true);
	});
});
