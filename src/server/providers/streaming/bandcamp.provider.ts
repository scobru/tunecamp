import { searchBandcamp, extractBandcampMetadata, BANDCAMP_IMAGE_BASE } from "../../utils/bandcamp.js";
import type { StreamingProvider, StreamCandidate } from "../../core/provider.js";

const SEARCH_LIMIT = 5;

/**
 * BandcampStreamingProvider — searches via Bandcamp's JSON API and extracts
 * MP3-128 stream URLs using the shared Bandcamp utility.
 *
 * Based on nuclear-plugin-bandcamp implementation patterns.
 */
export class BandcampStreamingProvider implements StreamingProvider {
    readonly id = "bandcamp";
    readonly name = "Bandcamp";
    readonly version = "2.0.0";
    readonly description = "Bandcamp streaming via official search API + data-tralbum parsing";

    async isAvailable(): Promise<boolean> {
        return true;
    }

    /**
     * Searches Bandcamp for a track title+artist, then resolves the stream URL.
     */
    async getStreamUrl(title: string, artist?: string, album?: string): Promise<string | null> {
        try {
            const query = artist ? `${artist} ${title}` : title;
            console.log(`[BandcampProvider] 🔍 Searching: ${query}`);

            const results = await searchBandcamp(query, "t", SEARCH_LIMIT);

            if (results.length === 0) {
                console.log(`[BandcampProvider] ❌ No results for: ${query}`);
                return null;
            }

            // Try each result until we get a stream
            for (const result of results) {
                const trackUrl = result.item_url_path ?? result.item_url_root;
                try {
                    const meta = await extractBandcampMetadata(trackUrl);
                    const streamUrl = meta?.tracks?.[0]?.streamUrl;
                    if (streamUrl) {
                        console.log(`[BandcampProvider] ✅ Resolved: ${result.name}`);
                        return streamUrl;
                    }
                } catch (err) {
                    console.warn(`[BandcampProvider] ⚠️ Failed for ${trackUrl}:`, err);
                }
            }

            return null;
        } catch (error) {
            console.error(`[BandcampProvider] ❌ Error for "${title}":`, error);
            return null;
        }
    }

    canHandle(sourceId: string): boolean {
        return sourceId.includes("bandcamp.com") || sourceId.includes("bcbits.com");
    }

    async getStreamById(id: string): Promise<string | null> {
        const meta = await extractBandcampMetadata(id);
        return meta?.tracks?.[0]?.streamUrl || null;
    }

    /**
     * Searches Bandcamp for tracks and returns candidates.
     */
    async search(query: string): Promise<StreamCandidate[]> {
        try {
            const results = await searchBandcamp(query, "t", 10);
            return results.map(r => ({
                id: r.item_url_path ?? r.item_url_root,
                title: r.name,
                artist: r.band_name ?? "Unknown",
                provider: "bandcamp",
                thumbnail: r.art_id ? `${BANDCAMP_IMAGE_BASE}/a${String(r.art_id).padStart(10, "0")}_2.jpg` : r.img,
                meta: { url: r.item_url_path ?? r.item_url_root }
            }));
        } catch (error) {
            console.error(`[BandcampProvider] ❌ Search failed for: ${query}`, error);
            return [];
        }
    }
}
