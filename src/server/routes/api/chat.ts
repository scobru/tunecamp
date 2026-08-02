import { Router } from "express";
import { wrapAsync } from "../../middleware/error-handling.js";
import type { ServiceContainer } from "../../core/container.js";

export function createChatRoutes(container: ServiceContainer): Router {
	const router = Router();

	/**
	 * GET /api/chat/history
	 * Lobby backlog for a client that just connected. Direct messages are never
	 * stored (the server only ever holds their ciphertext), so this is lobby-only.
	 */
	router.get(
		"/history",
		wrapAsync(async (req: any, res: any) => {
			const limit = Math.min(parseInt(req.query.limit) || 100, 500);
			res.json({ messages: container.chatService.getHistory(limit) });
		}),
	);

	router.get(
		"/peers",
		wrapAsync(async (_req: any, res: any) => {
			const clients = container.chatService.getClients();
			res.json({ clients });
		}),
	);

	router.get(
		"/pubkey/:username",
		wrapAsync(async (req: any, res: any) => {
			const username = String(req.params.username || "");
			const instance = String(req.query.instance || "");
			const local = container.chatService.getPubkey(username);
			if (local) {
				return res.json({ username, pubkey: local });
			}

			if (!instance) {
				return res.status(404).json({ error: "Pubkey not found" });
			}

			const peers = container.federatedDiscoveryService.getPeers();
			let peerOrigin: string | undefined;
			for (const p of peers) {
				try {
					const url = new URL(p);
					const name = url.hostname.split(".")[0];
					if (name === instance) {
						peerOrigin = p;
						break;
					}
				} catch {
					// skip invalid peer URL
				}
			}
			if (!peerOrigin) {
				return res.status(404).json({ error: "Instance not found" });
			}

			try {
				const remoteRes = await fetch(
					`${peerOrigin}/api/chat/pubkey/${encodeURIComponent(username)}`,
				);
				if (!remoteRes.ok) {
					return res.status(404).json({ error: "Remote pubkey not found" });
				}
				const data = await remoteRes.json();
				return res.json(data);
			} catch {
				return res.status(502).json({ error: "Failed to fetch remote pubkey" });
			}
		}),
	);

	return router;
}
