import { ProviderRegistry, syncRegistryWithDatabase } from "../../core/provider.js";
import type { DownloadProvider, DownloadResult } from "../../core/provider.js";
import { SoulseekDownloadProvider } from "../../providers/download/soulseek.provider.js";
import { TorrentDownloadProvider } from "../../providers/download/torrent.provider.js";
import type { SoulseekService } from "../integrations/soulseek.js";
import type { TorrentService } from "../integrations/torrent.service.js";

/**
 * DownloadService manages a registry of DownloadProviders.
 *
 * When TuneCamp needs to find and download a track from an external source
 * (e.g. Soulseek, BitTorrent, Bandcamp), it delegates to the registered providers.
 *
 * The "waterfall" strategy: search all providers simultaneously, merge results.
 * The caller then picks a result and calls download() to retrieve the file.
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
            throw new Error(`[DownloadService] Provider "${result.source}" is disabled. Enable it under System → Plugins.`);
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

export function initDownloadService(soulseekService: SoulseekService, torrentService?: TorrentService, defaultOwnerId: number = 1, db?: any): DownloadService {
    _downloadService = new DownloadService();
    // P2P sources are an explicit admin opt-in: legally grey for a
    // music-selling platform, so they ship disabled until toggled on
    // (Admin → System → Plugins). syncRegistryWithDatabase below restores
    // the persisted choice of admins who already opted in.
    _downloadService.getRegistry().register(new SoulseekDownloadProvider(soulseekService), false);
    if (torrentService) {
        _downloadService.getRegistry().register(new TorrentDownloadProvider(torrentService, defaultOwnerId), false);
    }
    if (db) {
        syncRegistryWithDatabase(_downloadService.getRegistry(), db).catch(err => console.error("Failed to sync download registry:", err));
    }
    return _downloadService;
}
