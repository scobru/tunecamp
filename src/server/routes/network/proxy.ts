import { Router } from "express";
import { Readable } from "node:stream";
import { isSafeUrl } from "../../../utils/networkUtils.js";

import type { ServiceContainer } from "../../core/container.js";

export function createProxyRoutes(container: ServiceContainer): Router {
    const router = Router();
    const library = container.library;

    const deleteBrokenTrack = (url: string, reason: string) => {
        try {
            const tracks = Array.from(library.iterateTracks("url = ? AND file_path IS NULL", [url]));
            for (const track of tracks) {
                console.warn(`🧹 [Self-Healing] Deleting broken external track ${track.id} ("${track.title}"): ${reason}`);
                library.deleteTrack(track.id);
            }
        } catch (dbErr) {
            console.error("❌ [Self-Healing] Failed to delete broken track:", dbErr);
        }
    };

    /**
     * GET /api/proxy/stream
     * Proxies a remote audio stream to bypass CORS/SSL issues
     */
    router.get("/stream", async (req, res) => {
        const url = req.query.url as string;
        if (!url) {
            return res.status(400).send("URL is required");
        }

        const safe = await isSafeUrl(url);
        if (!safe) {
            console.warn(`⚠️ Proxy target blocked: ${url}`);
            return res.status(403).send("Forbidden: Invalid or unsafe URL");
        }

        try {
            console.log(`📡 Proxying stream: ${url}`);
            
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Tunecamp/1.0',
                    'Accept': '*/*'
                }
            });

            if (!response.ok) {
                console.warn(`⚠️ Proxy target returned error: ${response.status}`);
                if (response.status === 404 || response.status === 410 || response.status === 403) {
                    deleteBrokenTrack(url, `HTTP ${response.status} from target`);
                }
                return res.status(response.status).send(`Failed to fetch remote stream: ${response.statusText}`);
            }

            // Copy headers
            const contentType = response.headers.get('content-type');
            const contentLength = response.headers.get('content-length');
            const acceptRanges = response.headers.get('accept-ranges');

            if (contentType) res.setHeader('Content-Type', contentType);
            if (contentLength) res.setHeader('Content-Length', contentLength);
            if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
            
            // Handle range requests if needed (basic pass-through for now)
            // For now, just pipe the stream
            if (response.body) {
                // Global fetch yields a web ReadableStream; adapt to a Node
                // stream so it can be piped to the Express response.
                const nodeStream = Readable.fromWeb(response.body as any);
                nodeStream.pipe(res);

                nodeStream.on('error', (err) => {
                    console.error('❌ Proxy stream error:', err);
                    res.end();
                });
            } else {
                res.status(500).send("Proxy target returned no body");
            }

        } catch (error: any) {
            console.error("❌ Proxy error:", error);
            const isConnectionError = error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT';
            if (isConnectionError) {
                deleteBrokenTrack(url, `Connection error (${error.code})`);
            }
            res.status(500).send("Proxy error");
        }
    });

    return router;
}

