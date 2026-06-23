
// ─── Config (from nuclear-plugin-soundcloud) ──────────────────────────────────
const SOUNDCLOUD_URL = "https://soundcloud.com";
const SOUNDCLOUD_API_V2 = "https://api-v2.soundcloud.com";
const CLIENT_ID_REGEX = /[{,]client_id:"(\w+)"/;
const SNDCDN_SCRIPT_URL_REGEX = /https?:\/\/[^\s"]*sndcdn\.com[^\s"]*\.js/g;
const ARTWORK_LARGE_SUFFIX = "-t500x500";
export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SoundcloudTranscoding {
    url: string;
    preset: string;
    duration: number;
    snipped: boolean;
    format: { protocol: "hls" | "progressive"; mime_type: string };
    quality: string;
}

export interface SoundcloudTrack {
    id: number;
    title: string;
    description?: string;
    genre?: string;
    permalink_url: string;
    full_duration: number;
    artwork_url: string | null;
    user: { username: string; permalink_url: string; avatar_url: string };
    media: { transcodings: SoundcloudTranscoding[] };
    created_at: string;
}

export interface SoundcloudUser {
    id: number;
    username: string;
    description?: string;
    avatar_url: string;
    permalink_url: string;
    track_count: number;
}

export interface SoundcloudSearchResult {
    collection: SoundcloudTrack[];
}

export interface SoundcloudUserSearchResult {
    collection: SoundcloudUser[];
}

export interface SoundcloudStreamResponse {
    url: string;
}

// ─── Client ID (scraped from SoundCloud JS bundles) ───────────────────────────
let cachedClientId: string | null = null;

export async function getClientId(forceRefresh = false): Promise<string> {
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
export async function scApiRequest<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
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

export function resolveArtworkUrl(track: SoundcloudTrack | any): string | undefined {
    const url = track.artwork_url || track.avatar_url;
    if (!url) return undefined;
    return url.replace(/-large\./, `${ARTWORK_LARGE_SUFFIX}.`);
}
