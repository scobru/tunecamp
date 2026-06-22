import { createAuthService } from "./auth.service.js";
import sqlite3 from "better-sqlite3";
import { jest } from '@jest/globals';
import jwt from "jsonwebtoken";

const Database = sqlite3;

describe("AuthService", () => {
    let db: any;
    let authService: any;

    beforeEach(async () => {
        db = new Database(":memory:");
        db.exec(`
            CREATE TABLE IF NOT EXISTS gun_users (
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
        const admin = db.prepare("SELECT * FROM admin WHERE username = ?").get("admin");
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
            CREATE TABLE IF NOT EXISTS gun_users (
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
        const payload = { isAdmin: true, username: "admin", artistId: 1, role: "admin" as const, isActive: true, userId: 1, tokenVersion: 0 };
        const secret = "secret";

        test("generateToken and verifyToken (happy path)", async () => {
            const token = authService.generateToken(payload);
            expect(token).toBeDefined();

            const decoded = await authService.verifyToken(token);
            expect(decoded).toMatchObject(payload);
        });

        test("generateToken and verifyToken with null artistId", async () => {
            // Create user first to satisfy DB check in verifyToken
            await authService.createUser("user", "password", null, 0, undefined, "user");
            const nullArtistPayload = { isAdmin: false, username: "user", artistId: null, role: "user" as const, isActive: true, userId: 2, tokenVersion: 0 };
            
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
});
