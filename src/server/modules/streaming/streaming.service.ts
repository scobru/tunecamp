import { ProviderRegistry, syncRegistryWithDatabase } from "../../core/provider.js";
import type { StreamingProvider } from "../../core/provider.js";
import { YouTubeStreamingProvider } from "../../providers/streaming/youtube.provider.js";
import { BandcampStreamingProvider } from "../../providers/streaming/bandcamp.provider.js";
import type { DatabaseService } from "../../database.types.js";

/**
 * StreamingService manages a registry of StreamingProviders.
 */
export class StreamingService {
    private registry = new ProviderRegistry<StreamingProvider>();

    constructor() {
        this.registry.register(new YouTubeStreamingProvider());
        this.registry.register(new BandcampStreamingProvider());
    }

    async resolve(trackTitle: string, artistName: string, albumTitle?: string): Promise<string | null> {
        for (const provider of this.registry.getEnabled()) {
            try {
                const url = await provider.getStreamUrl(trackTitle, artistName, albumTitle);
                if (url) {
                    console.log(`[StreamingService] ✅ Resolved "${trackTitle}" via "${provider.name}"`);
                    return url;
                }
            } catch (error) {
                console.error(`[StreamingService] ❌ Provider "${provider.name}" failed to resolve "${trackTitle}":`, error);
            }
        }

        console.warn(`[StreamingService] ⚠️ No provider could resolve: "${artistName} - ${trackTitle}"`);
        return null;
    }

    async resolveById(providerId: string, trackId: string): Promise<string | null> {
        const provider = this.registry.get(providerId);
        if (!provider || !this.registry.isEnabled(providerId)) {
            console.warn(`[StreamingService] Provider "${providerId}" not found or disabled.`);
            return null;
        }
        return provider.getStreamById(trackId);
    }

    getRegistry(): ProviderRegistry<StreamingProvider> {
        return this.registry;
    }

    listProviders() {
        return this.registry.getRegistryInfo();
    }
}

/** App-wide singleton */
export const streamingService = new StreamingService();

let _streamingService: StreamingService;
export async function initStreamingService(db: DatabaseService): Promise<StreamingService> {
    _streamingService = new StreamingService();
    _streamingService.getRegistry().register(new YouTubeStreamingProvider());
    _streamingService.getRegistry().register(new BandcampStreamingProvider());
    
    await syncRegistryWithDatabase(_streamingService.getRegistry(), db);
    
    return _streamingService;
}

export function getStreamingService(): StreamingService {
    return _streamingService || streamingService;
}
