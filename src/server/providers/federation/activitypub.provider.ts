import type { FederationProvider } from "../../core/provider.js";
import type { ActivityPubService } from "../../modules/activitypub/activitypub.service.js";

/**
 * ActivityPubFederationProvider adapters ActivityPubService to the 
 * modular TuneCamp Federation interface.
 */
export class ActivityPubFederationProvider implements FederationProvider {
    readonly id = "activitypub";
    readonly name = "ActivityPub";
    readonly version = "1.0.0";
    readonly description = "Federation via ActivityPub (W3C standard), compatible with Mastodon, Funkwhale, etc.";

    constructor(private apService: ActivityPubService) {}

    /**
     * Publishes content to the ActivityPub network.
     */
    async publish(content: { type: 'track' | 'album' | 'artist'; id: number; data: any }): Promise<void> {
        try {
            if (content.type === 'album') {
                // In ActivityPub terms, a release broadcast
                await this.apService.broadcastRelease(content.data, true);
            } else if (content.type === 'track') {
                // We usually broadcast at the album level, but could do individual tracks here
            } else if (content.type === 'artist') {
                // Sync artist profile or similar
            }
        } catch (error) {
            console.error(`[ActivityPubProvider] ❌ Failed to publish ${content.type} ${content.id}:`, error);
        }
    }

    /**
     * Discovers content via ActivityPub.
     * Note: AP discovery usually happens via WebFinger or searching Actor IDs.
     */
    async discover(query: string): Promise<any[]> {
        try {
            // If it's a handle (e.g. @user@domain), we can try to follow/fetch
            if (query.includes("@")) {
                await this.apService.followRemoteActor(query);
                return [{ id: query, source: "activitypub", type: "actor", info: "Discovering and following remote actor..." }];
            }
            return [];
        } catch (error) {
            console.error(`[ActivityPubProvider] ❌ Discovery failed for "${query}":`, error);
            return [];
        }
    }

    /**
     * Returns AP network status.
     */
    async getStatus(): Promise<{ connected: boolean; peers: number; info?: string }> {
        const domain = this.apService.getDomain();
        return {
            connected: !!domain,
            peers: 0, // ActivityPub doesn't have a simple 'peer count' like P2P, but we could return follower count
            info: `Domain: ${domain}`
        };
    }
}
