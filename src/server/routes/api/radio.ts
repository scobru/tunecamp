import { Router, json } from "express";
import fs from "fs-extra";
import type { Request, Response } from "express";
import type { ServiceContainer } from "../../core/container.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { wrapAsync } from "../../middleware/error-handling.js";

export function createRadioRoutes(container: ServiceContainer): Router {
    const radioService = (container as any).radioService;
    const authMiddleware = container.authMiddleware;
    const router = Router();

    /**
     * GET /api/radio
     * Public: radio status + current track
     */
    router.get("/", json(), wrapAsync(async (_req: Request, res: Response) => {
        if (!radioService) return res.json({ active: false, hlsUrl: "/api/radio/hls/stream.m3u8", listenerCount: 0 });
        res.json(radioService.getStatus());
    }));

    /**
     * POST /api/admin/radio/start
     * Admin: start the radio
     */
    router.post("/start", json(), authMiddleware.requireAdmin, wrapAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!radioService) return res.status(503).json({ error: "Radio service not available" });

        const { name, playlistId, trackIds, shuffle } = req.body;
        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({ error: "Radio name is required" });
        }
        if (!playlistId && (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0)) {
            return res.status(400).json({ error: "Either playlistId or trackIds must be provided" });
        }

        try {
            await radioService.start({
                name: name.trim(),
                playlistId: playlistId ? Number(playlistId) : null,
                trackIds: trackIds && Array.isArray(trackIds) ? trackIds.map(Number) : undefined,
                shuffle: shuffle === true,
            });
            res.json({ success: true, status: radioService.getStatus() });
        } catch (e: any) {
            res.status(500).json({ error: e?.message || "Failed to start radio" });
        }
    }));

    /**
     * POST /api/admin/radio/stop
     * Admin: stop the radio
     */
    router.post("/stop", json(), authMiddleware.requireAdmin, wrapAsync(async (_req: Request, res: Response) => {
        if (!radioService) return res.status(503).json({ error: "Radio service not available" });
        await radioService.stop();
        res.json({ success: true });
    }));

    /**
     * GET /api/radio/hls/:file
     * Serve HLS playlist + segments (public)
     */
    router.get("/hls/:file", wrapAsync(async (req: Request, res: Response) => {
        if (!radioService?.isActive()) {
            return res.status(404).json({ error: "Radio is not active" });
        }

        const { file } = req.params;
        const filePath = radioService.resolveFile(file);
        if (!filePath || !(await fs.pathExists(filePath))) {
            return res.status(404).json({ error: "Not found" });
        }

        if (file.endsWith(".m3u8")) {
            radioService.trackListener(req.ip || req.socket.remoteAddress || "unknown");
            res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
            res.setHeader("Cache-Control", "no-store");
        } else {
            res.setHeader("Content-Type", "video/mp2t");
            res.setHeader("Cache-Control", "public, max-age=60");
        }

        res.sendFile(filePath);
    }));

    return router;
}
