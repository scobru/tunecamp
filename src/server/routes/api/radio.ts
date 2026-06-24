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

        const { name, playlistId, trackIds, sources, shuffle } = req.body;
        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({ error: "Radio name is required" });
        }
        const hasSources = Array.isArray(sources) && sources.length > 0;
        const hasTrackIds = Array.isArray(trackIds) && trackIds.length > 0;
        if (!playlistId && !hasTrackIds && !hasSources) {
            return res.status(400).json({ error: "Provide at least one source: sources, playlistId, or trackIds" });
        }

        try {
            await radioService.start({
                name: name.trim(),
                playlistId: playlistId ? Number(playlistId) : null,
                trackIds: hasTrackIds ? trackIds.map(Number) : undefined,
                sources: hasSources ? sources.map(String) : undefined,
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
     * GET /api/radio/stream.m3u
     * M3U playlist — opens directly in VLC, foobar2000, mpv, etc.
     */
    router.get("/stream.m3u", wrapAsync(async (req: Request, res: Response) => {
        const status = radioService?.getStatus();
        if (!status?.active) {
            return res.status(404).send("# Radio is not active\n");
        }
        const base = `${req.protocol}://${req.get("host")}`;
        const streamUrl = `${base}${status.hlsUrl}`;
        const track = status.currentTrack;
        const title = track
            ? `${track.artist_name ? track.artist_name + " - " : ""}${track.title}`
            : status.name;

        const m3u = [
            "#EXTM3U",
            `#EXTINF:-1 tvg-name="${status.name}",${title}`,
            streamUrl,
            "",
        ].join("\n");

        res.setHeader("Content-Type", "audio/x-mpegurl");
        res.setHeader("Content-Disposition", `inline; filename="radio.m3u"`);
        res.setHeader("Cache-Control", "no-store");
        res.send(m3u);
    }));

    /**
     * GET /api/radio/feed.rss
     * RSS/podcast feed with HLS enclosure — compatible with podcast clients
     * that support live streams (Pocket Casts, AntennaPod, etc.)
     */
    router.get("/feed.rss", wrapAsync(async (req: Request, res: Response) => {
        const status = radioService?.getStatus();
        const base = `${req.protocol}://${req.get("host")}`;
        const pageUrl = `${base}/radio`;

        if (!status?.active) {
            const empty = [
                `<?xml version="1.0" encoding="UTF-8"?>`,
                `<rss version="2.0">`,
                `  <channel>`,
                `    <title>Radio</title>`,
                `    <link>${pageUrl}</link>`,
                `    <description>Radio is currently offline.</description>`,
                `  </channel>`,
                `</rss>`,
            ].join("\n");
            res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
            return res.send(empty);
        }

        const streamUrl = `${base}${status.hlsUrl}`;
        const track = status.currentTrack;
        const nowPlaying = track
            ? `${track.artist_name ? track.artist_name + " — " : ""}${track.title}`
            : "Live stream";
        const coverUrl = track?.id ? `${base}/api/tracks/${track.id}/cover` : "";
        const pubDate = status.startedAt ? new Date(status.startedAt).toUTCString() : new Date().toUTCString();

        const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

        const feed = [
            `<?xml version="1.0" encoding="UTF-8"?>`,
            `<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">`,
            `  <channel>`,
            `    <title>${esc(status.name)}</title>`,
            `    <link>${esc(pageUrl)}</link>`,
            `    <description>${esc(status.name)} — live radio stream</description>`,
            `    <language>en</language>`,
            coverUrl ? `    <itunes:image href="${esc(coverUrl)}"/>` : "",
            `    <item>`,
            `      <title>${esc(nowPlaying)}</title>`,
            `      <guid isPermaLink="false">${esc(streamUrl)}</guid>`,
            `      <pubDate>${pubDate}</pubDate>`,
            `      <enclosure url="${esc(streamUrl)}" length="0" type="application/vnd.apple.mpegurl"/>`,
            `      <itunes:duration>0</itunes:duration>`,
            `    </item>`,
            `  </channel>`,
            `</rss>`,
        ].filter(Boolean).join("\n");

        res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.send(feed);
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
