import { searchBandcamp, extractBandcampMetadata, BANDCAMP_IMAGE_BASE } from "../../utils/bandcamp.js";
import type { MetadataProvider, MetadataResult, ArtistMetadata } from "../../core/provider.js";

/**
 * BandcampMetadataProvider — provider for metadata and search from Bandcamp.
 */
export class BandcampMetadataProvider implements MetadataProvider {
    readonly id = "bandcamp";
    readonly name = "Bandcamp";
    readonly version = "1.1.0";
    readonly description = "Metadata provider using Bandcamp's public search API and scraping.";

    async searchRelease(query: string): Promise<MetadataResult[]> {
        try {
            const results = await searchBandcamp(query, "a", 10);
            return results.map(r => ({
                id: r.url,
                title: r.name,
                artist: r.band_name || "Unknown",
                date: "",
                genre: r.genre_name,
                coverUrl: r.art_id ? `${BANDCAMP_IMAGE_BASE}/a${String(r.art_id).padStart(10, "0")}_2.jpg` : r.img,
                source: "bandcamp"
            }));
        } catch (error) {
            console.error(`[BandcampMetadata] Search release failed:`, error);
            return [];
        }
    }

    async searchRecording(query: string): Promise<MetadataResult[]> {
        try {
            const results = await searchBandcamp(query, "t", 10);
            return results.map(r => ({
                id: r.url,
                title: r.name,
                artist: r.band_name || "Unknown",
                date: "",
                albumTitle: r.album_name,
                genre: r.genre_name,
                coverUrl: r.art_id ? `${BANDCAMP_IMAGE_BASE}/a${String(r.art_id).padStart(10, "0")}_2.jpg` : r.img,
                source: "bandcamp"
            }));
        } catch (error) {
            console.error(`[BandcampMetadata] Search recording failed:`, error);
            return [];
        }
    }

    async searchArtist(query: string): Promise<ArtistMetadata[]> {
        try {
            const results = await searchBandcamp(query, "b", 5);
            return results.map(r => ({
                id: r.url,
                name: r.name,
                bio: r.location,
                avatarUrl: r.img,
                source: "bandcamp"
            }));
        } catch (error) {
            console.error(`[BandcampMetadata] Search artist failed:`, error);
            return [];
        }
    }

    async getCoverUrl(id: string): Promise<string | null> {
        // If id is a URL, we can try to extract metadata
        if (id.startsWith("http")) {
            const meta = await extractBandcampMetadata(id);
            return meta?.cover || null;
        }
        return null;
    }
}
