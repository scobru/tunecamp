import { Router } from "express";
import fetch from "node-fetch";
import { isSafeUrl } from "../../../utils/networkUtils.js";

export function createProxyRoutes(): Router {
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
                response.body.pipe(res);
                
                response.body.on('error', (err) => {
                    console.error('❌ Proxy stream error:', err);
                    res.end();
                });
            } else {
                res.status(500).send("Proxy target returned no body");
            }

        } catch (error) {
            console.error("❌ Proxy error:", error);
            res.status(500).send("Proxy error");
        }
    });

    return router;
}

