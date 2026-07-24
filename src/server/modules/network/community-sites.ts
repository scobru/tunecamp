import type { DatabaseService } from "../../core/database.js";
import type { ServerConfig } from "../../core/config.js";
import type { FederatedDiscoveryService } from "./federated-discovery.service.js";
import { getSiteHandle } from "../../core/site-actor.js";
import { isLiveTuneCamp } from "../../common/network.js";

/**
 * Builds the aggregated community site list from every discovery source:
 * local + federated (HTTP/NodeInfo gossip) + ActivityPub site actors.
 *
 * Shared by `/api/stats/network/sites` (admin/webapp) and `/api/community/sites`
 * (public, for the static website).
 */
export interface CommunitySitesDeps {
    dbService: DatabaseService;
    config: ServerConfig;
    federatedDiscoveryService: FederatedDiscoveryService;
}

export async function buildCommunitySites(deps: CommunitySitesDeps): Promise<any[]> {
    const { dbService, config, federatedDiscoveryService } = deps;
    const publicUrl = dbService.getSetting("publicUrl") || config.publicUrl || `http://localhost:${config.port}`;
    const myUrl = publicUrl.replace(/\/$/, "");

    // 1. Federated (HTTP/NodeInfo gossip) sites
    const formattedFedSites = (federatedDiscoveryService?.getCommunitySites?.() ?? [])
        .filter((s) => s.url && s.url.replace(/\/$/, "") !== myUrl)
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

    // 2. ActivityPub site actors — health-checked so a followed instance that
    // went dark doesn't linger in the directory just because we once followed it.
    const apActorsAll = dbService
        .getFollowedActors()
        .filter((a: any) => a.username === "site" || a.username === getSiteHandle(dbService));
    const apLiveness = await Promise.all(apActorsAll.map(async (a: any) => {
        try { return await isLiveTuneCamp(new URL(a.uri).origin, 3000); } catch { return false; }
    }));
    const apActors = apActorsAll.filter((_: any, i: number) => apLiveness[i]);
    const knownOrigins = new Set(formattedFedSites.map((s) => new URL(s.url).origin));
    const formattedApSites = apActors
        .filter((a: any) => {
            try { return !knownOrigins.has(new URL(a.uri).origin); } catch { return true; }
        })
        .map((a: any) => ({
            url: a.uri,
            name: a.name || a.username || "AP Actor",
            description: a.summary || "",
            version: "ActivityPub",
            lastSeen: a.last_seen || new Date().toISOString(),
            coverImage: a.icon_url || null,
            federation: "activitypub",
        }));

    // 3. Local site
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

    return [localSite, ...formattedFedSites, ...formattedApSites];
}
