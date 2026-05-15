import fetch from "node-fetch";
import { load } from "cheerio";

export const BANDCAMP_IMAGE_BASE = "https://f4.bcbits.com/img";
export const BANDCAMP_SEARCH_API_URL = "https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface BandcampSearchResult {
    type: 'b' | 'a' | 't'; // band, album, track
    id: number;
    name: string;
    url: string;
    img?: string;
    art_id?: number;
    genre_name?: string;
    band_name?: string;
    album_name?: string;
    location?: string;
}

export interface BandcampTrack {
    title: string;
    duration: number;
    position: number;
    lyrics?: string;
    streamUrl?: string;
}

export interface BandcampMetadata {
    title: string;
    artist: string;
    year: number;
    cover: string;
    genre?: string;
    tracks: BandcampTrack[];
}

/**
 * Searches Bandcamp using the public autocomplete API.
 */
export async function searchBandcamp(query: string, filter: 'b' | 'a' | 't' = 't', limit: number = 10): Promise<BandcampSearchResult[]> {
    try {
        const response = await fetch(BANDCAMP_SEARCH_API_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': USER_AGENT
            },
            body: JSON.stringify({
                search_text: query,
                search_filter: filter,
                full_page: false,
                fan_id: null,
            }),
            signal: AbortSignal.timeout(10_000)
        });

        if (!response.ok) {
            throw new Error(`Bandcamp search API returned ${response.status}`);
        }

        const data = await response.json() as any;
        const results = data.auto?.results || [];

        return results.slice(0, limit).map((r: any) => ({
            type: r.type,
            id: r.id,
            name: r.name,
            url: r.item_url_path || r.item_url_root,
            img: r.img,
            art_id: r.art_id,
            genre_name: r.genre_name,
            band_name: r.band_name,
            album_name: r.album_name,
            location: r.location
        }));
    } catch (error) {
        console.error(`[Bandcamp] Search failed for "${query}":`, error);
        return [];
    }
}

/**
 * Extracts metadata and stream URLs from a Bandcamp page.
 */
export async function extractBandcampMetadata(url: string): Promise<BandcampMetadata | null> {
    try {
        const fullUrl = url.startsWith("http") ? url : `https://${url}`;
        const res = await fetch(fullUrl, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(15_000)
        });

        if (!res.ok) {
            console.error(`[Bandcamp] Failed to fetch ${fullUrl}: ${res.status}`);
            return null;
        }

        const html = await res.text();
        const $ = load(html);

        // Extract data-tralbum
        const script = $('script[data-tralbum]');
        const raw = script.attr('data-tralbum');
        if (!raw) {
            console.warn(`[Bandcamp] No data-tralbum found at ${fullUrl}`);
            return null;
        }

        const tralbumData = JSON.parse(raw.replace(/&quot;/g, '"'));
        
        const title = tralbumData.current?.title || tralbumData.trackinfo?.[0]?.title || "";
        const artist = tralbumData.artist || "";
        const dateStr = tralbumData.current?.release_date || "";
        const year = dateStr ? new Date(dateStr).getFullYear() : new Date().getFullYear();

        const coverArtId = tralbumData.art_id || "";
        const cover = coverArtId ? `${BANDCAMP_IMAGE_BASE}/a${coverArtId}_10.jpg` : "";

        const trackinfo = tralbumData.trackinfo || [];
        const tracks = trackinfo
            .map((t: any) => ({
                title: t.title || t.name,
                duration: t.duration || 0,
                position: t.track_num || t.position,
                lyrics: t.lyrics || null,
                streamUrl: t.file?.["mp3-128"] || null
            }))
            .filter((t: any) => t.title);

        return { 
            title, 
            artist, 
            year, 
            cover, 
            genre: tralbumData.tags?.[0]?.name || "Bandcamp",
            tracks 
        };
    } catch (error) {
        console.error("[Bandcamp] Error extracting metadata:", error);
        return null;
    }
}
