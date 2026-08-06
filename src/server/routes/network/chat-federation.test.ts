import { describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import crypto from "crypto";
import { createChatFederationRoutes } from "./chat-federation.js";
import { createChatService } from "../../modules/chat/chat.service.js";
import { createChatFederationService as realCreateChatFederationService } from "../../modules/chat/chat-federation.service.js";

const dummyDb = {
	getSetting: () => undefined,
	getRemoteActor: () => undefined,
	upsertRemoteActor: () => {}
};

function createChatFederationService(chatService: any, secret: string) {
	return realCreateChatFederationService(chatService, dummyDb, secret);
}

// Inbound now requires a fresh timestamp, so payloads are dated at call time
// instead of using fixed constants.
const NOW = Date.now();

function buildApp(secret = "shared-secret", peers = ["https://a.example.com"]) {
	const db = new Database(":memory:");
	db.exec(`CREATE TABLE peer_chat_messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT NOT NULL,
		message TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)`);
	const chatService = createChatService({ db } as any);
	const federation = createChatFederationService(chatService, secret);

	const app = express();
	app.use(express.json());
	app.use(
		"/api/chat/federated",
		createChatFederationRoutes({
			database: { db } as any,
			chatService,
			chatFederationService: federation,
			config: { chatFederationSecret: secret } as any,
			federatedDiscoveryService: { getPeers: () => peers },
		} as any),
	);

	return { app, db, chatService, federation };
}

describe("Chat federation routes", () => {
	describe("POST /api/chat/federated/inbound", () => {
		it("accepts a valid signed lobby message and relays it locally", async () => {
			const { app, chatService } = buildApp();
			const spy = jest
				.spyOn(chatService, "relayFederatedMessage")
				.mockReturnValue(true);

			const payload = {
				username: "alice",
				instance: "a.example.com",
				text: "hello from federation",
				ts: NOW,
				lobby: true,
			};
			const signature = createChatFederationService(
				chatService,
				"shared-secret",
			).sign(payload as any);

			const res = await request(app)
				.post("/api/chat/federated/inbound")
				.set("Content-Type", "application/json")
				.set("X-Chat-Signature", signature)
				.send(payload);

			expect(res.status).toBe(202);
			expect(res.body.accepted).toBe(true);
			expect(spy).toHaveBeenCalledWith(
				"alice@a.example.com",
				"hello from federation",
				NOW,
				true,
				undefined,
				undefined,
			);
		});

		it("accepts a signed DM and relays it to the named recipient", async () => {
			const { app, chatService } = buildApp();
			const spy = jest
				.spyOn(chatService, "relayFederatedMessage")
				.mockReturnValue(true);

			const payload = {
				username: "alice",
				instance: "a.example.com",
				text: "ciphertext-blob",
				ts: NOW,
				lobby: false,
				toUsername: "bob",
			};
			const signature = createChatFederationService(
				chatService,
				"shared-secret",
			).sign(payload as any);

			const res = await request(app)
				.post("/api/chat/federated/inbound")
				.set("Content-Type", "application/json")
				.set("X-Chat-Signature", signature)
				.send(payload);

			expect(res.status).toBe(202);
			expect(spy).toHaveBeenCalledWith(
				"alice@a.example.com",
				"ciphertext-blob",
				NOW,
				false,
				"bob",
				undefined,
			);
		});

		it("carries the signed room fields through to the relay", async () => {
			const { app, chatService } = buildApp();
			const spy = jest
				.spyOn(chatService, "relayFederatedMessage")
				.mockReturnValue(true);

			const payload = {
				username: "alice",
				instance: "a.example.com",
				text: "hello room",
				ts: NOW,
				lobby: false,
				roomGlobalId: "11111111-2222-3333-4444-555555555555",
				roomName: "general",
			};
			const signature = createChatFederationService(
				chatService,
				"shared-secret",
			).sign(payload as any);

			const res = await request(app)
				.post("/api/chat/federated/inbound")
				.set("Content-Type", "application/json")
				.set("X-Chat-Signature", signature)
				.send(payload);

			expect(res.status).toBe(202);
			expect(spy).toHaveBeenCalledWith(
				"alice@a.example.com",
				"hello room",
				NOW,
				false,
				undefined,
				"11111111-2222-3333-4444-555555555555",
			);
		});

		it("accepts a valid asymmetric-signed message and relays it locally", async () => {
			const keys = crypto.generateKeyPairSync("rsa", {
				modulusLength: 2048,
				publicKeyEncoding: { type: "pkcs1", format: "pem" },
				privateKeyEncoding: { type: "pkcs1", format: "pem" },
			});

			const db = new Database(":memory:");
			db.exec(`CREATE TABLE peer_chat_messages (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				username TEXT NOT NULL,
				message TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)`);
			const chatService = createChatService({ db } as any);

			const spy = jest
				.spyOn(chatService, "relayFederatedMessage")
				.mockReturnValue(true);

			const mockDbInstance = {
				settings: {} as Record<string, string>,
				remoteActors: {} as Record<string, any>,
				getSetting(key: string) { return this.settings[key]; },
				getRemoteActor(uri: string) { return this.remoteActors[uri]; },
				upsertRemoteActor(actor: any) { this.remoteActors[actor.uri] = { ...this.remoteActors[actor.uri], ...actor }; }
			};

			mockDbInstance.remoteActors["https://a.example.com/users/site"] = {
				uri: "https://a.example.com/users/site",
				public_key: keys.publicKey,
			};

			const federation = realCreateChatFederationService(chatService, mockDbInstance as any, "");
			federation.setPeers(["https://a.example.com"]);

			const app = express();
			app.use(express.json());
			app.use(
				"/api/chat/federated",
				createChatFederationRoutes({
					database: { db, getSetting: (k: string) => mockDbInstance.getSetting(k) } as any,
					chatService,
					chatFederationService: federation,
					config: { chatFederationSecret: "" } as any,
					federatedDiscoveryService: { getPeers: () => ["https://a.example.com"] },
				} as any),
			);

			const payload = {
				username: "alice",
				instance: "a.example.com",
				text: "hello asymmetric route",
				ts: NOW,
				lobby: true,
			};

			const signInput = JSON.stringify([
				payload.username,
				payload.instance,
				payload.text,
				payload.ts,
				payload.lobby,
				"",
				"",
				"",
			]);
			const signer = crypto.createSign("sha256");
			signer.update(signInput);
			const signature = signer.sign(keys.privateKey, "hex");

			const res = await request(app)
				.post("/api/chat/federated/inbound")
				.set("Content-Type", "application/json")
				.set("X-Chat-Signature", signature)
				.send(payload);

			expect(res.status).toBe(202);
			expect(res.body.accepted).toBe(true);
			expect(spy).toHaveBeenCalledWith(
				"alice@a.example.com",
				"hello asymmetric route",
				NOW,
				true,
				undefined,
				undefined,
			);
		});

		it("rejects a request with no signature", async () => {
			const { app } = buildApp();

			const res = await request(app)
				.post("/api/chat/federated/inbound")
				.send({ username: "x", instance: "y", text: "z", ts: 1 });

			expect(res.status).toBe(401);
			expect(res.body.error).toBe("Missing signature");
		});

		it("rejects a tampered payload even with a valid signature for the original", async () => {
			const { app, chatService } = buildApp();
			const payload = {
				username: "alice",
				instance: "a.example.com",
				text: "original",
				ts: 1000,
				lobby: true,
			};
			const signature = createChatFederationService(
				chatService,
				"shared-secret",
			).sign(payload as any);

			const res = await request(app)
				.post("/api/chat/federated/inbound")
				.set("Content-Type", "application/json")
				.set("X-Chat-Signature", signature)
				.send({ ...payload, text: "tampered" });

			expect(res.status).toBe(401);
			expect(res.body.error).toBe("Invalid signature");
		});

		it("rejects a request with missing required fields", async () => {
			const { app } = buildApp();

			const res = await request(app)
				.post("/api/chat/federated/inbound")
				.set("Content-Type", "application/json")
				.set("X-Chat-Signature", "sig")
				.send({ username: "", instance: "", text: "" });

			expect(res.status).toBe(400);
			expect(res.body.error).toBe("Missing required fields");
		});

		it("returns 409 for a duplicate within the dedup window", async () => {
			const { app, chatService } = buildApp();
			jest.spyOn(chatService, "relayFederatedMessage").mockReturnValue(true);

			const payload = {
				username: "alice",
				instance: "a.example.com",
				text: "dup",
				ts: NOW,
				lobby: true,
			};
			const signature = createChatFederationService(
				chatService,
				"shared-secret",
			).sign(payload as any);

			const first = await request(app)
				.post("/api/chat/federated/inbound")
				.set("Content-Type", "application/json")
				.set("X-Chat-Signature", signature)
				.send(payload);

			const second = await request(app)
				.post("/api/chat/federated/inbound")
				.set("Content-Type", "application/json")
				.set("X-Chat-Signature", signature)
				.send(payload);

			expect(first.status).toBe(202);
			expect(second.status).toBe(409);
			expect(second.body.accepted).toBe(false);
		});

		it("rejects a correctly signed message that is too old to be live", async () => {
			const { app, chatService } = buildApp();
			const spy = jest
				.spyOn(chatService, "relayFederatedMessage")
				.mockReturnValue(true);

			// Past the dedup window a captured message would otherwise be
			// replayable forever, since its signature never expires.
			const payload = {
				username: "alice",
				instance: "a.example.com",
				text: "replayed",
				ts: NOW - 10 * 60 * 1000,
				lobby: true,
			};
			const signature = createChatFederationService(
				chatService,
				"shared-secret",
			).sign(payload as any);

			const res = await request(app)
				.post("/api/chat/federated/inbound")
				.set("Content-Type", "application/json")
				.set("X-Chat-Signature", signature)
				.send(payload);

			expect(res.status).toBe(401);
			expect(res.body.error).toBe("Stale or future-dated message");
			expect(spy).not.toHaveBeenCalled();
		});

		it("rejects a message dated far in the future", async () => {
			const { app, chatService } = buildApp();
			const payload = {
				username: "alice",
				instance: "a.example.com",
				text: "from tomorrow",
				ts: NOW + 60 * 60 * 1000,
				lobby: true,
			};
			const signature = createChatFederationService(
				chatService,
				"shared-secret",
			).sign(payload as any);

			const res = await request(app)
				.post("/api/chat/federated/inbound")
				.set("Content-Type", "application/json")
				.set("X-Chat-Signature", signature)
				.send(payload);

			expect(res.status).toBe(401);
		});

		it("rejects a signed message claiming an instance that is not a known peer", async () => {
			const { app, chatService } = buildApp("shared-secret", [
				"https://a.example.com",
			]);
			const spy = jest
				.spyOn(chatService, "relayFederatedMessage")
				.mockReturnValue(true);

			const payload = {
				username: "alice",
				instance: "evil.example.com",
				text: "injected",
				ts: NOW,
				lobby: true,
			};
			const signature = createChatFederationService(
				chatService,
				"shared-secret",
			).sign(payload as any);

			const res = await request(app)
				.post("/api/chat/federated/inbound")
				.set("Content-Type", "application/json")
				.set("X-Chat-Signature", signature)
				.send(payload);

			expect(res.status).toBe(403);
			expect(res.body.error).toBe("Unknown peer instance");
			expect(spy).not.toHaveBeenCalled();
		});

		it("ignores a sender-supplied id so the dedup key cannot be chosen", async () => {
			const { app, chatService } = buildApp();
			jest.spyOn(chatService, "relayFederatedMessage").mockReturnValue(true);

			const payload = {
				username: "alice",
				instance: "a.example.com",
				text: "id-not-signed",
				ts: NOW,
				lobby: true,
			};
			const signature = createChatFederationService(
				chatService,
				"shared-secret",
			).sign(payload as any);

			// A peer pre-seeding the dedup map with the id of a message it wants
			// suppressed: honouring `id` would make the real message a duplicate.
			const poison = await request(app)
				.post("/api/chat/federated/inbound")
				.set("Content-Type", "application/json")
				.set("X-Chat-Signature", signature)
				.send({ ...payload, id: "attacker-chosen-id" });

			expect(poison.status).toBe(202);

			const replay = await request(app)
				.post("/api/chat/federated/inbound")
				.set("Content-Type", "application/json")
				.set("X-Chat-Signature", signature)
				.send(payload);

			// Same signed fields, so the recomputed id matches: still a duplicate.
			expect(replay.status).toBe(409);
		});
	});
});
