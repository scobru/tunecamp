import { describe, expect, it, jest, beforeEach, afterEach } from "@jest/globals";
import {
	createChatFederationService,
	MAX_MESSAGE_AGE_MS,
	RETRY_BACKOFF_MS,
	type FederatedChatMessage,
} from "./chat-federation.service.js";

function fakeChatService() {
	return {
		relayFederatedMessage: jest.fn().mockReturnValue(true),
	};
}

import crypto from "crypto";

describe("ChatFederationService", () => {
	let service: ReturnType<typeof createChatFederationService>;
	let fake: ReturnType<typeof fakeChatService>;
	let mockDb: any;
	const realFetch = global.fetch;

	beforeEach(() => {
		// `verify` resolves the peer's key over the network whenever the DB has no
		// cached actor. Unstubbed, that is a real DNS lookup per assertion: fast
		// enough alone to look harmless, slow enough under a parallel run to make
		// the suite flaky. Tests that want a peer key seed `mockDb.remoteActors`.
		global.fetch = jest.fn(async () => {
			throw new Error("ENOTFOUND");
		}) as any;

		fake = fakeChatService();
		mockDb = {
			settings: {} as Record<string, string>,
			remoteActors: {} as Record<string, any>,
			getSetting(key: string) { return this.settings[key]; },
			getRemoteActor(uri: string) { return this.remoteActors[uri]; },
			upsertRemoteActor(actor: any) { this.remoteActors[actor.uri] = { ...this.remoteActors[actor.uri], ...actor }; }
		};
		service = createChatFederationService(fake as any, mockDb, "shared-secret");
		service.setPeers(["https://a.example.com", "https://b.example.com"]);
	});

	afterEach(() => {
		global.fetch = realFetch;
		jest.restoreAllMocks();
	});

	describe("sign / verify", () => {
		it("produces a stable signature for the same payload", () => {
			const payload: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "hello",
				ts: 1000,
				lobby: true,
			};
			// Since keys are not set, it falls back to HMAC (which is a 64-char hex string)
			expect(service.sign(payload)).toHaveLength(64);
			expect(service.sign(payload)).toBe(service.sign(payload));
		});

		it("verifies a matching signature and rejects a tampered one", async () => {
			// Round-tripping needs a real keypair now that verify is asymmetric
			// only: sign with ours, publish the matching key as the peer's.
			const keys = crypto.generateKeyPairSync("rsa", {
				modulusLength: 2048,
				publicKeyEncoding: { type: "pkcs1", format: "pem" },
				privateKeyEncoding: { type: "pkcs1", format: "pem" },
			});
			mockDb.settings["site_private_key"] = keys.privateKey;
			mockDb.remoteActors["https://a.example.com/users/site"] = {
				uri: "https://a.example.com/users/site",
				public_key: keys.publicKey,
			};

			const payload: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "hello",
				ts: 1000,
			};
			const sig = service.sign(payload);
			expect(await service.verify(payload, sig)).toBe(true);
			expect(await service.verify({ ...payload, text: "bye" }, sig)).toBe(false);
			expect(await service.verify(payload, "bad")).toBe(false);
		});

		it("does not let separator characters in text forge another payload", () => {
			const honest: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "hi",
				ts: 1000,
				lobby: false,
				toUsername: "bob",
			};
			// Same characters, different field boundaries: must not sign alike.
			const forged: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: 'hi","1000","false","bob',
				ts: 1000,
				lobby: false,
			};
			expect(service.sign(forged)).not.toBe(service.sign(honest));
		});
	});

	describe("asymmetric sign / verify", () => {
		let peerPublicKey: string;
		let peerPrivateKey: string;

		beforeEach(() => {
			const keys = crypto.generateKeyPairSync("rsa", {
				modulusLength: 2048,
				publicKeyEncoding: { type: "pkcs1", format: "pem" },
				privateKeyEncoding: { type: "pkcs1", format: "pem" },
			});
			peerPublicKey = keys.publicKey;
			peerPrivateKey = keys.privateKey;
		});

		it("signs with site private key and verifies with peer public key", async () => {
			// Local signs with our key
			mockDb.settings["site_private_key"] = peerPrivateKey;

			// Seed peer's public key in the db cache so no network call is needed
			mockDb.remoteActors["https://a.example.com/users/site"] = {
				uri: "https://a.example.com/users/site",
				public_key: peerPublicKey,
			};

			const payload: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "hello asymmetric",
				ts: 1000,
			};

			const sig = service.sign(payload);
			// Verification should succeed using asymmetric crypto
			expect(await service.verify(payload, sig)).toBe(true);
			// Tampered payload should fail
			expect(await service.verify({ ...payload, text: "forged" }, sig)).toBe(false);
		});

		it("refuses a shared-secret signature once the peer publishes a key", async () => {
			mockDb.remoteActors["https://a.example.com/users/site"] = {
				uri: "https://a.example.com/users/site",
				public_key: peerPublicKey,
			};

			const payload: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "downgrade attempt",
				ts: 1000,
			};

			// A well-formed HMAC from anyone holding the federation-wide secret.
			const hmac = crypto
				.createHmac("sha256", "shared-secret")
				.update(
					JSON.stringify([
						payload.username,
						payload.instance,
						payload.text,
						payload.ts,
						false,
						"",
						"",
						"",
					]),
				)
				.digest("hex");

			expect(await service.verify(payload, hmac)).toBe(false);
		});

		it("refuses a shared-secret signature from a peer with no published key", async () => {
			const payload: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "legacy peer",
				ts: 1000,
			};
			// No site_private_key and no cached actor, so sign() takes the HMAC
			// path — which no peer accepts any more. The secret is shared by the
			// whole federation, so honouring it would let any peer speak as any
			// other; an unattributable message is refused instead.
			expect(await service.verify(payload, service.sign(payload))).toBe(false);
		});

		it("refuses a message from a peer whose key cannot be resolved", async () => {
			const payload: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "unreachable peer",
				ts: 1000,
			};
			// Signed correctly by a real key, but the peer publishes none we can
			// reach: unverifiable is refused, not trusted.
			const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
			const signer = crypto.createSign("sha256");
			signer.update(JSON.stringify([payload.username, payload.instance, payload.text, payload.ts, false, "", "", ""]));
			expect(await service.verify(payload, signer.sign(privateKey, "hex"))).toBe(false);
		});
	});

	describe("resolvePeerPublicKey", () => {
		const PEM = "-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----\n";

		/** Serves NodeInfo advertising `actorId`, and an actor only at `keyAt`. */
		function stubPeer(actorId: string, keyAt: string) {
			global.fetch = jest.fn(async (url: any) => {
				const u = String(url);
				if (u.endsWith("/.well-known/nodeinfo")) {
					return {
						ok: true,
						json: async () => ({
							links: [{ rel: "http://nodeinfo.diaspora.software/ns/schema/2.0", href: `${new URL(u).origin}/nodeinfo/2.0` }],
						}),
					};
				}
				if (u.endsWith("/nodeinfo/2.0")) {
					return { ok: true, json: async () => ({ metadata: { actorId } }) };
				}
				if (u === keyAt) {
					return { ok: true, json: async () => ({ publicKey: { publicKeyPem: PEM } }) };
				}
				return { ok: false, status: 404, json: async () => ({}) };
			}) as any;
		}

		it("uses the advertised actorId when it is on the peer's own origin", async () => {
			stubPeer("https://a.example.com/users/label", "https://a.example.com/users/label");
			expect(await service.resolvePeerPublicKey("a.example.com")).toBe(PEM);
		});

		it("retries the advertised path on the peer origin when actorId is cross-origin", async () => {
			// The peer's `publicUrl` is misconfigured: NodeInfo points at www.other,
			// which 404s, but the actor is served on the peer origin itself. Without
			// the rewrite this returns null and verification silently downgrades to
			// the shared HMAC secret.
			stubPeer("https://www.other.example/users/label", "https://a.example.com/users/label");
			expect(await service.resolvePeerPublicKey("a.example.com")).toBe(PEM);
		});

		it("still accepts a cross-origin actor that really does serve the key", async () => {
			stubPeer("https://www.other.example/users/label", "https://www.other.example/users/label");
			expect(await service.resolvePeerPublicKey("a.example.com")).toBe(PEM);
		});

		it("caches the key under the URI it was actually fetched from", async () => {
			stubPeer("https://www.other.example/users/label", "https://a.example.com/users/label");
			await service.resolvePeerPublicKey("a.example.com");
			expect(mockDb.remoteActors["https://a.example.com/users/label"].public_key).toBe(PEM);
		});

		it("returns null when no candidate serves a key", async () => {
			stubPeer("https://www.other.example/users/label", "https://nowhere.example/users/label");
			expect(await service.resolvePeerPublicKey("a.example.com")).toBe(null);
		});

		it("returns null for an instance that is not a known peer", async () => {
			stubPeer("https://evil.example/users/label", "https://evil.example/users/label");
			expect(await service.resolvePeerPublicKey("evil.example")).toBe(null);
		});
	});

	describe("ingest", () => {
		it("relays a new lobby message locally and returns true", () => {
			const payload: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "federated hello",
				ts: 2000,
				lobby: true,
			};
			expect(service.ingest(payload)).toBe(true);
			expect(fake.relayFederatedMessage).toHaveBeenCalledWith(
				"alice@a.example.com",
				"federated hello",
				2000,
				true,
				undefined,
				undefined,
			);
		});

		it("relays a DM to the named local recipient", () => {
			const payload: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "secret ciphertext",
				ts: 2001,
				lobby: false,
				toUsername: "bob",
			};
			expect(service.ingest(payload)).toBe(true);
			expect(fake.relayFederatedMessage).toHaveBeenCalledWith(
				"alice@a.example.com",
				"secret ciphertext",
				2001,
				false,
				"bob",
				undefined,
			);
		});

		it("relays a room message by global id, not by local room id", () => {
			const payload: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "hello room",
				ts: 2002,
				lobby: false,
				roomGlobalId: "11111111-2222-3333-4444-555555555555",
				roomName: "general",
			};
			expect(service.ingest(payload)).toBe(true);
			expect(fake.relayFederatedMessage).toHaveBeenCalledWith(
				"alice@a.example.com",
				"hello room",
				2002,
				false,
				undefined,
				"11111111-2222-3333-4444-555555555555",
			);
		});

		it("deduplicates the same message within the window", () => {
			const payload: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "dup",
				ts: 3000,
			};
			expect(service.ingest(payload)).toBe(true);
			expect(fake.relayFederatedMessage).toHaveBeenCalledTimes(1);
			expect(service.ingest(payload)).toBe(false);
		});

		it("accepts the same message after the dedup window expires", () => {
			const payload: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "later",
				ts: 4000,
			};
			expect(service.ingest(payload)).toBe(true);

			// Advance time past the dedup window (message age + clock skew).
			jest.spyOn(Date, "now").mockReturnValue(Date.now() + 7 * 60 * 1000);

			expect(service.ingest(payload)).toBe(true);
			expect(fake.relayFederatedMessage).toHaveBeenCalledTimes(2);
		});
	});

	describe("isFresh", () => {
		it("accepts a message minted now and one within the age window", () => {
			const now = 10 * 60 * 1000;
			expect(service.isFresh(now, now)).toBe(true);
			expect(service.isFresh(now - 4 * 60 * 1000, now)).toBe(true);
		});

		it("rejects a message older than the age window", () => {
			const now = 10 * 60 * 1000;
			expect(service.isFresh(now - 6 * 60 * 1000, now)).toBe(false);
		});

		it("tolerates a small clock skew but rejects a far-future timestamp", () => {
			const now = 10 * 60 * 1000;
			expect(service.isFresh(now + 30 * 1000, now)).toBe(true);
			expect(service.isFresh(now + 5 * 60 * 1000, now)).toBe(false);
		});

		it("rejects a missing or non-numeric timestamp", () => {
			expect(service.isFresh(Number.NaN)).toBe(false);
			expect(service.isFresh(0)).toBe(false);
		});
	});

	describe("isKnownInstance", () => {
		it("matches a peer by full hostname and by bare first label", () => {
			expect(service.isKnownInstance("a.example.com")).toBe(true);
			expect(service.isKnownInstance("A.EXAMPLE.COM")).toBe(true);
			expect(service.isKnownInstance("b")).toBe(true);
		});

		it("rejects an instance that is not among the known peers", () => {
			expect(service.isKnownInstance("evil.example.com")).toBe(false);
			expect(service.isKnownInstance("")).toBe(false);
		});
	});

	describe("dedup id", () => {
		it("ignores a sender-supplied id and recomputes it from the signed fields", () => {
			const payload: FederatedChatMessage = {
				id: "attacker-chosen-id",
				username: "alice",
				instance: "a.example.com",
				text: "unsuppressable",
				ts: 6000,
			};
			expect(service.ingest(payload)).toBe(true);
			// Same signed fields under a different claimed id: still a duplicate.
			expect(service.ingest({ ...payload, id: "another-id" })).toBe(false);
		});
	});

	describe("fanout", () => {
		it("POSTs signed payloads to every known peer", async () => {
			const fetchMock = jest.fn(async () => ({ ok: true })) as any;
			global.fetch = fetchMock;

			const payload: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "broadcast",
				ts: 5000,
				lobby: true,
			};

			await service.fanout(payload);

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(fetchMock).toHaveBeenCalledWith(
				"https://a.example.com/api/chat/federated/inbound",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						"Content-Type": "application/json",
						"X-Chat-Signature": expect.any(String),
					}),
					body: expect.any(String),
				}),
			);

			const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
			expect(body.username).toBe("alice");
			expect(body.instance).toBe("a.example.com");
			expect(body.text).toBe("broadcast");
			expect(body.id).toHaveLength(64);
		});

		it("does not fail the whole batch if one peer is down", async () => {
			const fetchMock = jest.fn(async () => ({ ok: true })) as any;
			fetchMock
				.mockImplementationOnce(async () => ({ ok: true }))
				.mockImplementationOnce(async () => {
					throw new Error("ECONNREFUSED");
				});
			global.fetch = fetchMock;

			const payload: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "resilient",
				ts: 5001,
			};

			await expect(service.fanout(payload)).resolves.toBeUndefined();
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});
	});

	describe("fanout retries", () => {
		afterEach(() => {
			service.stopRetries();
			jest.useRealTimers();
		});

		/** Fresh enough that the receiver's freshness window is not the limit. */
		function livePayload(text: string): FederatedChatMessage {
			return {
				username: "alice",
				instance: "a.example.com",
				text,
				ts: Date.now(),
				lobby: false,
			};
		}

		it("retries a transient failure until the peer accepts", async () => {
			jest.useFakeTimers();
			const fetchMock = jest
				.fn<any>()
				.mockImplementationOnce(async () => {
					throw new Error("ECONNREFUSED");
				})
				.mockImplementationOnce(async () => ({ ok: true }));
			global.fetch = fetchMock as any;

			await service.fanout(livePayload("peer restarting"), "https://a.example.com");
			expect(fetchMock).toHaveBeenCalledTimes(1);

			await jest.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0]);
			expect(fetchMock).toHaveBeenCalledTimes(2);

			// Accepted on the retry, so nothing further is scheduled.
			await jest.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[1]);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});

		it("retries a 5xx but not a refusal the peer would repeat", async () => {
			jest.useFakeTimers();
			const fetchMock = jest.fn<any>(async () => ({ ok: false, status: 503 }));
			global.fetch = fetchMock as any;

			await service.fanout(livePayload("peer overloaded"), "https://a.example.com");
			await jest.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0]);
			expect(fetchMock).toHaveBeenCalledTimes(2);

			service.stopRetries();
			fetchMock.mockClear();
			fetchMock.mockImplementation(async () => ({ ok: false, status: 401 }));

			// A bad signature is not a transient condition: resending the same
			// bytes cannot change the answer.
			await service.fanout(livePayload("bad signature"), "https://a.example.com");
			await jest.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0]);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("does not retry a message already too stale for the peer to accept", async () => {
			jest.useFakeTimers();
			const fetchMock = jest.fn<any>(async () => {
				throw new Error("ECONNREFUSED");
			});
			global.fetch = fetchMock as any;

			// Retries carry the original signed `ts`, so past the freshness
			// window every attempt would be refused as stale. Give up instead.
			const stale: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "long gone",
				ts: Date.now() - MAX_MESSAGE_AGE_MS - 1000,
			};

			await service.fanout(stale, "https://a.example.com");
			await jest.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0] * 10);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});
	});
});
