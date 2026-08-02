import { describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import { createChatFederationRoutes } from "./chat-federation.js";
import { createChatService } from "../../modules/chat/chat.service.js";
import { createChatFederationService } from "../../modules/chat/chat-federation.service.js";

function buildApp(secret = "shared-secret") {
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
			config: { chatFederationSecret: secret } as any,
			federatedDiscoveryService: { getPeers: () => [] },
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
				.send(payload);

			expect(res.status).toBe(202);
			expect(res.body.accepted).toBe(true);
			expect(spy).toHaveBeenCalledWith(
				"alice@a.example.com",
				"hello from federation",
				1000,
				true,
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
				ts: 2000,
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
				2000,
				false,
				"bob",
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
				ts: 3000,
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
	});

	describe("GET /api/chat/federated/peers", () => {
		it("returns the peer list", async () => {
			const { app } = buildApp();
			const res = await request(app).get("/api/chat/federated/peers");
			expect(res.status).toBe(200);
			expect(res.body.peers).toEqual([]);
		});
	});
});
