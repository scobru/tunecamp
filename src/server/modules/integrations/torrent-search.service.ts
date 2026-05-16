import { TorrentSearchProvider, TorrentSearchResult } from "../../core/torrent-search.types.js";

export class TorrentSearchService {
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
            try {
                const results = await p.search(query, category);
                return results.map((r: TorrentSearchResult) => ({ ...r, searchProviderId: p.id }));
            } catch (err) {
                console.error(`[TorrentSearch] Provider ${p.id} failed:`, err);
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
