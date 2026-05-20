import { Router } from "express";
import type { Request, Response } from "express";
import type { ZenDBService } from "../../modules/network/zendb.service.js";
import { Zen } from "../../modules/network/zen.js";
import { kprs } from "../../modules/network/zen-network.js";

/**
 * buildRelayStatus — Builds a canonical Zen relay status payload.
 *
 * Compatible with zen/lib/status.js buildStatus() schema.
 * Consumed by zen/src/axe.js: fetch(base + "/status") → ZEN.recover() + ZEN.verify()
 *
 * Fields:
 *   name      — always "tunecamp" (identifies this relay type)
 *   version   — relay software version
 *   domain    — public hostname (stripped from publicUrl)
 *   pub       — server identity public key (secp256k1)
 *   mcp       — false (tunecamp does not expose MCP relay)
 *   peers     — wss:// peer list known to this relay (for AXE discovery)
 *   timestamp — Date.now() at call time
 *   ip4/ip6   — null (resolved by clients from DNS)
 *   port      — WebSocket relay port (1970)
 */
function buildRelayStatus(opts: {
    domain: string | null;
    pub: string | null;
    peers: string[];
    port?: number;
}): object {
    return {
        name: "tunecamp",
        version: "2.0.0",
        domain: opts.domain ?? null,
        pub: opts.pub ?? null,
        mcp: false,
        peers: opts.peers,
        timestamp: Date.now(),
        ip4: null,
        ip6: null,
        port: opts.port ?? 1970,
    };
}

/**
 * createZenRelayRoutes — Returns a router with:
 *
 *   GET /status
 *     Signed ZEN string (ZEN.sign) containing relay status JSON.
 *     AXE clients call this on WebSocket connect to discover more peers.
 *     Protocol: client does ZEN.recover(str) → pub, ZEN.verify(str, pub) → JSON
 *
 *   GET /.well-known/peers.json
 *     Plain JSON { peers: ["wss://...", ...] }
 *     Used by zen/src/bootstrap.js wellKnownBootstrap() for initial peer discovery
 *     before any WebSocket connection is established.
 */
export function createZenRelayRoutes(
    zendbService: ZenDBService,
    publicUrl?: string
): Router {
    const router = Router();

    /**
     * Derive domain from publicUrl (e.g. "https://tunecamp.example.com" → "tunecamp.example.com")
     * Returns null if not configured.
     */
    function getDomain(): string | null {
        const url = publicUrl;
        if (!url) return null;
        try {
            return new URL(url).hostname;
        } catch {
            return null;
        }
    }

    /**
     * GET /status
     *
     * Returns a ZEN-signed text string. Consumers:
     *   - zen/src/axe.js (browser AXE on connect)
     *   - Any Zen node that wants to verify relay identity and get peer hints
     *
     * Falls back to plain JSON if the server identity pair is not yet available.
     */
    router.get("/status", async (req: Request, res: Response) => {
        try {
            // Collect known peers in wss:// wire format
            const peers = Array.from(kprs).filter((p) =>
                /^wss?:\/\//.test(p)
            );

            const domain = getDomain();
            const serverPair = await zendbService.getIdentityKeyPair();
            const pub = serverPair?.pub ?? null;

            const payload = buildRelayStatus({ domain, pub, peers });
            const payloadStr = JSON.stringify(payload);

            if (serverPair?.priv) {
                // Sign with server identity — AXE clients use ZEN.recover() + ZEN.verify()
                const signed = await (Zen as any).sign(payloadStr, serverPair);
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.setHeader("Cache-Control", "no-cache, no-store");
                res.setHeader("Access-Control-Allow-Origin", "*");
                return res.send(signed);
            }

            // Fallback: plain JSON if no identity pair yet (first boot before init)
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Cache-Control", "no-cache, no-store");
            res.setHeader("Access-Control-Allow-Origin", "*");
            return res.json(payload);
        } catch (err) {
            console.error("🚨 [ZenRelay] /status error:", err);
            res.status(500).json({ error: "Failed to build relay status" });
        }
    });

    /**
     * GET /.well-known/peers.json
     *
     * Standard relay peer discovery endpoint.
     * Used by zen/src/bootstrap.js wellKnownBootstrap() before WebSocket connect.
     *
     * Response: { peers: ["wss://host:port/zen", ...] }
     */
    router.get("/.well-known/peers.json", (req: Request, res: Response) => {
        try {
            const peers = Array.from(kprs).filter((p) =>
                /^wss?:\/\//.test(p)
            );
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader(
                "Cache-Control",
                "public, max-age=60, stale-while-revalidate=300"
            );
            res.setHeader("Access-Control-Allow-Origin", "*");
            return res.json({ peers });
        } catch (err) {
            console.error("🚨 [ZenRelay] /.well-known/peers.json error:", err);
            res.status(500).json({ error: "Failed to build peer list" });
        }
    });

    return router;
}
