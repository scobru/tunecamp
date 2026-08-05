import { describe, expect, it, beforeEach, afterEach } from "@jest/globals";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import { createChatRoutes } from "./chat.js";
import { createChatService } from "../../modules/chat/chat.service.js";
import type { DatabaseService } from "../../core/database.types.js";

function fakeWs() {
	return { readyState: 1, send: () => {} } as any;
}

describe("Chat API routes", () => {
	let db: InstanceType<typeof Database>;
	let chatService: ReturnType<typeof createChatService>;
	let app: express.Express;

	beforeEach(() => {
		db = new Database(":memory:");
		db.exec(`CREATE TABLE peer_chat_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL,
			message TEXT NOT NULL,
			created_at INTEGER NOT NULL
		)`);
		db.exec(`CREATE TABLE admin (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL UNIQUE,
			zen_pub TEXT,
			zen_priv TEXT
		)`);
		chatService = createChatService({ db } as unknown as DatabaseService);

		app = express();
		app.use(express.json());
		app.use(
			"/api/chat",
			createChatRoutes({
				database: { db } as any,
				chatService,
				federatedDiscoveryService: {
					resolvePeerByInstance: () => undefined,
				},
			} as any),
		);
	});

	afterEach(() => {
		db.close();
	});

	describe("GET /pubkey/:username", () => {
		it("prefers the account's Zen identity over the live session key", async () => {
			db.prepare(
				"INSERT INTO admin (username, zen_pub) VALUES ('alice', 'zen-pub-alice')",
			).run();
			chatService.register("alice-id", "alice", fakeWs());
			chatService.setPubkey("alice-id", "session-key");

			const res = await request(app).get("/api/chat/pubkey/alice");

			expect(res.status).toBe(200);
			expect(res.body.pubkey).toBe("zen-pub-alice");
			expect(res.body.source).toBe("identity");
		});

		it("answers for a user who is offline, since the key is on the account", async () => {
			db.prepare(
				"INSERT INTO admin (username, zen_pub) VALUES ('alice', 'zen-pub-alice')",
			).run();

			const res = await request(app).get("/api/chat/pubkey/alice");

			expect(res.status).toBe(200);
			expect(res.body.pubkey).toBe("zen-pub-alice");
		});

		it("falls back to the session key, flagged as such, for an account with no Zen identity", async () => {
			db.prepare("INSERT INTO admin (username) VALUES ('bob')").run();
			chatService.register("bob-id", "bob", fakeWs());
			chatService.setPubkey("bob-id", "session-key-bob");

			const res = await request(app).get("/api/chat/pubkey/bob");

			expect(res.status).toBe(200);
			expect(res.body.pubkey).toBe("session-key-bob");
			expect(res.body.source).toBe("session");
		});

		it("404s when there is neither an identity nor a live session", async () => {
			const res = await request(app).get("/api/chat/pubkey/nobody");
			expect(res.status).toBe(404);
		});
	});
});
