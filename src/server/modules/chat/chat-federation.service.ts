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
	private secret: string;
	private peers: string[] = [];
	private publicKeyCache = new Map<string, string>();

	constructor(
		private chatService: ChatService,
		private db: ChatFederationDatabase,
		secret = "",
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
	 * RSA-SHA256 signature (asymmetric) over the JSON-encoded payload fields.
	 *
	 * The HMAC branch is a last resort for an instance whose site keypair is
	 * missing or unusable. Peers no longer accept it — `verify` is asymmetric
	 * only — so it exists to keep the send path from throwing, not to federate:
	 * such a message will be refused at the far end.
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
		if (privateKey) {
			try {
				const signer = crypto.createSign("sha256");
				signer.update(signInput);
				return signer.sign(privateKey, "hex");
			} catch (e) {
				console.error("❌ Failed to sign message asymetrically, falling back to HMAC:", e);
			}
		}
		return crypto
			.createHmac("sha256", this.secret || "")
			.update(signInput)
			.digest("hex");
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
	 * on some other host, which then 404s — and an unresolved key silently
	 * downgrades verification to the shared HMAC secret. So when the advertised
	 * actorId is cross-origin, try its path on the peer's own origin first: that
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
	 * A signature proves the sender knew the shared secret, not *when* it minted
	 * the message: without a freshness bound a captured message stays replayable
	 * forever once it ages out of the dedup window.
	 */
	isFresh(ts: number, now: number = Date.now()): boolean {
		if (!Number.isFinite(ts)) return false;
		return ts <= now + MAX_CLOCK_SKEW_MS && ts >= now - MAX_MESSAGE_AGE_MS;
	}

	/**
	 * `instance` is self-asserted by the sender. For a peer that publishes a key
	 * the signature already pins the message to that host; for one still on the
	 * shared HMAC secret it only proves "some peer", so requiring the claimed
	 * origin to be a peer we already know keeps hosts outside the federation out.
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
	db: ChatFederationDatabase,
	secret = "",
): ChatFederationService {
	return new ChatFederationService(chatService, db, secret);
}
