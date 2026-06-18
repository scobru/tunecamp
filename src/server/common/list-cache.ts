import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Short-TTL response memo + ETag/304 for read-only list endpoints.
 *
 * Several list endpoints (notably GET /api/artists) recompute over the whole
 * catalog on every request — loading all tracks/albums/releases and building
 * lookup sets just to filter a list. Under any real traffic that work is
 * repeated needlessly. This helper caches the serialized response for a short
 * window keyed by the caller-supplied `scopeKey` (which must capture everything
 * the response varies on), and emits a weak ETag so unchanged lists return 304.
 *
 * Freshness is bounded by the TTL rather than wired into every mutation site —
 * acceptable here because list contents change rarely (admin uploads) and a few
 * seconds of staleness on a browse view is fine. Call invalidateListCache() to
 * force a global refresh if a caller ever needs immediate consistency.
 */

interface CacheEntry {
    etag: string;
    body: string;
    expires: number;
}

const DEFAULT_TTL_MS = 8_000;
const MAX_ENTRIES = 1_000; // safety cap; entries are cheap to rebuild

const store = new Map<string, CacheEntry>();
let generation = 0;

/** Drops every cached list. Bumps a generation so in-flight keys can't collide. */
export function invalidateListCache(): void {
    generation++;
    store.clear();
}

/**
 * Express middleware that invalidates the list cache after any successful
 * mutating request (POST/PUT/PATCH/DELETE). Mount it on the resource routers
 * whose lists are cached (artists, albums, releases, tracks) so an edit — a new
 * star, a rating, an upload — shows up on the very next read instead of after
 * the TTL. GET/HEAD pass straight through, so it never invalidates on reads
 * (and is not mounted on high-frequency write paths like playback heartbeats).
 */
export function invalidateListCacheOnMutation(req: Request, res: Response, next: NextFunction): void {
    const m = req.method;
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") {
        return next();
    }
    res.on("finish", () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
            invalidateListCache();
        }
    });
    next();
}

/**
 * Serves `produce()`'s result as JSON, memoized for `ttlMs` and revalidated via
 * ETag. `produce` only runs on a cache miss. `scopeKey` must encode the route
 * plus every request attribute the response depends on (role, ids, query).
 */
export async function serveCachedList(
    req: Request,
    res: Response,
    scopeKey: string,
    produce: () => unknown | Promise<unknown>,
    ttlMs: number = DEFAULT_TTL_MS,
): Promise<void> {
    const key = `${generation}:${scopeKey}`;
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.expires <= now) {
        const data = await produce();
        const body = JSON.stringify(data ?? null);
        const etag = `W/"${crypto.createHash("sha1").update(body).digest("base64")}"`;
        if (store.size >= MAX_ENTRIES) store.clear();
        entry = { etag, body, expires: now + ttlMs };
        store.set(key, entry);
    }

    res.setHeader("ETag", entry.etag);
    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");

    if (req.headers["if-none-match"] === entry.etag) {
        res.status(304).end();
        return;
    }

    res.type("application/json").send(entry.body);
}
