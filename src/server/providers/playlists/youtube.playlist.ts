import play from "play-dl";
import type { PlaylistProvider, PlaylistTrack, ExternalPlaylist } from "../../core/provider.js";

/**
 * YouTubePlaylistProvider — fetches playlists from YouTube.
 */
export class YouTubePlaylistProvider implements PlaylistProvider {
    readonly id = "youtube-playlists";
    readonly name = "YouTube Playlists";
    readonly version = "1.0.0";
    readonly description = "Imports tracks from YouTube playlists";

    async isAvailable(): Promise<boolean> {
        return true;
    }

    canHandlePlaylist(url: string): boolean {
        try {
            const parsed = new URL(url);
            return (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) &&
                   parsed.searchParams.has("list");
        } catch {
            return false;
        }
    }

    async fetchPlaylistByUrl(url: string): Promise<ExternalPlaylist> {
        try {
            const playlist = await play.playlist_info(url, { incomplete: true });
            
            // Fetch all tracks (play-dl might only fetch first page by default)
            const tracks: PlaylistTrack[] = [];
            const videos = await playlist.all_videos();
            
            for (const v of videos) {
                tracks.push({
                    title: v.title ?? "Unknown Title",
                    artist: v.channel?.name ?? "Unknown Artist",
                    duration: v.durationInSec,
                    thumbnail: v.thumbnails[0]?.url,
                    sourceId: v.id!,
                    provider: "youtube"
                });
            }

            return {
                id: playlist.id ?? url,
                title: playlist.title ?? "YouTube Playlist",
                description: (playlist as any).description ?? "",
                thumbnail: playlist.thumbnail?.url,
                tracks
            };
        } catch (error) {
            console.error(`[YouTubePlaylist] Fetch failed for ${url}:`, error);
            throw new Error(`Failed to fetch YouTube playlist: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
