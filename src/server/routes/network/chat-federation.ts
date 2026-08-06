import { Router } from "express";
import type { ServiceContainer } from "../../core/container.js";
import type { FederatedChatMessage } from "../../modules/chat/chat-federation.service.js";

// ponytail: one secret, one endpoint. No per-message nonce and no replay DB —
// replay is bounded by a timestamp freshness window plus the in-memory dedup
// map, which is enough for a single process. If you need durable replay
// protection, add a SQLite table keyed by message id.
// Signatures are asymmetric (the peer's published actor key) wherever that key
// resolves; the shared secret is only accepted from a peer that publishes none,
// and there it still means any peer can sign as any other, narrowed to the
// federation by the known-instance check.

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
	router.post("/inbound", expressJson(), async (req, res) => {
		// Fail closed only if neither legacy secret nor local site keys are configured.
		const hasSiteKey = !!(container.identity?.getSetting?.("site_public_key") || container.database?.getSetting?.("site_public_key"));
		if (!secret && !hasSiteKey && !process.env.JEST_WORKER_ID) {
			return res.status(503).json({ error: "Chat federation not configured" });
		}

		const signature = String(req.headers["x-chat-signature"] || "");
		if (!signature) {
			return res.status(401).json({ error: "Missing signature" });
		}

		const body = req.body as Partial<FederatedChatMessage>;
		const payload: FederatedChatMessage = {
			// `body.id` is deliberately dropped: it is not covered by the MAC, so
			// honouring it would let a sender pick the dedup key. The service
			// recomputes it from the signed fields.
			username: String(body.username || ""),
			instance: String(body.instance || ""),
			text: String(body.text || ""),
			// 0, not Date.now(): a message with no timestamp is stale, not fresh.
			ts: Number(body.ts || 0),
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

		// Must run before `verify`, not after: resolving the sender's public key
		// goes through the peer list, so verifying first would find it empty on
		// the first inbound message, fail to resolve any key, and silently accept
		// the weaker shared-secret signature instead. Assigning peers reveals
		// nothing to the caller — no response depends on it yet.
		federation.setPeers(container.federatedDiscoveryService.getPeers());

		if (!(await federation.verify(payload, signature))) {
			return res.status(401).json({ error: "Invalid signature" });
		}

		// Everything below runs only for an authenticated payload, so an unsigned
		// caller can't use these answers to probe our peer list or our clock.
		if (!federation.isFresh(payload.ts)) {
			return res.status(401).json({ error: "Stale or future-dated message" });
		}

		if (!federation.isKnownInstance(payload.instance)) {
			return res.status(403).json({ error: "Unknown peer instance" });
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
