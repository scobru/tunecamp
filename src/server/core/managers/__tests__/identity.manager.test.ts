import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import path from "path";
import os from "os";
import fsExtra from "fs-extra";
import { createDatabase } from "../../database.js";
import { createIdentityManager } from "../identity.js";
import type { DatabaseService } from "../../database.types.js";

describe("IdentityManager", () => {
    let dbService: DatabaseService;
    let dbPath: string;

    beforeEach(() => {
        dbPath = path.join(os.tmpdir(), `tunecamp-identity-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
        dbService = createDatabase(dbPath);
    });

    afterEach(() => {
        try {
            dbService.db.close();
            for (const suffix of ["", "-wal", "-shm"]) {
                try { fsExtra.unlinkSync(`${dbPath}${suffix}`); } catch {}
            }
        } catch {}
    });

    it("creates, retrieves, and lists users", () => {
        const identity = createIdentityManager(dbService.db);
        const userId = identity.createUser("alice", "hashed_pw", null, "admin");
        expect(userId).toBeGreaterThan(0);

        const user = identity.getUser(userId);
        expect(user).toBeDefined();
        expect(user?.username).toBe("alice");
        expect(user?.role).toBe("admin");

        const byName = identity.getUserByUsername("alice");
        expect(byName?.id).toBe(userId);

        const admins = identity.getAdmins();
        expect(admins.some(a => a.id === userId)).toBe(true);
    });

    it("filters updateUser against allowed columns and ignores disallowed keys", () => {
        const identity = createIdentityManager(dbService.db);
        const userId = identity.createUser("bob", "hashed_pw", null, "user");

        // Allowed keys update
        identity.updateUser(userId, {
            is_active: 0,
            storage_quota: 5000,
            role: "curator"
        } as any);

        let user = identity.getUser(userId);
        expect(user?.is_active).toBe(0);
        expect(user?.storage_quota).toBe(5000);
        expect(user?.role).toBe("curator");

        // Disallowed keys (e.g. non-existent or dangerous fields) should be filtered out safely without error
        identity.updateUser(userId, {
            zen_pub: "not-in-allowed-list",
            non_existent_column: "dangerous"
        } as any);

        user = identity.getUser(userId);
        expect((user as any).zen_pub).toBeNull();
    });

    it("manages user subscriptions", () => {
        const identity = createIdentityManager(dbService.db);
        const userId = identity.createUser("subscriber", "pw", null, "user");

        const initial = identity.getUserSubscription(userId);
        expect(initial.status).toBe("none");
        expect(initial.expiresAt).toBeNull();

        const expiry = new Date(Date.now() + 30 * 86400000).toISOString();
        identity.updateSubscription(userId, "active", expiry);

        const updated = identity.getUserSubscription(userId);
        expect(updated.status).toBe("active");
        expect(updated.expiresAt).toBe(expiry);
    });

    it("stores, retrieves, and overrides settings", () => {
        const identity = createIdentityManager(dbService.db);
        identity.setSetting("siteName", "Test Music Hub");
        identity.setSetting("theme", "dark");

        expect(identity.getSetting("siteName")).toBe("Test Music Hub");
        expect(identity.getSetting("theme")).toBe("dark");

        const all = identity.getAllSettings();
        expect(all["siteName"]).toBe("Test Music Hub");
        expect(all["theme"]).toBe("dark");

        // Update existing setting
        identity.setSetting("siteName", "Updated Hub");
        expect(identity.getSetting("siteName")).toBe("Updated Hub");
    });

    it("manages system plugin states and configs", () => {
        const identity = createIdentityManager(dbService.db);
        identity.setPluginEnabled("scrobbler", true);
        identity.setPluginConfig("scrobbler", JSON.stringify({ apiKey: "12345" }));

        const state = identity.getPluginState("scrobbler");
        expect(state).toBeDefined();
        expect(state?.enabled).toBe(true);
        expect(JSON.parse(state?.config || "{}")).toEqual({ apiKey: "12345" });
    });

    it("manages ActivityPub user keys", () => {
        const identity = createIdentityManager(dbService.db);
        const userId = identity.createUser("apuser", "pw", null, "user");

        identity.updateUserApKeys(userId, "PUBKEY_PEM", "PRIVKEY_PEM");
        const user = identity.getUser(userId);
        expect(user?.ap_public_key).toBe("PUBKEY_PEM");
        expect(user?.ap_private_key).toBe("PRIVKEY_PEM");
    });

    it("deletes users", () => {
        const identity = createIdentityManager(dbService.db);
        const userId = identity.createUser("tempuser", "pw", null, "user");
        expect(identity.getUser(userId)).toBeDefined();

        identity.deleteUser(userId);
        expect(identity.getUser(userId)).toBeUndefined();
    });
});
