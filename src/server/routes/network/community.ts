import { Router } from "express";
import type { ServiceContainer } from "../../core/container.js";
import { buildCommunitySites } from "../../modules/network/community-sites.js";

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

    return router;
}
