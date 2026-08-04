import crypto from "crypto";
import type { ChatService } from "./chat.service.js";

// ponytail: dedup stays in-process; if this ever runs clustered, move to Redis
// or a shared SQLite table. For a single Node process the Set is correct and
// cheaper than a DB round-trip on every message.
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

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

	/** Accept a federated message and relay it locally if not a duplicate. */
	ingest(payload: FederatedChatMessage): boolean {
		const id = payload.id || this.computeId(payload);
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
