/**
 * Download Access — single source of truth for "may this viewer take the FULL
 * FILE of this content?".
 *
 * `canConsumeTrack` (visibility.ts) answers a different question: "may this
 * viewer *see/stream* this track?". Streaming is the public product of the
 * platform, so that gate is deliberately permissive. Handing over the master
 * file is not: a release sold on the store, one published as streaming-only, or
 * one that is a showcase for an external shop must not be downloadable just
 * because it is publicly listed.
 *
 * Before this module the download routes reused the *consumption* gate, so
 * `GET /api/tracks/:id/download`, `/api/albums/:id/download` and
 * `/api/releases/:id/download` handed out paid content to anyone — the paywall
 * only existed in the webapp, which merely hides the button unless
 * `album.download === 'free'`. Sidecamp's Network tab (and plain curl) walked
 * straight past it.
 *
 * The paid path that DOES enforce entitlement is
 * `GET /api/payments/download/:trackId`; the rules below intentionally mirror
 * its checks (active subscription, or an unlock code matching the track or its
 * release) so both doors agree on who has paid.
 */
import { ForbiddenError, PaymentRequiredError, type AppError } from "./errors.js";
import {
    Capability,
    VisibilityGuardian,
    type ViewerContext,
} from "./visibility.js";

/**
 * How a release exposes its downloadable payload. These are the values the
 * release editor writes ("none" = Streaming Only, the default). `null` means
 * the field was never set — the editor treats that as "none" too, but for a
 * plain scanned album it just means nobody ever made a choice, so the price
 * fields get the final say.
 */
export type DownloadMode =
    | "free"
    | "paid"
    | "codes"
    | "external"
    | "none"
    | null
    | undefined;

export interface DownloadableAlbum {
    id?: number;
    owner_id?: number | null;
    artist_id?: number | null;
    download?: DownloadMode | string;
    price?: number | null;
    price_usdc?: number | null;
    price_usdt?: number | null;
}

export interface DownloadableTrack {
    id: number;
    album_id?: number | null;
    owner_id?: number | null;
    artist_id?: number | null;
    price?: number | null;
    price_usdc?: number | null;
    price_usdt?: number | null;
}

/**
 * Narrow data-access surface so the policy stays testable with a fake, and so
 * routes can pass partial lookups (every member is optional: a missing lookup
 * simply means "that way of proving entitlement is unavailable here").
 */
export interface DownloadAccessLookups {
    /** Per-release price override (release_tracks) — wins over the track row. */
    getTrackPriceFromRelease?(
        releaseId: number,
        trackId: number
    ): { price?: number | null; price_usdc?: number | null; price_usdt?: number | null } | undefined;
    /** True when the user holds a subscription that is active and unexpired. */
    hasActiveSubscription?(userId: number): boolean;
    /** Unlock code passed as `?code=` — same validation the payments route uses. */
    validateUnlockCode?(code: string): {
        valid: boolean;
        releaseId?: number | null;
        trackId?: number | null;
    };
    /** A completed purchase mints an unlock code carrying the buyer's user_id. */
    hasPurchase?(
        userId: number,
        target: { trackId?: number | null; releaseId?: number | null }
    ): boolean;
}

export interface DownloadAccessOptions {
    /** Value of the `?code=` query param, if the caller supplied one. */
    code?: string | null;
}

/** Why a download was refused. Routes map these onto 402 vs 403. */
export type DownloadDenialReason =
    | "payment_required"
    | "streaming_only"
    | "external_only";

export interface DownloadDecision {
    allowed: boolean;
    reason?: DownloadDenialReason;
}

const ALLOWED: DownloadDecision = { allowed: true };

/** Effective sale mode of a piece of content, once price fields are folded in. */
type SaleMode = "free" | "paid" | "streaming_only" | "external";

function priceOf(o: {
    price?: number | null;
    price_usdc?: number | null;
    price_usdt?: number | null;
} | null | undefined): number {
    if (!o) return 0;
    return Math.max(
        Number(o.price) || 0,
        Number(o.price_usdc) || 0,
        Number(o.price_usdt) || 0
    );
}

/**
 * Resolves the album's own download stance. Kept separate from the track-level
 * price so `canDownloadTrack` can upgrade "streaming only" to "paid" when the
 * individual track carries a price.
 */
function albumSaleMode(album: DownloadableAlbum | null | undefined): SaleMode {
    // No release container at all (orphan library file): nothing was ever put
    // up for sale, so the visibility gate alone decides.
    if (!album) return "free";

    switch (album.download) {
        case "free":
            // An explicit "Free Download" wins even if price fields linger from
            // an earlier configuration.
            return "free";
        case "paid":
        case "codes":
            return "paid";
        case "external":
            return "external";
        default:
            // "none" (Streaming Only) or never set: a price means it is on sale,
            // otherwise the artist did not publish a downloadable payload.
            return priceOf(album) > 0 ? "paid" : "streaming_only";
    }
}

/** Effective price of a track, honouring the per-release override. */
function trackPrice(
    track: DownloadableTrack,
    lookups: DownloadAccessLookups
): number {
    if (track.album_id != null && lookups.getTrackPriceFromRelease) {
        const override = lookups.getTrackPriceFromRelease(track.album_id, track.id);
        if (override) {
            // Mirror the payments route: each override field falls back to the
            // track row, so a release may deliberately zero a track's price.
            return priceOf({
                price: override.price ?? track.price,
                price_usdc: override.price_usdc ?? track.price_usdc,
                price_usdt: override.price_usdt ?? track.price_usdt,
            });
        }
    }
    return priceOf(track);
}

/**
 * Roles and ownership that bypass the paywall entirely.
 *
 * MANAGE_PRIVATE_LIBRARY covers Curator (super_user), Manager (admin) and Root
 * Admin — the staff who run the instance's library and already see every
 * private item. Ownership covers the artist selling the release: they must
 * always be able to pull their own masters back.
 */
function isPrivileged(
    context: ViewerContext,
    track: DownloadableTrack | null | undefined,
    album: DownloadableAlbum | null | undefined
): boolean {
    if (VisibilityGuardian.can(context, Capability.MANAGE_PRIVATE_LIBRARY)) return true;
    if (album && VisibilityGuardian.canManageItem(context, album)) return true;
    if (track && VisibilityGuardian.canManageItem(context, track)) return true;
    return false;
}

/** Does an unlock code cover this track / release? Same rule as payments.ts. */
function codeMatches(
    validation: { valid: boolean; releaseId?: number | null; trackId?: number | null },
    target: { trackId?: number | null; releaseId?: number | null }
): boolean {
    if (!validation.valid) return false;
    if (
        target.trackId != null &&
        validation.trackId != null &&
        validation.trackId === target.trackId
    ) {
        return true;
    }
    return (
        target.releaseId != null &&
        validation.releaseId != null &&
        validation.releaseId === target.releaseId
    );
}

/** Has this viewer paid for the content, one way or another? */
function hasEntitlement(
    context: ViewerContext,
    target: { trackId?: number | null; releaseId?: number | null },
    lookups: DownloadAccessLookups,
    options: DownloadAccessOptions
): boolean {
    const userId = context.userId ?? null;

    if (userId != null && lookups.hasActiveSubscription?.(userId)) return true;
    if (userId != null && lookups.hasPurchase?.(userId, target)) return true;

    const code = options.code?.trim();
    if (code && lookups.validateUnlockCode) {
        if (codeMatches(lookups.validateUnlockCode(code), target)) return true;
    }

    return false;
}

function decide(
    mode: SaleMode,
    context: ViewerContext,
    target: { trackId?: number | null; releaseId?: number | null },
    lookups: DownloadAccessLookups,
    options: DownloadAccessOptions
): DownloadDecision {
    if (mode === "free") return ALLOWED;
    if (mode === "external") return { allowed: false, reason: "external_only" };
    if (mode === "streaming_only") return { allowed: false, reason: "streaming_only" };

    // Paid: an unlock code, a recorded purchase or an active subscription opens it.
    if (hasEntitlement(context, target, lookups, options)) return ALLOWED;
    return { allowed: false, reason: "payment_required" };
}

/**
 * May this viewer download the full file of THIS track?
 *
 * Call it *after* `canConsumeTrack`: visibility comes first, this is the
 * commercial gate on top of it.
 */
export function canDownloadTrack(
    track: DownloadableTrack,
    album: DownloadableAlbum | null | undefined,
    context: ViewerContext,
    lookups: DownloadAccessLookups = {},
    options: DownloadAccessOptions = {}
): DownloadDecision {
    if (isPrivileged(context, track, album)) return ALLOWED;

    let mode = albumSaleMode(album);
    // A track priced on its own is on sale even when its release is configured
    // as streaming-only — the store sells single tracks too.
    if (mode === "streaming_only" && trackPrice(track, lookups) > 0) mode = "paid";

    return decide(
        mode,
        context,
        { trackId: track.id, releaseId: track.album_id ?? album?.id ?? null },
        lookups,
        options
    );
}

/**
 * May this viewer download the whole album/release (the ZIP routes)?
 *
 * Album-level only: an unlock code for one track does not unwrap the bundle.
 */
export function canDownloadAlbum(
    album: DownloadableAlbum,
    context: ViewerContext,
    lookups: DownloadAccessLookups = {},
    options: DownloadAccessOptions = {}
): DownloadDecision {
    if (isPrivileged(context, null, album)) return ALLOWED;

    return decide(
        albumSaleMode(album),
        context,
        { trackId: null, releaseId: album.id ?? null },
        lookups,
        options
    );
}

/** Human-readable refusal, shared by every download route. */
export function downloadDenialMessage(reason?: DownloadDenialReason): string {
    switch (reason) {
        case "payment_required":
            return "Purchase required: this content is on sale and needs an unlock code, a completed purchase or an active subscription to download.";
        case "external_only":
            return "This release is a showcase for an external store and cannot be downloaded here.";
        case "streaming_only":
        default:
            return "Downloads are disabled for this content (streaming only).";
    }
}

/**
 * Builds the lookups from the managers a route already has in hand.
 *
 * Every member is probed with `typeof === "function"` on purpose: routes
 * resolve managers through the service container, which falls back to the
 * database object when a manager is absent (notably in tests), so a missing
 * method must degrade to "cannot prove entitlement that way" rather than throw
 * mid-download.
 */
export function createDownloadAccessLookups(deps: {
    library?: any;
    identity?: any;
    integration?: any;
}): DownloadAccessLookups {
    const { library, identity, integration } = deps;

    return {
        getTrackPriceFromRelease:
            typeof library?.getTrackPriceFromRelease === "function"
                ? (releaseId: number, trackId: number) =>
                      library.getTrackPriceFromRelease(releaseId, trackId)
                : undefined,

        hasActiveSubscription:
            typeof identity?.getUserSubscription === "function"
                ? (userId: number) => {
                      const sub = identity.getUserSubscription(userId);
                      if (!sub || sub.status !== "active") return false;
                      return !sub.expiresAt || new Date(sub.expiresAt) > new Date();
                  }
                : undefined,

        validateUnlockCode:
            typeof integration?.validateUnlockCode === "function"
                ? (code: string) => integration.validateUnlockCode(code)
                : undefined,

        hasPurchase:
            typeof integration?.hasPurchase === "function"
                ? (userId: number, target: { trackId?: number | null; releaseId?: number | null }) =>
                      integration.hasPurchase(userId, target)
                : undefined,
    };
}

/** Maps a refusal onto its HTTP status: 402 when money would fix it, else 403. */
export function downloadDenialStatus(reason?: DownloadDenialReason): 402 | 403 {
    return reason === "payment_required" ? 402 : 403;
}

/** The error a download route throws for a refused decision. */
export function downloadDenialError(reason?: DownloadDenialReason): AppError {
    const message = downloadDenialMessage(reason);
    return downloadDenialStatus(reason) === 402
        ? new PaymentRequiredError(message)
        : new ForbiddenError(message);
}
