import type { FederationProvider } from "../../core/provider.js";

/**
 * ZenFederationProvider wraps ZenDBService to conform to the FederationProvider interface.
 *
 * Zen is TuneCamp's decentralized P2P network layer (Gun.js based).
 * This provider uses it to:
 *   - publish() → announce releases to the Zen community network
 *   - discover() → search for content across known peers
 *   - getStatus() → report peer connectivity
 */
export class ZenFederationProvider implements FederationProvider {
    readonly id = "zen-p2p";
    readonly name = "Zen P2P Network";
    readonly version = "1.0.0";
    readonly description = "Federated music discovery via Zen decentralized network";

    constructor(private readonly zendbService: any) {}

    /**
     * Announces a track, album, or artist to the Zen network.
     * Uses the existing publishRelease() for albums and registerSite() for context.
     */
    async publish(content: { type: 'track' | 'album' | 'artist'; id: number; data: any }): Promise<void> {
        try {
            if (content.type === 'album') {
                await this.zendbService.publishRelease(content.id);
                console.log(`[ZenFederationProvider] Published album ${content.id} to Zen network`);
            } else {
                // Tracks and artists propagate implicitly through album publishing in Zen
                console.log(`[ZenFederationProvider] ${content.type} ${content.id} will propagate with next album publish`);
            }
        } catch (error) {
            console.error(`[ZenFederationProvider] publish() failed:`, error);
            throw error;
        }
    }

    /**
     * Discovers music content from community sites on the Zen network.
     * Returns the raw catalog entries from remote instances.
     */
    async discover(query: string): Promise<any[]> {
        try {
            const sites = await this.zendbService.getCommunitySites();
            // Filter sites by query if possible (basic name match)
            const q = query.toLowerCase();
            return sites.filter((s: any) =>
                s.title?.toLowerCase().includes(q) ||
                s.artistName?.toLowerCase().includes(q) ||
                s.description?.toLowerCase().includes(q)
            );
        } catch (error) {
            console.error(`[ZenFederationProvider] discover() failed:`, error);
            return [];
        }
    }

    /**
     * Returns the current Zen network connection status.
     */
    async getStatus(): Promise<{ connected: boolean; peers: number; info?: string }> {
        try {
            const peers = this.zendbService.getPeerCount?.() ?? 0;
            return {
                connected: peers > 0,
                peers,
                info: peers > 0 ? `Connected to ${peers} Zen peer(s)` : "No Zen peers connected"
            };
        } catch {
            return { connected: false, peers: 0, info: "Zen status unavailable" };
        }
    }
}
