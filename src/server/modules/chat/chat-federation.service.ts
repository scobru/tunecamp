import crypto from "crypto";
import type { ChatService } from "./chat.service.js";
import type { RemoteActor } from "../../core/database.types.js";

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
/** Backoff between outbound delivery attempts. Short: see `scheduleRetry`. */
export const RETRY_BACKOFF_MS = [2_000, 8_000, 30_000];

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

export interface ChatFederationDatabase {
	getSetting(key: string): string | undefined;
	getRemoteActor(uri: string): RemoteActor | undefined;
	upsertRemoteActor(actor: Partial<RemoteActor>): void;
}

export class ChatFederationService {
	private dedup = new Map<string, number>();
	private retryTimers = new Set<NodeJS.Timeout>();
	private peers: string[] = [];
	private publicKeyCache = new Map<string, string>();

	constructor(
		private chatService: ChatService,
		private db: ChatFederationDatabase,
	) {}

	getPeers(): string[] {
		return this.peers;
	}

	setPeers(peers: string[]): void {
		this.peers = peers;
	}

	/**
	 * RSA-SHA256 signature (asymmetric) over the JSON-encoded payload fields,
	 * made with this instance's own site key.
	 *
	 * Throws when that key is missing or unusable, because there is nothing
	 * left to fall back to. The only alternative we ever had was a secret
	 * shared by the whole federation, and `verify` stopped accepting it: it
	 * proved "some peer we already know", never which one. Signing with it
	 * produced bytes every peer refuses — a message that looked sent and was
	 * dropped at the far end. Failing here says so at the point of failure.
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
		const privateKey = this.db.getSetting("site_private_key");
		if (!privateKey) {
			throw new Error(
				"No site_private_key: cannot sign a federated chat message. " +
					"Every instance generates one at boot; until it exists, federation is off.",
			);
		}
		const signer = crypto.createSign("sha256");
		signer.update(signInput);
		return signer.sign(privateKey, "hex");
	}

	async verify(payload: FederatedChatMessage, signature: string): Promise<boolean> {
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

		// Asymmetric only. The legacy HMAC fallback was removed: that secret is
		// shared by the whole federation, so it proves "some peer we already
		// know", never *which* one — any holder could sign as any other host
		// simply by being a peer. Every instance generates a site keypair at
		// boot (`generateKeysForAllArtists`) and publishes it on its site actor,
		// so a peer with no resolvable key is misconfigured or unreachable, and
		// a message we cannot attribute is refused rather than half-trusted.
		const publicKey = await this.resolvePeerPublicKey(payload.instance);
		if (!publicKey) {
			console.error(`❌ No published key for ${payload.instance}; refusing unattributable message`);
			return false;
		}

		try {
			const verifier = crypto.createVerify("sha256");
			verifier.update(signInput);
			return verifier.verify(publicKey, signature, "hex");
		} catch (e: any) {
			console.error(`❌ Asymmetric signature verification failed for ${payload.instance}:`, e.message);
			return false;
		}
	}

	private getPeerUrl(instance: string): string | null {
		const claimed = String(instance || "").toLowerCase();
		if (!claimed) return null;
		for (const peer of this.peers) {
			try {
				const url = new URL(peer);
				const host = url.hostname.toLowerCase();
				if (host === claimed || host.split(".")[0] === claimed) {
					return url.origin;
				}
			} catch {
				// ignore
			}
		}
		return null;
	}

	async resolvePeerPublicKey(instance: string): Promise<string | null> {
		const origin = this.getPeerUrl(instance);
		if (!origin) return null;

		// Check in-memory cache first
		if (this.publicKeyCache.has(origin)) {
			return this.publicKeyCache.get(origin) || null;
		}

		const actorId = await this.fetchNodeInfoActorId(origin);
		for (const candidate of this.actorIdCandidates(origin, actorId)) {
			const cachedActor = this.db.getRemoteActor(candidate);
			if (cachedActor?.public_key) {
				this.publicKeyCache.set(origin, cachedActor.public_key);
				return cachedActor.public_key;
			}
			const pubKey = await this.fetchActorPublicKey(candidate);
			if (pubKey) {
				this.db.upsertRemoteActor({
					uri: candidate,
					type: "Application",
					public_key: pubKey,
				});
				this.publicKeyCache.set(origin, pubKey);
				return pubKey;
			}
		}

		return null;
	}

	/**
	 * Actor URIs to try, best first.
	 *
	 * A peer whose `publicUrl` is misconfigured advertises a NodeInfo `actorId`
	 * on some other host, which then 404s — and an unresolved key means every
	 * message from that peer is refused. So when the advertised actorId is
	 * cross-origin, try its path on the peer's own origin first: that
	 * keeps the key we trust for `instance` coming from `instance` itself rather
	 * than from a host it merely names. The advertised URI is still tried after,
	 * since a peer may genuinely serve its actor elsewhere.
	 */
	private actorIdCandidates(origin: string, actorId: string | null): string[] {
		const candidates: string[] = [];
		if (actorId) {
			let parsed: URL | null = null;
			try {
				parsed = new URL(actorId);
			} catch {
				// Not a URL: unusable as-is, and there is no path to rewrite.
			}
			if (parsed?.origin === origin) {
				candidates.push(actorId);
			} else if (parsed) {
				candidates.push(`${origin}${parsed.pathname}`, actorId);
			}
		}
		// Legacy guess, for a peer that advertises no actorId at all.
		candidates.push(`${origin}/users/site`);
		return [...new Set(candidates)];
	}

	private async fetchNodeInfoActorId(origin: string): Promise<string | null> {
		try {
			const wellKnownRes = await fetch(`${origin}/.well-known/nodeinfo`);
			if (wellKnownRes.ok) {
				const wellKnown = await wellKnownRes.json() as any;
				const nodeInfoLink = wellKnown.links?.find((l: any) => l.rel?.includes("nodeinfo"));
				if (nodeInfoLink?.href) {
					const niRes = await fetch(nodeInfoLink.href);
					if (niRes.ok) {
						const ni = await niRes.json() as any;
						if (ni.metadata?.actorId) return ni.metadata.actorId;
					}
				}
			}
		} catch (e) {
			// ignore
		}

		try {
			const res = await fetch(`${origin}/api/v1/instance/nodeinfo/2.0`);
			if (res.ok) {
				const ni = await res.json() as any;
				if (ni.software?.name === "tunecamp" && ni.metadata?.actorId) {
					return ni.metadata.actorId;
				}
			}
		} catch (e) {
			// ignore
		}

		return null;
	}

	private async fetchActorPublicKey(actorId: string): Promise<string | null> {
		try {
			const res = await fetch(actorId, {
				headers: {
					"Accept": "application/activity+json, application/ld+json, application/json",
				},
			});
			if (res.ok) {
				const actor = await res.json() as any;
				return actor.publicKey?.publicKeyPem || null;
			}
		} catch (e: any) {
			console.log(`ℹ️ Peer public key fetch unavailable for ${actorId}: ${e.message}`);
		}
		return null;
	}

	/**
	 * A signature proves which peer minted the message, not *when*: without a
	 * freshness bound a captured message stays replayable forever once it ages
	 * out of the dedup window.
	 */
	isFresh(ts: number, now: number = Date.now()): boolean {
		if (!Number.isFinite(ts)) return false;
		return ts <= now + MAX_CLOCK_SKEW_MS && ts >= now - MAX_MESSAGE_AGE_MS;
	}

	/**
	 * `instance` is self-asserted by the sender, and the signature already pins
	 * the message to the host that published the key. This is the second, cheap
	 * check: it keeps a stranger who signs correctly for their own host from
	 * being relayed at all unless we already peer with them.
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
	 *
	 * Never rejects: callers in `chat.ws.ts` fire this without awaiting, so a
	 * rejection would surface as an unhandled one and take the process down.
	 * An unsignable message is a local misconfiguration — it must not cost the
	 * sender their own delivery, which already happened before we were called.
	 */
	async fanout(
		payload: FederatedChatMessage,
		targetPeer?: string,
	): Promise<void> {
		let signature: string;
		try {
			signature = this.sign(payload);
		} catch (e: any) {
			console.error(`❌ Chat federation disabled: ${e?.message || e}`);
			return;
		}
		const body = JSON.stringify({
			...payload,
			id: payload.id || this.computeId(payload),
		});

		const targets = targetPeer ? [targetPeer] : this.peers;
		await Promise.allSettled(
			targets.map((peer) => this.deliver(peer, body, signature, payload.ts, 0)),
		);
	}

	/**
	 * POST one message to one peer, retrying a transient failure.
	 *
	 * A permanent answer is not retried: a 4xx other than 429 means the peer
	 * refused this message on its merits (bad signature, unknown instance,
	 * stale `ts`), and nothing about resending it unchanged would help.
	 */
	private async deliver(
		peer: string,
		body: string,
		signature: string,
		ts: number,
		attempt: number,
	): Promise<void> {
		try {
			const res = await fetch(`${peer}/api/chat/federated/inbound`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Chat-Signature": signature,
				},
				body,
			});
			if (res.ok) return;
			if (res.status < 500 && res.status !== 429) {
				console.warn(`⚠️ Chat delivery to ${peer} refused: HTTP ${res.status}`);
				return;
			}
			this.scheduleRetry(peer, body, signature, ts, attempt, `HTTP ${res.status}`);
		} catch (e: any) {
			this.scheduleRetry(peer, body, signature, ts, attempt, e?.message || String(e));
		}
	}

	/**
	 * Retries are bounded by the receiver's own freshness window, not by an
	 * attempt count alone: a peer refuses anything older than
	 * `MAX_MESSAGE_AGE_MS`, and a retry carries the original signed `ts`, so
	 * once that deadline passes there is no delay at which the message could
	 * still be accepted. That is also why there is no durable queue here — a
	 * message surviving a restart would already be too stale to deliver.
	 */
	private scheduleRetry(
		peer: string,
		body: string,
		signature: string,
		ts: number,
		attempt: number,
		reason: string,
	): void {
		const delay = RETRY_BACKOFF_MS[attempt];
		if (delay === undefined || Date.now() + delay >= ts + MAX_MESSAGE_AGE_MS) {
			console.warn(
				`⚠️ Chat delivery to ${peer} abandoned after ${attempt + 1} attempt(s): ${reason}`,
			);
			return;
		}
		const timer = setTimeout(() => {
			this.retryTimers.delete(timer);
			void this.deliver(peer, body, signature, ts, attempt + 1);
		}, delay);
		// Never keep the process alive for a chat retry.
		timer.unref?.();
		this.retryTimers.add(timer);
	}

	/** Drop scheduled retries. For shutdown, and for tests that must not leak timers. */
	stopRetries(): void {
		for (const timer of this.retryTimers) clearTimeout(timer);
		this.retryTimers.clear();
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
	db: ChatFederationDatabase,
): ChatFederationService {
	return new ChatFederationService(chatService, db);
}
