import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import path from "path";
import os from "os";
import fsExtra from "fs-extra";
import { createDatabase } from "../../database.js";
import { createIntegrationManager } from "../integration.js";
import type { DatabaseService } from "../../database.types.js";

describe("IntegrationManager", () => {
    let dbService: DatabaseService;
    let dbPath: string;

    beforeEach(() => {
        dbPath = path.join(os.tmpdir(), `tunecamp-integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

    describe("Storage Accounts", () => {
        it("creates, updates with allowlist, and deletes storage accounts", () => {
            const integration = createIntegrationManager(dbService.db);
            const accountId = integration.createStorageAccount({
                user_id: 1,
                provider: "gdrive",
                account_email: "test@example.com",
                access_token: "token123",
                refresh_token: "refresh123",
                expiry_date: 1234567890
            });
            expect(accountId).toBeGreaterThan(0);

            const acc = integration.getStorageAccount(accountId);
            expect(acc).toBeDefined();
            expect(acc?.account_email).toBe("test@example.com");

            // Update with allowlisted field
            integration.updateStorageAccount(accountId, {
                access_token: "new_token",
                disallowed_field: "ignored"
            });

            const updated = integration.getStorageAccount(accountId);
            expect(updated?.access_token).toBe("new_token");

            // Get by provider
            const byProv = integration.getStorageAccountByProvider(1, "gdrive");
            expect(byProv?.id).toBe(accountId);

            // Delete
            integration.deleteStorageAccount(accountId);
            expect(integration.getStorageAccount(accountId)).toBeUndefined();
        });
    });

    describe("Unlock Codes", () => {
        it("creates, validates, and redeems unlock codes", () => {
            const integration = createIntegrationManager(dbService.db);
            integration.createUnlockCode("CODE-ABC-123", 10, 20, "0xtxhash", 30, 1);

            const val = integration.validateUnlockCode("CODE-ABC-123");
            expect(val.valid).toBe(true);
            expect(val.releaseId).toBe(10);
            expect(val.trackId).toBe(20);
            expect(val.assetId).toBe(30);
            expect(val.isUsed).toBe(false);

            // Lookup by tx hash
            const byTx = integration.getUnlockCodeByTxHash("0xtxhash");
            expect(byTx).toBeDefined();

            // Redeem
            integration.redeemUnlockCode("CODE-ABC-123");
            const redeemed = integration.validateUnlockCode("CODE-ABC-123");
            expect(redeemed.valid).toBe(true);
            expect(redeemed.isUsed).toBe(true);

            // Invalid code
            const invalid = integration.validateUnlockCode("NON-EXISTENT");
            expect(invalid.valid).toBe(false);
        });
    });

    describe("Digital Assets", () => {
        it("creates, fetches, updates, and deletes assets", () => {
            const integration = createIntegrationManager(dbService.db);
            const assetId = integration.createAsset({
                title: "Sample Pack Vol 1",
                description: "Dope drums",
                price: 15,
                currency: "USD",
                visibility: "public"
            });
            expect(assetId).toBeGreaterThan(0);

            const asset = integration.getAsset(assetId);
            expect(asset).toBeDefined();
            expect(asset.title).toBe("Sample Pack Vol 1");
            expect(asset.slug).toContain("sample-pack-vol-1");

            const bySlug = integration.getAssetBySlug(asset.slug);
            expect(bySlug?.id).toBe(assetId);

            const publicAssets = integration.getPublicAssets();
            expect(publicAssets.some(a => a.id === assetId)).toBe(true);

            // Update
            integration.updateAsset(assetId, {
                title: "Updated Sample Pack",
                price: 20
            });
            const updated = integration.getAsset(assetId);
            expect(updated.title).toBe("Updated Sample Pack");
            expect(updated.price).toBe(20);

            // Delete
            integration.deleteAsset(assetId);
            expect(integration.getAsset(assetId)).toBeUndefined();
        });
    });

    describe("Torrents", () => {
        it("creates, updates, and deletes torrent entries", () => {
            const integration = createIntegrationManager(dbService.db);
            const hash = "0123456789abcdef0123456789abcdef01234567";

            integration.createTorrent({
                info_hash: hash,
                magnet_uri: `magnet:?xt=urn:btih:${hash}`,
                status: "downloading",
                name: "Test Album"
            });

            const t = integration.getTorrent(hash);
            expect(t).toBeDefined();
            expect(t?.name).toBe("Test Album");

            integration.updateTorrentProgress(hash, 0.75, "downloading", 1024, 512, 10, 50000000, "/tmp/test");
            const updated = integration.getTorrent(hash);
            expect(updated?.progress).toBe(0.75);
            expect(updated?.path).toBe("/tmp/test");

            integration.deleteTorrent(hash);
            expect(integration.getTorrent(hash)).toBeUndefined();
        });
    });
});
