import { TorrentSearchProvider, TorrentSearchResult } from '../../core/torrent-search.types.js';

/**
 * ThePirateBay search backed by the official JSON API (apibay.org).
 *
 * The HTML scrapers in `torrent-search-api` (see PublicScraperTorrentProvider)
 * are fragile and — crucially — unreachable from many datacenter/VPS IPs, where
 * they silently return zero results without throwing. apibay is a single stable
 * JSON endpoint that returns an `info_hash` per result, so we can build the
 * magnet link ourselves without a second round-trip. This makes it the primary,
 * most reliable provider; the scrapers stay registered as a fallback.
 *
 * The base URL is overridable via TORRENT_APIBAY_URL for operators who need to
 * route through a mirror or proxy.
 */
const APIBAY_URL = process.env.TORRENT_APIBAY_URL || 'https://apibay.org';
const SEARCH_TIMEOUT_MS = 12_000;

// apibay top-level category codes. We map our coarse category names onto them;
// 0 means "all categories".
const CATEGORY_MAP: Record<string, number> = {
    Music: 100,
    Audio: 100,
    Movies: 200,
    Video: 200,
    TV: 205,
    Apps: 300,
    Games: 400,
    Books: 601,
    All: 0,
};

// Public, well-seeded trackers appended to every magnet so clients can find peers.
const DEFAULT_TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://exodus.desync.com:6969/announce',
    'udp://tracker.openbittorrent.com:6969/announce',
];

interface ApibayItem {
    id: string;
    name: string;
    info_hash: string;
    leechers: string;
    seeders: string;
    size: string;
    added: string;
    num_files: string;
    username: string;
    status: string;
    category: string;
}

function buildMagnet(infoHash: string, name: string): string {
    const trackers = DEFAULT_TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join('');
    return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${trackers}`;
}

// apibay returns names with HTML entities (e.g. "&amp;", "&#39;"). Decode the
// common ones so titles render cleanly in the UI.
function decodeEntities(s: string): string {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function humanSize(bytes: number): string {
    if (!bytes || bytes <= 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }
    return `${v.toFixed(2)} ${units[i]}`;
}

export class ApibayTorrentProvider implements TorrentSearchProvider {
    readonly id = 'apibay';
    readonly name = 'ThePirateBay (apibay)';

    async search(query: string, category: string = 'Music'): Promise<TorrentSearchResult[]> {
        const cat = CATEGORY_MAP[category] ?? 0;
        const url = `${APIBAY_URL}/q.php?q=${encodeURIComponent(query)}&cat=${cat}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://thepiratebay.org/',
                    'Origin': 'https://thepiratebay.org',
                    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'cross-site'
                },
            });
            if (!res.ok) {
                console.error(`[Apibay] HTTP ${res.status} for "${query}"`);
                return [];
            }
            const items = (await res.json()) as ApibayItem[];
            if (!Array.isArray(items)) return [];

            // apibay returns a single sentinel row when there are no matches.
            if (items.length === 1 && (items[0].id === '0' || items[0].info_hash === '0000000000000000000000000000000000000000')) {
                return [];
            }

            return items.map((t): TorrentSearchResult => {
                const name = decodeEntities(t.name);
                return {
                title: name,
                size: humanSize(Number(t.size)),
                seeds: Number(t.seeders) || 0,
                peers: Number(t.leechers) || 0,
                time: t.added ? new Date(Number(t.added) * 1000).toISOString().slice(0, 10) : undefined,
                desc: `${APIBAY_URL}/description.php?id=${t.id}`,
                provider: this.name,
                // Pre-built magnet — getMagnet() just returns it, no second request.
                magnet: buildMagnet(t.info_hash, name),
                };
            });
        } catch (error: any) {
            const reason = error?.name === 'AbortError' ? `timed out after ${SEARCH_TIMEOUT_MS}ms` : (error?.message || error);
            console.error(`[Apibay] Search failed for "${query}": ${reason}`);
            return [];
        } finally {
            clearTimeout(timer);
        }
    }

    async getMagnet(torrent: TorrentSearchResult): Promise<string | null> {
        return torrent.magnet || null;
    }
}
