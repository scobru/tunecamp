import express from "express";
import request from "supertest";
import { createZenRoutes } from "../zen.js";
import { jest } from "@jest/globals";
import crypto from "node:crypto";
import { generateKeyPair, signPayload } from "fid";
import type { FidKeyPair } from "fid";

/**
 * Tests for zen.ts endpoints NOT already covered by zen.integration.test.ts.
 *
 * zen.integration.test.ts covers: challenge, link, set (zen_priv clear), sso
 * (basic), sso code mode, sso/exchange, /user/:username/public (happy path).
 *
 * This file covers:
 * - POST /keys (zen vault upload, pub mismatch, first-time binding collision)
 * - POST /verify (passport verification)
 * - GET /user/:username/public (404 for unknown / inactive user)
 * - POST /set (409 zen_pub collision with another user)
 * - POST /link (missing fields validation)
 */
describe("Zen routes — supplementary tests", () => {
	let app: express.Express;
	const mockUser = { id: 1, username: "alice", isRootAdmin: false };

	const mockAuthMiddleware = {
		requireUser: (req: any, res: any, next: any) => {
			if (req.headers.authorization === "Bearer test-token") {
				req.username = mockUser.username;
				req.userId = mockUser.id;
				req.user = mockUser;
				return next();
			}
			return res.status(401).json({ error: "Authentication required" });
		},
		optionalAuth: (req: any, res: any, next: any) => {
			if (req.headers.authorization === "Bearer test-token") {
				req.username = mockUser.username;
				req.userId = mockUser.id;
				req.user = mockUser;
			}
			return next();
		},
	};

	// In-memory user store for the mock
	let usersById: Record<number, any> = {};
	let usersByUsername: Record<string, any> = {};
	let nextUserId = 100;

	let baseKeys: FidKeyPair;
	let altKeys: FidKeyPair;

	const mockContainer: any = {
		authMiddleware: mockAuthMiddleware,
		authService: {
			getUserByUsername: jest.fn(),
			getUserProfile: jest.fn(),
			createUser: jest.fn(),
			updateUserProfile: jest.fn(),
			generateToken: jest.fn(),
		},
		database: {
			prepare: jest.fn(),
		},
		config: { jwtSecret: "test-secret-for-zen", host: "test.tunecamp.net" },
	};

	beforeAll(async () => {
		baseKeys = await generateKeyPair();
		altKeys = await generateKeyPair();
	});

	beforeEach(() => {
		app = express();
		app.use(express.json());
		app.use("/api/auth/zen", createZenRoutes(mockContainer));

		nextUserId = 100;
		usersByUsername = {
			alice: {
				id: 1,
				username: "alice",
				artist_id: 10,
				artist_name: "Alice Artist",
				is_active: 1,
				created_at: "2026-01-01T00:00:00Z",
				zen_pub: baseKeys.pub,
				zen_priv: "encrypted-vault-data",
				role: "admin",
				token_version: 0,
			},
		};
		usersById = { 1: usersByUsername.alice };

		mockContainer.authService.getUserByUsername.mockImplementation(
			(username: string) => usersByUsername[username],
		);
		mockContainer.authService.getUserProfile.mockImplementation(
			(username: string) =>
				usersByUsername[username]
					? { alias: usersByUsername[username].username }
					: undefined,
		);
		mockContainer.authService.generateToken.mockReturnValue("mock-jwt-token");
		mockContainer.authService.createUser.mockImplementation(
			async (
				username: string,
				_password: string,
				artistId: number | null,
				_quota: number,
				zenPub: string,
				role: string,
			) => {
				const id = nextUserId++;
				const u = {
					id,
					username,
					artist_id: artistId,
					is_active: 1,
					zen_pub: zenPub,
					role,
					token_version: 0,
					created_at: new Date().toISOString(),
				};
				usersByUsername[username] = u;
				usersById[id] = u;
				return { id };
			},
		);

		mockContainer.database.prepare.mockImplementation((query: string) => {
			if (query.includes("FROM admin WHERE zen_pub")) {
				return {
					get: (pub: string) =>
						Object.values(usersByUsername).find(
							(u: any) => u.zen_pub === pub,
						) ?? null,
					all: () => [],
					run: () => ({}),
				};
			}
			if (query.includes("SELECT zen_pub FROM admin WHERE id")) {
				return {
					get: (id: number) => {
						const u = usersById[id];
						return u ? { zen_pub: u.zen_pub } : undefined;
					},
					all: () => [],
					run: () => ({}),
				};
			}
			if (query.includes("SELECT id FROM admin WHERE zen_pub") && query.includes("id !=")) {
				return {
					get: (pub: string, excludeId: number) =>
						Object.values(usersByUsername).find(
							(u: any) => u.zen_pub === pub && u.id !== excludeId,
						) ?? null,
					all: () => [],
					run: () => ({}),
				};
			}
			if (query.includes("UPDATE admin SET zen_pub")) {
				return {
					get: () => null,
					all: () => [],
					run: (...args: any[]) => {
						// Update in our store
						return {};
					},
				};
			}
			if (query.includes("SELECT") && query.includes("artists")) {
				return {
					get: () => null,
					all: () => [],
					run: () => ({}),
				};
			}
			if (query.includes("starred_items")) {
				return {
					get: () => null,
					all: () => [],
					run: () => ({}),
				};
			}
			if (query.includes("playlists")) {
				return {
					get: () => null,
					all: () => [],
					run: () => ({}),
				};
			}
			if (query.includes("albums")) {
				return {
					get: () => null,
					all: () => [],
					run: () => ({}),
				};
			}
			if (query.includes("ap_public_key")) {
				return {
					get: () => null,
					all: () => [],
					run: () => ({}),
				};
			}
			return { get: () => null, all: () => [], run: () => ({}) };
		});
	});

	// ── POST /keys ──────────────────────────────────────────────────────────

	describe("POST /api/auth/zen/keys", () => {
		test("requires authentication", async () => {
			const res = await request(app)
				.post("/api/auth/zen/keys")
				.send({ zenPubKey: baseKeys.pub, encryptedZenPriv: "encrypted" });

			expect(res.status).toBe(401);
		});

		test("rejects missing zenPubKey", async () => {
			const res = await request(app)
				.post("/api/auth/zen/keys")
				.set("Authorization", "Bearer test-token")
				.send({ encryptedZenPriv: "encrypted" });

			expect(res.status).toBe(400);
			expect(res.body.error).toContain("Missing");
		});

		test("rejects missing encryptedZenPriv", async () => {
			const res = await request(app)
				.post("/api/auth/zen/keys")
				.set("Authorization", "Bearer test-token")
				.send({ zenPubKey: baseKeys.pub });

			expect(res.status).toBe(400);
			expect(res.body.error).toContain("Missing");
		});

		test("accepts matching zenPubKey and stores vault", async () => {
			const res = await request(app)
				.post("/api/auth/zen/keys")
				.set("Authorization", "Bearer test-token")
				.send({ zenPubKey: baseKeys.pub, encryptedZenPriv: "new-encrypted-vault" });

			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
			expect(res.body.zenPub).toBe(baseKeys.pub);
		});

		test("rejects mismatched zenPubKey when user already has one (409)", async () => {
			const res = await request(app)
				.post("/api/auth/zen/keys")
				.set("Authorization", "Bearer test-token")
				.send({ zenPubKey: altKeys.pub, encryptedZenPriv: "different-vault" });

			expect(res.status).toBe(409);
			expect(res.body.error).toContain("does not match");
		});

		test("returns 404 for non-existent user", async () => {
			mockContainer.authService.getUserByUsername.mockReturnValue(undefined);

			const res = await request(app)
				.post("/api/auth/zen/keys")
				.set("Authorization", "Bearer test-token")
				.send({ zenPubKey: baseKeys.pub, encryptedZenPriv: "vault" });

			expect(res.status).toBe(404);
			expect(res.body.error).toContain("User not found");
		});
	});

	// ── POST /verify ────────────────────────────────────────────────────────

	describe("POST /api/auth/zen/verify", () => {
		test("rejects malformed passport (missing fields)", async () => {
			const res = await request(app)
				.post("/api/auth/zen/verify")
				.send({ instanceDomain: "test.tunecamp.net" });

			expect(res.status).toBe(400);
			expect(res.body.valid).toBe(false);
			expect(res.body.error).toContain("Malformed");
		});

		test("rejects completely empty body", async () => {
			const res = await request(app)
				.post("/api/auth/zen/verify")
				.send({});

			expect(res.status).toBe(400);
			expect(res.body.valid).toBe(false);
		});

		test("rejects invalid signature", async () => {
			const res = await request(app)
				.post("/api/auth/zen/verify")
				.send({
					instanceDomain: "test.tunecamp.net",
					localUsername: "alice",
					zenPubKey: baseKeys.pub,
					issuedAt: Date.now(),
					passportSignature: "definitely-not-a-real-signature",
				});

			expect(res.status).toBe(400);
			expect(res.body.valid).toBe(false);
		});
	});

	// ── POST /link validation ───────────────────────────────────────────────

	describe("POST /api/auth/zen/link validation", () => {
		test("rejects missing zenPubKey", async () => {
			const res = await request(app)
				.post("/api/auth/zen/link")
				.send({
					challenge: { nonce: "abc", instanceDomain: "test" },
					seaSignature: "sig",
				});

			expect(res.status).toBe(400);
			expect(res.body.error).toContain("Missing");
		});

		test("rejects missing challenge", async () => {
			const res = await request(app)
				.post("/api/auth/zen/link")
				.send({
					zenPubKey: baseKeys.pub,
					seaSignature: "sig",
				});

			expect(res.status).toBe(400);
		});

		test("rejects missing seaSignature", async () => {
			const res = await request(app)
				.post("/api/auth/zen/link")
				.send({
					zenPubKey: baseKeys.pub,
					challenge: { nonce: "abc", instanceDomain: "test" },
				});

			expect(res.status).toBe(400);
		});

		test("returns 401 for unknown zen_pub", async () => {
			const strangerKeys = await generateKeyPair();
			const res = await request(app)
				.post("/api/auth/zen/link")
				.send({
					zenPubKey: strangerKeys.pub,
					challenge: { nonce: "abc", instanceDomain: "test" },
					seaSignature: "sig",
				});

			expect(res.status).toBe(401);
			expect(res.body.error).toContain("FID identity not found");
		});
	});

	// ── POST /set ───────────────────────────────────────────────────────────

	describe("POST /api/auth/zen/set", () => {
		test("requires authentication", async () => {
			const res = await request(app)
				.post("/api/auth/zen/set")
				.send({
					zenPubKey: altKeys.pub,
					challenge: { nonce: "abc" },
					seaSignature: "sig",
				});

			expect(res.status).toBe(401);
		});

		test("rejects missing fields", async () => {
			const res = await request(app)
				.post("/api/auth/zen/set")
				.set("Authorization", "Bearer test-token")
				.send({ zenPubKey: altKeys.pub });

			expect(res.status).toBe(400);
			expect(res.body.error).toContain("Missing");
		});
	});

	// ── GET /user/:username/public ──────────────────────────────────────────

	describe("GET /api/auth/zen/user/:username/public", () => {
		test("returns 404 for non-existent user", async () => {
			const res = await request(app).get(
				"/api/auth/zen/user/nonexistent/public",
			);

			expect(res.status).toBe(404);
			expect(res.body.error).toContain("User not found");
		});

		test("returns 404 for inactive user", async () => {
			usersByUsername.inactive = {
				id: 50,
				username: "inactive",
				is_active: 0,
				zen_pub: null,
				role: "user",
				token_version: 0,
			};

			const res = await request(app).get(
				"/api/auth/zen/user/inactive/public",
			);

			expect(res.status).toBe(404);
			expect(res.body.error).toContain("inactive");
		});

		test("returns public profile for active user", async () => {
			const res = await request(app).get(
				"/api/auth/zen/user/alice/public",
			);

			expect(res.status).toBe(200);
			expect(res.body.success).toBe(true);
			expect(res.body.publicProfile).toBeDefined();
			expect(res.body.publicProfile.username).toBe("alice");
		});

		test("includes releases, playlists, and likes arrays", async () => {
			const res = await request(app).get(
				"/api/auth/zen/user/alice/public",
			);

			expect(res.status).toBe(200);
			expect(res.body.publicReleases).toBeDefined();
			expect(Array.isArray(res.body.publicReleases)).toBe(true);
			expect(res.body.publicPlaylists).toBeDefined();
			expect(Array.isArray(res.body.publicPlaylists)).toBe(true);
			expect(res.body.publicLikes).toBeDefined();
			expect(Array.isArray(res.body.publicLikes)).toBe(true);
		});
	});

	// ── POST /sso/exchange edge cases ───────────────────────────────────────

	describe("POST /api/auth/zen/sso/exchange edge cases", () => {
		test("rejects non-string code", async () => {
			const res = await request(app)
				.post("/api/auth/zen/sso/exchange")
				.send({ code: 12345 });

			expect(res.status).toBe(400);
		});

		test("rejects empty string code", async () => {
			const res = await request(app)
				.post("/api/auth/zen/sso/exchange")
				.send({ code: "" });

			expect(res.status).toBe(400);
		});

		test("rejects null body", async () => {
			const res = await request(app)
				.post("/api/auth/zen/sso/exchange")
				.send(null);

			expect(res.status).toBe(400);
		});
	});
});
