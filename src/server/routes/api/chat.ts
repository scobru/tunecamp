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
		wrapAsync(async (req: any, res: any) => {
			const clients = container.chatService.getClients();
			res.json({ clients });
		}),
	);

	return router;
}
