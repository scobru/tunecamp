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

describe("ChatFederationService", () => {
	let service: ReturnType<typeof createChatFederationService>;
	let fake: ReturnType<typeof fakeChatService>;

	beforeEach(() => {
		fake = fakeChatService();
		service = createChatFederationService(fake as any, "shared-secret");
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
			expect(service.sign(payload)).toHaveLength(64);
			expect(service.sign(payload)).toBe(service.sign(payload));
		});

		it("verifies a matching signature and rejects a tampered one", () => {
			const payload: FederatedChatMessage = {
				username: "alice",
				instance: "a.example.com",
				text: "hello",
				ts: 1000,
			};
			const sig = service.sign(payload);
			expect(service.verify(payload, sig)).toBe(true);
			expect(service.verify({ ...payload, text: "bye" }, sig)).toBe(false);
			expect(service.verify(payload, "bad")).toBe(false);
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

			// Advance time past the 5-minute window.
			jest.spyOn(Date, "now").mockReturnValue(Date.now() + 6 * 60 * 1000);

			expect(service.ingest(payload)).toBe(true);
			expect(fake.relayFederatedMessage).toHaveBeenCalledTimes(2);
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
