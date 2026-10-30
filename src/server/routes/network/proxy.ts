import { Router } from "express";
import { Readable } from "node:stream";
import { fetchSafe, drainResponse } from "../../common/network.js";

const PROXIED_MEDIA = /^\s*(audio\/|video\/|image\/|application\/(ogg|octet-stream)|binary\/octet-stream)/i;

import type { ServiceContainer } from "../../core/container.js";

export function createProxyRoutes(container: ServiceContainer): Router {
    const router = Router();

    /**
     * GET /api/proxy/stream
     * Proxies a remote audio stream to bypass CORS/SSL issues
     */
    router.get("/stream", async (req, res) => {
        const url = req.query.url as string;
        if (!url) {
            return res.status(400).send("URL is required");
        }

        try {
            console.log(`📡 Proxying stream: ${url}`);

            let response: Response;
            try {
                response = await fetchSafe(url, {
                    headers: { 'User-Agent': 'Tunecamp/1.0', 'Accept': '*/*' }
                });
            } catch (e: any) {
                if (!String(e?.message).startsWith('SSRF Blocked')) throw e;
                console.warn(`⚠️ Proxy target blocked: ${url}`);
                return res.status(403).send("Forbidden: Invalid or unsafe URL");
            }

            if (!response.ok) {
                console.warn(`⚠️ Proxy target returned error: ${response.status}`);
                return res.status(response.status).send(`Failed to fetch remote stream: ${response.statusText}`);
            }

            // This route answers from our own origin, whose CSP allows inline scripts:
            // relaying a remote text/html page would run its script here, next to the
            // login token in localStorage. Media only, and the body may never run code.
            const contentType = response.headers.get('content-type') || 'application/octet-stream';
            if (!PROXIED_MEDIA.test(contentType)) {
                await drainResponse(response);
                return res.status(415).send("Only audio, video and image content can be proxied");
            }
            res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");

            const contentLength = response.headers.get('content-length');
            const acceptRanges = response.headers.get('accept-ranges');

            res.setHeader('Content-Type', contentType);
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
            res.status(500).send("Proxy error");
        }
    });

    return router;
}

