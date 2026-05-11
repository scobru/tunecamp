import { extractBandcampMetadata } from "../../utils/bandcamp.js";
import type { MetadataProvider, MetadataResult } from "../../core/provider.js";

/**
 * BandcampMetadataProvider uses the built-in Bandcamp utility to search for track metadata.
 */
export class BandcampMetadataProvider implements MetadataProvider {
    readonly id = "bandcamp-metadata";
    readonly name = "Bandcamp Metadata";
    readonly version = "1.0.0";
    readonly description = "Extracts rich metadata (artwork, tracks, years) from Bandcamp URLs";

    async isAvailable(): Promise<boolean> {
        return true;
    }

    /**
     * Since Bandcamp search is limited, this provider mostly works when a URL is provided,
     * or it can be extended to search via Bandcamp's tags/search page.
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
                    albumTitle: meta.title, // Bandcamp often treats the page as an album
                    date: meta.year ? `${meta.year}-01-01` : "",
                    year: meta.year,
                    coverUrl: meta.cover,
                    source: "bandcamp"
                }];
            }
        }
        return [];
    }

    async searchRelease(query: string): Promise<MetadataResult[]> {
        return this.searchRecording(query);
    }

    async getCoverUrl(id: string): Promise<string | null> {
        if (id.includes("bandcamp.com")) {
            const meta = await extractBandcampMetadata(id);
            return meta?.cover || null;
        }
        return null;
    }
}
