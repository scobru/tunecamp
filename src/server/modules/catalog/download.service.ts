import { ProviderRegistry, syncRegistryWithDatabase } from "../../core/provider.js";
import type { DownloadProvider, DownloadResult } from "../../core/provider.js";

/**
 * DownloadService manages a registry of DownloadProviders.
 *
 * When TuneCamp needs to find and download a track from an external source
 * (e.g. Soulseek, BitTorrent, Bandcamp), it delegates to the registered providers.
 *
 * The "waterfall" strategy: search all providers simultaneously, merge results.
 * The caller then picks a result and calls download() to retrieve the file.
 *
 * P2P providers (Soulseek, BitTorrent) are no longer hard-imported here.
 * They register themselves at startup via registerBuiltInDownloadProviders()
 * in server.ts, which dynamically imports them only if the npm packages are
 * available (they live in optionalDependencies).
 */
export class DownloadService {
    private registry = new ProviderRegistry<DownloadProvider>();

    /**
     * Searches all available (connected) providers for the given query.
     * Results from all providers are merged and returned together.
     *
     * @param query - e.g. "Radiohead - Creep"
     */
    async search(query: string): Promise<DownloadResult[]> {
        const allResults: DownloadResult[][] = await Promise.all(
            this.registry.getEnabled().map(async (provider) => {
                try {
                    const available = await provider.isAvailable();
                    if (!available) {
                        console.log(`[DownloadService] ⏭️ Skipping "${provider.name}" (not available)`);
                        return [];
                    }
                    const results = await provider.search(query);
                    console.log(`[DownloadService] 🔍 "${provider.name}" returned ${results.length} results for: ${query}`);
                    return results;
                } catch (error) {
                    console.error(`[DownloadService] ❌ Provider "${provider.name}" search failed:`, error);
                    return [];
                }
            })
        );

        return allResults.flat();
    }

    /**
     * Downloads a result using the provider that produced it.
     * The provider is identified via result.source (maps to provider id).
     *
     * @returns Local file path of the downloaded file.
     */
    async download(result: DownloadResult): Promise<string> {
        const provider = this.registry.get(result.source);
        if (!provider) {
            throw new Error(`[DownloadService] No provider registered for source: "${result.source}"`);
        }
        if (!this.registry.isEnabled(result.source)) {
            throw new Error(`[DownloadService] Provider "${result.source}" is disabled. Enable it under Admin → Integrations.`);
        }

        console.log(`[DownloadService] ⬇️ Downloading via "${provider.name}": ${result.title}`);
        return provider.download(result);
    }

    /**
     * Expose the registry for dynamic plugin registration.
     *
     * Example from a plugin:
     *   downloadService.getRegistry().register(new TorrentDownloadProvider());
     */
    getRegistry(): ProviderRegistry<DownloadProvider> {
        return this.registry;
    }

    listProviders(): { id: string; name: string; version: string; available?: boolean }[] {
        return this.registry.getAll().map((p: DownloadProvider) => ({
            id: p.id,
            name: p.name,
            version: p.version,
        }));
    }
}

/** App-wide singleton */
let _downloadService: DownloadService | null = null;

export function getDownloadService(): DownloadService | null {
    return _downloadService;
}

/**
 * Creates the DownloadService singleton. P2P providers are no longer
 * hard-wired here — they register themselves via registerBuiltInDownloadProviders()
 * in server.ts, which dynamically imports them only when their npm packages exist.
 */
export function initDownloadService(db?: any): DownloadService {
    _downloadService = new DownloadService();
    if (db) {
        syncRegistryWithDatabase(_downloadService.getRegistry(), db).catch(err => console.error("Failed to sync download registry:", err));
    }
    return _downloadService;
}
