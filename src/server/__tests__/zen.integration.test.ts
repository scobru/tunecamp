import express from "express";
import request from "supertest";
import { createZenRoutes } from "../routes/auth/zen.js";
import { jest } from "@jest/globals";
import crypto from "node:crypto";
import { generateKeyPair, signPayload } from "fid";
import type { FidKeyPair } from "fid";

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
        optionalAuth: (req: any, res: any, next: any) => {
            if (req.headers.authorization === "Bearer test-token") {
                req.username = mockUser.username;
                req.userId = mockUser.id;
                req.user = mockUser;
            }
            return next();
        }
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
            prepare: jest.fn(),
            getFidWebauthnKey: (credentialId: string) => webauthnKeys.get(credentialId),
            registerFidWebauthnKey: (credentialId: string, publicKeyPem: string) => {
                if (!webauthnKeys.has(credentialId)) webauthnKeys.set(credentialId, publicKeyPem);
            }
        },
        config: { jwtSecret: "test-secret", host: "test.tunecamp.net" }
    };

    // Keyed by username, mirrors the `admin` table rows the real DB would hold.
    let usersByUsername: Record<string, any> = {};
    // Stands in for the fid_webauthn_credentials table (credentialId -> pinned public key PEM).
    const webauthnKeys = new Map<string, string>();
    let nextUserId = 100;

    // Real Zen SEA keypairs so signature verification in the routes under test
    // succeeds against genuine crypto rather than fake/hardcoded strings.
    let baseKeys: FidKeyPair;
    let altKeys1: FidKeyPair;
    let altKeys2: FidKeyPair;

    beforeAll(async () => {
        baseKeys = await generateKeyPair();
        altKeys1 = await generateKeyPair();
        altKeys2 = await generateKeyPair();
    });

    beforeEach(() => {
        webauthnKeys.clear();
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
                zen_pub: baseKeys.pub,
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

    test("GET /api/auth/zen/challenge requires a session or a zenPubKey", async () => {
        const res = await request(app).get("/api/auth/zen/challenge");
        expect(res.status).toBe(401);
    });

    test("GET /api/auth/zen/challenge rejects an unknown zenPubKey", async () => {
        const strangerKeys = await generateKeyPair();
        const res = await request(app)
            .get("/api/auth/zen/challenge")
            .query({ zenPubKey: strangerKeys.pub });

        expect(res.status).toBe(404);
    });

    // The FID portal is a different origin with no session cookie; it identifies itself
    // by the zen_pub already linked to the account, and the signature it returns to
    // /link is what actually authenticates.
    test("GET /api/auth/zen/challenge issues a challenge for a linked zenPubKey without a session", async () => {
        const res = await request(app)
            .get("/api/auth/zen/challenge")
            .query({ zenPubKey: baseKeys.pub });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.challenge.username).toBe("scobru");
        expect(res.body.challenge.nonce).toBeDefined();
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
                zenPubKey: baseKeys.pub,
                challenge: { nonce: "invalid_nonce", instanceDomain: "test.tunecamp.net" },
                seaSignature: "mock_sig"
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain("invalid/expired challenge nonce");
    });

    test("POST /api/auth/zen/link issues Instance Passport Badge on valid nonce", async () => {
        const challengeRes = await request(app)
            .get("/api/auth/zen/challenge")
            .set("Authorization", "Bearer test-token");

        const challenge = challengeRes.body.challenge;
        // /link resolves the account by zen_pub, so the signing key must be the one
        // already linked to the user the challenge was issued for.
        const seaSignature = await signPayload(`scobru:${challenge.nonce}`, baseKeys.priv);

        const linkRes = await request(app)
            .post("/api/auth/zen/link")
            .set("Authorization", "Bearer test-token")
            .send({
                zenPubKey: baseKeys.pub,
                challenge,
                seaSignature
            });

        expect(linkRes.status).toBe(200);
        expect(linkRes.body.success).toBe(true);
        expect(linkRes.body.passport).toBeDefined();
        expect(linkRes.body.passport.localUsername).toBe("scobru");
        expect(linkRes.body.passport.zenPubKey).toBe(baseKeys.pub);
        expect(linkRes.body.passport.passportSignature).toBeDefined();
    });

    // Helper to generate a valid apSeed (32 bytes = 64 hex chars)
    function validApSeed(): string {
        return crypto.randomBytes(32).toString("hex");
    }

    // Builds a real, verifiably-signed SSO token. `keys` picks the signing identity
    // (defaults to the seeded `scobru` user's keypair); `overrides` adjusts other fields.
    async function buildSsoToken(overrides: Record<string, any> = {}, keys: FidKeyPair = baseKeys) {
        const fields = {
            clientId: "tunecamp-instance",
            instanceDomain: "sudorecords.scobrudot.dev",
            username: "scobru",
            zenPubKey: keys.pub,
            issuedAt: Date.now(),
            nonce: crypto.randomBytes(16).toString("hex"),
            ...overrides
        };
        const tokenPayload = `${fields.clientId}:${fields.instanceDomain}:${fields.username}:${fields.zenPubKey}:${fields.issuedAt}:${fields.nonce}`;
        const signature = await signPayload(tokenPayload, keys.priv);
        return { ...fields, signature };
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
        const token = await buildSsoToken({ issuedAt: Date.now() - 20 * 60 * 1000 });
        const res = await request(app)
            .post("/api/auth/zen/sso")
            .send({ ssoToken: token, apSeed: validApSeed() });
        expect(res.status).toBe(401);
        expect(res.body.error).toContain("expired");
    });

    test("POST /api/auth/zen/sso rejects invalid apSeed length", async () => {
        const token = await buildSsoToken();
        const res = await request(app)
            .post("/api/auth/zen/sso")
            .send({ ssoToken: token, apSeed: "invalid" });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain("apSeed");
    });

    test("POST /api/auth/zen/sso creates new user on valid request", async () => {
        const token = await buildSsoToken({ username: "newlistener" }, altKeys1);
        const res = await request(app)
            .post("/api/auth/zen/sso")
            .send({ ssoToken: token, apSeed: validApSeed() });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.token).toBe("mock-jwt-token");
        expect(res.body.isNewUser).toBe(true);
        expect(res.body.username).toBe("newlistener");
    });

    test("POST /api/auth/zen/sso registers under a unique username when the desired handle is taken, keeping it as alias", async () => {
        const token = await buildSsoToken({ username: "scobru" }, altKeys2);
        const res = await request(app)
            .post("/api/auth/zen/sso")
            .send({ ssoToken: token, apSeed: validApSeed() });
        const expectedUsername = `scobru-${altKeys2.pub.slice(0, 6)}`;
        expect(res.status).toBe(200);
        expect(res.body.isNewUser).toBe(true);
        expect(res.body.username).toBe(expectedUsername);
        expect(mockContainer.authService.updateUserProfile).toHaveBeenCalledWith(expectedUsername, { alias: "scobru" });
    });

    test("POST /api/auth/zen/sso logs in existing user on valid request", async () => {
        const token = await buildSsoToken();
        const res = await request(app)
            .post("/api/auth/zen/sso")
            .send({ ssoToken: token, apSeed: validApSeed() });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.username).toBe("scobru");
    });

    // Minimal raw(r||s) -> DER encoder, mirroring what a real authenticator emits.
    function rawToDer(raw: Uint8Array): Uint8Array {
        const half = raw.length / 2;
        const encodeInt = (bytes: Uint8Array) => {
            let b = bytes;
            let i = 0;
            while (i < b.length - 1 && b[i] === 0 && (b[i + 1] & 0x80) === 0) i++;
            b = b.slice(i);
            if (b[0] & 0x80) b = Uint8Array.from([0, ...b]);
            return Uint8Array.from([0x02, b.length, ...b]);
        };
        const r = encodeInt(raw.slice(0, half));
        const s = encodeInt(raw.slice(half));
        return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
    }

    // Builds a genuinely signed WebAuthn SSO token for `credentialId`, signed by `keyPair`.
    async function buildWebauthnSsoToken(credentialId: string, keyPair: CryptoKey extends never ? never : any, username = "passkeyuser") {
        const spki = Buffer.from(await crypto.subtle.exportKey("spki", keyPair.publicKey)).toString("base64");
        const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${spki.match(/.{1,64}/g)!.join("\n")}\n-----END PUBLIC KEY-----\n`;

        const fields = {
            clientId: "tunecamp-instance",
            instanceDomain: "sudorecords.scobrudot.dev",
            username,
            zenPubKey: "",
            issuedAt: Date.now(),
            nonce: crypto.randomBytes(16).toString("hex")
        };
        const tokenPayload = `${fields.clientId}:${fields.instanceDomain}:${fields.username}:${credentialId}:${fields.issuedAt}:${fields.nonce}`;

        const authenticatorData = new Uint8Array(37);
        const challenge = crypto.createHash("sha256").update(tokenPayload).digest().toString("base64url");
        const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: "webauthn.get", challenge }));
        const clientDataHash = new Uint8Array(await crypto.subtle.digest("SHA-256", clientDataJSON));
        const signed = Uint8Array.from([...authenticatorData, ...clientDataHash]);
        const rawSig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keyPair.privateKey, signed));

        return {
            ...fields,
            signature: Buffer.from(rawToDer(rawSig)).toString("base64url"),
            masterKeySource: { type: "webauthn", credentialId, publicKeyPem },
            webauthnAssertion: {
                authenticatorData: Buffer.from(authenticatorData).toString("base64url"),
                clientDataJSON: Buffer.from(clientDataJSON).toString("base64url")
            }
        };
    }

    test("POST /api/auth/zen/sso pins a passkey on first use and refuses a different key for the same credentialId", async () => {
        const victim = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
        const attacker = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
        const credentialId = "cred-passkey-1";

        // First sighting: nothing pinned yet, so the token's own key is accepted and stored.
        const first = await request(app)
            .post("/api/auth/zen/sso")
            .send({ ssoToken: await buildWebauthnSsoToken(credentialId, victim), apSeed: validApSeed() });
        expect(first.status).toBe(200);
        expect(first.body.success).toBe(true);
        expect(webauthnKeys.get(credentialId)).toBeDefined();

        // The attacker knows the credentialId (it travels in every token) but not the private
        // half, so they sign with their own key and claim the victim's credential.
        const forged = await request(app)
            .post("/api/auth/zen/sso")
            .send({ ssoToken: await buildWebauthnSsoToken(credentialId, attacker), apSeed: validApSeed() });
        expect(forged.status).toBe(400);
        expect(forged.body.error).toContain("does not match registered credential");
    });

    test("POST /api/auth/zen/sso in code mode returns a code instead of a session, redeemable exactly once", async () => {
        const token = await buildSsoToken({ username: "codeuser" }, altKeys1);
        const res = await request(app)
            .post("/api/auth/zen/sso")
            .send({ ssoToken: token, apSeed: validApSeed(), mode: "code" });

        expect(res.status).toBe(200);
        expect(res.body.code).toEqual(expect.any(String));
        // The portal is a third party: it must never come away holding a session for this instance.
        expect(res.body.token).toBeUndefined();

        const exchanged = await request(app)
            .post("/api/auth/zen/sso/exchange")
            .send({ code: res.body.code });
        expect(exchanged.status).toBe(200);
        expect(exchanged.body.token).toBe("mock-jwt-token");
        expect(exchanged.body.username).toBe("codeuser");

        // The code travels in the callback URL, so whoever reads it afterwards must get nothing.
        const replayed = await request(app)
            .post("/api/auth/zen/sso/exchange")
            .send({ code: res.body.code });
        expect(replayed.status).toBe(400);
        expect(replayed.body.error).toContain("already used");
    });

    test("POST /api/auth/zen/sso/exchange rejects a missing or unknown code", async () => {
        expect((await request(app).post("/api/auth/zen/sso/exchange").send({})).status).toBe(400);

        const bogus = await request(app)
            .post("/api/auth/zen/sso/exchange")
            .send({ code: "not-a-real-code" });
        expect(bogus.status).toBe(400);
        expect(bogus.body.error).toContain("Invalid");
    });

    test("GET /api/auth/zen/user/:username/public exports only public data", async () => {
        const res = await request(app).get("/api/auth/zen/user/scobru/public");
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.publicProfile.username).toBe("scobru");
        expect(res.body.publicProfile.artistName).toBe("Scobru Artist");
    });
});
