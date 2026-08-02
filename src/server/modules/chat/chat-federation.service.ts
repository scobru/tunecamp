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
}

interface SeenKey {
	key: string;
	expiresAt: number;
}

export class ChatFederationService {
	private dedup = new Map<string, SeenKey>();
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

	/** HMAC-SHA256 over `username|instance|text|ts|lobby|toUsername`. */
	sign(payload: FederatedChatMessage): string {
		const signInput = [
			payload.username,
			payload.instance,
			payload.text,
			String(payload.ts),
			String(payload.lobby ?? false),
			payload.toUsername || "",
		].join("|");
		return crypto
			.createHmac("sha256", this.secret)
			.update(signInput)
			.digest("hex");
	}

	verify(payload: FederatedChatMessage, signature: string): boolean {
		const expected = this.sign(payload);
		return expected === signature;
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
		);
		return true;
	}

	/** Fan out a local lobby message to known federated peers. */
	async fanout(payload: FederatedChatMessage): Promise<void> {
		const signature = this.sign(payload);
		const body = JSON.stringify({
			...payload,
			id: payload.id || this.computeId(payload),
		});

		await Promise.allSettled(
			this.peers.map((peer) =>
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
				`${payload.username}|${payload.instance}|${payload.text}|${payload.ts}`,
			)
			.digest("hex");
	}

	private isSeen(id: string): boolean {
		const now = Date.now();
		this.purgeSeen(now);
		return this.dedup.has(id);
	}

	private markSeen(id: string): void {
		this.dedup.set(id, { key: id, expiresAt: Date.now() + DEDUP_WINDOW_MS });
	}

	private purgeSeen(now: number): void {
		for (const [key, entry] of this.dedup.entries()) {
			if (entry.expiresAt < now) this.dedup.delete(key);
		}
	}
}

export function createChatFederationService(
	chatService: ChatService,
	secret: string,
): ChatFederationService {
	return new ChatFederationService(chatService, secret);
}
