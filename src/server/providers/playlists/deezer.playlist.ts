import { deezerClient, isDeezerPlaylistUrl, extractDeezerPlaylistId } from "../../utils/deezer.js";
import type { 
    PlaylistProvider, 
    ExternalPlaylist, 
    MetadataProvider, 
    MetadataResult 
} from "../../core/provider.js";

export class DeezerProvider implements PlaylistProvider, MetadataProvider {
    readonly id = "deezer";
    readonly name = "Deezer";
    readonly version = "1.0.0";
    readonly description = "Deezer playlist and metadata provider";

    async isAvailable(): Promise<boolean> {
        return true;
    }

    // ─── PlaylistProvider ──────────────────────────────────────────────────────

    canHandlePlaylist(url: string): boolean {
        return isDeezerPlaylistUrl(url);
    }

    async fetchPlaylistByUrl(url: string): Promise<ExternalPlaylist> {
        const id = extractDeezerPlaylistId(url);
        const data = await deezerClient.getPlaylist(id);
        
        if (data.error) {
            throw new Error(`Deezer: ${data.error.message}`);
        }

        return {
            id: String(data.id),
            title: data.title,
            description: data.description || "",
            thumbnail: data.picture_medium || data.picture_big,
            tracks: data.tracks.data.map((t: any) => ({
                sourceId: String(t.id),
                title: t.title,
                artist: t.artist.name,
                album: t.album?.title,
                duration: t.duration,
                thumbnail: t.album?.cover_medium
            }))
        };
    }

    // ─── MetadataProvider ───────────────────────────────────────────────────────

    async searchRelease(query: string): Promise<MetadataResult[]> {
        return [];
    }

    async searchRecording(query: string): Promise<MetadataResult[]> {
        try {
            const data = await deezerClient.searchTracks(query);
            if (!data.data) return [];

            return data.data.map((t: any) => ({
                id: String(t.id),
                title: t.title,
                artist: t.artist.name,
                album: t.album?.title,
                date: "",
                source: "deezer",
                thumbnail: t.album?.cover_medium
            }));
        } catch (e) {
            console.error(`[Deezer] Search failed:`, e);
            return [];
        }
    }

    async getCoverUrl(id: string): Promise<string | null> {
        // Deezer IDs for tracks can be used to get album cover
        try {
            const data = await deezerClient.searchTracks(id, 1); // ID as query works sometimes or use getTrack
            // Actually better to have a getTrack in client
            return null;
        } catch {
            return null;
        }
    }
}
