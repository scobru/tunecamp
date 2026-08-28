import express, { Router } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { wrapAsync } from "../../middleware/error-handling.js";
import { BadRequestError, ForbiddenError } from "../../common/errors.js";
import type { ServiceContainer } from "../../core/container.js";
import type { DigService, DigStrategy } from "../../modules/catalog/dig.service.js";

const VALID_STRATEGIES: DigStrategy[] = ["fast", "balanced", "deep"];

/**
 * Per-user, in-memory rate limiting for the digging endpoints.
 *
 * The `/run` endpoint fans out many scraping requests to Bandcamp, so we must protect the
 * server's IP from getting banned: at most one dig in flight per user, and a bounded number
 * of "deep" digs per rolling hour.
 */
const inFlight = new Set<number>();
const deepHistory = new Map<number, number[]>();
const MAX_DEEP_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

function checkDeepQuota(userId: number): boolean {
    const now = Date.now();
    const recent = (deepHistory.get(userId) || []).filter(ts => now - ts < HOUR_MS);
    deepHistory.set(userId, recent);
    return recent.length < MAX_DEEP_PER_HOUR;
}

export function createDigRoutes(container: ServiceContainer): Router {
    const digService: DigService = (container as any).digService;

    const router = Router();
    router.use(express.json());

    const requireUserId = (req: AuthenticatedRequest): number => {
        if (!req.userId) throw new ForbiddenError("Unauthorized");
        return req.userId;
    };

    /** GET /api/dig/search?q=&source= — search a source for seed releases. */
    router.get("/search", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const userId = requireUserId(req);
        const q = String(req.query.q || "").trim();
        const source = String(req.query.source || "bandcamp");
        if (!q) throw new BadRequestError("Missing query");
        digService.logHistory(userId, q, source);
        const results = await digService.searchSource(q, source);
        res.json(results);
    }));

    /** POST /api/dig/run — run the collector-graph dig.
     *  { releaseUrl, strategy } (default) digs Bandcamp's fan collections from a Bandcamp URL.
     *  { source: "network", albumId | trackId } digs this TuneCamp network's own users' stars
     *  instead, seeded from a release already in your own library (strategy is ignored). */
    router.post("/run", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const userId = requireUserId(req);
        const { releaseUrl, strategy, source, albumId, trackId } = req.body || {};

        if (inFlight.has(userId)) {
            return res.status(429).json({ error: "A dig is already running. Please wait for it to finish." });
        }

        if (source === "network") {
            const parsedAlbumId = Number(albumId);
            const parsedTrackId = Number(trackId);
            if (!Number.isFinite(parsedAlbumId) && !Number.isFinite(parsedTrackId)) {
                throw new BadRequestError("Missing albumId or trackId");
            }
            inFlight.add(userId);
            try {
                const result = await digService.digNetwork({
                    albumId: Number.isFinite(parsedAlbumId) ? parsedAlbumId : undefined,
                    trackId: Number.isFinite(parsedTrackId) ? parsedTrackId : undefined
                });
                res.json(result);
            } finally {
                inFlight.delete(userId);
            }
            return;
        }

        if (!releaseUrl || typeof releaseUrl !== "string") {
            throw new BadRequestError("Missing releaseUrl");
        }
        const chosen: DigStrategy = VALID_STRATEGIES.includes(strategy) ? strategy : "balanced";
        if (chosen === "deep" && !checkDeepQuota(userId)) {
            return res.status(429).json({ error: `Deep dig limit reached (${MAX_DEEP_PER_HOUR}/hour). Try a faster strategy.` });
        }

        inFlight.add(userId);
        if (chosen === "deep") {
            deepHistory.set(userId, [...(deepHistory.get(userId) || []), Date.now()]);
        }
        try {
            const result = await digService.dig(releaseUrl, chosen);
            res.json(result);
        } finally {
            inFlight.delete(userId);
        }
    }));

    // --- Sessions ---

    router.get("/sessions", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const userId = requireUserId(req);
        res.json(digService.listSessions(userId));
    }));

    router.post("/sessions", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const userId = requireUserId(req);
        const name = String(req.body?.name || "").trim();
        if (!name) throw new BadRequestError("Missing session name");
        res.status(201).json(digService.createSession(userId, name));
    }));

    router.delete("/sessions/:id", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const userId = requireUserId(req);
        digService.deleteSession(userId, Number(req.params.id));
        res.json({ ok: true });
    }));

    // --- Crate ---

    router.get("/sessions/:id/crate", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const userId = requireUserId(req);
        res.json(digService.getCrate(userId, Number(req.params.id)));
    }));

    router.post("/sessions/:id/crate", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const userId = requireUserId(req);
        const { sourceUrl, source, title, artist, coverUrl, previewUrl, bpm } = req.body || {};
        if (!sourceUrl || typeof sourceUrl !== "string") {
            throw new BadRequestError("Missing sourceUrl");
        }
        const item = digService.addToCrate(userId, Number(req.params.id), {
            sourceUrl, source, title, artist, coverUrl, previewUrl,
            bpm: typeof bpm === "number" ? bpm : undefined
        });
        res.status(201).json(item);
    }));

    router.delete("/sessions/:id/crate/:itemId", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const userId = requireUserId(req);
        digService.removeFromCrate(userId, Number(req.params.id), Number(req.params.itemId));
        res.json({ ok: true });
    }));

    // --- History ---

    router.get("/history", wrapAsync(async (req: AuthenticatedRequest, res: any) => {
        const userId = requireUserId(req);
        res.json(digService.getHistory(userId));
    }));

    return router;
}
