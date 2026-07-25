import express from "express";
import request from "supertest";
import { createZenRoutes } from "../routes/auth/zen.js";

describe("Zen SEA Integration Routes", () => {
    let app: express.Express;
    const mockUser = { id: 1, username: "scobru", isRootAdmin: false };

    const mockAuthMiddleware = {
        requireUser: (req: any, res: any, next: any) => {
            if (req.headers.authorization === "Bearer test-token") {
                req.user = mockUser;
                return next();
            }
            return res.status(401).json({ error: "Authentication required" });
        },
        optionalAuth: (req: any, res: any, next: any) => next()
    };

    const mockAuthService = {
        getUserByUsername: (username: string) => {
            if (username === "scobru") {
                return {
                    id: 1,
                    username: "scobru",
                    artist_id: 10,
                    artist_name: "Scobru Artist",
                    is_active: 1,
                    created_at: "2026-07-25T00:00:00Z"
                };
            }
            return undefined;
        }
    };

    const mockDatabase = {
        prepare: (query: string) => ({
            get: () => ({ id: 10, name: "Scobru Artist", bio: "Producer & DJ", image_url: "https://example.com/avatar.jpg" }),
            all: () => []
        })
    };

    const mockContainer: any = {
        authMiddleware: mockAuthMiddleware,
        authService: mockAuthService,
        database: mockDatabase,
        config: { jwtSecret: "test-secret", host: "test.tunecamp.net" }
    };

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use("/api/auth/zen", createZenRoutes(mockContainer));
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

    test("GET /api/auth/zen/user/:username/public exports only public data", async () => {
        const res = await request(app).get("/api/auth/zen/user/scobru/public");
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.publicProfile.username).toBe("scobru");
        expect(res.body.publicProfile.artistName).toBe("Scobru Artist");
    });
});
