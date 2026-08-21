import { describe, test, expect } from "@jest/globals";
import {
	SITE_ACTOR_ID,
	getSiteHandle,
	isSiteHandle,
	slugifySiteName,
} from "../site-actor.js";

describe("Site Actor Identity Helpers", () => {
	test("SITE_ACTOR_ID constant is -1", () => {
		expect(SITE_ACTOR_ID).toBe(-1);
	});

	// ── getSiteHandle ───────────────────────────────────────────────────────

	describe("getSiteHandle", () => {
		test("returns configured siteHandle setting when present", () => {
			const mockDb = {
				getSetting: (k: string) => (k === "siteHandle" ? "my-cool-instance" : null),
			};
			expect(getSiteHandle(mockDb)).toBe("my-cool-instance");
		});

		test("falls back to 'site' when setting is absent or empty", () => {
			const mockDb = {
				getSetting: () => null,
			};
			expect(getSiteHandle(mockDb)).toBe("site");
		});
	});

	// ── isSiteHandle ────────────────────────────────────────────────────────

	describe("isSiteHandle", () => {
		test("recognizes configured custom site handle", () => {
			const mockDb = {
				getSetting: (k: string) => (k === "siteHandle" ? "sudo-records" : null),
			};
			expect(isSiteHandle("sudo-records", mockDb)).toBe(true);
		});

		test("recognizes legacy 'site' handle even when custom handle is configured", () => {
			const mockDb = {
				getSetting: (k: string) => (k === "siteHandle" ? "custom-name" : null),
			};
			expect(isSiteHandle("site", mockDb)).toBe(true);
		});

		test("returns false for unrelated user handles", () => {
			const mockDb = {
				getSetting: (k: string) => (k === "siteHandle" ? "custom-name" : null),
			};
			expect(isSiteHandle("alice", mockDb)).toBe(false);
			expect(isSiteHandle("bob", mockDb)).toBe(false);
		});
	});

	// ── slugifySiteName ─────────────────────────────────────────────────────

	describe("slugifySiteName", () => {
		test("slugifies regular instance names to webfinger-safe strings", () => {
			expect(slugifySiteName("TuneCamp Music")).toBe("tunecamp-music");
			expect(slugifySiteName("My Super Studio 2026")).toBe("my-super-studio-2026");
		});

		test("falls back to 'site' for empty, null, or undefined strings", () => {
			expect(slugifySiteName("")).toBe("site");
			expect(slugifySiteName(null)).toBe("site");
			expect(slugifySiteName(undefined)).toBe("site");
		});
	});
});
