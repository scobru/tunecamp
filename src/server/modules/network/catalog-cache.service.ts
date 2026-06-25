import type { Database as DatabaseType } from "better-sqlite3";
import { isSafeUrl } from "../../../utils/networkUtils.js";

/**
 * CatalogCacheService — SQLite-backed cache for remote peer catalogs.
 *
 * Strategy: stale-while-revalidate.
 * - Fresh entry (< TTL): served directly, no network.
 * - Stale entry: served immediately, refreshed in the background.
 * - Missing entry: fetched live (first discovery of a peer).
 * - Offline peer: last known catalog keeps being served until HARD_EXPIRY.
 *
 * This keeps the Network page fast and resilient: a peer going offline
 * no longer makes its tracks vanish from the UI.
 */

const TTL_MS = 60 * 60 * 1000;                 // 1h: entry considered fresh
const PEER_TTL_MS = 2 * 60 * 1000;             // 2m: catalogs carrying ephemeral peer tracks revalidate fast so disconnected peers drop quickly
const HARD_EXPIRY_MS = 48 * 60 * 60 * 1000;     // 48h: drop entries not refreshed since (a peer offline >2d stops showing)
const FETCH_TIMEOUT = 5000;                     // 5s per instance

interface PeerSite {
    url: string;
    name?: string;
}

/** Drains a fetch Response body to avoid memory leaks in Node's fetch. */
async function drainBody(response: Response): Promise<void> {
    try {
        if (response.body && typeof (response.body as any).cancel === 'function') {
            await (response.body as any).cancel();
        } else {
            await response.text();
        }
    } catch { /* ignore */ }
}

export interface CatalogCacheService {
    /** Returns tracks for all sites, serving cache and revalidating stale entries in background. */
    getTracks(sites: PeerSite[]): Promise<any[]>;
    /** Drops expired entries. Called automatically on creation. */
    prune(): void;
    /**
     * Forces the next getTracks() to refetch a peer live by dropping its cached
     * entry. Pass a site URL to invalidate one peer, or omit to clear all peers.
     * Returns the number of entries removed. Use this when a peer's catalog is
     * known to have changed (e.g. a release was deleted upstream) so the change
     * shows up immediately instead of after the TTL window.
     */
    invalidate(siteUrl?: string): number;
}

export function createCatalogCacheService(db: DatabaseType): CatalogCacheService {
    db.exec(`
        CREATE TABLE IF NOT EXISTS peer_catalog_cache (
            site_url TEXT PRIMARY KEY,
            tracks_json TEXT NOT NULL,
            fetched_at INTEGER NOT NULL
        );
    `);
    // Migration: track whether a cached catalog carries ephemeral peer tracks,
    // so those entries can use a much shorter freshness window.
    try {
        db.exec("ALTER TABLE peer_catalog_cache ADD COLUMN has_peer INTEGER NOT NULL DEFAULT 0");
    } catch { /* column already exists */ }

    const selectStmt = db.prepare("SELECT tracks_json, fetched_at, has_peer FROM peer_catalog_cache WHERE site_url = ?");
    const upsertStmt = db.prepare(`
        INSERT INTO peer_catalog_cache (site_url, tracks_json, fetched_at, has_peer)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(site_url) DO UPDATE SET tracks_json = excluded.tracks_json, fetched_at = excluded.fetched_at, has_peer = excluded.has_peer
    `);
    const pruneStmt = db.prepare("DELETE FROM peer_catalog_cache WHERE fetched_at < ?");
    const deleteStmt = db.prepare("DELETE FROM peer_catalog_cache WHERE site_url = ?");
    const deleteAllStmt = db.prepare("DELETE FROM peer_catalog_cache");

    // Dedup concurrent refreshes for the same peer
    const inFlight = new Map<string, Promise<any[] | null>>();

    const prune = () => {
        try {
            pruneStmt.run(Date.now() - HARD_EXPIRY_MS);
        } catch (e) {
            console.error("❌ [CatalogCache] Prune failed:", e);
        }
    };

    /**
     * Fetches and normalizes a single peer's catalog.
     * Returns null on failure so the caller can keep serving stale data.
     */
    const fetchCatalog = async (site: PeerSite): Promise<any[] | null> => {
        const siteUrl = site.url.replace(/\/$/, "");

        const existing = inFlight.get(siteUrl);
        if (existing) return existing;

        const promise = (async (): Promise<any[] | null> => {
            let timeoutId: NodeJS.Timeout | undefined;
            try {
                // SSRF protection
                if (!(await isSafeUrl(siteUrl))) return null;

                const controller = new AbortController();
                timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
                const headers = {
                    'Accept': 'application/json',
                    'User-Agent': 'TuneCamp-Federation/2.0'
                };

                // Prefer the complete federation catalog; fall back to the legacy
                // /api/catalog overview for peers running older versions that don't
                // expose /full (the overview is truncated, but better than nothing).
                let response = await fetch(`${siteUrl}/api/catalog/full`, {
                    signal: controller.signal,
                    headers
                });
                if (response.status === 404) {
                    await drainBody(response);
                    response = await fetch(`${siteUrl}/api/catalog`, {
                        signal: controller.signal,
                        headers
                    });
                }

                if (!response.ok) {
                    await drainBody(response);
                    return null;
                }

                const catalog: any = await response.json();
                const tracks = parseCatalog(catalog, siteUrl, site.name);

                const hasPeer = tracks.some((t) => t.type === "peer") ? 1 : 0;
                upsertStmt.run(siteUrl, JSON.stringify(tracks), Date.now(), hasPeer);
                return tracks;
            } catch (error) {
                // Instance offline or unreachable — keep serving cache
                return null;
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
                inFlight.delete(siteUrl);
            }
        })();

        inFlight.set(siteUrl, promise);
        return promise;
    };

    const getTracks = async (sites: PeerSite[]): Promise<any[]> => {
        const now = Date.now();
        const results: any[] = [];
        const liveFetches: Promise<any[] | null>[] = [];

        for (const site of sites) {
            if (!site.url) continue;
            const siteUrl = site.url.replace(/\/$/, "");

            let cached: { tracks_json: string; fetched_at: number; has_peer?: number } | undefined;
            try {
                cached = selectStmt.get(siteUrl) as any;
            } catch (e) {
                console.error("❌ [CatalogCache] Read failed:", e);
            }

            if (cached) {
                // Past the hard expiry the peer has been unrefreshed (offline)
                // too long — stop serving its tracks and drop the entry, instead
                // of waiting for the next restart-time prune().
                if (now - cached.fetched_at > HARD_EXPIRY_MS) {
                    try { deleteStmt.run(siteUrl); } catch { /* best effort */ }
                    void fetchCatalog(site); // give it one more chance to come back
                    continue;
                }

                try {
                    results.push(...JSON.parse(cached.tracks_json));
                } catch { /* corrupted entry, refetch below */ }

                // Catalogs carrying ephemeral peer tracks go stale much sooner,
                // so a disconnected peer is dropped within minutes, not an hour.
                const ttl = cached.has_peer ? PEER_TTL_MS : TTL_MS;
                if (now - cached.fetched_at > ttl) {
                    // Stale: serve cached data now, revalidate in background
                    void fetchCatalog(site);
                }
            } else {
                // First sight of this peer: fetch live
                liveFetches.push(fetchCatalog(site));
            }
        }

        if (liveFetches.length > 0) {
            const settled = await Promise.allSettled(liveFetches);
            for (const result of settled) {
                if (result.status === 'fulfilled' && result.value) {
                    results.push(...result.value);
                }
            }
        }

        return results;
    };

    const invalidate = (siteUrl?: string): number => {
        try {
            if (siteUrl) {
                const normalized = siteUrl.replace(/\/$/, "");
                inFlight.delete(normalized);
                return deleteStmt.run(normalized).changes;
            }
            inFlight.clear();
            return deleteAllStmt.run().changes;
        } catch (e) {
            console.error("❌ [CatalogCache] Invalidate failed:", e);
            return 0;
        }
    };

    prune();

    return { getTracks, prune, invalidate };
}

/**
 * Normalizes a remote /api/catalog payload into the flat NetworkTrack shape
 * used by the Network page.
 */
function parseCatalog(catalog: any, siteUrl: string, siteName?: string): any[] {
    const tracks: any[] = [];

    if (catalog.releases && Array.isArray(catalog.releases)) {
        for (const release of catalog.releases) {
            if (!release.tracks || !Array.isArray(release.tracks)) continue;

            for (const track of release.tracks) {
                tracks.push({
                    slug: `${siteUrl}::${track.id || track.title}`,
                    title: track.title || "Untitled",
                    artistName: track.artistName || track.artist || release.artist_name || siteName || "Unknown Artist",
                    releaseTitle: release.title || "Unknown Release",
                    coverUrl: track.coverUrl || (release.cover_path ? `${siteUrl}/api/albums/${release.slug || release.id}/cover` : null),
                    audioUrl: track.streamUrl || (track.id ? `${siteUrl}/api/tracks/${track.id}/stream` : null),
                    duration: track.duration || 0,
                    siteUrl: siteUrl,
                    federation: "http",
                    type: "release"
                });
            }
        }
    }

    // Ephemeral peer-shared tracks advertised by the remote instance (only
    // present when that instance has opted into peer federation). They stream
    // through a dedicated public endpoint and disappear when the peer goes
    // offline (subject to this cache's TTL).
    if (catalog.peerTracks && Array.isArray(catalog.peerTracks)) {
        for (const track of catalog.peerTracks) {
            if (!track.sessionId || !track.id) continue;
            tracks.push({
                slug: `${siteUrl}::peer::${track.sessionId}::${track.id}`,
                title: track.title || "Untitled",
                artistName: track.artist || siteName || "Unknown Artist",
                releaseTitle: track.album || "Peer Share",
                coverUrl: null,
                audioUrl: `${siteUrl}/api/peers/${track.sessionId}/tracks/${track.id}/federated-stream`,
                downloadUrl: track.allowDownload
                    ? `${siteUrl}/api/peers/${track.sessionId}/tracks/${track.id}/federated-download`
                    : null,
                duration: track.duration || 0,
                siteUrl: siteUrl,
                federation: "http",
                type: "peer"
            });
        }
    }

    // If no releases structure, try the flat tracks array
    if (tracks.length === 0 && catalog.tracks && Array.isArray(catalog.tracks)) {
        for (const track of catalog.tracks) {
            tracks.push({
                slug: `${siteUrl}::${track.id || track.title}`,
                title: track.title || "Untitled",
                artistName: track.artistName || track.artist || siteName || "Unknown Artist",
                releaseTitle: track.album || "Unknown Release",
                coverUrl: track.coverUrl || null,
                audioUrl: track.streamUrl || (track.id ? `${siteUrl}/api/tracks/${track.id}/stream` : null),
                duration: track.duration || 0,
                siteUrl: siteUrl,
                federation: "http",
                type: "release"
            });
        }
    }

    return tracks;
}
