import type { DatabaseService } from "../../core/database.js";
import {
    searchBandcamp,
    extractBandcampMetadata,
    getTralbumCollectors,
    getFanCollection,
    BANDCAMP_IMAGE_BASE,
    type BandcampCollectedItem
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
    constructor(private database: DatabaseService) {}

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

        const meta = await extractBandcampMetadata(releaseUrl);
        if (!meta || !meta.tralbumId || !meta.tralbumType) {
            throw new Error("Could not read this Bandcamp release (no tralbum id found).");
        }

        const seed = {
            title: meta.title,
            artist: meta.artist,
            url: releaseUrl,
            coverUrl: meta.cover
        };

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
