import { extractBandcampMetadata, searchBandcamp, BANDCAMP_IMAGE_BASE } from "../../utils/bandcamp.js";
import type { MetadataProvider, MetadataResult } from "../../core/provider.js";

/**
 * BandcampMetadataProvider uses the Bandcamp utility to search and extract metadata.
 */
export class BandcampMetadataProvider implements MetadataProvider {
    readonly id = "bandcamp";
    readonly name = "Bandcamp Metadata";
    readonly version = "2.0.0";
    readonly description = "Extracts rich metadata (artwork, tracks, years) from Bandcamp URLs or search";

    async isAvailable(): Promise<boolean> {
        return true;
    }

    /**
     * Searches Bandcamp for recordings (tracks).
     */
    async searchRecording(query: string): Promise<MetadataResult[]> {
        // If the query is a Bandcamp URL, extract it directly
        if (query.includes("bandcamp.com")) {
            const meta = await extractBandcampMetadata(query);
            if (meta) {
                return [{
                    id: query,
                    title: meta.title,
                    artist: meta.artist,
                    albumTitle: meta.title,
                    date: meta.year ? `${meta.year}-01-01` : "",
                    year: meta.year,
                    coverUrl: meta.cover,
                    source: "bandcamp"
                }];
            }
        }

        // Otherwise, perform a text search
        const results = await searchBandcamp(query, "t", 5);
        return results.map(r => ({
            id: r.item_url_path ?? r.item_url_root,
            title: r.name,
            artist: r.band_name ?? "Unknown",
            date: "", // Text search doesn't provide date directly
            coverUrl: r.art_id ? `${BANDCAMP_IMAGE_BASE}/a${String(r.art_id).padStart(10, "0")}_2.jpg` : r.img,
            source: "bandcamp"
        }));
    }

    async searchRelease(query: string): Promise<MetadataResult[]> {
        if (query.includes("bandcamp.com")) {
            return this.searchRecording(query);
        }

        // Search for albums
        const results = await searchBandcamp(query, "a", 5);
        return results.map(r => ({
            id: r.item_url_path ?? r.item_url_root,
            title: r.name,
            artist: r.band_name ?? "Unknown",
            date: "",
            coverUrl: r.art_id ? `${BANDCAMP_IMAGE_BASE}/a${String(r.art_id).padStart(10, "0")}_2.jpg` : r.img,
            source: "bandcamp"
        }));
    }

    async getCoverUrl(id: string): Promise<string | null> {
        if (id.includes("bandcamp.com")) {
            const meta = await extractBandcampMetadata(id);
            return meta?.cover || null;
        }
        return null;
    }
}
