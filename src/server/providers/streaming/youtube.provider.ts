import ytdl from "@distube/ytdl-core";
import ytSearch from "yt-search";
import { readFileSync } from "fs";
import play from "play-dl";
import type { StreamingProvider, StreamCandidate, MetadataProvider, MetadataResult } from "../../core/provider.js";

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
 * YouTubeStreamingProvider — uses @distube/ytdl-core for stream resolution
 * and yt-search for text-based search (play-dl is unstable).
 *
 * Implements both StreamingProvider and MetadataProvider for alignment.
 */
export class YouTubeStreamingProvider implements StreamingProvider, MetadataProvider {
    readonly id = "youtube";
    readonly name = "YouTube";
    readonly version = "2.2.0";
    readonly description = "YouTube streaming & metadata via @distube/ytdl-core + yt-search + play-dl fallback";

    /** ytdl agent — created once, supports optional cookies */
    private agent: ytdl.Agent;

    /** Circuit breaker state */
    private consecutiveBotBlocks = 0;
    private circuitBreakerUntil = 0;

    constructor() {
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

    // ─── MetadataProvider Implementation ────────────────────────────────────────

    async searchRelease(query: string): Promise<MetadataResult[]> {
        return this.searchRecording(query);
    }

    async searchRecording(query: string): Promise<MetadataResult[]> {
        if (Date.now() < this.circuitBreakerUntil) {
            console.warn(`[YouTubeProvider] 🔌 Circuit breaker active, skipping search for: ${query}`);
            return [];
        }

        try {
            // Add jitter to metadata search
            await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
            
            console.log(`[YouTubeMetadata] 🔍 Searching via yt-search: ${query}`);
            const results = await ytSearch(query);
            const videos = results.videos.slice(0, 5);

            return videos.map((v: any) => ({
                id: v.videoId,
                title: v.title,
                artist: v.author?.name ?? "Unknown",
                date: v.timestamp ?? "",
                coverUrl: v.thumbnail,
                source: "youtube"
            }));
        } catch (error) {
            console.error(`[YouTubeMetadata] yt-search failed, falling back to play-dl:`, error);
            try {
                const results = await play.search(query, {
                    limit: 5,
                    source: { youtube: "video" }
                });

                return results.map(v => ({
                    id: v.id!,
                    title: v.title!,
                    artist: v.channel?.name ?? "Unknown",
                    date: v.uploadedAt ?? "",
                    coverUrl: v.thumbnails[0]?.url,
                    source: "youtube"
                }));
            } catch (pError) {
                console.error(`[YouTubeMetadata] All search methods failed:`, pError);
                return [];
            }
        }
    }

    async getCoverUrl(id: string): Promise<string | null> {
        try {
            const info = await ytdl.getBasicInfo(id, { agent: this.agent });
            return info.videoDetails.thumbnails[0]?.url ?? null;
        } catch {
            try {
                const info = await play.video_info(id.includes("http") ? id : `https://www.youtube.com/watch?v=${id}`);
                return info.video_details.thumbnails[0]?.url ?? null;
            } catch {
                return null;
            }
        }
    }

    // ─── StreamingProvider Implementation ───────────────────────────────────────

    async getStreamUrl(title: string, artist?: string, album?: string): Promise<string | null> {
        try {
            const query = artist ? `${artist} - ${title}` : title;
            console.log(`[YouTubeProvider] 🔍 Searching: ${query}`);

            const results = await ytSearch(query);
            if (results.videos.length === 0) {
                console.log(`[YouTubeProvider] ❌ No results for: ${query}`);
                return null;
            }

            const video = results.videos[0];
            console.log(`[YouTubeProvider] ✨ Found: ${video.title} → ${video.url}`);
            return this._resolveStreamUrl(video.videoId);
        } catch (error) {
            console.error(`[YouTubeProvider] ❌ getStreamUrl failed for "${title}", trying fallback search...`);
            try {
                const query = artist ? `${artist} - ${title}` : title;
                const results = await play.search(query, { limit: 1, source: { youtube: "video" } });
                if (results.length > 0) {
                    return this._resolveStreamUrl(results[0].id!);
                }
            } catch (fError) {
                console.error(`[YouTubeProvider] ❌ All search fallbacks failed for "${title}"`);
            }
            return null;
        }
    }

    canHandle(sourceId: string): boolean {
        return sourceId.includes("youtube.com") || sourceId.includes("youtu.be");
    }

    async getStreamById(id: string): Promise<string | null> {
        return this._resolveStreamUrl(id);
    }

    async search(query: string): Promise<StreamCandidate[]> {
        try {
            const results = await ytSearch(query);
            return results.videos.slice(0, 10).map((v: any) => ({
                id: v.videoId,
                title: v.title,
                artist: v.author?.name ?? "Unknown",
                provider: "youtube",
                thumbnail: v.thumbnail,
                duration: v.seconds,
                meta: { url: v.url }
            }));
        } catch (error) {
            console.error(`[YouTubeProvider] ❌ Search failed for: ${query}, falling back to play-dl`, error);
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
            } catch (pError) {
                console.error(`[YouTubeProvider] ❌ All search providers failed:`, pError);
                return [];
            }
        }
    }

    private async _resolveStreamUrl(urlOrId: string): Promise<string | null> {
        if (Date.now() < this.circuitBreakerUntil) {
            console.warn(`[YouTubeProvider] 🔌 Circuit breaker active, skipping resolution for: ${urlOrId}`);
            return null;
        }

        const clients: ("ANDROID" | "TV" | "IOS" | "WEB" | "WEB_EMBEDDED" | "ANDROID_MUSIC" | "MWEB")[] = 
            ["ANDROID", "TV", "IOS", "ANDROID_MUSIC", "MWEB", "WEB_EMBEDDED", "WEB"];
        
        let lastError: any = null;

        for (const client of clients) {
            try {
                console.log(`[YouTubeProvider] ⚡ Resolving ${urlOrId} via ${client} client...`);
                const info = await ytdl.getInfo(urlOrId, {
                    agent: this.agent,
                    playerClients: [client],
                    requestOptions: {
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                        }
                    }
                } as any);

                const format = chooseBestAudioFormat(info.formats);
                if (format?.url) {
                    console.log(`[YouTubeProvider] ✅ Success! Resolved via ${client}`);
                    this.consecutiveBotBlocks = 0; // Reset on success
                    return format.url;
                }
            } catch (error: any) {
                lastError = error;
                const isBot = error.message?.includes("bot") || error.message?.includes("Sign in");
                console.warn(`[YouTubeProvider] ⚠️ ${client} client failed: ${error.message}${isBot ? " (Bot Detection)" : ""}`);
                if (!isBot) break; 
            }
        }

        // Record bot block if all local clients failed with bot detection
        this.consecutiveBotBlocks++;
        if (this.consecutiveBotBlocks > 5) {
            this.circuitBreakerUntil = Date.now() + 15 * 60 * 1000; // 15 min cooldown
            console.error(`[YouTubeProvider] 🚨 5+ bot blocks detected. Circuit breaker triggered for 15 minutes.`);
        }

        // --- Invidious Fallback ---
        console.log(`[YouTubeProvider] 🔄 Local resolution failed. Attempting Invidious fallback for ${urlOrId}...`);
        const invidiousInstances = [
            "https://invidious.lunar.icu",
            "https://inv.vern.cc",
            "https://invidious.projectsegfau.lt",
            "https://yewtu.be",
            "https://iv.ggtyler.dev"
        ];

        const videoId = urlOrId.includes("v=") ? urlOrId.split("v=")[1].split("&")[0] : urlOrId;

        for (const instance of invidiousInstances) {
            try {
                const res = await fetch(`${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats`);
                if (res.ok) {
                    const data: any = await res.json();
                    const audioFormat = data.adaptiveFormats
                        .filter((f: any) => f.type.startsWith("audio/"))
                        .sort((a: any, b: any) => parseInt(b.bitrate) - parseInt(a.bitrate))[0];
                    
                    if (audioFormat?.url) {
                        console.log(`[YouTubeProvider] ✨ Success! Resolved via Invidious instance: ${instance}`);
                        return audioFormat.url;
                    }
                }
            } catch (e) {
                // Instance might be down, try next
            }
        }

        // Final fallback to play-dl
        try {
            console.log(`[YouTubeProvider] 🔄 Final attempt via play-dl fallback for ${urlOrId}...`);
            const info = await play.video_info(urlOrId.includes("http") ? urlOrId : `https://www.youtube.com/watch?v=${urlOrId}`);
            const format = info.format.find(f => (f.mimeType?.includes("audio") || f.audioQuality) && f.url);
            
            if (format?.url) {
                console.log(`[YouTubeProvider] ✨ Success! Resolved via play-dl fallback.`);
                return format.url;
            }
        } catch (pError: any) {
            console.error(`[YouTubeProvider] ❌ All resolution methods failed for ${urlOrId}`);
        }

        if (lastError) throw lastError;
        return null;
    }
}
