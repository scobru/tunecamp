import { 
    SpotifyMetadataClient, 
    isSpotifyPlaylistUrl, 
    extractSpotifyPlaylistId 
} from "../../utils/spotify.js";
import type { 
    MetadataProvider, 
    MetadataResult, 
    PlaylistProvider, 
    PlaylistTrack,
    ExternalPlaylist
} from "../../core/provider.js";

/**
 * SpotifyProvider — provides metadata and playlist importing from Spotify.
 * Uses internal Pathfinder API with TOTP authentication.
 */
export class SpotifyProvider implements MetadataProvider, PlaylistProvider {
    readonly id = "spotify";
    readonly name = "Spotify";
    readonly version = "1.0.0";
    readonly description = "Metadata and playlist provider for Spotify";
    
    private client = new SpotifyMetadataClient();

    async isAvailable(): Promise<boolean> {
        return true;
    }

    // ─── MetadataProvider ───────────────────────────────────────────────────────

    async searchRelease(query: string): Promise<MetadataResult[]> {
        // searchAlbums not fully implemented in utils yet, but can be added
        return [];
    }

    async searchRecording(query: string): Promise<MetadataResult[]> {
        try {
            const tracks = await this.client.searchTracks(query);
            return tracks.map((t: any) => ({
                id: t.uri,
                title: t.name,
                artist: t.artists.items.map((a: any) => a.profile.name).join(", "),
                album: t.albumOfTrack.name,
                date: "",
                source: "spotify"
            }));
        } catch (e) {
            console.error(`[Spotify] searchRecording failed:`, e);
            return [];
        }
    }

    async getCoverUrl(id: string): Promise<string | null> {
        return null; // Requires more complex lookup
    }

    // ─── PlaylistProvider ───────────────────────────────────────────────────────

    canHandlePlaylist(url: string): boolean {
        return isSpotifyPlaylistUrl(url);
    }

    async fetchPlaylistByUrl(url: string): Promise<ExternalPlaylist> {
        const id = extractSpotifyPlaylistId(url);
        const playlist = await this.client.getPlaylist(id);

        return {
            id: playlist.id || id,
            title: playlist.name,
            description: playlist.description,
            thumbnail: playlist.images?.items[0]?.sources[0]?.url,
            tracks: playlist.content.items.map((item: any) => {
                const t = item.itemV2.data;
                return {
                    title: t.name,
                    artist: t.artists.items.map((a: any) => a.profile.name).join(", "),
                    duration: Math.floor(t.duration.totalMilliseconds / 1000),
                    thumbnail: t.albumOfTrack?.coverArt?.sources[0]?.url,
                    sourceId: t.uri,
                    provider: "spotify"
                };
            })
        };
    }
}
