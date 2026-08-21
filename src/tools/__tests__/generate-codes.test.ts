import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { createDatabase } from "../../server/core/database.js";
import { StringUtils } from "../../utils/stringUtils.js";

describe("CLI Tools - Unlock Codes Generation Logic", () => {
	let dbService: any;
	let albumId: number;

	beforeAll(() => {
		dbService = createDatabase(":memory:");
		const userId = dbService.createUser("code_owner", "pwd", undefined, "admin");
		const artistId = dbService.createArtist("Code Artist");
		albumId = dbService.createAlbum({
			title: "Code Album",
			artist_id: artistId,
			owner_id: userId,
			visibility: "public",
		});
	});

	afterAll(() => {
		if (dbService?.db) dbService.db.close();
	});

	test("StringUtils.generateUnlockCode generates properly formatted coupon strings", () => {
		const code1 = StringUtils.generateUnlockCode();
		const code2 = StringUtils.generateUnlockCode();

		expect(code1).toBeDefined();
		expect(code1.length).toBeGreaterThanOrEqual(8);
		expect(code1).not.toBe(code2);
	});

	test("generates and inserts batch unlock codes for a target album", () => {
		const codes: string[] = [];
		const count = 15;

		for (let i = 0; i < count; i++) {
			codes.push(StringUtils.generateUnlockCode());
		}

		// Insert batch
		const insertCode = dbService.db.prepare(
			"INSERT INTO unlock_codes (code, release_id) VALUES (?, ?)",
		);
		const insertMany = dbService.db.transaction((generatedCodes: string[], relId: number) => {
			for (const code of generatedCodes) {
				insertCode.run(code, relId);
			}
		});

		insertMany(codes, albumId);

		const rows = dbService.db
			.prepare("SELECT * FROM unlock_codes WHERE release_id = ?")
			.all(albumId);

		expect(rows).toHaveLength(count);
		for (const code of codes) {
			const validation = dbService.validateUnlockCode(code);
			expect(validation.valid).toBe(true);
			expect(validation.isUsed).toBe(false);
			expect(validation.releaseId).toBe(albumId);
		}
	});
});
