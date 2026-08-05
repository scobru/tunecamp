import crypto from "crypto";
import type { ChatService } from "./chat.service.js";

// ponytail: dedup stays in-process; if this ever runs clustered, move to Redis
// or a shared SQLite table. For a single Node process the Set is correct and
// cheaper than a DB round-trip on every message.
/** How old a signed message may be before it is refused as a replay. */
export const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000; // 5 minutes
/** Tolerance for a peer whose clock runs ahead of ours. */
export const MAX_CLOCK_SKEW_MS = 60 * 1000; // 1 minute
// Must outlive the freshness window: if an entry expired first, a message could
// fall out of dedup while still young enough to be accepted a second time.
const DEDUP_WINDOW_MS = MAX_MESSAGE_AGE_MS + MAX_CLOCK_SKEW_MS;

export interface FederatedChatMessage {
	id?: string;
	username: string;
	instance: string;
	text: string;
	ts: number;
	lobby?: boolean;
	toUsername?: string;
	/**
	 * Federation-wide room id. Never the local `chat_rooms.id`: that is a
	 * per-instance AUTOINCREMENT, so room 3 here is not room 3 there.
	 */
	roomGlobalId?: string;
	roomName?: string;
}

export class ChatFederationService {
	private dedup = new Map<string, number>();
	private secret: string;
	private peers: string[] = [];

	constructor(
		private chatService: ChatService,
		secret: string,
	) {
		this.secret = secret;
	}

	getPeers(): string[] {
		return this.peers;
	}

	setPeers(peers: string[]): void {
		this.peers = peers;
	}

	/**
	 * HMAC-SHA256 over the signed fields. JSON-encoded rather than joined on a
	 * separator: `text` is attacker-controlled, so a separator it can contain
	 * would let two different messages produce the same signing input.
	 */
	sign(payload: FederatedChatMessage): string {
		const signInput = JSON.stringify([
			payload.username,
			payload.instance,
			payload.text,
			payload.ts,
			payload.lobby ?? false,
			payload.toUsername || "",
			payload.roomGlobalId || "",
			payload.roomName || "",
		]);
		return crypto
			.createHmac("sha256", this.secret)
			.update(signInput)
			.digest("hex");
	}

	verify(payload: FederatedChatMessage, signature: string): boolean {
		const expected = Buffer.from(this.sign(payload));
		const given = Buffer.from(String(signature || ""));
		return (
			expected.length === given.length &&
			crypto.timingSafeEqual(expected, given)
		);
	}

	/**
	 * A signature proves the sender knew the shared secret, not *when* it minted
	 * the message: without a freshness bound a captured message stays replayable
	 * forever once it ages out of the dedup window.
	 */
	isFresh(ts: number, now: number = Date.now()): boolean {
		if (!Number.isFinite(ts)) return false;
		return ts <= now + MAX_CLOCK_SKEW_MS && ts >= now - MAX_MESSAGE_AGE_MS;
	}

	/**
	 * `instance` is self-asserted by the sender and the HMAC secret is shared by
	 * the whole federation, so a valid signature only proves "some peer", not
	 * "this peer". Requiring the claimed origin to be a peer we already know at
	 * least keeps hosts outside the federation out. Per-peer secrets would be
	 * the real fix.
	 */
	isKnownInstance(instance: string): boolean {
		const claimed = String(instance || "").toLowerCase();
		if (!claimed) return false;
		return this.peers.some((peer) => {
			try {
				const host = new URL(peer).hostname.toLowerCase();
				// Peers are full origins; `instance` may be the bare first label.
				return host === claimed || host.split(".")[0] === claimed;
			} catch {
				return false;
			}
		});
	}

	/** Accept a federated message and relay it locally if not a duplicate. */
	ingest(payload: FederatedChatMessage): boolean {
		// Always recompute: `id` rides outside the signature, so a sender-chosen
		// one could pre-seed the dedup map and silently suppress a later message.
		const id = this.computeId(payload);
		if (this.isSeen(id)) return false;

		this.markSeen(id);
		this.chatService.relayFederatedMessage(
			`${payload.username}@${payload.instance}`,
			payload.text,
			payload.ts,
			payload.lobby ?? true,
			payload.toUsername,
			payload.roomGlobalId,
		);
		return true;
	}

	/**
	 * Fan out a message to federated peers. With `targetPeer`, delivers to that
	 * one origin only (cross-instance DM); otherwise broadcasts to every known
	 * peer (lobby message).
	 */
	async fanout(
		payload: FederatedChatMessage,
		targetPeer?: string,
	): Promise<void> {
		const signature = this.sign(payload);
		const body = JSON.stringify({
			...payload,
			id: payload.id || this.computeId(payload),
		});

		const targets = targetPeer ? [targetPeer] : this.peers;
		await Promise.allSettled(
			targets.map((peer) =>
				fetch(`${peer}/api/chat/federated/inbound`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Chat-Signature": signature,
					},
					body,
				}).then((r) => {
					if (!r.ok) throw new Error(`HTTP ${r.status}`);
				}),
			),
		);
	}

	private computeId(payload: FederatedChatMessage): string {
		return crypto
			.createHash("sha256")
			.update(
				JSON.stringify([
					payload.username,
					payload.instance,
					payload.text,
					payload.ts,
					payload.roomGlobalId || "",
				]),
			)
			.digest("hex");
	}

	private isSeen(id: string): boolean {
		const now = Date.now();
		this.purgeSeen(now);
		return this.dedup.has(id);
	}

	private markSeen(id: string): void {
		this.dedup.set(id, Date.now() + DEDUP_WINDOW_MS);
	}

	private purgeSeen(now: number): void {
		for (const [key, expiresAt] of this.dedup) {
			if (expiresAt < now) this.dedup.delete(key);
		}
	}
}

export function createChatFederationService(
	chatService: ChatService,
	secret: string,
): ChatFederationService {
	return new ChatFederationService(chatService, secret);
}
