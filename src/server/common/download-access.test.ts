import { UserRole, type ViewerContext } from "./visibility.js";
import {
    canDownloadAlbum,
    canDownloadTrack,
    createDownloadAccessLookups,
    downloadDenialError,
    downloadDenialStatus,
    type DownloadAccessLookups,
} from "./download-access.js";

describe("download-access", () => {
    const rootAdmin: ViewerContext = { userId: 1, role: UserRole.ROOT_ADMIN };
    const manager: ViewerContext = { userId: 2, role: UserRole.ADMIN };
    const curator: ViewerContext = { userId: 3, role: UserRole.SUPER_USER };
    const listener: ViewerContext = { userId: 4, role: UserRole.NORMAL_USER };
    const guest: ViewerContext = { role: UserRole.GUEST };

    const freeAlbum = { id: 100, download: "free", price: 0 };
    const paidAlbum = { id: 200, download: "codes", price: 5 };
    const streamOnlyAlbum = { id: 300, download: "none", price: 0 };
    const externalAlbum = { id: 400, download: "external", price: 0 };
    const untouchedAlbum = { id: 500, download: null, price: 0 };

    const track = (over: Partial<{ id: number; album_id: number | null; price: number; owner_id: number | null; artist_id: number | null }> = {}) => ({
        id: 1,
        album_id: null,
        price: 0,
        ...over,
    });

    describe("free content stays free", () => {
        test("a release marked 'free' downloads for anyone, guests included", () => {
            expect(canDownloadTrack(track({ album_id: 100 }), freeAlbum, guest).allowed).toBe(true);
            expect(canDownloadAlbum(freeAlbum, guest).allowed).toBe(true);
        });

        test("an orphan library track with no release container is downloadable", () => {
            expect(canDownloadTrack(track(), null, listener).allowed).toBe(true);
        });

        test("'free' wins over leftover price fields", () => {
            const album = { id: 100, download: "free", price: 9.99 };
            expect(canDownloadTrack(track({ album_id: 100 }), album, guest).allowed).toBe(true);
        });
    });

    describe("paid content is refused without entitlement", () => {
        test("a guest is refused with payment_required", () => {
            const decision = canDownloadTrack(track({ album_id: 200 }), paidAlbum, guest);
            expect(decision).toEqual({ allowed: false, reason: "payment_required" });
            expect(downloadDenialStatus(decision.reason)).toBe(402);
        });

        test("a plain logged-in listener is refused too", () => {
            expect(canDownloadTrack(track({ album_id: 200 }), paidAlbum, listener).allowed).toBe(false);
            expect(canDownloadAlbum(paidAlbum, listener).allowed).toBe(false);
        });

        test("a release with no explicit mode but a price is treated as on sale", () => {
            const priced = { id: 600, download: null, price: 3 };
            expect(canDownloadAlbum(priced, guest)).toEqual({ allowed: false, reason: "payment_required" });
        });

        test("a track priced on its own is gated even when its release is streaming-only", () => {
            const t = track({ id: 7, album_id: 300, price: 1.5 });
            expect(canDownloadTrack(t, streamOnlyAlbum, guest)).toEqual({
                allowed: false,
                reason: "payment_required",
            });
        });

        test("a per-release price override of 0 makes a priced track free again", () => {
            const lookups: DownloadAccessLookups = {
                getTrackPriceFromRelease: () => ({ price: 0, price_usdc: 0, price_usdt: 0 }),
            };
            const t = track({ id: 7, album_id: 300, price: 1.5 });
            expect(canDownloadTrack(t, streamOnlyAlbum, guest, lookups).allowed).toBe(false);
            // still refused, but as streaming-only rather than as a sale
            expect(canDownloadTrack(t, streamOnlyAlbum, guest, lookups).reason).toBe("streaming_only");
        });
    });

    describe("entitlement unlocks paid content", () => {
        test("an unlock code matching the track opens it", () => {
            const lookups: DownloadAccessLookups = {
                validateUnlockCode: (code) =>
                    code === "GOOD" ? { valid: true, trackId: 1, releaseId: null } : { valid: false },
            };
            expect(canDownloadTrack(track({ album_id: 200 }), paidAlbum, guest, lookups, { code: "GOOD" }).allowed).toBe(true);
            expect(canDownloadTrack(track({ album_id: 200 }), paidAlbum, guest, lookups, { code: "BAD" }).allowed).toBe(false);
        });

        test("an unlock code matching the release opens the whole ZIP", () => {
            const lookups: DownloadAccessLookups = {
                validateUnlockCode: () => ({ valid: true, releaseId: 200, trackId: null }),
            };
            expect(canDownloadAlbum(paidAlbum, guest, lookups, { code: "REL" }).allowed).toBe(true);
        });

        test("a code for another release does not open this one", () => {
            const lookups: DownloadAccessLookups = {
                validateUnlockCode: () => ({ valid: true, releaseId: 999, trackId: null }),
            };
            expect(canDownloadAlbum(paidAlbum, guest, lookups, { code: "OTHER" }).allowed).toBe(false);
        });

        test("an active subscription opens it", () => {
            const lookups: DownloadAccessLookups = { hasActiveSubscription: (id) => id === 4 };
            expect(canDownloadTrack(track({ album_id: 200 }), paidAlbum, listener, lookups).allowed).toBe(true);
            expect(canDownloadTrack(track({ album_id: 200 }), paidAlbum, guest, lookups).allowed).toBe(false);
        });

        test("a recorded purchase opens it", () => {
            const lookups: DownloadAccessLookups = {
                hasPurchase: (userId, target) => userId === 4 && target.releaseId === 200,
            };
            expect(canDownloadAlbum(paidAlbum, listener, lookups).allowed).toBe(true);
        });
    });

    describe("streaming-only and external showcases", () => {
        test("'none' refuses the download without offering a purchase", () => {
            expect(canDownloadAlbum(streamOnlyAlbum, listener)).toEqual({
                allowed: false,
                reason: "streaming_only",
            });
            expect(downloadDenialStatus("streaming_only")).toBe(403);
        });

        test("a release left untouched (download null, no price) is streaming-only", () => {
            expect(canDownloadAlbum(untouchedAlbum, guest).reason).toBe("streaming_only");
        });

        test("'external' refuses the download", () => {
            expect(canDownloadAlbum(externalAlbum, listener)).toEqual({
                allowed: false,
                reason: "external_only",
            });
        });

        test("an unlock code cannot bypass streaming-only or external", () => {
            const lookups: DownloadAccessLookups = {
                validateUnlockCode: () => ({ valid: true, releaseId: 300, trackId: null }),
                hasActiveSubscription: () => true,
            };
            expect(canDownloadAlbum(streamOnlyAlbum, listener, lookups, { code: "X" }).allowed).toBe(false);
            expect(canDownloadAlbum(externalAlbum, listener, lookups, { code: "X" }).allowed).toBe(false);
        });
    });

    describe("staff and owners bypass the gate", () => {
        test.each([
            ["root admin", rootAdmin],
            ["manager", manager],
            ["curator", curator],
        ])("%s downloads paid, streaming-only and external content", (_label, context) => {
            expect(canDownloadTrack(track({ album_id: 200 }), paidAlbum, context as ViewerContext).allowed).toBe(true);
            expect(canDownloadAlbum(streamOnlyAlbum, context as ViewerContext).allowed).toBe(true);
            expect(canDownloadAlbum(externalAlbum, context as ViewerContext).allowed).toBe(true);
        });

        test("the owning user downloads their own paid release", () => {
            const owned = { ...paidAlbum, owner_id: 4 };
            expect(canDownloadAlbum(owned, listener).allowed).toBe(true);
            expect(canDownloadTrack(track({ album_id: 200 }), owned, listener).allowed).toBe(true);
        });

        test("a linked artist downloads their own unowned release", () => {
            const linked = { ...paidAlbum, owner_id: null, artist_id: 10 };
            const artistCtx: ViewerContext = { userId: 9, artistId: 10, role: UserRole.NORMAL_USER };
            expect(canDownloadAlbum(linked, artistCtx).allowed).toBe(true);
        });

        test("a listener who owns the track but not the release still gets it", () => {
            const t = track({ id: 7, album_id: 200, owner_id: 4 });
            expect(canDownloadTrack(t, paidAlbum, listener).allowed).toBe(true);
        });
    });

    describe("downloadDenialError", () => {
        test("payment_required becomes a 402, every other refusal a 403", () => {
            expect(downloadDenialError("payment_required").statusCode).toBe(402);
            expect(downloadDenialError("streaming_only").statusCode).toBe(403);
            expect(downloadDenialError("external_only").statusCode).toBe(403);
            expect(downloadDenialError(undefined).statusCode).toBe(403);
        });
    });

    describe("createDownloadAccessLookups", () => {
        test("maps subscription status, expiry and purchases onto the policy", () => {
            const lookups = createDownloadAccessLookups({
                identity: {
                    getUserSubscription: (id: number) =>
                        id === 1
                            ? { status: "active", expiresAt: null }
                            : id === 2
                              ? { status: "active", expiresAt: "2000-01-01T00:00:00Z" }
                              : { status: "none", expiresAt: null },
                },
                integration: {
                    hasPurchase: (id: number) => id === 1,
                    validateUnlockCode: (code: string) => ({ valid: code === "OK" }),
                },
                library: { getTrackPriceFromRelease: () => ({ price: 2 }) },
            });

            expect(lookups.hasActiveSubscription!(1)).toBe(true);
            expect(lookups.hasActiveSubscription!(2)).toBe(false); // expired
            expect(lookups.hasActiveSubscription!(3)).toBe(false);
            expect(lookups.hasPurchase!(1, { trackId: 1 })).toBe(true);
            expect(lookups.validateUnlockCode!("OK").valid).toBe(true);
            expect(lookups.getTrackPriceFromRelease!(1, 1)).toEqual({ price: 2 });
        });

        test("absent managers degrade to undefined instead of throwing", () => {
            const lookups = createDownloadAccessLookups({ identity: {}, integration: {}, library: {} });
            expect(lookups.hasActiveSubscription).toBeUndefined();
            expect(lookups.hasPurchase).toBeUndefined();
            expect(lookups.validateUnlockCode).toBeUndefined();
            expect(lookups.getTrackPriceFromRelease).toBeUndefined();
            // and the policy still answers without them
            expect(canDownloadAlbum(paidAlbum, listener, lookups).reason).toBe("payment_required");
        });
    });
});
