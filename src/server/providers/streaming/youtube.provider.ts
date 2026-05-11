import play from "play-dl";
import type { StreamingProvider } from "../../core/provider.js";

/**
 * YouTubeStreamingProvider uses play-dl to search and resolve streaming URLs from YouTube.
 * This is used as a fallback when a track is missing from the local library.
 */
export class YouTubeStreamingProvider implements StreamingProvider {
    readonly id = "youtube";
    readonly name = "YouTube";
    readonly version = "1.0.0";
    readonly description = "YouTube streaming fallback using play-dl";

    async isAvailable(): Promise<boolean> {
        // play-dl usually works without keys for basic search/stream, 
        // but can be enhanced with YT_SKIP_GEN_PREW=1 or cookies.
        return true;
    }

    /**
     * Resolves a track title and artist to a YouTube stream URL.
     */
    async getStreamUrl(title: string, artist?: string, album?: string): Promise<string | null> {
        try {
            const query = artist ? `${artist} - ${title}` : title;
            console.log(`[YouTubeProvider] 🔍 Searching for: ${query}`);

            // Search for videos
            const results = await play.search(query, {
                limit: 1,
                source: { youtube: "video" }
            });

            if (results.length === 0) {
                console.log(`[YouTubeProvider] ❌ No results found for: ${query}`);
                return null;
            }

            const video = results[0];
            console.log(`[YouTubeProvider] ✨ Found: ${video.title} (${video.url})`);

            const info = await play.video_info(video.url);
            const format = info.format.find(f => f.mimeType?.includes('audio') && !f.mimeType?.includes('video'));
            
            if (format?.url) {
                return format.url;
            }

            return video.url; 
        } catch (error) {
            console.error(`[YouTubeProvider] ❌ Error resolving ${title}:`, error);
            return null;
        }
    }

    canHandle(sourceId: string): boolean {
        return sourceId.includes("youtube.com") || sourceId.includes("youtu.be");
    }

    async getStreamById(id: string): Promise<string | null> {
        try {
            const info = await play.video_info(id);
            const format = info.format.find(f => f.mimeType?.includes('audio') && !f.mimeType?.includes('video'));
            return format?.url || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Searches YouTube for tracks matching the query.
     * Returns results in a format compatible with Global Search.
     */
    async search(query: string): Promise<any[]> {
        try {
            const results = await play.search(query, {
                limit: 10,
                source: { youtube: "video" }
            });

            return results.map(v => ({
                id: v.id,
                title: v.title,
                artist: v.channel?.name || "Unknown",
                url: v.url,
                thumbnail: v.thumbnails[0]?.url,
                duration: v.durationInSec,
                source: "youtube",
                type: "recording"
            }));
        } catch (error) {
            console.error(`[YouTubeProvider] ❌ Search failed for: ${query}`, error);
            return [];
        }
    }
}
