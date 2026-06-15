import type { Database as DatabaseType } from "better-sqlite3";
import { isSafeUrl } from "../../../utils/networkUtils.js";

/**
 * FederatedDiscoveryService — HTTP/gossip-based discovery of TuneCamp instances.
 *
 * Replaces Zen-based signaling for instance discovery. It crawls outward from a
 * set of seed instances (ActivityPub-followed TuneCamp sites + TUNECAMP_FEDERATION_SEEDS),
 * validating each peer via NodeInfo (`software.name === "tunecamp"`) and expanding
 * the frontier through each peer's `/api/community/peers` endpoint.
 *
 * Modeled on CatalogCacheService: SQLite-backed, SSRF-guarded (isSafeUrl), bounded
 * fetch timeouts, and a hard expiry so instances that go away stop being served.
 * There is NO central relay — discovery is pure gossip from the seed points.
 */

const HARD_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7d: drop entries never refreshed since
const FETCH_TIMEOUT = 5000;                     // 5s per request
const MAX_INSTANCES = 100;                      // crawl breadth safety cap
const MAX_DEPTH = 3;                            // crawl depth safety cap

export interface FederatedInstance {
    url: string;            // instance origin (https://host)
    name?: string;
    description?: string;
    coverImage?: string;
    artistName?: string;
    communityLink?: string;
    version?: string;
    lastSeen?: number;
}

export interface FederatedDiscoveryOptions {
    /** Static seed origins from config (TUNECAMP_FEDERATION_SEEDS). */
    seeds?: string[];
    /** Origins of TuneCamp instances followed via ActivityPub (resolved lazily each crawl). */
    getApSeedOrigins?: () => string[];
    /** This instance's own origin — excluded from results and gossip. */
    getOwnOrigin?: () => string | undefined;
}

export interface FederatedDiscoveryService {
    /** Crawl the network from the seeds; returns the number of reachable instances found. */
    crawl(): Promise<number>;
    /**
     * Probe a single origin on demand: validates it's a TuneCamp instance via NodeInfo
     * and, if so, stores its metadata immediately (so it appears without waiting for a
     * full crawl). Returns true when the origin is a reachable TuneCamp instance.
     */
    probeOrigin(rawOrigin: string): Promise<boolean>;
    /** Discovered instances, served from SQLite (same shape stats.ts expects from Zen sites). */
    getCommunitySites(): FederatedInstance[];
    /** Known instance origins, for the public `/api/community/peers` gossip endpoint. */
    getPeers(): string[];
    /** Drops entries older than the hard expiry. Called automatically after each crawl. */
    prune(): void;
}

/** Strip path/query and return the canonical origin, or null if unparseable. */
function normalizeOrigin(raw?: string): string | null {
    if (!raw) return null;
    try {
        const u = new URL(raw.trim());
        if (u.protocol !== "https:" && u.protocol !== "http:") return null;
        return u.origin;
    } catch {
        return null;
    }
}

/** NodeInfo serializes software.version as a string, but be defensive about objects. */
function formatVersion(v: any): string | undefined {
    if (!v) return undefined;
    if (typeof v === "string") return v;
    if (typeof v === "object" && v.major != null) {
        return [v.major, v.minor, v.patch].filter((x) => x != null).join(".");
    }
    return undefined;
}

export function createFederatedDiscoveryService(
    db: DatabaseType,
    options: FederatedDiscoveryOptions = {}
): FederatedDiscoveryService {
    db.exec(`
        CREATE TABLE IF NOT EXISTS federated_instances (
            origin TEXT PRIMARY KEY,
            name TEXT,
            description TEXT,
            cover_image TEXT,
            artist_name TEXT,
            community_link TEXT,
            version TEXT,
            last_seen INTEGER NOT NULL,
            fetched_at INTEGER NOT NULL
        );
    `);

    const selectAllStmt = db.prepare("SELECT * FROM federated_instances WHERE fetched_at >= ? ORDER BY last_seen DESC");
    const selectOriginsStmt = db.prepare("SELECT origin FROM federated_instances WHERE fetched_at >= ?");
    const upsertStmt = db.prepare(`
        INSERT INTO federated_instances
            (origin, name, description, cover_image, artist_name, community_link, version, last_seen, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(origin) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            cover_image = excluded.cover_image,
            artist_name = excluded.artist_name,
            community_link = excluded.community_link,
            version = excluded.version,
            last_seen = excluded.last_seen,
            fetched_at = excluded.fetched_at
    `);
    const pruneStmt = db.prepare("DELETE FROM federated_instances WHERE fetched_at < ?");

    let crawling = false;

    /** GETs a JSON document with a bounded timeout; returns null on any failure. */
    const fetchJson = async (url: string): Promise<any | null> => {
        let timeoutId: NodeJS.Timeout | undefined;
        try {
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
            const res = await fetch(url, {
                signal: controller.signal,
                headers: { Accept: "application/json", "User-Agent": "TuneCamp-Federation/2.0" },
            });
            if (!res.ok) {
                // Drain the body to avoid leaks in Node's fetch implementation.
                try {
                    if (res.body && typeof (res.body as any).cancel === "function") {
                        await (res.body as any).cancel();
                    } else {
                        await res.text();
                    }
                } catch { /* ignore */ }
                return null;
            }
            return await res.json();
        } catch {
            return null;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    };

    /** Resolves NodeInfo via /.well-known/nodeinfo (same-origin only), falling back to /nodeinfo/2.1. */
    const fetchNodeInfo = async (origin: string): Promise<any | null> => {
        const wellKnown = await fetchJson(`${origin}/.well-known/nodeinfo`);
        let href: string | undefined;
        if (wellKnown?.links && Array.isArray(wellKnown.links)) {
            const link =
                wellKnown.links.find(
                    (l: any) =>
                        typeof l?.rel === "string" &&
                        l.rel.includes("nodeinfo") &&
                        (l.rel.endsWith("2.1") || l.rel.endsWith("2.0"))
                ) || wellKnown.links.find((l: any) => typeof l?.href === "string");
            href = link?.href;
        }
        // SSRF hardening: the discovery doc must not redirect us off-origin.
        if (href) {
            try {
                if (new URL(href).origin !== origin) href = undefined;
            } catch {
                href = undefined;
            }
        }
        const doc = href ? await fetchJson(href) : null;
        if (doc?.software) return doc;
        return await fetchJson(`${origin}/nodeinfo/2.1`);
    };

    /** Probes one origin: validates it's TuneCamp, stores metadata, returns its peer list. */
    const probe = async (origin: string): Promise<{ peers: string[] } | null> => {
        if (!(await isSafeUrl(origin))) return null;

        const nodeinfo = await fetchNodeInfo(origin);
        if (!nodeinfo || nodeinfo.software?.name !== "tunecamp") return null;

        const meta = await fetchJson(`${origin}/api/community/instance`);
        const peersDoc = await fetchJson(`${origin}/api/community/peers`);
        const peers: string[] = Array.isArray(peersDoc)
            ? peersDoc.filter((p): p is string => typeof p === "string")
            : Array.isArray(peersDoc?.peers)
            ? peersDoc.peers.filter((p: any): p is string => typeof p === "string")
            : [];

        const now = Date.now();
        upsertStmt.run(
            origin,
            meta?.name || meta?.title || null,
            meta?.description || null,
            meta?.coverImage || null,
            meta?.artistName || null,
            meta?.communityLink || null,
            formatVersion(nodeinfo.software?.version) || meta?.version || null,
            now,
            now
        );

        return { peers };
    };

    const crawl = async (): Promise<number> => {
        if (crawling) return getCommunitySites().length;
        crawling = true;
        try {
            const own = normalizeOrigin(options.getOwnOrigin?.());
            const seedOrigins = [...(options.seeds || []), ...(options.getApSeedOrigins?.() || [])];

            const visited = new Set<string>();
            let frontier: string[] = [];
            for (const s of seedOrigins) {
                const o = normalizeOrigin(s);
                if (o && o !== own) frontier.push(o);
            }
            frontier = [...new Set(frontier)];

            const reachable = new Set<string>();
            let depth = 0;
            let capped = false;

            while (frontier.length > 0 && depth < MAX_DEPTH) {
                const batch = frontier.filter((o) => !visited.has(o));
                for (const o of batch) visited.add(o);
                if (visited.size > MAX_INSTANCES) capped = true;

                const results = await Promise.allSettled(batch.map((o) => probe(o)));
                const next: string[] = [];
                for (let i = 0; i < results.length; i++) {
                    const r = results[i];
                    if (r.status !== "fulfilled" || !r.value) continue;
                    reachable.add(batch[i]);
                    for (const p of r.value.peers) {
                        const po = normalizeOrigin(p);
                        if (!po || po === own || visited.has(po)) continue;
                        if (visited.size + next.length >= MAX_INSTANCES) {
                            capped = true;
                            continue;
                        }
                        next.push(po);
                    }
                }
                frontier = [...new Set(next)];
                depth++;
            }

            if (capped) {
                console.warn(
                    `⚠️ [FederatedDiscovery] Crawl hit safety cap (${MAX_INSTANCES} instances / depth ${MAX_DEPTH}); some peers were not visited.`
                );
            }

            prune();
            console.log(
                `🛰️ [FederatedDiscovery] Crawl complete: ${reachable.size} reachable TuneCamp instance(s).`
            );
            return reachable.size;
        } finally {
            crawling = false;
        }
    };

    const probeOrigin = async (rawOrigin: string): Promise<boolean> => {
        const o = normalizeOrigin(rawOrigin);
        if (!o) return false;
        const own = normalizeOrigin(options.getOwnOrigin?.());
        if (o === own) return false;
        return (await probe(o)) !== null;
    };

    const getCommunitySites = (): FederatedInstance[] => {
        const since = Date.now() - HARD_EXPIRY_MS;
        let rows: any[] = [];
        try {
            rows = selectAllStmt.all(since) as any[];
        } catch (e) {
            console.error("❌ [FederatedDiscovery] Read failed:", e);
            return [];
        }
        return rows.map((r) => ({
            url: r.origin,
            name: r.name || undefined,
            description: r.description || undefined,
            coverImage: r.cover_image || undefined,
            artistName: r.artist_name || undefined,
            communityLink: r.community_link || undefined,
            version: r.version || undefined,
            lastSeen: r.last_seen || undefined,
        }));
    };

    const getPeers = (): string[] => {
        const own = normalizeOrigin(options.getOwnOrigin?.());
        const out = new Set<string>();
        const since = Date.now() - HARD_EXPIRY_MS;
        try {
            for (const row of selectOriginsStmt.all(since) as any[]) {
                const o = normalizeOrigin(row.origin);
                if (o && o !== own) out.add(o);
            }
        } catch (e) {
            console.error("❌ [FederatedDiscovery] getPeers read failed:", e);
        }
        // Include our own seeds/follows so a freshly-booted instance still gossips.
        for (const s of [...(options.seeds || []), ...(options.getApSeedOrigins?.() || [])]) {
            const o = normalizeOrigin(s);
            if (o && o !== own) out.add(o);
        }
        return [...out];
    };

    const prune = () => {
        try {
            pruneStmt.run(Date.now() - HARD_EXPIRY_MS);
        } catch (e) {
            console.error("❌ [FederatedDiscovery] Prune failed:", e);
        }
    };

    prune();

    return { crawl, probeOrigin, getCommunitySites, getPeers, prune };
}
