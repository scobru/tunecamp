import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import { createDatabase } from "../../database.js";

describe("Integration Manager", () => {
	let db: any;
	let logSpy: any;
	let warnSpy: any;
	let errorSpy: any;

	let primaryUserId: number;

	beforeAll(() => {
		logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		db = createDatabase(":memory:");

		primaryUserId = db.createUser("admin_int", "hashInt", null, "admin");
	});

	afterAll(() => {
		if (db?.db) db.db.close();
		logSpy.mockRestore();
		warnSpy.mockRestore();
		errorSpy.mockRestore();
	});

	// ── Storage Accounts ────────────────────────────────────────────────────

	describe("Storage Accounts", () => {
		test("CRUD operations for storage accounts", () => {
			const id = db.createStorageAccount({
				user_id: primaryUserId,
				provider: "gdrive",
				account_email: "test@gmail.com",
				access_token: "tok123",
				refresh_token: "ref123",
				expiry_date: Date.now() + 3600000,
			});
			expect(id).toBeGreaterThan(0);

			const acc = db.getStorageAccount(id);
			expect(acc).toBeDefined();
			expect(acc.account_email).toBe("test@gmail.com");
			expect(acc.provider).toBe("gdrive");

			const byProvider = db.getStorageAccountByProvider(primaryUserId, "gdrive");
			expect(byProvider).toBeDefined();
			expect(byProvider.id).toBe(id);

			const userAccounts = db.getStorageAccounts(primaryUserId);
			expect(userAccounts.some((a: any) => a.id === id)).toBe(true);

			db.updateStorageAccount(id, { access_token: "tok_updated" });
			expect(db.getStorageAccount(id).access_token).toBe("tok_updated");

			db.deleteStorageAccount(id);
			expect(db.getStorageAccount(id)).toBeUndefined();
		});
	});

	// ── Primary Admin Helper ────────────────────────────────────────────────

	describe("Primary Admin", () => {
		test("getPrimaryAdminId returns earliest admin id", () => {
			const adminId = db.getPrimaryAdminId();
			expect(adminId).toBe(primaryUserId);
		});
	});

	// ── Torrents ────────────────────────────────────────────────────────────

	describe("Torrents", () => {
		const infoHash = "0123456789abcdef0123456789abcdef01234567";

		test("createTorrent, getTorrent and updateTorrentProgress", () => {
			db.createTorrent({
				info_hash: infoHash,
				magnet_uri: `magnet:?xt=urn:btih:${infoHash}`,
				status: "downloading",
				owner_id: primaryUserId,
				name: "Cool Album FLAC",
				artist: "Cool Artist",
			});

			let torrent = db.getTorrent(infoHash);
			expect(torrent).toBeDefined();
			expect(torrent.name).toBe("Cool Album FLAC");
			expect(torrent.status).toBe("downloading");

			// Update progress
			db.updateTorrentProgress(infoHash, 0.75, "downloading", 1024, 512, 10, 1000000, "/tmp/cool.torrent");
			torrent = db.getTorrent(infoHash);
			expect(torrent.progress).toBe(0.75);
			expect(torrent.num_peers).toBe(10);

			// Update status
			db.updateTorrentStatus(infoHash, "seeding");
			expect(db.getTorrent(infoHash).status).toBe("seeding");

			// Delete
			db.deleteTorrent(infoHash);
			expect(db.getTorrent(infoHash)).toBeUndefined();
		});
	});

	// ── Unlock Codes ────────────────────────────────────────────────────────

	describe("Unlock Codes", () => {
		let releaseId: number;
		let trackId: number;

		beforeEach(() => {
			const artistId = db.createArtist("Unlock Artist");
			releaseId = db.createAlbum({
				title: "Unlock Album",
				artist_id: artistId,
				owner_id: primaryUserId,
				visibility: "public",
			});
			trackId = db.createTrack({
				title: "Unlock Track",
				album_id: releaseId,
				artist_id: artistId,
				duration: 100,
				file_path: "unlock/track.mp3",
			});
		});

		test("create, validate, redeem unlock code", () => {
			const code = "DISCOUNT-50-OFF";
			db.createUnlockCode(code, releaseId, trackId, "0xtransactionhash", undefined, primaryUserId);

			let status = db.validateUnlockCode(code);
			expect(status.valid).toBe(true);
			expect(status.isUsed).toBe(false);
			expect(status.releaseId).toBe(releaseId);
			expect(status.trackId).toBe(trackId);

			// Redeem
			db.redeemUnlockCode(code);
			status = db.validateUnlockCode(code);
			expect(status.valid).toBe(true);
			expect(status.isUsed).toBe(true);

			// Invalid code
			expect(db.validateUnlockCode("NON-EXISTENT").valid).toBe(false);
		});

		test("getPurchasesByUser and listUnlockCodes", () => {
			const code = "PURCHASE-USER-1";
			db.createUnlockCode(code, null, null, "0xtx123", null, primaryUserId);

			const list = db.listUnlockCodes();
			expect(list.some((c: any) => c.code === code)).toBe(true);

			const userPurchases = db.getPurchasesByUser(primaryUserId);
			expect(userPurchases.some((p: any) => p.code === code)).toBe(true);

			const byTx = db.getUnlockCodeByTxHash("0xtx123");
			expect(byTx).toBeDefined();
			expect(byTx.code).toBe(code);
		});
	});

	// ── Assets ──────────────────────────────────────────────────────────────

	describe("Assets", () => {
		test("create, get, update, and delete asset", () => {
			const artistId = db.createArtist("Asset Artist");
			const assetId = db.createAsset({
				title: "Exclusive Synth Pack",
				description: "Stems and MIDI",
				artist_id: artistId,
				owner_id: primaryUserId,
				type: "sample_pack",
				price: 10,
				currency: "USDC",
				visibility: "public",
				requires_subscription: false,
			});

			expect(assetId).toBeGreaterThan(0);

			const asset = db.getAsset(assetId);
			expect(asset).toBeDefined();
			expect(asset.title).toBe("Exclusive Synth Pack");
			expect(asset.slug).toBeDefined();
			expect(asset.artist_name).toBe("Asset Artist");

			const bySlug = db.getAssetBySlug(asset.slug);
			expect(bySlug).toBeDefined();
			expect(bySlug.id).toBe(assetId);

			// Update
			db.updateAsset(assetId, {
				title: "Updated Synth Pack",
				price: 15,
				requires_subscription: true,
			});

			const updated = db.getAsset(assetId);
			expect(updated.title).toBe("Updated Synth Pack");
			expect(updated.price).toBe(15);
			expect(updated.requires_subscription).toBe(1);

			// Filter lists
			const publicAssets = db.getPublicAssets();
			expect(publicAssets.some((a: any) => a.id === assetId)).toBe(true);

			const artistAssets = db.getAssetsByArtist(artistId);
			expect(artistAssets.some((a: any) => a.id === assetId)).toBe(true);

			// Delete
			db.deleteAsset(assetId);
			expect(db.getAsset(assetId)).toBeUndefined();
		});
	});
});
