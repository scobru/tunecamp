import { ProviderRegistry, syncRegistryWithDatabase } from "../../core/provider.js";
import type { FederationProvider } from "../../core/provider.js";
import { ZenFederationProvider } from "../../providers/federation/zen.provider.js";
import { ActivityPubFederationProvider } from "../../providers/federation/activitypub.provider.js";
import type { ActivityPubService } from "./activitypub.service.js";
import type { DatabaseService } from "../../database.js";

/**
 * FederationService manages a registry of FederationProviders.
 */
export class FederationService {
    private registry = new ProviderRegistry<FederationProvider>();

    async publish(content: { type: 'track' | 'album' | 'artist'; id: number; data: any }): Promise<void> {
        await Promise.allSettled(
            this.registry.getEnabled().map(p => p.publish(content).catch(e =>
                console.error(`[FederationService] Provider "${p.name}" publish failed:`, e)
            ))
        );
    }

    async discover(query: string): Promise<any[]> {
        const results = await Promise.all(
            this.registry.getEnabled().map(p =>
                p.discover(query).catch(e => {
                    console.error(`[FederationService] Provider "${p.name}" discover failed:`, e);
                    return [];
                })
            )
        );
        return results.flat();
    }

    async getStatus(): Promise<{ provider: string; connected: boolean; peers: number; info?: string }[]> {
        return Promise.all(
            this.registry.getEnabled().map(async p => {
                const status = await p.getStatus().catch(() => ({ connected: false, peers: 0 }));
                return { provider: p.name, ...status };
            })
        );
    }

    getRegistry(): ProviderRegistry<FederationProvider> {
        return this.registry;
    }

    listProviders() {
        return this.registry.getRegistryInfo();
    }
}

export const federationService = new FederationService();

export async function initFederationService(db: DatabaseService, zendbService: any, apService?: ActivityPubService): Promise<FederationService> {
    federationService.getRegistry().register(new ZenFederationProvider(zendbService));
    if (apService) {
        federationService.getRegistry().register(new ActivityPubFederationProvider(apService));
    }
    
    await syncRegistryWithDatabase(federationService.getRegistry(), db);
    
    return federationService;
}
