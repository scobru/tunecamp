import { load } from "cheerio";

export const BANDCAMP_IMAGE_BASE = "https://f4.bcbits.com/img";
const BANDCAMP_SEARCH_API_URL = "https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic";
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

interface BandcampTrack {
    title: string;
    duration: number;
    position: number;
    lyrics?: string;
    streamUrl?: string;
    /** Durable Bandcamp track page URL (e.g. https://artist.bandcamp.com/track/...). Unlike
     *  streamUrl (a signed, short-lived CDN link), this never expires and can be re-resolved
     *  for a fresh stream/download URL at any time. */
    url?: string;
}

export interface BandcampMetadata {
    title: string;
    artist: string;
    year: number;
    cover: string;
    genre?: string;
    tracks: BandcampTrack[];
    /** Internal Bandcamp tralbum id, needed for the collectors API. */
    tralbumId?: number;
    /** Internal Bandcamp tralbum type ('a' = album, 't' = track). */
    tralbumType?: TralbumType;
}

/** Bandcamp internal tralbum type discriminator. */
export type TralbumType = 'a' | 't';

/** A Bandcamp fan who owns (collected) a given release. */
export interface BandcampCollector {
    fanId: number;
    username: string;
    name: string;
    url: string;
}

/** An item in a Bandcamp fan's public collection. */
export interface BandcampCollectedItem {
    tralbumId: number;
    tralbumType: TralbumType;
    title: string;
    artist: string;
    url: string;
    coverUrl: string;
    /** Global count of how many fans collected this item (Bandcamp's own signal). */
    alsoCollectedCount: number;
    /** mp3-128 preview stream URL for the featured track, if available. */
    previewUrl: string | null;
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

        const origin = new URL(fullUrl).origin;
        const trackinfo = tralbumData.trackinfo || [];
        const tracks = trackinfo
            .map((t: any) => ({
                title: t.title || t.name,
                duration: t.duration || 0,
                position: t.track_num || t.position,
                lyrics: t.lyrics || null,
                streamUrl: t.file?.["mp3-128"] || null,
                url: t.title_link ? new URL(t.title_link, origin).toString() : undefined
            }))
            .filter((t: any) => t.title);

        return {
            title,
            artist,
            year,
            cover,
            genre: tralbumData.tags?.[0]?.name || "Bandcamp",
            tracks,
            tralbumId: typeof tralbumData.id === "number" ? tralbumData.id : undefined,
            tralbumType: tralbumData.item_type === "album" ? "a" : tralbumData.item_type === "track" ? "t" : undefined
        };
    } catch (error) {
        console.error("[Bandcamp] Error extracting metadata:", error);
        return null;
    }
}

const COLLECTORS_API_URL = "https://bandcamp.com/api/tralbumcollectors/2/thumbs";
const FAN_COLLECTION_API_URL = "https://bandcamp.com/api/fancollection/1/collection_items";
const COLLECTORS_PAGE_SIZE = 40;
const COLLECTION_PAGE_SIZE = 40;

async function postJson(url: string, body: unknown, timeoutMs = 12_000): Promise<any | null> {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) {
        throw new Error(`${url} returned ${response.status}`);
    }
    return response.json();
}

/**
 * Fetches the fans who have collected (own) a given Bandcamp release.
 *
 * Uses Bandcamp's internal, undocumented `tralbumcollectors` endpoint. Pagination
 * is driven by the per-result `token` field (the last result's token is passed as the
 * next request's `token`). NOTE: this endpoint is reverse-engineered and may change.
 */
export async function getTralbumCollectors(
    tralbumType: TralbumType,
    tralbumId: number,
    limit: number = 60
): Promise<BandcampCollector[]> {
    const collectors: BandcampCollector[] = [];
    let token: string | null = null;
    try {
        while (collectors.length < limit) {
            const data: any = await postJson(COLLECTORS_API_URL, {
                tralbum_type: tralbumType,
                tralbum_id: tralbumId,
                count: COLLECTORS_PAGE_SIZE,
                token
            });
            const results: any[] = data?.results || [];
            if (results.length === 0) break;

            for (const r of results) {
                if (typeof r.fan_id !== "number") continue;
                collectors.push({
                    fanId: r.fan_id,
                    username: r.username || "",
                    name: r.name || r.username || "Unknown",
                    url: r.url || (r.username ? `https://bandcamp.com/${r.username}` : "")
                });
            }

            token = results[results.length - 1]?.token || null;
            if (!data?.more_available || !token) break;
        }
    } catch (error) {
        console.error(`[Bandcamp] getTralbumCollectors failed for ${tralbumType}${tralbumId}:`, error);
    }
    return collectors.slice(0, limit);
}

/**
 * Fetches the public collection of a Bandcamp fan.
 *
 * Uses the internal `fancollection/collection_items` endpoint. The first request needs an
 * `older_than_token`; a synthetic "<now>::a::" token returns the most recent page, and the
 * response's `last_token` paginates further back. Each item already carries title/artist/art
 * and a preview stream URL via the sibling `tracklists` map, so no per-item fetch is needed.
 */
export async function getFanCollection(
    fanId: number,
    limit: number = 40
): Promise<BandcampCollectedItem[]> {
    const items: BandcampCollectedItem[] = [];
    let token: string = `${Math.floor(Date.now() / 1000)}::a::`;
    try {
        while (items.length < limit) {
            const data: any = await postJson(FAN_COLLECTION_API_URL, {
                fan_id: fanId,
                older_than_token: token,
                count: COLLECTION_PAGE_SIZE
            });
            const rawItems: any[] = data?.items || [];
            const tracklists: Record<string, any[]> = data?.tracklists || {};
            if (rawItems.length === 0) break;

            for (const it of rawItems) {
                if (typeof it.tralbum_id !== "number") continue;
                const tType: TralbumType = it.tralbum_type === "t" ? "t" : "a";
                const tlKey = `${tType}${it.tralbum_id}`;
                const previewUrl = tracklists[tlKey]?.[0]?.file?.["mp3-128"] || null;
                items.push({
                    tralbumId: it.tralbum_id,
                    tralbumType: tType,
                    title: it.item_title || it.album_title || "Unknown",
                    artist: it.band_name || "Unknown",
                    url: it.item_url || "",
                    coverUrl: it.item_art_url || it.item_art?.thumb_url || "",
                    alsoCollectedCount: typeof it.also_collected_count === "number" ? it.also_collected_count : 0,
                    previewUrl
                });
            }

            token = data?.last_token || "";
            if (!data?.more_available || !token) break;
        }
    } catch (error) {
        console.error(`[Bandcamp] getFanCollection failed for fan ${fanId}:`, error);
    }
    return items.slice(0, limit);
}
