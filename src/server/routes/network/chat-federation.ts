import { Router } from "express";
import type { ServiceContainer } from "../../core/container.js";
import {
	createChatFederationService,
	type FederatedChatMessage,
} from "../../modules/chat/chat-federation.service.js";

// ponytail: one secret, one endpoint. No per-message nonce, no replay DB
// beyond the in-memory dedup window. If you need durable replay protection,
// add a SQLite table keyed by message id.

export function createChatFederationRoutes(
	container: ServiceContainer,
): Router {
	const router = Router();
	const federation = createChatFederationService(
		container.chatService,
		container.config.chatFederationSecret || "",
	);

	// Expose known peers so instances can crawl each other's chat networks.
	router.get("/peers", (_req, res) => {
		res.json({ peers: federation.getPeers?.() || [] });
	});

	// Inbound relay from a federated peer. Authenticated by HMAC-SHA256
	// over the payload fields, using the shared secret. The signature binds
	// username, instance, text, ts, lobby, and toUsername — tampering any
	// field invalidates the MAC.
	router.post("/inbound", expressJson(), (req, res) => {
		const signature = String(req.headers["x-chat-signature"] || "");
		if (!signature) {
			return res.status(401).json({ error: "Missing signature" });
		}

		const body = req.body as Partial<FederatedChatMessage>;
		const payload: FederatedChatMessage = {
			id: body.id,
			username: String(body.username || ""),
			instance: String(body.instance || ""),
			text: String(body.text || ""),
			ts: Number(body.ts || Date.now()),
			lobby: body.lobby ?? true,
			toUsername: body.toUsername ? String(body.toUsername) : undefined,
		};

		if (!payload.username || !payload.instance || !payload.text) {
			return res.status(400).json({ error: "Missing required fields" });
		}

		if (!federation.verify(payload, signature)) {
			return res.status(401).json({ error: "Invalid signature" });
		}

		const accepted = federation.ingest(payload);
		res.status(accepted ? 202 : 409).json({ accepted });
	});

	return router;
}

function expressJson() {
	return (req: any, res: any, next: any) => {
		if (!req.is("application/json")) {
			return res.status(415).json({ error: "application/json required" });
		}
		next();
	};
}
