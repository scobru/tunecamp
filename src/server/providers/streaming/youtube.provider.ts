import youtubedl from "youtube-dl-exec";
import ytSearch from "yt-search";
import play from "play-dl";
import fs from "fs";
import path from "path";
import type { StreamingProvider, StreamCandidate, MetadataProvider, MetadataResult } from "../../core/provider.js";

/**
 * YouTubeStreamingProvider — uses youtube-dl-exec (yt-dlp) for stream resolution
 * and yt-search for text-based search.
 *
 * Implements both StreamingProvider and MetadataProvider for alignment.
 */
export class YouTubeStreamingProvider implements StreamingProvider, MetadataProvider {
    readonly id = "youtube";
    readonly name = "YouTube";
    readonly version = "3.0.0";
    readonly description = "YouTube streaming & metadata via yt-dlp + yt-search";

    private cookiesPath?: string;
    private consecutiveBotBlocks = 0;
    private circuitBreakerUntil = 0;

    constructor(cookiesPath?: string) {
        this.reset(cookiesPath || process.env.YOUTUBE_COOKIES_PATH);
    }

    /**
     * Resets the provider state, clears circuit breaker, and optionally updates cookies path.
     */
    public reset(newPath?: string) {
        // Use an absolute path for the default cookies file to avoid CWD issues
        const defaultPath = path.join(process.cwd(), 'data', 'youtube_cookies.txt');
        const envPath = process.env.YOUTUBE_COOKIES_PATH;
        
        // Priority: explicit path > env var > default path
        let finalPath = newPath || envPath || defaultPath;
        
        if (finalPath && fs.existsSync(finalPath)) {
            this.cookiesPath = finalPath;
            console.log(`[YouTubeProvider] 🍪 Cookies path set to: ${this.cookiesPath}`);
        } else {
            this.cookiesPath = undefined;
            if (finalPath === defaultPath) {
                console.log(`[YouTubeProvider] 🍪 No cookies found at default path: ${defaultPath}`);
            } else if (finalPath) {
                console.warn(`[YouTubeProvider] 🍪 Configured cookies path not found: ${finalPath}`);
            } else {
                console.log(`[YouTubeProvider] 🍪 No cookies path configured.`);
            }
        }

        this.consecutiveBotBlocks = 0;
        this.circuitBreakerUntil = 0;
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
            const info = await play.video_info(id.includes("http") ? id : `https://www.youtube.com/watch?v=${id}`);
            return info.video_details.thumbnails[0]?.url ?? null;
        } catch {
            return null;
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
        let lastError: any = null;
        const targetUrl = urlOrId.includes("http") ? urlOrId : `https://www.youtube.com/watch?v=${urlOrId}`;

        // Attempt yt-dlp only if circuit breaker is NOT active
        if (Date.now() >= this.circuitBreakerUntil) {
            try {
                console.log(`[YouTubeProvider] ⚡ Resolving ${targetUrl} via yt-dlp...`);
                
                const options: any = {
                    getUrl: true,
                    format: 'ba/b',
                    noWarnings: true,
                    noCheckCertificate: true,
                    // Always use robust extractor args as a base
                    extractorArgs: 'youtube:player_client=android,web'
                };
                
                if (this.cookiesPath && fs.existsSync(this.cookiesPath)) {
                    options.cookies = this.cookiesPath;
                    console.log(`[YouTubeProvider] ⚡ Resolving via yt-dlp with cookies...`);
                } else {
                    console.log(`[YouTubeProvider] ⚡ Resolving via yt-dlp (no cookies)...`);
                }

                const url = await youtubedl(targetUrl, options);
                if (url && typeof url === 'string') {
                    console.log(`[YouTubeProvider] ✅ Success! Resolved via yt-dlp`);
                    this.consecutiveBotBlocks = 0; 
                    return url.trim();
                }
            } catch (error: any) {
                lastError = error;
                const errorMsg = error.message || "";
                const isBot = errorMsg.includes("Sign in") || 
                              errorMsg.includes("bot") || 
                              errorMsg.includes("429") || 
                              errorMsg.includes("Unusual traffic") ||
                              errorMsg.includes("challenge");

                console.warn(`[YouTubeProvider] ⚠️ yt-dlp failed: ${errorMsg.split('\n')[0]}${isBot ? " (Bot Detection/Rate Limit)" : ""}`);
                
                if (isBot) {
                    this.consecutiveBotBlocks++;
                    if (this.consecutiveBotBlocks > 5) {
                        this.circuitBreakerUntil = Date.now() + 15 * 60 * 1000; // 15 min cooldown
                        console.error(`[YouTubeProvider] 🚨 5+ bot blocks detected. Circuit breaker triggered for 15 minutes. Fallbacks will still be attempted.`);
                    }
                }
            }
        } else {
            console.warn(`[YouTubeProvider] 🔌 yt-dlp circuit breaker active, skipping to fallbacks for: ${urlOrId}`);
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
            const info = await play.video_info(targetUrl);
            const format = info.format.find(f => (f.mimeType?.includes("audio") || f.audioQuality) && f.url);
            
            if (format?.url) {
                console.log(`[YouTubeProvider] ✨ Success! Resolved via play-dl fallback.`);
                return format.url;
            }
        } catch (pError: any) {
            console.error(`[YouTubeProvider] ❌ All resolution methods failed for ${urlOrId}`);
        }

        if (lastError) {
            const isBot = lastError.message?.includes("Sign in") || lastError.message?.includes("bot") || lastError.message?.includes("429");
            // If it's a bot block, don't throw, let it return null so caller can try next provider
            if (isBot) {
                console.warn(`[YouTubeProvider] 🛑 Final resolution failed due to bot detection. Returning null.`);
                return null;
            }
            throw lastError;
        }
        return null;
    }
}

