import ytdl from "@nuclearplayer/ytdl-core";
import { readFileSync } from "fs";
import play from "play-dl";
import type { StreamingProvider, StreamCandidate } from "../../core/provider.js";




/**
 * Pick the best audio format from ytdl format list.
 * Prefers: opus/webm (best quality) → mp4a/aac → any audio-only → any with audio
 */
function chooseBestAudioFormat(formats: ytdl.videoFormat[]): ytdl.videoFormat | null {
    const audioOnly = formats.filter(f => f.hasAudio && !f.hasVideo);

    // 1. Prefer opus (webm container) — highest quality
    const opus = audioOnly.find(f => f.codecs?.includes("opus") || f.container === "webm");
    if (opus) return opus;

    // 2. AAC / mp4a
    const aac = audioOnly.find(f => f.codecs?.includes("mp4a") || f.container === "mp4");
    if (aac) return aac;

    // 3. Any audio-only
    if (audioOnly.length > 0) return audioOnly[0];

    // 4. Fallback: any format that has audio (muxed)
    return formats.find(f => f.hasAudio) ?? null;
}

/**
 * YouTubeStreamingProvider — uses @nuclearplayer/ytdl-core for stream resolution
 * and play-dl for text-based search (ytdl-core has no search API).
 *
 * Multi-client fallback: ["WEB_EMBEDDED", "IOS", "ANDROID", "TV"]
 * If one client is blocked, ytdl-core automatically tries the next.
 */
export class YouTubeStreamingProvider implements StreamingProvider {
    readonly id = "youtube";
    readonly name = "YouTube";
    readonly version = "2.0.0";
    readonly description = "YouTube streaming via @nuclearplayer/ytdl-core (multi-client) + play-dl search";

    /** ytdl agent — created once, supports optional cookies */
    private agent: ytdl.Agent;

    constructor() {
        // Optional: load cookies from YOUTUBE_COOKIES_PATH env var (synchronous)
        const cookiesPath = process.env.YOUTUBE_COOKIES_PATH;
        if (cookiesPath) {
            try {
                const cookies = JSON.parse(readFileSync(cookiesPath, "utf-8"));
                this.agent = ytdl.createAgent(cookies);
                console.log(`[YouTubeProvider] 🍪 Loaded cookies from ${cookiesPath}`);
            } catch {
                console.warn("[YouTubeProvider] ⚠️ Failed to load cookies, using anonymous agent");
                this.agent = ytdl.createAgent();
            }
        } else {
            this.agent = ytdl.createAgent();
        }
    }

    async isAvailable(): Promise<boolean> {
        return true;
    }

    /**
     * Resolves a track title + artist to a YouTube audio stream URL.
     * Uses play-dl to search, ytdl-core to resolve the stream.
     */
    async getStreamUrl(title: string, artist?: string, album?: string): Promise<string | null> {
        try {
            const query = artist ? `${artist} - ${title}` : title;
            console.log(`[YouTubeProvider] 🔍 Searching: ${query}`);

            const results = await play.search(query, {
                limit: 1,
                source: { youtube: "video" }
            });

            if (results.length === 0) {
                console.log(`[YouTubeProvider] ❌ No results for: ${query}`);
                return null;
            }

            const videoUrl = results[0].url;
            console.log(`[YouTubeProvider] ✨ Found: ${results[0].title} → ${videoUrl}`);
            return this._resolveStreamUrl(videoUrl);
        } catch (error) {
            console.error(`[YouTubeProvider] ❌ getStreamUrl failed for "${title}":`, error);
            return null;
        }
    }

    canHandle(sourceId: string): boolean {
        return sourceId.includes("youtube.com") || sourceId.includes("youtu.be");
    }

    async getStreamById(id: string): Promise<string | null> {
        return this._resolveStreamUrl(id);
    }

    /**
     * Searches YouTube using play-dl and returns candidates.
     */
    async search(query: string): Promise<StreamCandidate[]> {
        try {
            const results = await play.search(query, {
                limit: 10,
                source: { youtube: "video" }
            });

            return results
                .filter(v => v.id && v.title)
                .map(v => ({
                    id: v.id!,
                    title: v.title!,
                    artist: v.channel?.name ?? "Unknown",
                    provider: "youtube",
                    thumbnail: v.thumbnails[0]?.url,
                    duration: v.durationInSec,
                    meta: { url: v.url }
                }));
        } catch (error) {
            console.error(`[YouTubeProvider] ❌ Search failed for: ${query}`, error);
            return [];
        }
    }

    /**
     * Core resolution: given a YouTube URL or video ID, returns the best audio stream URL.
     */
    private async _resolveStreamUrl(urlOrId: string): Promise<string | null> {
        try {
            const info = await ytdl.getInfo(urlOrId, {
                agent: this.agent,
                playerClients: ["WEB_EMBEDDED", "IOS", "ANDROID", "TV"],
            });

            const format = chooseBestAudioFormat(info.formats);
            if (!format?.url) {
                console.warn(`[YouTubeProvider] ⚠️ No audio format found for ${urlOrId}`);
                return null;
            }

            return format.url;
        } catch (error) {
            console.error(`[YouTubeProvider] ❌ Failed to resolve stream for ${urlOrId}:`, error);
            throw error; // Let StreamingService handle retries
        }
    }
}
