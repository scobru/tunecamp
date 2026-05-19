import express, { Router } from "express";
import type { TorrentService } from "../../modules/integrations/torrent.service.js";
import type { DatabaseService } from "../../core/database.js";
import type { AuthService } from "../../modules/auth/auth.service.js";

export function createTorrentRoutes(database: DatabaseService, torrentService: TorrentService, auth: AuthService): Router {
    const router = Router();
    router.use(express.json());

    /**
     * GET /api/admin/torrents
     * List all torrents with current status
     */
    router.get("/", async (req: any, res) => {
        try {
            const dbTorrents = database.getTorrents();
            const activeTorrents = torrentService.getTorrentsStatus() as any[];
            
            const activeMap = new Map(activeTorrents.map(at => [at.infoHash, at]));

            const results = dbTorrents.map(dt => {
                const active = activeMap.get(dt.info_hash);
                return {
                    ...dt,
                    infoHash: dt.info_hash,
                    name: active ? active.name : dt.name,
                    status: active ? (active.done ? 'completed' : 'downloading') : dt.status,
                    progress: active ? active.progress : dt.progress,
                    downloadSpeed: active ? active.downloadSpeed : 0,
                    uploadSpeed: active ? active.uploadSpeed : 0,
                    numPeers: active ? active.numPeers : 0,
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
