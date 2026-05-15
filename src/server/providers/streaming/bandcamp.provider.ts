import { searchBandcamp, extractBandcampMetadata, BANDCAMP_IMAGE_BASE } from "../../utils/bandcamp.js";
import type { StreamingProvider, StreamCandidate } from "../../core/provider.js";

/**
 * BandcampProvider — provider for external audio streams from Bandcamp.
 */
export class BandcampProvider implements StreamingProvider {
    readonly id = "bandcamp";
    readonly name = "Bandcamp";
    readonly version = "1.1.0";
    readonly description = "Streaming provider using Bandcamp scraping.";

    async isAvailable(): Promise<boolean> {
        return true;
    }

    async getStreamUrl(title: string, artist: string, _album?: string): Promise<string | null> {
        const query = `${artist} ${title}`;
        const candidates = await this.search(query);
        
        if (candidates.length > 0) {
            // Try to find an exact match if possible, otherwise pick first
            const match = candidates.find(c => 
                c.title.toLowerCase() === title.toLowerCase() && 
                c.artist?.toLowerCase() === artist.toLowerCase()
            ) || candidates[0];
            
            return this.getStreamById(match.id);
        }
        
        return null;
    }

    canHandle(sourceId: string): boolean {
        return sourceId.includes("bandcamp.com");
    }

    async getStreamById(id: string): Promise<string | null> {
        try {
            // id is the Bandcamp URL
            const meta = await extractBandcampMetadata(id);
            if (!meta || meta.tracks.length === 0) return null;
            
            // If it's a track URL, it will have one track or the first one is the target
            return meta.tracks[0].streamUrl || null;
        } catch (error) {
            console.error(`[BandcampProvider] Resolve failed for ${id}:`, error);
            return null;
        }
    }

    async search(query: string): Promise<StreamCandidate[]> {
        try {
            const results = await searchBandcamp(query, "t", 10);
            return results.map(r => ({
                id: r.url,
                title: r.name,
                artist: r.band_name || "Unknown",
                provider: "bandcamp",
                thumbnail: r.art_id ? `${BANDCAMP_IMAGE_BASE}/a${String(r.art_id).padStart(10, "0")}_2.jpg` : r.img,
                meta: { url: r.url }
            }));
        } catch (error) {
            console.error(`[BandcampProvider] Search failed for: ${query}`, error);
            return [];
        }
    }
}
