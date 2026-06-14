import type { DatabaseService } from "../../core/database.js";
import type { ServerConfig } from "../../core/config.js";
import type { ZenDBService } from "./zendb.service.js";
import type { FederatedDiscoveryService } from "./federated-discovery.service.js";
import { getSiteHandle } from "../../core/site-actor.js";

/**
 * Builds the aggregated community site list from every discovery source:
 * local + Zen signaling + federated (HTTP/NodeInfo gossip) + ActivityPub site actors.
 *
 * Shared by `/api/stats/network/sites` (admin/webapp) and `/api/community/sites`
 * (public, for the static website). Zen is kept in parallel during Phase A.
 */
export interface CommunitySitesDeps {
    dbService: DatabaseService;
    config: ServerConfig;
    zendbService: ZenDBService;
    federatedDiscoveryService: FederatedDiscoveryService;
}

export async function buildCommunitySites(deps: CommunitySitesDeps): Promise<any[]> {
    const { dbService, config, zendbService, federatedDiscoveryService } = deps;
    const publicUrl = dbService.getSetting("publicUrl") || config.publicUrl || `http://localhost:${config.port}`;

    // 1. Zen signaling sites (legacy — kept in parallel during Phase A)
    const gunSites = await zendbService.getCommunitySites();
    const formattedGunSites = gunSites.map((s: any) => ({
        url: s.url,
        name: s.name || s.title || "Untitled",
        description: s.description || "",
        version: s.version || "2.0",
        lastSeen: s.lastSeen,
        coverImage: s.coverImage || null,
        communityLink: s.communityLink || null,
        federation: "zen",
    }));

    // 2. Federated (HTTP/NodeInfo gossip) sites — deduped against Zen-discovered ones
    const knownUrls = new Set(formattedGunSites.map((s) => (s.url || "").replace(/\/$/, "")));
    const formattedFedSites = (federatedDiscoveryService?.getCommunitySites?.() ?? [])
        .filter((s) => s.url && !knownUrls.has(s.url.replace(/\/$/, "")))
        .map((s) => ({
            url: s.url,
            name: s.name || "Untitled",
            description: s.description || "",
            version: s.version || "2.0",
            lastSeen: s.lastSeen,
            coverImage: s.coverImage || null,
            communityLink: s.communityLink || null,
            federation: "federated",
        }));

    // 3. ActivityPub site actors
    const apActors = dbService
        .getFollowedActors()
        .filter((a: any) => a.username === "site" || a.username === getSiteHandle(dbService));
    const formattedApSites = apActors.map((a: any) => ({
        url: a.uri,
        name: a.name || a.username || "AP Actor",
        description: a.summary || "",
        version: "ActivityPub",
        lastSeen: a.last_seen || new Date().toISOString(),
        coverImage: a.icon_url || null,
        federation: "activitypub",
    }));

    // 4. Local site
    const localSite = {
        url: publicUrl,
        name: dbService.getSetting("siteName") || "Local Instance",
        description: dbService.getSetting("siteDescription") || "My TuneCamp Server",
        version: "2.0 (Local)",
        lastSeen: new Date().toISOString(),
        coverImage: dbService.getSetting("coverImage") || null,
        communityLink: dbService.getSetting("communityLink") || null,
        federation: "local",
    };

    return [localSite, ...formattedGunSites, ...formattedFedSites, ...formattedApSites];
}
