import torrentSearch from 'torrent-search-api';
import { TorrentSearchProvider, TorrentSearchResult } from '../../core/torrent-search.types.js';

export class PublicScraperTorrentProvider implements TorrentSearchProvider {
    readonly id = 'public-scraper';
    readonly name = 'Public Trackers (1337x, TPB)';

    constructor() {
        // Enable all available public providers for better reliability
        torrentSearch.enablePublicProviders();
    }

    async search(query: string, category: string = 'Music'): Promise<TorrentSearchResult[]> {
        try {
            const results: any[] = await torrentSearch.search(query, category, 20);
            return results.map((t: any) => ({
                title: t.title,
                time: t.time,
                size: t.size,
                seeds: Number(t.seeds) || 0,
                peers: Number(t.peers) || 0,
                desc: t.desc,
                provider: t.provider,
                magnet: t.magnet // Some providers return magnet directly
            }));
        } catch (error) {
            console.error(`[PublicScraper] Search failed for "${query}":`, error);
            return [];
        }
    }

    async getMagnet(torrent: TorrentSearchResult): Promise<string | null> {
        if (torrent.magnet) return torrent.magnet;
        try {
            return await torrentSearch.getMagnet(torrent as any);
        } catch (error) {
            console.error(`[PublicScraper] Failed to get magnet for "${torrent.title}":`, error);
            return null;
        }
    }
}
