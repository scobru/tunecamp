import { jest } from "@jest/globals";
import {
    SITE_ACTOR_ID,
    getSiteHandle,
    isSiteHandle,
    slugifySiteName
} from "../site-actor.js";

describe("site-actor", () => {
    describe("SITE_ACTOR_ID", () => {
        it("should be exactly -1", () => {
            expect(SITE_ACTOR_ID).toBe(-1);
        });
    });

    describe("getSiteHandle", () => {
        it("should return the configured siteHandle", () => {
            const db = { getSetting: jest.fn().mockReturnValue("custom-site-handle") };
            expect(getSiteHandle(db as any)).toBe("custom-site-handle");
            expect(db.getSetting).toHaveBeenCalledWith("siteHandle");
        });

        it("should fallback to 'site' if siteHandle is not set", () => {
            const db1 = { getSetting: jest.fn().mockReturnValue(undefined) };
            expect(getSiteHandle(db1 as any)).toBe("site");

            const db2 = { getSetting: jest.fn().mockReturnValue(null) };
            expect(getSiteHandle(db2 as any)).toBe("site");

            const db3 = { getSetting: jest.fn().mockReturnValue("") };
            expect(getSiteHandle(db3 as any)).toBe("site");
        });
    });

    describe("isSiteHandle", () => {
        it("should return true if handle matches configured siteHandle", () => {
            const db = { getSetting: jest.fn().mockReturnValue("custom-site-handle") };
            expect(isSiteHandle("custom-site-handle", db as any)).toBe(true);
        });

        it("should return true if handle matches legacy 'site' default", () => {
            const db = { getSetting: jest.fn().mockReturnValue("custom-site-handle") };
            // Even if configured differently, "site" should still work
            expect(isSiteHandle("site", db as any)).toBe(true);
        });

        it("should return false if handle does not match either", () => {
            const db = { getSetting: jest.fn().mockReturnValue("custom-site-handle") };
            expect(isSiteHandle("some-other-handle", db as any)).toBe(false);
        });

        it("should return true for 'site' when no siteHandle is configured", () => {
            const db = { getSetting: jest.fn().mockReturnValue(undefined) };
            expect(isSiteHandle("site", db as any)).toBe(true);
        });

        it("should return false for other handle when no siteHandle is configured", () => {
            const db = { getSetting: jest.fn().mockReturnValue(undefined) };
            expect(isSiteHandle("other", db as any)).toBe(false);
        });
    });

    describe("slugifySiteName", () => {
        it("should derive webfinger-safe slug from instance name", () => {
            expect(slugifySiteName("My Cool Instance")).toBe("my-cool-instance");
            expect(slugifySiteName("Sudo Records!")).toBe("sudo-records");
        });

        it("should fallback to 'site' if name is undefined or null or empty", () => {
            expect(slugifySiteName(undefined)).toBe("site");
            expect(slugifySiteName(null)).toBe("site");
            expect(slugifySiteName("")).toBe("site");
            expect(slugifySiteName("!@#")).toBe("site"); // slugify returns empty string for these, then fallback triggers
        });
    });
});
