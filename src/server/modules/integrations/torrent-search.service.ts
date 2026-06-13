import { TorrentSearchProvider, TorrentSearchResult } from "../../core/torrent-search.types.js";

class TorrentSearchService {
    private providers: TorrentSearchProvider[] = [];

    constructor() {
        // Registry will be populated by server.ts
    }

    public registerProvider(provider: TorrentSearchProvider) {
        this.providers.push(provider);
    }

    public async searchAll(query: string, category: string = 'Music'): Promise<TorrentSearchResult[]> {
        const allResults: TorrentSearchResult[] = [];
        
        // Run searches in parallel
        const searchPromises = this.providers.map(async (p) => {
            const t0 = Date.now();
            try {
                const results = await p.search(query, category);
                console.log(`🔎 [TorrentSearch] ${p.id} → ${results.length} results (${Date.now() - t0}ms)`);
                return results.map((r: TorrentSearchResult) => ({ ...r, searchProviderId: p.id }));
            } catch (err) {
                console.error(`[TorrentSearch] Provider ${p.id} failed after ${Date.now() - t0}ms:`, err);
                return [];
            }
        });

        const resultsArray = await Promise.all(searchPromises);
        for (const results of resultsArray) {
            allResults.push(...(results as any[]));
        }

        // Sort by seeds descending
        return allResults.sort((a, b) => b.seeds - a.seeds);
    }

    public async getMagnet(providerId: string, torrent: TorrentSearchResult): Promise<string | null> {
        const provider = this.providers.find(p => p.id === providerId);
        if (!provider) throw new Error(`Provider ${providerId} not found`);
        return provider.getMagnet(torrent);
    }
}

export const torrentSearchService = new TorrentSearchService();
