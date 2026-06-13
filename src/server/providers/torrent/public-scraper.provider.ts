import torrentSearch from 'torrent-search-api';
import { TorrentSearchProvider, TorrentSearchResult } from '../../core/torrent-search.types.js';

/**
 * Public tracker scraper backed by `torrent-search-api`.
 *
 * Most of the library's bundled scrapers are dead in practice: RARBG/Torrent9/
 * Torrentz2 changed domains or shut down, and 1337x now sits behind a Cloudflare
 * challenge that makes the scraper hang and return 403. Enabling *all* providers
 * therefore both wastes time and risks stalling the whole search on the dead ones.
 *
 * We instead enable a curated short-list of providers that still respond, and wrap
 * the search in a hard timeout so a single misbehaving scraper can't block the
 * request. Operators can override the list via the TORRENT_SEARCH_PROVIDERS env var
 * (comma-separated provider names, e.g. "ThePirateBay,Limetorrents,1337x").
 */
const DEFAULT_PROVIDERS = ['ThePirateBay', 'Limetorrents'];
const SEARCH_TIMEOUT_MS = 12_000;

export class PublicScraperTorrentProvider implements TorrentSearchProvider {
    readonly id = 'public-scraper';
    readonly name = 'Public Trackers';

    constructor() {
        const configured = (process.env.TORRENT_SEARCH_PROVIDERS || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        const wanted = configured.length > 0 ? configured : DEFAULT_PROVIDERS;

        const enabled: string[] = [];
        for (const name of wanted) {
            try {
                torrentSearch.enableProvider(name);
                enabled.push(name);
            } catch (err: any) {
                console.warn(`⚠️ [PublicScraper] Could not enable provider "${name}": ${err?.message || err}`);
            }
        }
        console.log(`🔌 [PublicScraper] Enabled torrent providers: ${enabled.join(', ') || '(none)'}`);
    }

    async search(query: string, category: string = 'Music'): Promise<TorrentSearchResult[]> {
        try {
            const results: any[] = await Promise.race([
                torrentSearch.search(query, category, 20),
                new Promise<any[]>((_, reject) =>
                    setTimeout(() => reject(new Error(`search timed out after ${SEARCH_TIMEOUT_MS}ms`)), SEARCH_TIMEOUT_MS)
                ),
            ]);
            return results.map((t: any) => ({
                title: t.title,
                time: t.time,
                size: t.size,
                seeds: Number(t.seeds) || 0,
                peers: Number(t.peers) || 0,
                desc: t.desc,
                provider: t.provider,
                // `link` (page URL) and `magnet` are both needed by getMagnet() to
                // resolve the download link later — pass them through untouched.
                link: t.link,
                magnet: t.magnet,
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
