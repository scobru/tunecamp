import express, { Router } from "express";
import type { ServiceContainer } from "../../core/container.js";
import { buildCommunitySites } from "../../modules/network/community-sites.js";

// ponytail: in-memory rate limit, 1 registration per IP per hour
const registerRateLimit = new Map<string, number>();
const REGISTER_COOLDOWN_MS = 60 * 60 * 1000;

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
                version: "2.3.0",
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

    return router;
}
