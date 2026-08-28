import express, { Router } from "express";
import { readFile } from "fs/promises";
import path from "path";
import type { ServiceContainer } from "../../core/container.js";
import { buildCommunitySites } from "../../modules/network/community-sites.js";

let pkg: { version: string } = { version: '0.0.0' };
try {
    pkg = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8'));
} catch {
    // fallback
}

// ponytail: in-memory rate limit, 1 registration per IP per hour
const registerRateLimit = new Map<string, number>();
const REGISTER_COOLDOWN_MS = 60 * 60 * 1000;

// ponytail: in-memory sliding-window rate limit for /dig-lookup, 30 requests/min per IP —
// it's cheap local reads but still real (aggregate) user behavior data, so throttle scraping.
const digLookupRateLimit = new Map<string, number[]>();
const DIG_LOOKUP_LIMIT = 30;
const DIG_LOOKUP_WINDOW_MS = 60 * 1000;
function checkDigLookupRate(ip: string): boolean {
    const now = Date.now();
    const recent = (digLookupRateLimit.get(ip) || []).filter(ts => now - ts < DIG_LOOKUP_WINDOW_MS);
    recent.push(now);
    digLookupRateLimit.set(ip, recent);
    return recent.length <= DIG_LOOKUP_LIMIT;
}

/**
 * Public `/api/community/*` endpoints — the federated discovery surface.
 *
 * Mounted without auth (like /api/stats) and covered by the global CORS config,
 * so peer crawlers and the static website can fetch them cross-origin.
 */
export function createCommunityRoutes(container: ServiceContainer): Router {
    const dbService = container.database;
    const config = container.config;
    const federatedDiscoveryService = container.federatedDiscoveryService;
    const router = Router();

    /**
     * GET /api/community/instance
     * Rich self-description used by peer crawlers. NodeInfo (/nodeinfo/2.1) is
     * used only to detect that a host IS a TuneCamp instance; this carries the
     * card metadata (name, cover, artist, community link).
     */
    router.get("/instance", (req, res) => {
        try {
            const publicUrl = dbService.getSetting("publicUrl") || config.publicUrl || null;
            res.json({
                software: "tunecamp",
                version: pkg.version,
                url: publicUrl,
                name: dbService.getSetting("siteName") || config.siteName || "TuneCamp Instance",
                description: dbService.getSetting("siteDescription") || config.siteDescription || "",
                coverImage: dbService.getSetting("coverImage") || null,
                artistName: dbService.getSetting("artistName") || null,
                communityLink: dbService.getSetting("communityLink") || null,
            });
        } catch (error) {
            console.error("Error building community instance metadata:", error);
            res.status(500).json({ error: "Failed to get instance metadata" });
        }
    });

    /**
     * GET /api/community/peers
     * The instances this server knows about — gossip surface for crawlers.
     */
    router.get("/peers", (req, res) => {
        try {
            res.json(federatedDiscoveryService.getPeers());
        } catch (error) {
            console.error("Error listing community peers:", error);
            res.status(500).json({ error: "Failed to list peers" });
        }
    });

    /**
     * GET /api/community/sites
     * Aggregated discovery list (local + federated + AP). Public payload
     * the static website consumes for cross-origin discovery.
     */
    router.get("/sites", async (req, res) => {
        try {
            const sites = await buildCommunitySites({ dbService, config, federatedDiscoveryService });
            res.json(sites);
        } catch (error) {
            console.error("Error getting community sites:", error);
            res.status(500).json({ error: "Failed to get community sites" });
        }
    });

    /**
     * GET /api/community/activity?limit=30
     * Public activity feed — likes, purchases, public playlists and releases,
     * newest first. Only events on *published public releases* (and public
     * playlists) are exposed; private library items never appear. Actor
     * identity (username) is included for likes and playlists only when that
     * user opted into a public profile (`admin.public_profile_enabled`), so
     * every name shown federatedly resolves to a working `/u/:username` page.
     * Purchases never carry an actor (unlock codes have no account identity).
     */
    router.get("/activity", (req, res) => {
        try {
            const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "30"), 10) || 30, 1), 100);
            const base = (dbService.getSetting("publicUrl") || config.publicUrl || "").replace(/\/$/, "");
            const instanceName = dbService.getSetting("siteName") || config.siteName || "TuneCamp Instance";

            // Public-release predicate shared by every UNION arm.
            const PUB = "a.is_release = 1 AND a.status = 'released' AND a.visibility = 'public'";
            const rows = dbService.db.prepare(`
                SELECT * FROM (
                    SELECT 'like' AS type, s.created_at AS ts, a.title AS title,
                           COALESCE(ar.name, a.album_artist) AS artist, a.slug AS slug, a.cover_path AS cover, pu.username AS user
                    FROM starred_items s
                    JOIN albums a ON a.id = CAST(s.item_id AS INTEGER)
                    LEFT JOIN artists ar ON ar.id = a.artist_id
                    LEFT JOIN admin pu ON pu.username = s.username COLLATE NOCASE AND pu.public_profile_enabled = 1
                    WHERE s.item_type = 'album' AND ${PUB}
                    UNION ALL
                    SELECT 'like', s.created_at, t.title,
                           COALESCE(t.artist_name, ar.name), a.slug, a.cover_path, pu.username
                    FROM starred_items s
                    JOIN tracks t ON t.id = CAST(s.item_id AS INTEGER)
                    JOIN albums a ON a.id = t.album_id
                    LEFT JOIN artists ar ON ar.id = a.artist_id
                    LEFT JOIN admin pu ON pu.username = s.username COLLATE NOCASE AND pu.public_profile_enabled = 1
                    WHERE s.item_type = 'track' AND ${PUB}
                    UNION ALL
                    SELECT 'purchase', u.created_at, a.title,
                           COALESCE(ar.name, a.album_artist), a.slug, a.cover_path, NULL
                    FROM unlock_codes u
                    JOIN albums a ON a.id = u.release_id
                    LEFT JOIN artists ar ON ar.id = a.artist_id
                    WHERE u.tx_hash IS NOT NULL AND ${PUB}
                    UNION ALL
                    SELECT 'playlist', p.created_at, p.name, NULL, NULL, NULL, pu.username
                    FROM playlists p
                    LEFT JOIN admin pu ON pu.username = p.username COLLATE NOCASE AND pu.public_profile_enabled = 1
                    WHERE p.is_public = 1
                    UNION ALL
                    SELECT 'release', COALESCE(a.published_at, a.created_at), a.title,
                           COALESCE(ar.name, a.album_artist), a.slug, a.cover_path, NULL
                    FROM albums a
                    LEFT JOIN artists ar ON ar.id = a.artist_id
                    WHERE ${PUB}
                ) ORDER BY ts DESC LIMIT ?
            `).all(limit) as { type: string; ts: string; title: string; artist: string | null; slug: string | null; cover: string | null; user: string | null }[];

            res.json({
                instance: { name: instanceName, url: base || null },
                events: rows.map(r => ({
                    type: r.type,
                    ts: r.ts,
                    user: r.user,
                    object: {
                        title: r.title,
                        artist: r.artist,
                        url: r.slug && base ? `${base}/releases/${r.slug}` : base || null,
                        cover: r.slug && r.cover && base ? `${base}/api/albums/${r.slug}/cover?t=${new Date(r.ts).getTime()}` : null,
                    },
                })),
            });
        } catch (error) {
            console.error("Error building community activity feed:", error);
            res.status(500).json({ error: "Failed to get activity feed" });
        }
    });

    /**
     * POST /api/community/register
     * Self-registration: an admin submits their instance URL. We probe it via
     * NodeInfo to verify it's a real TuneCamp instance, then store it immediately
     * so it appears in /api/community/sites without waiting for the next crawl.
     *
     * Rate-limited to 1 request per IP per hour (in-memory).
     */
    // express.json() is applied per-route (there is no global body parser); without it
    // req.body is undefined and registration always fails with "url is required".
    router.post("/register", express.json(), async (req, res) => {
        // Use req.ip, which resolves the real client IP from X-Forwarded-For because
        // 'trust proxy' is enabled (server.ts). Reading the socket address directly would
        // collapse to the nginx/proxy IP, turning the per-IP limit into a global one.
        const ip = req.ip || "unknown";
        const last = registerRateLimit.get(ip);
        if (last && Date.now() - last < REGISTER_COOLDOWN_MS) {
            const retryAfter = Math.ceil((REGISTER_COOLDOWN_MS - (Date.now() - last)) / 1000);
            res.setHeader("Retry-After", String(retryAfter));
            res.status(429).json({ error: "Too many registration requests. Try again later." });
            return;
        }

        // Accept the URL from the JSON body or the ?url= query string (the website sends both).
        const url = (req.body?.url ?? req.query?.url) as unknown;
        if (!url || typeof url !== "string") {
            res.status(400).json({ error: "url is required" });
            return;
        }

        registerRateLimit.set(ip, Date.now());

        try {
            const ok = await federatedDiscoveryService.probeOrigin(url);
            if (!ok) {
                res.status(422).json({ error: "Could not verify as a TuneCamp instance. Check the URL and that the instance is reachable." });
                return;
            }
            res.json({ ok: true, message: "Instance registered and will appear in the directory." });
        } catch (error) {
            console.error("Error registering community instance:", error);
            res.status(500).json({ error: "Registration failed" });
        }
    });

    /**
     * POST /api/community/dig-lookup { externalId?, title, artist }
     * Peer-facing half of network DIG (see dig.service.ts). The seed release is identified by
     * `externalId` when the caller has one (an exact match, e.g. a shared Bandcamp URL), else by
     * `title`+`artist` (fuzzy — the only option for a release that only exists on TuneCamp).
     * Returns the releases this instance's users co-starred alongside it — aggregate counts
     * only, never usernames, only public/released catalog items, and only opted-in instances
     * answer at all.
     */
    router.post("/dig-lookup", express.json(), (req, res) => {
        if (dbService.getSetting("digNetworkOptIn") !== "true") {
            res.status(404).json({ error: "Network dig is not enabled on this instance" });
            return;
        }

        const ip = req.ip || "unknown";
        if (!checkDigLookupRate(ip)) {
            res.status(429).json({ error: "Too many requests" });
            return;
        }

        const { externalId, title, artist } = req.body || {};
        if (!title || typeof title !== "string" || !artist || typeof artist !== "string") {
            res.status(400).json({ error: "title and artist are required" });
            return;
        }

        try {
            const seed = { externalId: typeof externalId === "string" ? externalId : null, title, artist };
            const results = container.digService.aggregateNetworkCoStars(seed, 50, { publicOnly: true });
            res.json({ results });
        } catch (error) {
            console.error("Error running dig-lookup:", error);
            res.status(500).json({ error: "Lookup failed" });
        }
    });

    return router;
}
