import express, { Router } from 'express';
import { torrentSearchService } from '../../modules/integrations/torrent-search.service.js';
import { createAuthMiddleware } from '../../middleware/auth.js';
import type { AuthService } from '../../modules/auth/auth.service.js';
import { DatabaseService } from '../../core/database.types.js';
import { ForbiddenError, BadRequestError } from '../../common/errors.js';
import { TorrentService } from '../../modules/integrations/torrent.service.js';

import type { ServiceContainer } from "../../core/container.js";

export function createTorrentSearchRouter(container: ServiceContainer): Router {
    const database: ServiceContainer['database'] = (container as any).database || (container as any);
    const torrentService: ServiceContainer['torrentService'] = (container as any).torrentService || (container as any);
    const authService: ServiceContainer['authService'] = (container as any).authService || (container as any);
    const router = Router();
    router.use(express.json());
    const auth = createAuthMiddleware(authService);

    /**
     * GET /api/admin/network/torrents/search
     * Search for torrents across all registered providers (Admin only)
     */
    router.get('/search', auth.requireAdmin, async (req: any, res) => {
        try {
            const query = req.query.q as string;
            const category = (req.query.cat as string) || 'Music';

            if (!query) throw new BadRequestError("Query required");

            console.log(`🔍 [Admin] Torrent Search: "${query}" (Category: ${category})`);
            const results = await torrentSearchService.searchAll(query, category);
            res.json(results);
        } catch (error: any) {
            console.error("❌ Torrent Search Error:", error);
            res.status(error.status || 500).json({ error: error.message });
        }
    });

    /**
     * POST /api/admin/network/torrents/download
     * Resolve magnet and add to download queue (Admin only)
     */
    router.post('/download', auth.requireAdmin, async (req: any, res) => {
        try {
            const { torrent, providerId } = req.body;
            if (!torrent || !providerId) throw new BadRequestError("Torrent and providerId required");

            console.log(`📥 [Admin] Resolving magnet for: ${torrent.title}`);
            const magnet = await torrentSearchService.getMagnet(providerId, torrent);
            
            if (!magnet) {
                return res.status(404).json({ error: "Could not resolve magnet link" });
            }

            console.log(`🧲 [Admin] Adding torrent to queue: ${torrent.title}`);
            torrentService.addTorrent(magnet, req.userId || 0);
            
            res.json({ success: true, message: "Torrent added to download queue" });
        } catch (error: any) {
            console.error("❌ Torrent Download Error:", error);
            res.status(error.status || 500).json({ error: error.message });
        }
    });

    return router;
}
