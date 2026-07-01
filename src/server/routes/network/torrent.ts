import express, { Router } from "express";
import type { TorrentService } from "../../modules/integrations/torrent.service.js";
import type { DatabaseService } from "../../core/database.js";
import type { AuthService } from "../../modules/auth/auth.service.js";

import type { ServiceContainer } from "../../core/container.js";
import { requireDownloadProvider } from "../../middleware/provider-gate.js";

const KNABEN_API = "https://knaben.org/api/v1";

export function createTorrentRoutes(container: ServiceContainer): Router {
    const torrentService = container.torrentService;
    const auth = container.authService;
    const integration = container.integration;
    const database = container.database;
    const router = Router();
    router.use(express.json());

    // BitTorrent is disabled by default (grey-area P2P): all its endpoints
    // require the plugin to be explicitly enabled by the admin.
    router.use(requireDownloadProvider("torrent"));

    /**
     * GET /api/admin/torrents/search?q=...&page=0&size=20
     * Proxy to Knaben aggregator API — avoids CORS and ISP blocks client-side.
     */
    router.get("/search", async (req, res) => {
        const q = String(req.query.q ?? "").trim();
        if (!q) return res.status(400).json({ error: "Query required" });

        const page = Math.max(0, parseInt(String(req.query.page ?? "0"), 10) || 0);
        const size = Math.min(50, Math.max(1, parseInt(String(req.query.size ?? "20"), 10) || 20));

        const params = new URLSearchParams({
            query: q,
            size: String(size),
            from: String(page * size),
            orderBy: "seeders",
            orderDirection: "desc",
        });

        try {
            const upstream = await fetch(`${KNABEN_API}/search?${params}`, {
                headers: { Accept: "application/json", "User-Agent": "TuneCamp/1.0" },
                signal: AbortSignal.timeout(10_000),
            });
            if (!upstream.ok) {
                return res.status(502).json({ error: `Knaben returned ${upstream.status}` });
            }
            const data = await upstream.json();
            res.json(data);
        } catch (err: any) {
            console.error("[torrent-search] Knaben fetch error:", err.message);
            res.status(502).json({ error: "Could not reach Knaben API" });
        }
    });

    /**
     * GET /api/admin/torrents
     * List all torrents with current status
     */
    router.get("/", async (req: any, res) => {
        try {
            const dbTorrents = integration.getTorrents();
            const activeTorrents = torrentService.getTorrentsStatus() as any[];

            const activeMap = new Map(
                activeTorrents
                    .filter(at => typeof at?.infoHash === 'string' && at.infoHash.length > 0)
                    .map(at => [at.infoHash.toLowerCase(), at])
            );

            const results = dbTorrents
                .filter(dt => {
                    if (typeof dt?.info_hash === 'string' && dt.info_hash.length > 0) return true;
                    console.warn('[torrents] Skipping DB row with null/invalid info_hash:', (dt as any)?.id ?? dt);
                    return false;
                })
                .map(dt => {
                    const infoHashLower = dt.info_hash.toLowerCase();
                    const active = activeMap.get(infoHashLower);
                    let status: string;
                    if (active) {
                        if (dt.status === 'seeding') status = 'seeding';
                        else if (active.done) status = 'completed';
                        else if (!active.ready) status = 'metadata';
                        else status = 'downloading';
                    } else {
                        status = dt.status;
                    }
                    return {
                        ...dt,
                        infoHash: infoHashLower,
                        name: active ? active.name : dt.name,
                        status,
                        progress: active ? active.progress : dt.progress,
                        downloadSpeed: active ? active.downloadSpeed : 0,
                        uploadSpeed: active ? active.uploadSpeed : 0,
                        numPeers: active ? active.numPeers : (dt.num_peers ?? 0),
                        ready: active ? active.ready : (dt.status !== 'metadata'),
                        files: active ? active.files : []
                    };
                });

            res.json(results);
        } catch (error) {
            console.error("Error listing torrents:", error);
            res.status(500).json({ error: "Failed to list torrents" });
        }
    });

    /**
     * POST /api/admin/torrents/purge
     * Remove all torrents in 'error'/'failed' state or stuck on 'metadata' beyond timeoutMs.
     * Body: { timeoutMs?: number }
     */
    router.post("/purge", async (req: any, res) => {
        const raw = req.body?.timeoutMs;
        const parsed = typeof raw === 'number' && Number.isFinite(raw) ? raw : 5 * 60 * 1000;
        // Clamp: min 10s, max 24h
        const timeoutMs = Math.max(10 * 1000, Math.min(24 * 60 * 60 * 1000, parsed));
        try {
            const removed = await torrentService.purgeStuck(timeoutMs);
            res.json({ success: true, removed, count: removed.length });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/admin/torrents/add
     */
    router.post("/add", async (req: any, res) => {
        if (!req.body) return res.status(400).json({ error: "Request body required" });
        const { magnet } = req.body;
        if (!magnet) return res.status(400).json({ error: "Magnet URI is required" });

        try {
            const infoHash = await torrentService.addTorrent(magnet, req.userId || null);
            res.json({ success: true, infoHash });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/admin/torrents/seed
     * Start seeding a list of files as a torrent
     */
    router.post("/seed", async (req: any, res) => {
        if (!req.body) return res.status(400).json({ error: "Request body required" });
        const { filePaths, name } = req.body;
        if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
            return res.status(400).json({ error: "filePaths array is required" });
        }
        if (!name) return res.status(400).json({ error: "Torrent name is required" });

        try {
            const magnetUri = await torrentService.seedFiles(filePaths, name, req.userId || null);
            res.json({ success: true, magnetUri });
        } catch (error: any) {
            console.error("❌ Torrent Seeding Error:", error);
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * DELETE /api/admin/torrents/:hash
     */
    router.delete("/:hash", async (req, res) => {
        const { hash } = req.params;
        try {
            await torrentService.removeTorrent(hash);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}
