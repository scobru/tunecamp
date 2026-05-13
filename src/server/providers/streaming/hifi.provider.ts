import { hifiClient, getTidalCoverUrl } from "../../utils/hifi.js";
import type { 
    StreamingProvider, 
    StreamCandidate, 
    MetadataProvider, 
    MetadataResult 
} from "../../core/provider.js";

/**
 * HiFiProvider — provides high-fidelity streaming and metadata via Monochrome API.
 */
export class HiFiProvider implements StreamingProvider, MetadataProvider {
    readonly id = "hifi";
    readonly name = "HiFi (Monochrome)";
    readonly version = "1.1.0";
    readonly description = "High-fidelity streaming and metadata provider (Tidal-based)";

    async isAvailable(): Promise<boolean> {
        return true;
    }

    // ─── MetadataProvider ───────────────────────────────────────────────────────

    async searchRelease(query: string): Promise<MetadataResult[]> {
        return [];
    }

    async searchRecording(query: string): Promise<MetadataResult[]> {
        try {
            const response = await hifiClient.searchTracks(query);
            if (!response.data || !response.data.items) return [];
            
            return response.data.items.map((t: any) => ({
                id: String(t.id),
                title: t.title,
                artist: t.artists.map((a: any) => a.name).join(", "),
                album: t.album.title,
                date: "",
                source: "hifi",
                thumbnail: t.album.cover ? getTidalCoverUrl(t.album.cover, 320) : undefined
            }));
        } catch (e) {
            console.error(`[HiFi] Search failed:`, e);
            return [];
        }
    }

    async getCoverUrl(id: string): Promise<string | null> {
        try {
            const data = await hifiClient.getCover(id);
            if (data.covers && data.covers.length > 0) {
                return data.covers[0]['1280'] || data.covers[0]['640'] || null;
            }
            return null;
        } catch {
            return null;
        }
    }

    // ─── StreamingProvider ──────────────────────────────────────────────────────

    async getStreamUrl(title: string, artist?: string): Promise<string | null> {
        const query = artist ? `${artist} ${title}` : title;
        const candidates = await this.search(query);
        if (candidates.length > 0) {
            return this.getStreamById(candidates[0].id);
        }
        return null;
    }

    canHandle(sourceId: string): boolean {
        return /^\d+$/.test(sourceId);
    }

    async getStreamById(id: string): Promise<string | null> {
        try {
            const data = await hifiClient.getTrackPlayback(id);
            return data.streamUrl || null;
        } catch (e) {
            console.error(`[HiFi] Resolve failed for ${id}:`, e);
            return null;
        }
    }

    async search(query: string): Promise<StreamCandidate[]> {
        try {
            const response = await hifiClient.searchTracks(query);
            if (!response.data || !response.data.items) return [];
            
            return response.data.items.slice(0, 10).map((t: any) => ({
                id: String(t.id),
                title: t.title,
                artist: t.artists.map((a: any) => a.name).join(", "),
                provider: "hifi",
                thumbnail: t.album.cover ? getTidalCoverUrl(t.album.cover, 160) : undefined
            }));
        } catch (e) {
            console.error(`[HiFi] Stream search failed:`, e);
            return [];
        }
    }
}
