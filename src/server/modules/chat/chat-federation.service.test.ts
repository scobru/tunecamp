import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import {
	createChatFederationService,
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

	beforeEach(() => {
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
});
