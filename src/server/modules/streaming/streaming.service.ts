import { ProviderRegistry, syncRegistryWithDatabase } from "../../core/provider.js";
import type { StreamingProvider, StreamCandidate } from "../../core/provider.js";
import { YouTubeStreamingProvider } from "../../providers/streaming/youtube.provider.js";
import { BandcampStreamingProvider } from "../../providers/streaming/bandcamp.provider.js";
import { SoundCloudStreamingProvider } from "../../providers/streaming/soundcloud.provider.js";
import { KhInsiderProvider } from "../../providers/streaming/khinsider.provider.js";
import { HiFiProvider } from "../../providers/streaming/hifi.provider.js";
import type { DatabaseService } from "../../core/database.types.js";

/**
 * StreamingService manages the registry of StreamingProviders.
 * Acts as a 'Host' that provides centralized resilience features:
 * - Caching of resolved stream URLs
 * - Automatic retries for intermittent failures
 * - Candidate-based resolution workflow
 */
export class StreamingService {
    private registry = new ProviderRegistry<StreamingProvider>();
    
    /** Global Cache: Key (Provider:ID) -> { url, expiresAt } */
    private urlCache = new Map<string, { url: string; expiresAt: number }>();
    private CACHE_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours default

    constructor() {
        this.registry.register(new YouTubeStreamingProvider());
        this.registry.register(new BandcampStreamingProvider());
        this.registry.register(new SoundCloudStreamingProvider());
        this.registry.register(new KhInsiderProvider());
        this.registry.register(new HiFiProvider());
    }

    /**
     * Searches for stream candidates across all enabled providers.
     */
    async search(query: string): Promise<StreamCandidate[]> {
        const allCandidates: StreamCandidate[] = [];
        const providers = this.registry.getEnabled();

        const results = await Promise.allSettled(
            providers.map(async p => {
                if (p.search) {
                    return await p.search(query);
                }
                return [];
            })
        );

        for (const res of results) {
            if (res.status === "fulfilled") {
                allCandidates.push(...res.value);
            }
        }

        return allCandidates;
    }

    /**
     * Resolves a track to a stream URL using a 'Best Effort' strategy.
     * Tries providers in order, with retries and caching.
     */
    async resolve(trackTitle: string, artistName: string, albumTitle?: string): Promise<string | null> {
        const query = `${artistName} - ${trackTitle}`;
        const cacheKey = `global:search:${query}`;

        const cached = this.getCached(cacheKey);
        if (cached) {
            console.log(`[StreamingService] ⚡ Global cache hit for: ${query}`);
            return cached;
        }

        for (const provider of this.registry.getEnabled()) {
            try {
                const url = await this.withRetry(async () => {
                    return await provider.getStreamUrl(trackTitle, artistName, albumTitle);
                }, 2); // 2 retries

                if (url) {
                    console.log(`[StreamingService] ✅ Resolved "${trackTitle}" via "${provider.name}"`);
                    this.setCache(cacheKey, url);
                    return url;
                }
            } catch (error) {
                console.error(`[StreamingService] ❌ Provider "${provider.name}" failed for "${trackTitle}":`, error);
            }
        }

        console.warn(`[StreamingService] ⚠️ No provider could resolve: "${artistName} - ${trackTitle}"`);
        return null;
    }

    /**
     * Resolves a stream by a specific provider ID and external ID.
     * Uses centralized caching and retries.
     */
    async resolveById(providerId: string, trackId: string): Promise<string | null> {
        const cacheKey = `${providerId}:${trackId}`;
        const cached = this.getCached(cacheKey);
        if (cached) {
            console.log(`[StreamingService] ⚡ Global cache hit for: ${cacheKey}`);
            return cached;
        }

        const provider = this.registry.get(providerId);
        if (!provider || !this.registry.isEnabled(providerId)) {
            console.warn(`[StreamingService] Provider "${providerId}" not found or disabled.`);
            return null;
        }

        try {
            const url = await this.withRetry(async () => {
                return await provider.getStreamById(trackId);
            }, 3); // 3 retries for direct ID resolution

            if (url) {
                this.setCache(cacheKey, url);
                return url;
            }
        } catch (error) {
            console.error(`[StreamingService] ❌ resolveById failed for ${cacheKey}:`, error);
        }

        return null;
    }

    /**
     * Centralized retry helper.
     */
    private async withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
        let lastError: any;
        for (let i = 0; i <= attempts; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (i < attempts) {
                    const delay = Math.pow(2, i) * 500;
                    console.warn(`[StreamingService] 🔄 Retry ${i + 1}/${attempts} after ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        throw lastError;
    }

    private getCached(key: string): string | null {
        const entry = this.urlCache.get(key);
        if (entry && Date.now() < entry.expiresAt) {
            return entry.url;
        }
        this.urlCache.delete(key);
        return null;
    }

    private setCache(key: string, url: string, ttl = this.CACHE_TTL_MS): void {
        this.urlCache.set(key, { url, expiresAt: Date.now() + ttl });
    }

    getRegistry(): ProviderRegistry<StreamingProvider> {
        return this.registry;
    }

    listProviders() {
        return this.registry.getRegistryInfo();
    }
}

/** App-wide singleton (used before DB init) */
export const streamingService = new StreamingService();

let _streamingService: StreamingService;

/**
 * Initializes the StreamingService with DB-persisted provider enable/disable state.
 * Call this during server startup after DB is ready.
 */
export async function initStreamingService(db: DatabaseService): Promise<StreamingService> {
    _streamingService = new StreamingService();
    await syncRegistryWithDatabase(_streamingService.getRegistry(), db);
    return _streamingService;
}

export function getStreamingService(): StreamingService {
    return _streamingService || streamingService;
}
