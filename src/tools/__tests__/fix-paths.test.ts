import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import { createDatabase } from "../../server/core/database.js";
import { StringUtils } from "../../utils/stringUtils.js";

describe("CLI Tools - Path Cleaning & Fixing Logic", () => {
	let dbService: any;
	let albumId: number;

	beforeAll(() => {
		dbService = createDatabase(":memory:");
		const userId = dbService.createUser("path_owner", "pwd", undefined, "admin");
		const artistId = dbService.createArtist("Path Artist");
		albumId = dbService.createAlbum({
			title: "Path Album",
			artist_id: artistId,
			owner_id: userId,
			visibility: "public",
		});
	});

	afterAll(() => {
		if (dbService?.db) dbService.db.close();
	});

	test("StringUtils.cleanPath normalizes slashes and removes leading ../ artifacts", () => {
		expect(StringUtils.cleanPath("music\\artist\\album\\01.mp3")).toBe("music/artist/album/01.mp3");
		expect(StringUtils.cleanPath("../../music/tracks/test.flac")).toBe("music/tracks/test.flac");
		expect(StringUtils.cleanPath("../tracks/song.mp3")).toBe("tracks/song.mp3");
	});

	test("fixes dirty file paths in tracks table", () => {
		// Insert directly into tracks table to simulate pre-existing un-sanitized legacy rows
		const result = dbService.db
			.prepare(
				"INSERT INTO tracks (title, album_id, file_path, lossless_path) VALUES (?, ?, ?, ?)",
			)
			.run("Legacy Dirty Track", albumId, "downloads/dirty\\folder\\track.mp3", "..\\..\\lossless\\dirty\\track.flac");

		const trackId = result.lastInsertRowid;

		const rawTrack = dbService.db.prepare("SELECT * FROM tracks WHERE id = ?").get(trackId);
		expect(rawTrack.file_path).toBe("downloads/dirty\\folder\\track.mp3");

		const cleanedPath = StringUtils.cleanPath(rawTrack.file_path);
		const cleanedLossless = StringUtils.cleanPath(rawTrack.lossless_path);

		expect(cleanedPath).toBe("downloads/dirty/folder/track.mp3");
		expect(cleanedLossless).toBe("lossless/dirty/track.flac");

		// Execute update like fix-paths.ts
		dbService.db
			.prepare("UPDATE tracks SET file_path = ?, lossless_path = ? WHERE id = ?")
			.run(cleanedPath, cleanedLossless, trackId);

		const updatedTrack = dbService.db.prepare("SELECT * FROM tracks WHERE id = ?").get(trackId);
		expect(updatedTrack.file_path).toBe("downloads/dirty/folder/track.mp3");
		expect(updatedTrack.lossless_path).toBe("lossless/dirty/track.flac");
	});
});
