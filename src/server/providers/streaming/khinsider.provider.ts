import { 
    searchKhInsider, 
    parseKhInsiderAlbum, 
    parseKhInsiderSong, 
    KHINSIDER_BASE_URL 
} from "../../utils/khinsider.js";
import type { 
    StreamingProvider, 
    StreamCandidate, 
    MetadataProvider, 
    MetadataResult 
} from "../../core/provider.js";

/**
 * KhInsiderProvider — provider for video game music from KHInsider.
 * Implements both StreamingProvider and MetadataProvider.
 */
export class KhInsiderProvider implements StreamingProvider, MetadataProvider {
    readonly id = "khinsider";
    readonly name = "KHInsider";
    readonly version = "1.0.0";
    readonly description = "Video game music provider (scraping downloads.khinsider.com)";

    async isAvailable(): Promise<boolean> {
        return true;
    }

    // ─── MetadataProvider ───────────────────────────────────────────────────────

    async searchRelease(query: string): Promise<MetadataResult[]> {
        try {
            const albums = await searchKhInsider(query);
            return albums.map(a => ({
                id: a.url,
                title: a.name,
                artist: "Video Game Music",
                date: "",
                source: "khinsider"
            }));
        } catch (e) {
            console.error(`[KhInsider] Search failed:`, e);
            return [];
        }
    }

    async searchRecording(query: string): Promise<MetadataResult[]> {
        // KhInsider search returns albums. We pick the first album and return its tracks.
        try {
            const albums = await searchKhInsider(query);
            if (albums.length === 0) return [];
            
            const detail = await parseKhInsiderAlbum(albums[0].url);
            if (!detail) return [];
            
            return detail.tracks.map(t => ({
                id: t.songPageUrl,
                title: t.name,
                artist: detail.name,
                date: "",
                source: "khinsider"
            }));
        } catch (e) {
            console.error(`[KhInsider] searchRecording failed:`, e);
            return [];
        }
    }

    async getCoverUrl(_id: string): Promise<string | null> {
        return null; // KhInsider doesn't always have easy cover links
    }

    // ─── StreamingProvider ──────────────────────────────────────────────────────

    async getStreamUrl(title: string, artist: string, album?: string): Promise<string | null> {
        const query = artist ? `${artist} ${title}` : title;
        const candidates = await this.search(query);
        if (candidates.length > 0) {
            return this.getStreamById(candidates[0].id);
        }
        return null;
    }

    canHandle(sourceId: string): boolean {
        return sourceId.includes("khinsider.com");
    }

    async getStreamById(id: string): Promise<string | null> {
        try {
            return await parseKhInsiderSong(id);
        } catch (e) {
            console.error(`[KhInsider] Resolve failed for ${id}:`, e);
            return null;
        }
    }

    async search(query: string): Promise<StreamCandidate[]> {
        try {
            const albums = await searchKhInsider(query);
            if (albums.length === 0) return [];
            
            const detail = await parseKhInsiderAlbum(albums[0].url);
            if (!detail) return [];
            
            return detail.tracks
                .filter(t => t.name.toLowerCase().includes(query.toLowerCase()) || query.toLowerCase().includes(t.name.toLowerCase()) || true)
                .slice(0, 10)
                .map(t => ({
                    id: t.songPageUrl,
                    title: t.name,
                    artist: detail.name,
                    provider: "khinsider"
                }));
        } catch (e) {
            console.error(`[KhInsider] search failed:`, e);
            return [];
        }
    }
}
