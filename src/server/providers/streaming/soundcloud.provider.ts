import fetch from "node-fetch";
import type { StreamingProvider, StreamCandidate } from "../../core/provider.js";

// ─── Config (from nuclear-plugin-soundcloud) ──────────────────────────────────
const SOUNDCLOUD_URL = "https://soundcloud.com";
const SOUNDCLOUD_API_V2 = "https://api-v2.soundcloud.com";
const CLIENT_ID_REGEX = /[{,]client_id:"(\w+)"/;
const SNDCDN_SCRIPT_URL_REGEX = /https?:\/\/[^\s"]*sndcdn\.com[^\s"]*\.js/g;
const ARTWORK_LARGE_SUFFIX = "-t500x500";
const SEARCH_LIMIT = 10;
const STREAM_SEARCH_LIMIT = 5;

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SoundcloudTranscoding {
    url: string;
    preset: string;
    duration: number;
    snipped: boolean;
    format: { protocol: "hls" | "progressive"; mime_type: string };
    quality: string;
}

interface SoundcloudTrack {
    id: number;
    title: string;
    permalink_url: string;
    full_duration: number;
    artwork_url: string | null;
    user: { username: string; permalink_url: string };
    media: { transcodings: SoundcloudTranscoding[] };
}

interface SoundcloudSearchResult {
    collection: SoundcloudTrack[];
}

interface SoundcloudStreamResponse {
    url: string;
}

// ─── Client ID (scraped from SoundCloud JS bundles) ───────────────────────────
let cachedClientId: string | null = null;

async function getClientId(forceRefresh = false): Promise<string> {
    if (cachedClientId && !forceRefresh) return cachedClientId;

    const homeRes = await fetch(SOUNDCLOUD_URL, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(15_000),
    });
    if (!homeRes.ok) throw new Error(`SoundCloud homepage fetch failed: ${homeRes.status}`);
    const html = await homeRes.text();

    const scriptUrls = [...html.matchAll(new RegExp(SNDCDN_SCRIPT_URL_REGEX.source, "g"))].map(m => m[0]);
    if (!scriptUrls.length) throw new Error("No sndcdn script URLs found on SoundCloud homepage");

    for (const scriptUrl of [...scriptUrls].reverse()) {
        try {
            const scriptRes = await fetch(scriptUrl, { signal: AbortSignal.timeout(10_000) });
            if (!scriptRes.ok) continue;
            const body = await scriptRes.text();
            const match = body.match(CLIENT_ID_REGEX);
            if (match?.[1]) {
                cachedClientId = match[1];
                console.log(`[SoundCloudProvider] 🔑 Extracted client_id`);
                return match[1];
            }
        } catch { /* try next */ }
    }
    throw new Error("Could not extract client_id from SoundCloud JS bundles");
}

export function clearSoundCloudClientId(): void {
    cachedClientId = null;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function apiRequest<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const clientId = await getClientId();
    const qs = new URLSearchParams({ ...params, client_id: clientId });
    const url = `${SOUNDCLOUD_API_V2}/${endpoint}?${qs}`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });

    if (res.status === 401 || res.status === 403) {
        // client_id expired — refresh and retry
        const freshId = await getClientId(true);
        const qs2 = new URLSearchParams({ ...params, client_id: freshId });
        const res2 = await fetch(`${SOUNDCLOUD_API_V2}/${endpoint}?${qs2}`, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res2.ok) throw new Error(`SoundCloud API error: ${res2.status} for ${endpoint}`);
        return res2.json() as Promise<T>;
    }
    if (!res.ok) throw new Error(`SoundCloud API error: ${res.status} for ${endpoint}`);
    return res.json() as Promise<T>;
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

// ─── Stream resolution: prefer progressive MP3, fallback to HLS ───────────────
interface ResolvedStream {
    url: string;
    protocol: "progressive" | "hls";
    mimeType: string;
}

function findProgressiveTranscoding(
    transcodings: SoundcloudTranscoding[]
): SoundcloudTranscoding | undefined {
    // Prefer progressive MP3 (direct URL, works with <audio>)
    return (
        transcodings.find(t => t.format.protocol === "progressive" && t.format.mime_type.includes("mpeg")) ??
        transcodings.find(t => t.format.protocol === "progressive")
    );
}

function findHlsTranscoding(
    transcodings: SoundcloudTranscoding[]
): SoundcloudTranscoding | undefined {
    // Prefer HLS AAC/MP4 for best quality
    return (
        transcodings.find(t => t.format.protocol === "hls" && t.format.mime_type.includes("mp4")) ??
        transcodings.find(t => t.format.protocol === "hls")
    );
}

async function resolveStream(track: SoundcloudTrack): Promise<ResolvedStream | null> {
    const transcodings = track.media?.transcodings ?? [];
    if (transcodings.length === 0) return null;

    // 1. Try progressive first (simpler, works with native <audio>)
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

    // 2. Fallback to HLS
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

function resolveArtworkUrl(track: SoundcloudTrack): string | undefined {
    if (!track.artwork_url) return undefined;
    return track.artwork_url.replace(/-large\./, `${ARTWORK_LARGE_SUFFIX}.`);
}

// ─── Provider ─────────────────────────────────────────────────────────────────
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
    readonly version = "1.0.0";
    readonly description = "SoundCloud streaming (progressive MP3 + HLS fallback, no API key needed)";

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

    /**
     * Searches SoundCloud for artist+title and returns the best stream URL.
     */
    async getStreamUrl(title: string, artist?: string, _album?: string): Promise<string | null> {
        try {
            const query = artist ? `${artist} ${title}` : title;
            console.log(`[SoundCloudProvider] 🔍 Searching: ${query}`);

            const result = await apiRequest<SoundcloudSearchResult>("search/tracks", {
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

    /**
     * Gets stream by SoundCloud track ID.
     */
    async getStreamById(id: string): Promise<string | null> {
        const trackId = Number(id);
        if (Number.isNaN(trackId)) {
            return null;
        }
        const track = await apiRequest<SoundcloudTrack>(`tracks/${trackId}`);
        const stream = await resolveStream(track);
        return stream?.url ?? null;
    }

    /**
     * Searches SoundCloud tracks and returns candidates.
     */
    async search(query: string): Promise<StreamCandidate[]> {
        try {
            const result = await apiRequest<SoundcloudSearchResult>("search/tracks", {
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
