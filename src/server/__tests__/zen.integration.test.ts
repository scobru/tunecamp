import express from "express";
import request from "supertest";
import { createZenRoutes } from "../routes/auth/zen.js";
import { jest } from "@jest/globals";
import crypto from "node:crypto";

describe("Zen SEA Integration Routes", () => {
    let app: express.Express;
    const mockUser = { id: 1, username: "scobru", isRootAdmin: false };

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
        optionalAuth: (req: any, res: any, next: any) => next()
    };

    const mockContainer: any = {
        authMiddleware: mockAuthMiddleware,
        authService: {
            getUserByUsername: jest.fn(),
            createUser: jest.fn(),
            updateUserProfile: jest.fn(),
            generateToken: jest.fn()
        },
        database: {
            prepare: jest.fn()
        },
        config: { jwtSecret: "test-secret", host: "test.tunecamp.net" }
    };

    // Keyed by username, mirrors the `admin` table rows the real DB would hold.
    let usersByUsername: Record<string, any> = {};
    let nextUserId = 100;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use("/api/auth/zen", createZenRoutes(mockContainer));

        usersByUsername = {
            scobru: {
                id: 1,
                username: "scobru",
                artist_id: 10,
                artist_name: "Scobru Artist",
                is_active: 1,
                created_at: "2026-07-25T00:00:00Z",
                zen_pub: "0DGULtYbQYzYDlRUddrRNoS7NrEzGIZAsQrXSKQYThMX1",
                role: "admin",
                token_version: 0
            }
        };
        nextUserId = 100;

        mockContainer.authService.getUserByUsername.mockImplementation((username: string) => usersByUsername[username]);
        mockContainer.authService.createUser.mockImplementation(async (username: string, _password: string, artistId: number | null, _quota: number, zenPub: string, role: string) => {
            const id = nextUserId++;
            usersByUsername[username] = { id, username, artist_id: artistId, is_active: 1, zen_pub: zenPub, role, token_version: 0 };
            return { id };
        });
        mockContainer.authService.updateUserProfile.mockImplementation((username: string, updates: Record<string, any>) => {
            if (usersByUsername[username]) Object.assign(usersByUsername[username], updates);
        });
        mockContainer.authService.generateToken.mockReturnValue("mock-jwt-token");
        mockContainer.database.prepare.mockImplementation((query: string) => {
            if (query.includes("SELECT public_key FROM artists")) {
                return { get: () => null };
            } else if (query.includes("FROM admin WHERE zen_pub")) {
                return { get: (pub: string) => Object.values(usersByUsername).find((u: any) => u.zen_pub === pub) ?? null };
            } else if (query.includes("UPDATE artists SET")) {
                return { run: () => ({}) };
            } else {
                return { get: () => null, all: () => [] };
            }
        });
    });

    test("GET /api/auth/zen/challenge requires authentication", async () => {
        const res = await request(app).get("/api/auth/zen/challenge");
        expect(res.status).toBe(401);
    });

    test("GET /api/auth/zen/challenge returns challenge with nonce for logged in user", async () => {
        const res = await request(app)
            .get("/api/auth/zen/challenge")
            .set("Authorization", "Bearer test-token");

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.challenge).toBeDefined();
        expect(res.body.challenge.username).toBe("scobru");
        expect(res.body.challenge.nonce).toBeDefined();
    });

    test("POST /api/auth/zen/link fails with invalid or missing nonce", async () => {
        const res = await request(app)
            .post("/api/auth/zen/link")
            .set("Authorization", "Bearer test-token")
            .send({
                zenPubKey: "QmZenTest123",
                challenge: { nonce: "invalid_nonce", instanceDomain: "test.tunecamp.net" },
                seaSignature: "mock_sig"
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain("Invalid or expired challenge nonce");
    });

    test("POST /api/auth/zen/link issues Instance Passport Badge on valid nonce", async () => {
        const challengeRes = await request(app)
            .get("/api/auth/zen/challenge")
            .set("Authorization", "Bearer test-token");

        const challenge = challengeRes.body.challenge;

        const linkRes = await request(app)
            .post("/api/auth/zen/link")
            .set("Authorization", "Bearer test-token")
            .send({
                zenPubKey: "QmZenTest123",
                challenge,
                seaSignature: "mock_sig"
            });

        expect(linkRes.status).toBe(200);
        expect(linkRes.body.success).toBe(true);
        expect(linkRes.body.passport).toBeDefined();
        expect(linkRes.body.passport.localUsername).toBe("scobru");
        expect(linkRes.body.passport.zenPubKey).toBe("QmZenTest123");
        expect(linkRes.body.passport.passportSignature).toBeDefined();
    });

    // Helper to generate a valid apSeed (32 bytes = 64 hex chars)
    function validApSeed(): string {
        return crypto.randomBytes(32).toString("hex");
    }

    // Helper to generate a valid SSO token
    function validSsoToken(overrides: any = {}) {
        return {
            clientId: "tunecamp-instance",
            instanceDomain: "sudorecords.scobrudot.dev",
            username: "scobru",
            zenPubKey: "0DGULtYbQYzYDlRUddrRNoS7NrEzGIZAsQrXSKQYThMX1",
            issuedAt: Date.now(),
            signature: "5db5d4a77267f7483e54f86b8ebf39918149f969d088d15c63b6c4e892b398a2",
            nonce: "c905eda3fa4e2dee7e4f126ddd54cbbf",
            ...overrides
        };
    }

    test("POST /api/auth/zen/sso rejects missing ssoToken or apSeed", async () => {
        const res = await request(app)
            .post("/api/auth/zen/sso")
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain("Missing ssoToken or apSeed");
    });

    test("POST /api/auth/zen/sso rejects missing ssoToken fields", async () => {
        const res = await request(app)
            .post("/api/auth/zen/sso")
            .send({ ssoToken: { username: "scobru" }, apSeed: validApSeed() });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain("Missing required ssoToken fields");
    });

    test("POST /api/auth/zen/sso rejects expired token", async () => {
        const res = await request(app)
            .post("/api/auth/zen/sso")
            .send({ ssoToken: { ...validSsoToken(), issuedAt: Date.now() - 20 * 60 * 1000 }, apSeed: validApSeed() });
        expect(res.status).toBe(401);
        expect(res.body.error).toContain("expired");
    });

    test("POST /api/auth/zen/sso rejects invalid apSeed length", async () => {
        const res = await request(app)
            .post("/api/auth/zen/sso")
            .send({ ssoToken: validSsoToken(), apSeed: "invalid" });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain("apSeed");
    });

    test("POST /api/auth/zen/sso creates new user on valid request", async () => {
        const res = await request(app)
            .post("/api/auth/zen/sso")
            .send({ ssoToken: validSsoToken({ username: "newlistener", zenPubKey: "brandNewZenPubKey1234567890" }), apSeed: validApSeed() });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.token).toBe("mock-jwt-token");
        expect(res.body.isNewUser).toBe(true);
        expect(res.body.username).toBe("newlistener");
    });

    test("POST /api/auth/zen/sso registers under a unique username when the desired handle is taken, keeping it as alias", async () => {
        const res = await request(app)
            .post("/api/auth/zen/sso")
            .send({ ssoToken: validSsoToken({ username: "scobru", zenPubKey: "collidingZenPubKey0987654" }), apSeed: validApSeed() });
        expect(res.status).toBe(200);
        expect(res.body.isNewUser).toBe(true);
        expect(res.body.username).toBe("scobru-collid");
        expect(mockContainer.authService.updateUserProfile).toHaveBeenCalledWith("scobru-collid", { alias: "scobru" });
    });

    test("POST /api/auth/zen/sso logs in existing user on valid request", async () => {
        const res = await request(app)
            .post("/api/auth/zen/sso")
            .send({ ssoToken: validSsoToken(), apSeed: validApSeed() });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.username).toBe("scobru");
    });

    test("GET /api/auth/zen/user/:username/public exports only public data", async () => {
        const res = await request(app).get("/api/auth/zen/user/scobru/public");
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.publicProfile.username).toBe("scobru");
        expect(res.body.publicProfile.artistName).toBe("Scobru Artist");
    });
});
