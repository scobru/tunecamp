import type { StreamingProvider, StreamCandidate } from "../../core/provider.js";
import { 
    scApiRequest, 
    resolveArtworkUrl, 
    getClientId, 
    clearSoundCloudClientId, 
    SoundcloudTrack, 
    SoundcloudSearchResult, 
    SoundcloudStreamResponse, 
    SoundcloudTranscoding,
    USER_AGENT
} from "../../utils/soundcloud.js";

const STREAM_SEARCH_LIMIT = 5;
const SEARCH_LIMIT = 10;

// ─── Stream resolution: prefer progressive MP3, fallback to HLS ───────────────
interface ResolvedStream {
    url: string;
    protocol: "progressive" | "hls";
    mimeType: string;
}

async function resolveTranscodingUrl(transcodingUrl: string): Promise<string> {
    const clientId = await getClientId();
    const parsed = new URL(transcodingUrl);
    parsed.searchParams.set("client_id", clientId);

    const res = await fetch(parsed.toString(), {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) {
        const freshId = await getClientId(true);
        parsed.searchParams.set("client_id", freshId);
        const res2 = await fetch(parsed.toString(), { signal: AbortSignal.timeout(10_000) });
        if (!res2.ok) throw new Error(`Stream URL resolve failed: ${res2.status}`);
        const data = (await res2.json()) as SoundcloudStreamResponse;
        return data.url;
    }
    if (!res.ok) throw new Error(`Stream URL resolve failed: ${res.status}`);
    const data = (await res.json()) as SoundcloudStreamResponse;
    return data.url;
}

function findProgressiveTranscoding(
    transcodings: SoundcloudTranscoding[]
): SoundcloudTranscoding | undefined {
    return (
        transcodings.find(t => t.format.protocol === "progressive" && t.format.mime_type.includes("mpeg")) ??
        transcodings.find(t => t.format.protocol === "progressive")
    );
}

function findHlsTranscoding(
    transcodings: SoundcloudTranscoding[]
): SoundcloudTranscoding | undefined {
    return (
        transcodings.find(t => t.format.protocol === "hls" && t.format.mime_type.includes("mp4")) ??
        transcodings.find(t => t.format.protocol === "hls")
    );
}

async function resolveStream(track: SoundcloudTrack): Promise<ResolvedStream | null> {
    const transcodings = track.media?.transcodings ?? [];
    if (transcodings.length === 0) return null;

    const progressive = findProgressiveTranscoding(transcodings);
    if (progressive) {
        try {
            const url = await resolveTranscodingUrl(progressive.url);
            console.log(`[SoundCloudProvider] ✅ Progressive stream for "${track.title}"`);
            return { url, protocol: "progressive", mimeType: progressive.format.mime_type };
        } catch (err) {
            console.warn(`[SoundCloudProvider] ⚠️ Progressive failed, trying HLS:`, err);
        }
    }

    const hls = findHlsTranscoding(transcodings);
    if (hls) {
        try {
            const url = await resolveTranscodingUrl(hls.url);
            console.log(`[SoundCloudProvider] ✅ HLS stream for "${track.title}"`);
            return { url, protocol: "hls", mimeType: hls.format.mime_type };
        } catch (err) {
            console.warn(`[SoundCloudProvider] ❌ HLS also failed:`, err);
        }
    }

    return null;
}

/**
 * SoundCloudStreamingProvider — scrapes client_id from SoundCloud JS bundles
 * (no API key required), then uses SoundCloud API v2 for search and streaming.
 *
 * Stream preference: progressive MP3 (direct) → HLS (m3u8 fallback)
 * Based on nuclear-plugin-soundcloud implementation patterns.
 */
export class SoundCloudStreamingProvider implements StreamingProvider {
    readonly id = "soundcloud";
    readonly name = "SoundCloud";
    readonly version = "1.1.0";
    readonly description = "SoundCloud streaming (progressive MP3 + HLS fallback, no API key needed). Disabled by default: bypasses the official player, against SoundCloud ToS.";

    async isAvailable(): Promise<boolean> {
        try {
            await getClientId();
            return true;
        } catch {
            return false;
        }
    }

    async onDisable(): Promise<void> {
        clearSoundCloudClientId();
    }

    async getStreamUrl(title: string, artist?: string, _album?: string): Promise<string | null> {
        try {
            const query = artist ? `${artist} ${title}` : title;
            console.log(`[SoundCloudProvider] 🔍 Searching: ${query}`);

            const result = await scApiRequest<SoundcloudSearchResult>("search/tracks", {
                q: query,
                limit: String(STREAM_SEARCH_LIMIT),
            });

            if (result.collection.length === 0) {
                console.log(`[SoundCloudProvider] ❌ No results for: ${query}`);
                return null;
            }

            for (const track of result.collection) {
                const stream = await resolveStream(track);
                if (stream) return stream.url;
            }
            return null;
        } catch (error) {
            console.error(`[SoundCloudProvider] ❌ getStreamUrl error for "${title}":`, error);
            return null;
        }
    }

    canHandle(sourceId: string): boolean {
        return sourceId.includes("soundcloud.com") || sourceId.includes("sndcdn.com");
    }

    async getStreamById(id: string): Promise<string | null> {
        const trackId = Number(id);
        if (Number.isNaN(trackId)) {
            return null;
        }
        try {
            const track = await scApiRequest<SoundcloudTrack>(`tracks/${trackId}`);
            const stream = await resolveStream(track);
            return stream?.url ?? null;
        } catch (e) {
            console.error(`[SoundCloudProvider] ❌ getStreamById failed for ${id}:`, e);
            return null;
        }
    }

    async search(query: string): Promise<StreamCandidate[]> {
        try {
            const result = await scApiRequest<SoundcloudSearchResult>("search/tracks", {
                q: query,
                limit: String(SEARCH_LIMIT),
            });

            return result.collection.map(track => ({
                id: String(track.id),
                title: track.title,
                artist: track.user?.username ?? "Unknown",
                provider: "soundcloud",
                thumbnail: resolveArtworkUrl(track),
                duration: Math.floor(track.full_duration / 1000),
                meta: { url: track.permalink_url }
            }));
        } catch (error) {
            console.error(`[SoundCloudProvider] ❌ Search failed for: ${query}`, error);
            return [];
        }
    }
}
