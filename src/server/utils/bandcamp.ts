import fetch from "node-fetch";
import { isSafeUrl } from "../../utils/networkUtils.js";

export const BANDCAMP_SEARCH_API_URL = "https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic";
export const BANDCAMP_IMAGE_BASE = "https://f4.bcbits.com/img";
export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface BandcampSearchResult {
    type: "b" | "a" | "t";
    id: number;
    name: string;
    band_name?: string;
    art_id?: number;
    img?: string;
    item_url_path?: string;
    item_url_root: string;
}

/**
 * Searches Bandcamp using their official JSON autocomplete API.
 */
export async function searchBandcamp(query: string, filter: "b" | "a" | "t" = "t", limit: number = 5): Promise<BandcampSearchResult[]> {
    try {
        const response = await fetch(BANDCAMP_SEARCH_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
            },
            body: JSON.stringify({
                search_text: query,
                search_filter: filter,
                full_page: false,
                fan_id: null,
            }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) return [];
        const data = await response.json() as any;
        return (data.auto?.results || []).slice(0, limit);
    } catch (error) {
        console.error("[Bandcamp] Search failed:", error);
        return [];
    }
}

export async function extractBandcampMetadata(url: string | string[]) {
    try {
        if (!url) return null;
        const actualUrl = Array.isArray(url) ? url[0] : url;
        if (!actualUrl || typeof actualUrl !== 'string') return null;

        const parsedUrl = new URL(actualUrl);
        const hostname = parsedUrl.hostname;
        const isBandcamp = hostname === "bandcamp.com" || hostname.endsWith(".bandcamp.com");
        const isBcbits = hostname === "bcbits.com" || hostname.endsWith(".bcbits.com");

        if (!isBandcamp && !isBcbits) return null;
        if (!(await isSafeUrl(actualUrl))) return null;

        const response = await fetch(actualUrl.split("?")[0], {
            headers: { "User-Agent": USER_AGENT }
        });
        const html = await response.text();

        let tralbumData = null;

        // Method 1: data-tralbum attribute (Preferred)
        const match = html.match(/data-tralbum="([^"]+)"/);
        if (match && match[1]) {
            try {
                const decoded = match[1].replace(/&quot;/g, '"');
                tralbumData = JSON.parse(decoded);
            } catch (e) { }
        }

        // Method 2: Legacy inline JS
        if (!tralbumData) {
            const legacyMatch = html.match(/var\s+TralbumData\s*=\s*({[\s\S]*?});/);
            if (legacyMatch) {
                try {
                    tralbumData = JSON.parse(legacyMatch[1].replace(/'/g, '"'));
                } catch (e) { }
            }
        }

        if (!tralbumData) return null;

        const title = tralbumData.current?.title || "";
        const artist = tralbumData.artist || "";
        const dateStr = tralbumData.current?.release_date || "";
        const year = dateStr ? new Date(dateStr).getFullYear() : new Date().getFullYear();

        const coverArtId = tralbumData.art_id || "";
        const cover = coverArtId ? `https://f4.bcbits.com/img/a${coverArtId}_10.jpg` : "";

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

        return { title, artist, year, cover, tracks };
    } catch (error) {
        console.error("[Bandcamp] Error extracting metadata:", error);
        return null;
    }
}
