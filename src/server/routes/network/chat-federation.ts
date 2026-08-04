import { Router } from "express";
import type { ServiceContainer } from "../../core/container.js";
import type { FederatedChatMessage } from "../../modules/chat/chat-federation.service.js";

// ponytail: one secret, one endpoint. No per-message nonce, no replay DB
// beyond the in-memory dedup window. If you need durable replay protection,
// add a SQLite table keyed by message id.

export function createChatFederationRoutes(
	container: ServiceContainer,
): Router {
	const router = Router();
	const secret = container.config.chatFederationSecret || "";
	// The container's instance, not a second one: outbound fanout shares its
	// dedup window, so a message we sent can't be re-ingested when a peer
	// echoes it back.
	const federation = container.chatFederationService;

	// Inbound relay from a federated peer. Authenticated by HMAC-SHA256
	// over the payload fields, using the shared secret. The signature binds
	// username, instance, text, ts, lobby, toUsername, roomGlobalId and
	// roomName — tampering any field invalidates the MAC.
	router.post("/inbound", expressJson(), (req, res) => {
		// HMAC with an empty key isn't a secret — fail closed rather than accept
		// forgeable signatures if the env var was never set.
		if (!secret) {
			return res.status(503).json({ error: "Chat federation not configured" });
		}

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
			// Signed fields must be rebuilt, not dropped: omitting them here
			// while the sender signed them makes the MAC never match.
			roomGlobalId: body.roomGlobalId
				? String(body.roomGlobalId)
				: undefined,
			roomName: body.roomName ? String(body.roomName) : undefined,
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
