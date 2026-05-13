import express from 'express';
import { TorrentService } from '../../modules/integrations/torrent.service.js';
import { createAuthMiddleware } from '../../middleware/auth.js';
import { DatabaseService } from '../../core/database.types.js';

import type { AuthService } from "../../modules/auth/auth.service.js";

export function createTorrentRoutes(database: DatabaseService, torrentService: TorrentService, authService: AuthService) {
    const router = express.Router();
    const authMiddleware = createAuthMiddleware(authService);

    // Require JSON body parsing
    router.use(express.json());

    // Require admin or super user for torrent management
    router.use(authMiddleware.requireAdmin);

    // GET /api/admin/torrents - List all torrents
    router.get('/', async (req, res) => {
        const startTime = Date.now();
        try {
            const dbTorrents = database.getTorrents();
            const activeTorrents = torrentService.getStatus(req.query.includeFiles === 'true');
            
            // Optimization: Create a Map for O(1) lookup of active torrents
            const activeMap = new Map(activeTorrents.map(at => [at.infoHash, at]));
            
            // Merge DB data with active client data
            const result = dbTorrents.map(dt => {
                const active = activeMap.get(dt.info_hash);
                return {
                    ...dt,
                    active: !!active,
                    status: active ? (active.done ? 'completed' : 'downloading') : dt.status,
                    progress: active ? active.progress : dt.progress,
                    downloadSpeed: active ? active.downloadSpeed : 0,
                    uploadSpeed: active ? active.uploadSpeed : 0,
                    numPeers: active ? active.numPeers : 0,
                    files: active ? active.files : []
                };
            });

            const duration = Date.now() - startTime;
            if (duration > 200) {
                console.warn(`⚠️ [TorrentRoute] GET / took ${duration}ms (dbCount=${dbTorrents.length}, activeCount=${activeTorrents.length})`);
            }

            res.json(result);
        } catch (err: any) {
            console.error("❌ Torrent list error:", err);
            res.status(500).json({ error: err.message });
        }
    });


    // POST /api/admin/torrents/add - Add a new magnet link
    router.post('/add', async (req, res) => {
        try {
            const { magnetUri } = req.body || {};
            const ownerId = (req as any).user?.id || 0;

            if (!magnetUri) {
                return res.status(400).json({ error: 'magnetUri is required' });
            }

            // Execute in background to avoid Nginx timeouts on slow magnet resolution
            torrentService.addTorrent(magnetUri, ownerId);
            
            res.json({ 
                message: 'Torrent add request submitted', 
                status: 'background_processing' 
            });
        } catch (err: any) {
            console.error("❌ Torrent add error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/admin/torrents/:infoHash - Remove a torrent
    router.delete('/:infoHash', async (req, res) => {
        const { infoHash } = req.params;
        const { deleteFiles } = req.query;

        try {
            torrentService.removeTorrent(infoHash, deleteFiles === 'true');
            res.json({ message: 'Torrent removed successfully' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/admin/torrents/sync/:infoHash - Manually sync a torrent to library
    router.post('/:infoHash/sync', async (req, res) => {
        const { infoHash } = req.params;

        try {
            const result = await torrentService.syncTorrent(infoHash);
            res.json(result);
        } catch (err: any) {
            console.error(`❌ Torrent sync error (${infoHash}):`, err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

