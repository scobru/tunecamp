import type { DatabaseService } from "../../core/database.js";
import { isSafeUrl } from "../../../utils/networkUtils.js";
import {
    searchBandcamp,
    extractBandcampMetadata,
    getTralbumCollectors,
    getFanCollection,
    BANDCAMP_IMAGE_BASE,
    type BandcampCollectedItem,
    type BandcampMetadata,
    type TralbumType
} from "../../utils/bandcamp.js";

/**
 * Dig Engine — Badger-inspired external crate-digging.
 *
 * The core move: from a seed Bandcamp release, find the fans who *own* it, read what else
 * they collect, and rank the releases that recur across those collections. Real collectors'
 * taste becomes the discovery signal. This is scouting only — nothing is imported into the
 * local catalog; results are previewed and saved to a per-user "crate".
 *
 * The collector graph exists only on Bandcamp (via undocumented internal endpoints), so this
 * is Bandcamp-only. Fan collections are cached in SQLite (`dig_cache`) and fetched with a
 * bounded concurrency pool to avoid hammering Bandcamp and getting the server IP banned.
 */

export type DigStrategy = "fast" | "balanced" | "deep";

interface StrategyConfig {
    /** How many collectors of the seed release to sample. */
    collectors: number;
    /** How deep to read each collector's collection (item count). */
    depth: number;
}

const STRATEGIES: Record<DigStrategy, StrategyConfig> = {
    fast: { collectors: 15, depth: 40 },
    balanced: { collectors: 50, depth: 80 },
    deep: { collectors: 150, depth: 200 }
};

/** Max parallel fan-collection fetches. Keep low to be polite to Bandcamp. */
const FETCH_CONCURRENCY = 5;
/** Cached fan collections live this long (seconds). */
const CACHE_TTL_SECONDS = 24 * 60 * 60;

export interface DigSearchResult {
    id: string;
    title: string;
    artist: string;
    url: string;
    coverUrl: string;
    source: string;
}

export interface RankedRelease {
    tralbumId: number;
    title: string;
    artist: string;
    url: string;
    coverUrl: string;
    previewUrl: string | null;
    /** How many of the sampled collectors own this release (the dig score). */
    score: number;
    /** Bandcamp's global "collected by N" count, a secondary popularity signal. */
    alsoCollectedCount: number;
}

export interface DigResult {
    seed: { title: string; artist: string; url: string; coverUrl: string };
    strategy: DigStrategy;
    collectorsSampled: number;
    results: RankedRelease[];
}

/**
 * A release co-starred by users alongside the seed. `externalId` identifies it when the release
 * is matched to an external source (Bandcamp, MusicBrainz, ...); it's null for a release that
 * only exists on TuneCamp, which is still included — see `networkKey()`.
 */
export interface NetworkCoStarItem {
    externalId: string | null;
    title: string;
    artist: string;
    coverUrl: string | null;
    /** How many distinct users (on one instance) starred both the seed and this item. */
    score: number;
}

export interface NetworkRankedItem extends NetworkCoStarItem {
    /** How many instances (this one plus peers) contributed to this item's score. */
    peers: number;
}

/** What a network-dig seed is identified by — either party may be missing external_id. */
export interface NetworkSeedIdentity {
    externalId: string | null;
    title: string;
    artist: string;
}

export interface NetworkDigResult {
    seed: { title: string; artist: string; url: string; coverUrl: string };
    source: "network";
    instancesQueried: number;
    results: NetworkRankedItem[];
}

/** Injected so DigService doesn't need to depend on the federation/config modules directly. */
export interface DigNetworkDeps {
    getPeers?: () => string[];
    getPublicUrl?: () => string | undefined;
}

/** Co-starred items with fewer than this many distinct starrers are dropped — a cheap floor
 *  against deanonymizing a single user's star from a small instance's aggregate response. */
const MIN_CO_STARRERS = 2;
/** Max parallel peer-instance queries for a network dig. */
const PEER_FETCH_CONCURRENCY = 5;
const PEER_FETCH_TIMEOUT_MS = 5000;

/** Strips accents/punctuation and lowercases, so "Café​, Vol. 2" and "cafe vol 2" match. */
function normalizeForMatch(s: string): string {
    return s
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

/**
 * A release's cross-instance identity for network dig: its external_id when it has one
 * (exact — matched to Bandcamp/MusicBrainz/etc via metadata match), otherwise a normalized
 * title+artist key (fuzzy — the only option for a release that's TuneCamp-only). Prefixed so
 * the two kinds can never collide.
 */
function networkKey(externalId: string | null | undefined, title: string, artist: string): string {
    if (externalId) return `ext:${externalId}`;
    return `fuzzy:${normalizeForMatch(title)}|${normalizeForMatch(artist)}`;
}

export interface DigSession {
    id: number;
    user_id: number;
    name: string;
    created_at: string;
    updated_at: string;
}

export interface DigCrateItem {
    id: number;
    session_id: number;
    source: string;
    source_url: string;
    title: string | null;
    artist: string | null;
    cover_url: string | null;
    preview_url: string | null;
    bpm: number | null;
    added_at: string;
}

/** Run an async mapper over items with a bounded number of concurrent workers. */
async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await worker(items[index]);
        }
    });
    await Promise.all(runners);
    return results;
}

export class DigService {
    constructor(private database: DatabaseService, private network: DigNetworkDeps = {}) {}

    /**
     * Resolves a Bandcamp seed URL, retrying transient failures. Bandcamp (or a jammed event
     * loop) can make a request time out transiently, so retry a couple of times with backoff
     * before giving up — and report timeouts honestly rather than as "bad URL".
     */
    private async resolveSeedMeta(releaseUrl: string): Promise<BandcampMetadata & { tralbumId: number; tralbumType: TralbumType }> {
        let meta = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            meta = await extractBandcampMetadata(releaseUrl);
            if (meta && meta.tralbumId && meta.tralbumType) break;
            if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
        if (!meta || !meta.tralbumId || !meta.tralbumType) {
            throw new Error(
                "Could not read this Bandcamp release — it may be temporarily unreachable, or the URL is not a public track/album page. Please try again."
            );
        }
        return meta as BandcampMetadata & { tralbumId: number; tralbumType: TralbumType };
    }

    // --- Search ---

    async searchSource(query: string, source: string = "bandcamp"): Promise<DigSearchResult[]> {
        if (source !== "bandcamp") return [];
        const results = await searchBandcamp(query, "a", 12);
        return results.map(r => ({
            id: r.url,
            title: r.name,
            artist: r.band_name || "Unknown",
            url: r.url,
            coverUrl: r.art_id
                ? `${BANDCAMP_IMAGE_BASE}/a${String(r.art_id).padStart(10, "0")}_2.jpg`
                : (r.img || ""),
            source: "bandcamp"
        }));
    }

    // --- The dig ---

    async dig(releaseUrl: string, strategy: DigStrategy = "balanced"): Promise<DigResult> {
        const config = STRATEGIES[strategy] || STRATEGIES.balanced;
        const meta = await this.resolveSeedMeta(releaseUrl);
        const seed = { title: meta.title, artist: meta.artist, url: releaseUrl, coverUrl: meta.cover };

        const collectors = await getTralbumCollectors(meta.tralbumType, meta.tralbumId, config.collectors);

        // Fetch each collector's collection (cached, bounded concurrency).
        const collections = await mapWithConcurrency(collectors, FETCH_CONCURRENCY, c =>
            this.getCachedFanCollection(c.fanId, config.depth)
        );

        // Cross-reference: count how many collectors own each release, excluding the seed.
        const tally = new Map<number, RankedRelease>();
        for (const collection of collections) {
            // De-dupe within a single collection so one fan counts at most once per release.
            const seenInThisFan = new Set<number>();
            for (const item of collection) {
                if (item.tralbumId === meta.tralbumId) continue;
                if (seenInThisFan.has(item.tralbumId)) continue;
                seenInThisFan.add(item.tralbumId);

                const existing = tally.get(item.tralbumId);
                if (existing) {
                    existing.score += 1;
                } else {
                    tally.set(item.tralbumId, {
                        tralbumId: item.tralbumId,
                        title: item.title,
                        artist: item.artist,
                        url: item.url,
                        coverUrl: item.coverUrl,
                        previewUrl: item.previewUrl,
                        score: 1,
                        alsoCollectedCount: item.alsoCollectedCount
                    });
                }
            }
        }

        const results = Array.from(tally.values())
            .sort((a, b) => b.score - a.score || b.alsoCollectedCount - a.alsoCollectedCount)
            .slice(0, 100);

        return {
            seed,
            strategy,
            collectorsSampled: collectors.length,
            results
        };
    }

    // --- Network dig (collector-graph over this instance's/peers' own users, not Bandcamp) ---

    /**
     * Every local album/track's cross-instance identity (see `networkKey()`), so a TuneCamp-only
     * release (no external_id) can still be matched by title+artist. When `publicOnly` is set —
     * used whenever this data is about to leave the instance, i.e. answering a peer's dig-lookup —
     * private/draft/unreleased catalog items are excluded so their metadata never leaks out.
     */
    private loadCatalogIdentities(publicOnly: boolean): Array<{ type: "album" | "track"; id: number; key: string; title: string; artist: string; slug: string | null; cover: string | null }> {
        const db = this.database.db;
        const releaseFilter = publicOnly ? "AND a.is_release = 1 AND a.status = 'released' AND a.visibility = 'public'" : "";

        const albums = db.prepare(`
            SELECT a.id AS id, a.title AS title, COALESCE(ar.name, a.album_artist) AS artist,
                   a.external_id AS external_id, a.slug AS slug, a.cover_path AS cover
            FROM albums a LEFT JOIN artists ar ON ar.id = a.artist_id
            WHERE 1=1 ${releaseFilter}
        `).all() as { id: number; title: string; artist: string | null; external_id: string | null; slug: string | null; cover: string | null }[];

        const tracks = db.prepare(`
            SELECT t.id AS id, t.title AS title, COALESCE(t.artist_name, ar.name) AS artist,
                   t.external_id AS external_id, a.slug AS slug, a.cover_path AS cover
            FROM tracks t
            LEFT JOIN albums a ON a.id = t.album_id
            LEFT JOIN artists ar ON ar.id = t.artist_id
            WHERE 1=1 ${releaseFilter}
        `).all() as { id: number; title: string; artist: string | null; external_id: string | null; slug: string | null; cover: string | null }[];

        return [
            ...albums.map(r => ({ type: "album" as const, id: r.id, key: networkKey(r.external_id, r.title, r.artist || ""), title: r.title, artist: r.artist || "Unknown", slug: r.slug, cover: r.cover })),
            ...tracks.map(r => ({ type: "track" as const, id: r.id, key: networkKey(r.external_id, r.title, r.artist || ""), title: r.title, artist: r.artist || "Unknown", slug: r.slug, cover: r.cover }))
        ];
    }

    /**
     * Local-only half of a network dig: which locally-starred releases co-occur with the seed
     * in this instance's own users' stars. Called both for this instance's own contribution to
     * `digNetwork()` and, remotely, by peer instances via POST /api/community/dig-lookup (with
     * `publicOnly: true`) — so it never returns usernames or private catalog data, and drops
     * anything under MIN_CO_STARRERS.
     */
    aggregateNetworkCoStars(seed: NetworkSeedIdentity, limit: number = 50, opts: { publicOnly?: boolean } = {}): NetworkCoStarItem[] {
        const seedKey = networkKey(seed.externalId, seed.title, seed.artist);
        const catalog = this.loadCatalogIdentities(!!opts.publicOnly);
        const byTypeId = new Map<string, typeof catalog[number]>();
        for (const item of catalog) byTypeId.set(`${item.type}:${item.id}`, item);

        const seedRefs = catalog.filter(item => item.key === seedKey);
        if (seedRefs.length === 0) return [];

        const seedWhere = seedRefs.map(() => "(item_type = ? AND item_id = ?)").join(" OR ");
        const seedParams = seedRefs.flatMap(r => [r.type, String(r.id)]);
        const db = this.database.db;
        const starrers = db.prepare(`SELECT DISTINCT username FROM starred_items WHERE ${seedWhere}`).all(...seedParams) as { username: string }[];
        if (starrers.length === 0) return [];

        const usernames = starrers.map(s => s.username);
        const placeholders = usernames.map(() => "?").join(",");
        const rows = db.prepare(`
            SELECT username, item_type, item_id FROM starred_items
            WHERE username IN (${placeholders}) AND item_type IN ('album', 'track')
        `).all(...usernames) as { username: string; item_type: string; item_id: string }[];

        const tally = new Map<string, NetworkCoStarItem>();
        const seenByUser = new Map<string, Set<string>>();
        for (const row of rows) {
            const item = byTypeId.get(`${row.item_type}:${row.item_id}`);
            if (!item || item.key === seedKey) continue; // unresolved item, or the seed itself

            const seen = seenByUser.get(row.username) ?? new Set<string>();
            if (seen.has(item.key)) continue; // one user counts once per release
            seen.add(item.key);
            seenByUser.set(row.username, seen);

            const existing = tally.get(item.key);
            if (existing) {
                existing.score += 1;
            } else {
                const base = this.network.getPublicUrl?.()?.replace(/\/$/, "");
                tally.set(item.key, {
                    externalId: item.key.startsWith("ext:") ? item.key.slice(4) : null,
                    title: item.title,
                    artist: item.artist,
                    coverUrl: item.slug && item.cover && base ? `${base}/api/albums/${item.slug}/cover` : null,
                    score: 1
                });
            }
        }

        return Array.from(tally.values())
            .filter(item => item.score >= MIN_CO_STARRERS)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /** POSTs a peer's public dig-lookup endpoint; any failure (offline, opted out, timeout) yields no results. */
    private async queryPeerNetwork(peerOrigin: string, seed: NetworkSeedIdentity): Promise<NetworkCoStarItem[]> {
        if (!(await isSafeUrl(peerOrigin))) return [];
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PEER_FETCH_TIMEOUT_MS);
        try {
            const res = await fetch(`${peerOrigin}/api/community/dig-lookup`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(seed),
                signal: controller.signal
            });
            if (!res.ok) return [];
            const data = await res.json() as { results?: NetworkCoStarItem[] };
            return Array.isArray(data?.results) ? data.results : [];
        } catch {
            return [];
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Network dig: like `dig()`, but the collector graph is this TuneCamp network's own users
     * (who starred the seed, and what else they starred) instead of Bandcamp's fan collections.
     * The seed is one of *your own* library releases (not a Bandcamp URL — a TuneCamp-only
     * release has no Bandcamp counterpart to seed from) — pass its local album or track id.
     * Combines this instance's own aggregate with the same query run on every known peer.
     */
    async digNetwork(seedRef: { albumId?: number; trackId?: number }): Promise<NetworkDigResult> {
        const db = this.database.db;
        let row: { title: string; artist: string | null; external_id: string | null; slug: string | null; cover: string | null } | undefined;
        if (seedRef.albumId) {
            row = db.prepare(`
                SELECT a.title AS title, COALESCE(ar.name, a.album_artist) AS artist, a.external_id AS external_id, a.slug AS slug, a.cover_path AS cover
                FROM albums a LEFT JOIN artists ar ON ar.id = a.artist_id WHERE a.id = ?
            `).get(seedRef.albumId) as any;
        } else if (seedRef.trackId) {
            row = db.prepare(`
                SELECT t.title AS title, COALESCE(t.artist_name, ar.name) AS artist, t.external_id AS external_id, a.slug AS slug, a.cover_path AS cover
                FROM tracks t LEFT JOIN albums a ON a.id = t.album_id LEFT JOIN artists ar ON ar.id = t.artist_id WHERE t.id = ?
            `).get(seedRef.trackId) as any;
        }
        if (!row) throw new Error("Release not found in your library");

        const artist = row.artist || "Unknown";
        const base = this.network.getPublicUrl?.()?.replace(/\/$/, "");
        const seed = {
            title: row.title,
            artist,
            url: row.slug && base ? `${base}/releases/${row.slug}` : "",
            coverUrl: row.slug && row.cover && base ? `${base}/api/albums/${row.slug}/cover` : ""
        };
        const seedIdentity: NetworkSeedIdentity = { externalId: row.external_id, title: row.title, artist };

        const peers = this.network.getPeers?.() ?? [];
        const localResults = this.aggregateNetworkCoStars(seedIdentity, 100);
        const peerResultsList = await mapWithConcurrency(peers, PEER_FETCH_CONCURRENCY, p => this.queryPeerNetwork(p, seedIdentity));

        const tally = new Map<string, NetworkRankedItem>();
        const merge = (items: NetworkCoStarItem[]) => {
            for (const item of items) {
                if (!item?.title) continue;
                const key = networkKey(item.externalId, item.title, item.artist);
                const existing = tally.get(key);
                if (existing) {
                    existing.score += item.score;
                    existing.peers += 1;
                } else {
                    tally.set(key, { ...item, peers: 1 });
                }
            }
        };
        merge(localResults);
        for (const peerResults of peerResultsList) merge(peerResults);

        const results = Array.from(tally.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, 100);

        return { seed, source: "network", instancesQueried: peers.length + 1, results };
    }

    private async getCachedFanCollection(fanId: number, depth: number): Promise<BandcampCollectedItem[]> {
        const cacheKey = `fan:${fanId}:${depth}`;
        const nowSec = Math.floor(Date.now() / 1000);

        const row = this.database.db
            .prepare("SELECT payload, expires_at FROM dig_cache WHERE cache_key = ?")
            .get(cacheKey) as { payload: string; expires_at: number } | undefined;

        if (row && row.expires_at > nowSec) {
            try {
                return JSON.parse(row.payload) as BandcampCollectedItem[];
            } catch {
                // fall through to refetch on corrupt cache
            }
        }

        const items = await getFanCollection(fanId, depth);
        // Only cache non-empty results so transient failures aren't pinned for 24h.
        if (items.length > 0) {
            this.database.db
                .prepare("INSERT OR REPLACE INTO dig_cache (cache_key, payload, expires_at) VALUES (?, ?, ?)")
                .run(cacheKey, JSON.stringify(items), nowSec + CACHE_TTL_SECONDS);
        }
        return items;
    }

    /** Remove expired cache rows. Safe to call periodically. */
    pruneCache(): void {
        const nowSec = Math.floor(Date.now() / 1000);
        this.database.db.prepare("DELETE FROM dig_cache WHERE expires_at <= ?").run(nowSec);
    }

    // --- Sessions ---

    createSession(userId: number, name: string): DigSession {
        const info = this.database.db
            .prepare("INSERT INTO dig_sessions (user_id, name) VALUES (?, ?)")
            .run(userId, name.trim() || "Untitled session");
        return this.database.db
            .prepare("SELECT * FROM dig_sessions WHERE id = ?")
            .get(info.lastInsertRowid) as DigSession;
    }

    listSessions(userId: number): DigSession[] {
        return this.database.db
            .prepare("SELECT * FROM dig_sessions WHERE user_id = ? ORDER BY updated_at DESC")
            .all(userId) as DigSession[];
    }

    deleteSession(userId: number, sessionId: number): void {
        this.database.db
            .prepare("DELETE FROM dig_sessions WHERE id = ? AND user_id = ?")
            .run(sessionId, userId);
    }

    private assertSessionOwner(userId: number, sessionId: number): void {
        const owned = this.database.db
            .prepare("SELECT 1 FROM dig_sessions WHERE id = ? AND user_id = ?")
            .get(sessionId, userId);
        if (!owned) throw new Error("Session not found");
    }

    // --- Crate ---

    getCrate(userId: number, sessionId: number): DigCrateItem[] {
        this.assertSessionOwner(userId, sessionId);
        return this.database.db
            .prepare("SELECT * FROM dig_crate_items WHERE session_id = ? ORDER BY added_at DESC")
            .all(sessionId) as DigCrateItem[];
    }

    addToCrate(
        userId: number,
        sessionId: number,
        item: {
            source?: string;
            sourceUrl: string;
            title?: string;
            artist?: string;
            coverUrl?: string;
            previewUrl?: string;
            bpm?: number;
        }
    ): DigCrateItem {
        this.assertSessionOwner(userId, sessionId);
        const info = this.database.db
            .prepare(
                `INSERT INTO dig_crate_items
                    (session_id, source, source_url, title, artist, cover_url, preview_url, bpm)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
                sessionId,
                item.source || "bandcamp",
                item.sourceUrl,
                item.title ?? null,
                item.artist ?? null,
                item.coverUrl ?? null,
                item.previewUrl ?? null,
                item.bpm ?? null
            );
        this.database.db
            .prepare("UPDATE dig_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(sessionId);
        return this.database.db
            .prepare("SELECT * FROM dig_crate_items WHERE id = ?")
            .get(info.lastInsertRowid) as DigCrateItem;
    }

    removeFromCrate(userId: number, sessionId: number, itemId: number): void {
        this.assertSessionOwner(userId, sessionId);
        this.database.db
            .prepare("DELETE FROM dig_crate_items WHERE id = ? AND session_id = ?")
            .run(itemId, sessionId);
    }

    // --- History ---

    logHistory(userId: number, query: string, source: string = "bandcamp"): void {
        const trimmed = query.trim();
        if (!trimmed) return;
        this.database.db
            .prepare("INSERT INTO dig_history (user_id, query, source) VALUES (?, ?, ?)")
            .run(userId, trimmed, source);
    }

    getHistory(userId: number, limit: number = 30): Array<{ id: number; query: string; source: string; created_at: string }> {
        return this.database.db
            .prepare("SELECT id, query, source, created_at FROM dig_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
            .all(userId, limit) as Array<{ id: number; query: string; source: string; created_at: string }>;
    }
}
