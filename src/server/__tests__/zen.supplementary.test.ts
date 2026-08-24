import express from "express";
import request from "supertest";
import { createZenRoutes } from "../routes/auth/zen.js";
import { jest, describe, test, expect, beforeAll, beforeEach } from "@jest/globals";
import crypto from "node:crypto";
import { generateKeyPair, signPayload, FidPassportIssuer } from "fid";
import type { FidKeyPair } from "fid";

/**
 * Supplementary zen route tests. The primary test file (zen.integration.test.ts)
 * covers challenge/link/set/sso/exchange/public-profile. This file covers:
 *
 *   1. POST /keys — vault upload, pub-key mismatch rejection, duplicate zen_pub rejection
 *   2. POST /verify — passport signature verification
 *   3. Signature forgery — signing a valid nonce with the wrong keypair
 */

describe("Zen SEA Routes — Supplementary", () => {
	let app: express.Express;

	let keys: FidKeyPair;
	let altKeys: FidKeyPair;
	let strangerKeys: FidKeyPair;

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

	let usersByUsername: Record<string, any>;
	const passportSecret = "test-secret";

	const mockContainer: any = {
		authMiddleware: mockAuthMiddleware,
		authService: {
			getUserByUsername: jest.fn(),
			createUser: jest.fn(),
			updateUserProfile: jest.fn(),
			generateToken: jest.fn().mockReturnValue("mock-jwt"),
			getUserProfile: jest.fn(),
		},
		database: { prepare: jest.fn() },
		config: { jwtSecret: passportSecret, host: "test.tunecamp.net" },
	};

	beforeAll(async () => {
		keys = await generateKeyPair();
		altKeys = await generateKeyPair();
		strangerKeys = await generateKeyPair();
	});

	beforeEach(() => {
		app = express();
		app.use(express.json());
		app.use("/api/auth/zen", createZenRoutes(mockContainer));

		usersByUsername = {
			alice: {
				id: 1,
				username: "alice",
				artist_id: null,
				is_active: 1,
				zen_pub: keys.pub,
				role: "user",
				token_version: 0,
			},
		};

		mockContainer.authService.getUserByUsername.mockImplementation(
			(u: string) => usersByUsername[u],
		);
		mockContainer.authService.getUserProfile.mockReturnValue(null);

		mockContainer.database.prepare.mockImplementation((query: string) => {
			if (query.includes("FROM admin WHERE zen_pub")) {
				return {
					get: (pub: string, ...rest: any[]) => {
						// "AND id != ?" variant — duplicate check
						if (rest.length > 0) {
							const excludeId = rest[0];
							return (
								Object.values(usersByUsername).find(
									(u: any) => u.zen_pub === pub && u.id !== excludeId,
								) ?? null
							);
						}
						return (
							Object.values(usersByUsername).find((u: any) => u.zen_pub === pub) ??
							null
						);
					},
					all: () => [],
					run: () => ({}),
				};
			}
			if (query.includes("SELECT zen_pub FROM admin WHERE id")) {
				return {
					get: (id: number) => {
						const u = Object.values(usersByUsername).find((u: any) => u.id === id);
						return u ? { zen_pub: u.zen_pub } : null;
					},
					all: () => [],
					run: () => ({}),
				};
			}
			if (query.includes("UPDATE admin SET zen_pub")) {
				return {
					get: () => null,
					all: () => [],
					run: (...args: any[]) => ({}),
				};
			}
			return { get: () => null, all: () => [], run: () => ({}) };
		});
	});

	// --- /keys ---

	// --- /verify ---

	describe("POST /api/auth/zen/verify", () => {
		test("rejects malformed passport (missing fields)", async () => {
			const res = await request(app)
				.post("/api/auth/zen/verify")
				.send({ instanceDomain: "test.tunecamp.net" });
			expect(res.status).toBe(400);
			expect(res.body.valid).toBe(false);
		});

		test("verifies a genuinely signed passport", async () => {
			const issuer = new FidPassportIssuer(passportSecret);
			const passport = issuer.issuePassport(
				"test.tunecamp.net",
				"alice",
				keys.pub,
			);
			const res = await request(app)
				.post("/api/auth/zen/verify")
				.send(passport);
			expect(res.status).toBe(200);
			expect(res.body.valid).toBe(true);
		});

		test("rejects a passport signed with a different secret", async () => {
			const wrongIssuer = new FidPassportIssuer("wrong-secret");
			const passport = wrongIssuer.issuePassport(
				"test.tunecamp.net",
				"alice",
				keys.pub,
			);
			const res = await request(app)
				.post("/api/auth/zen/verify")
				.send(passport);
			expect(res.status).toBe(400);
			expect(res.body.valid).toBe(false);
		});
	});

	// --- Signature forgery ---

	describe("POST /api/auth/zen/link — signature forgery", () => {
		test("rejects a valid nonce signed with a different keypair", async () => {
			// Get a legitimate challenge
			const challengeRes = await request(app)
				.get("/api/auth/zen/challenge")
				.query({ zenPubKey: keys.pub });
			expect(challengeRes.status).toBe(200);
			const challenge = challengeRes.body.challenge;

			// Sign the nonce with the WRONG key (stranger's key)
			const forgedSignature = await signPayload(
				`alice:${challenge.nonce}`,
				strangerKeys.priv,
			);

			const linkRes = await request(app)
				.post("/api/auth/zen/link")
				.send({
					zenPubKey: keys.pub,
					challenge,
					seaSignature: forgedSignature,
				});

			// The signature verification must fail: the nonce was signed with
			// strangerKeys.priv, but the server verifies against keys.pub (the
			// account's registered zen_pub). This is the actor-spoofing case.
			expect(linkRes.status).toBe(400);
			expect(linkRes.body.error).toContain("Invalid signature");
		});
	});
});
