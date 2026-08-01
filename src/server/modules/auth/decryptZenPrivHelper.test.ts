import { decryptZenPrivHelper, encryptZenPrivHelper } from "./auth.service.js";
import { describe, test, expect } from "@jest/globals";
import crypto from "crypto";

describe("decryptZenPrivHelper coverage test", () => {
	const TESTING_SECRET = "a-very-secure-testing-secret-key";
	const MOCK_DATA = { user: "admin", id: 99 };

	test("decrypts AES-256-GCM data correctly", () => {
		const encrypted = encryptZenPrivHelper(MOCK_DATA, TESTING_SECRET);
		const result = decryptZenPrivHelper(encrypted, TESTING_SECRET);
		expect(result).toEqual(MOCK_DATA);
	});

	test("decrypts AES-256-CBC legacy data correctly", () => {
		const key = crypto.createHash("sha256").update(TESTING_SECRET).digest();
		const iv = crypto.randomBytes(16);
		const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
		let dataHex = cipher.update(JSON.stringify(MOCK_DATA), "utf8", "hex");
		dataHex += cipher.final("hex");
		const legacyFormatEncrypted = `${iv.toString("hex")}:${dataHex}`;

		const result = decryptZenPrivHelper(legacyFormatEncrypted, TESTING_SECRET);
		expect(result).toEqual(MOCK_DATA);
	});

	test("throws error for GCM with wrong secret", () => {
		const encrypted = encryptZenPrivHelper(MOCK_DATA, TESTING_SECRET);
		expect(() => decryptZenPrivHelper(encrypted, "invalid-secret")).toThrow();
	});

	test("throws error for GCM with tampered auth tag", () => {
		const encrypted = encryptZenPrivHelper(MOCK_DATA, TESTING_SECRET);
		const parts = encrypted.split(":");
		parts[2] = parts[2].replace(/[0-9a-f]/, (c) => (c === "0" ? "1" : "0"));
		expect(() =>
			decryptZenPrivHelper(parts.join(":"), TESTING_SECRET),
		).toThrow();
	});

	test("throws error for CBC with wrong secret", () => {
		const key = crypto.createHash("sha256").update(TESTING_SECRET).digest();
		const iv = crypto.randomBytes(16);
		const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
		let dataHex = cipher.update(JSON.stringify(MOCK_DATA), "utf8", "hex");
		dataHex += cipher.final("hex");
		const legacyFormatEncrypted = `${iv.toString("hex")}:${dataHex}`;

		expect(() =>
			decryptZenPrivHelper(legacyFormatEncrypted, "invalid-secret"),
		).toThrow();
	});

	test("returns null for GCM with invalid JSON data", () => {
		const key = crypto.createHash("sha256").update(TESTING_SECRET).digest();
		const iv = crypto.randomBytes(12);
		const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
		let dataHex = cipher.update("invalid-json-content", "utf8", "hex");
		dataHex += cipher.final("hex");
		const authTagHex = cipher.getAuthTag().toString("hex");
		const encrypted = `${iv.toString("hex")}:${dataHex}:${authTagHex}`;

		expect(decryptZenPrivHelper(encrypted, TESTING_SECRET)).toBeNull();
	});

	test("returns null for CBC with invalid JSON data", () => {
		const key = crypto.createHash("sha256").update(TESTING_SECRET).digest();
		const iv = crypto.randomBytes(16);
		const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
		let dataHex = cipher.update("invalid-json-content", "utf8", "hex");
		dataHex += cipher.final("hex");
		const encrypted = `${iv.toString("hex")}:${dataHex}`;

		expect(decryptZenPrivHelper(encrypted, TESTING_SECRET)).toBeNull();
	});

	test("throws error for completely invalid string formats", () => {
		expect(() => decryptZenPrivHelper("", TESTING_SECRET)).toThrow();
		expect(() => decryptZenPrivHelper("invalid", TESTING_SECRET)).toThrow();
		expect(() =>
			decryptZenPrivHelper("invalid:too:many:colons:here:yes", TESTING_SECRET),
		).toThrow();
	});
});
