import {
	describe,
	expect,
	it,
	jest,
	beforeEach,
	afterEach,
} from "@jest/globals";
import Database from "better-sqlite3";
import { createChatService, type ChatService } from "./chat.service.js";
import type { DatabaseService } from "../../core/database.types.js";

function fakeWs() {
	return { readyState: 1, send: jest.fn() } as any;
}

describe("ChatService", () => {
	let chatService: ChatService;
	let db: InstanceType<typeof Database>;

	beforeEach(() => {
		// Real in-memory SQLite: the persistence path is a couple of statements,
		// and mocking them would only assert that the mock was called.
		db = new Database(":memory:");
		db.exec(`CREATE TABLE peer_chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )`);
		db.exec(`CREATE TABLE peer_chat_bans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            banned_by TEXT NOT NULL,
            reason TEXT,
            created_at INTEGER NOT NULL
        )`);
		db.exec(`CREATE TABLE peer_chat_mutes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            muted_by TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            reason TEXT,
            created_at INTEGER NOT NULL
        )`);
		chatService = createChatService({ db } as unknown as DatabaseService);
	});

	afterEach(() => {
		db.close();
	});

	describe("relayChat", () => {
		it("broadcasts a lobby message (empty toUsername) to every other connected client", () => {
			const aliceWs = fakeWs();
			const bobWs = fakeWs();
			const carolWs = fakeWs();
			chatService.register("alice-id", "alice", aliceWs);
			chatService.register("bob-id", "bob", bobWs);
			chatService.register("carol-id", "carol", carolWs);

			const delivered = chatService.relayChat("alice-id", "", "hi everyone");

			expect(delivered).toBe(true);
			expect(aliceWs.send).not.toHaveBeenCalled();
			expect(bobWs.send).toHaveBeenCalledWith(
				expect.stringContaining('"lobby":true'),
			);
			expect(carolWs.send).toHaveBeenCalledWith(
				expect.stringContaining('"lobby":true'),
			);
		});

		it("delivers a direct message only to the named recipient", () => {
			const aliceWs = fakeWs();
			const bobWs = fakeWs();
			const carolWs = fakeWs();
			chatService.register("alice-id", "alice", aliceWs);
			chatService.register("bob-id", "bob", bobWs);
			chatService.register("carol-id", "carol", carolWs);

			const delivered = chatService.relayChat("alice-id", "bob", "psst");

			expect(delivered).toBe(true);
			expect(bobWs.send).toHaveBeenCalledWith(
				expect.stringContaining('"lobby":false'),
			);
			expect(carolWs.send).not.toHaveBeenCalled();
		});

		it("returns false and delivers nothing for an unknown sender", () => {
			expect(chatService.relayChat("nonexistent-client", "", "hi")).toBe(false);
		});

		it("returns false and delivers nothing for blank text", () => {
			const aliceWs = fakeWs();
			const bobWs = fakeWs();
			chatService.register("alice-id", "alice", aliceWs);
			chatService.register("bob-id", "bob", bobWs);

			const delivered = chatService.relayChat("alice-id", "", "   ");

			expect(delivered).toBe(false);
			expect(bobWs.send).not.toHaveBeenCalled();
		});

		it("skips clients whose socket is no longer open", () => {
			const aliceWs = fakeWs();
			const bobWs = fakeWs();
			bobWs.readyState = 3; // CLOSED
			chatService.register("alice-id", "alice", aliceWs);
			chatService.register("bob-id", "bob", bobWs);

			expect(chatService.relayChat("alice-id", "", "hi")).toBe(false);
			expect(bobWs.send).not.toHaveBeenCalled();
		});

		it("does not deliver to a client that has unregistered", () => {
			const aliceWs = fakeWs();
			const bobWs = fakeWs();
			chatService.register("alice-id", "alice", aliceWs);
			chatService.register("bob-id", "bob", bobWs);
			chatService.unregister("bob-id");

			expect(chatService.relayChat("alice-id", "", "hi")).toBe(false);
			expect(bobWs.send).not.toHaveBeenCalled();
		});

		it("truncates text beyond the 2000 character cap", () => {
			const aliceWs = fakeWs();
			const bobWs = fakeWs();
			chatService.register("alice-id", "alice", aliceWs);
			chatService.register("bob-id", "bob", bobWs);

			chatService.relayChat("alice-id", "", "x".repeat(2500));

			const sent = JSON.parse(
				(bobWs.send as jest.Mock).mock.calls[0][0] as string,
			);
			expect(sent.text).toHaveLength(2000);
		});
	});

	describe("setPubkey", () => {
		it("broadcasts the announcing pubkey to other clients and returns their known keys", () => {
			const aliceWs = fakeWs();
			const bobWs = fakeWs();
			chatService.register("alice-id", "alice", aliceWs);
			chatService.register("bob-id", "bob", bobWs);

			chatService.setPubkey("bob-id", "bob-pub");
			bobWs.send.mockClear();

			const roster = chatService.setPubkey("alice-id", "alice-pub");

			expect(bobWs.send).toHaveBeenCalledWith(
				JSON.stringify({ type: "pubkey", from: "alice", pubkey: "alice-pub" }),
			);
			expect(roster).toEqual([{ username: "bob", pubkey: "bob-pub" }]);
		});

		it("returns an empty roster for an unknown client", () => {
			expect(chatService.setPubkey("nonexistent-client", "pub")).toEqual([]);
		});
	});

	describe("lobby history", () => {
		it("persists lobby messages and returns them oldest first", () => {
			chatService.register("alice-id", "alice", fakeWs());
			chatService.relayChat("alice-id", "", "first");
			chatService.relayChat("alice-id", "", "second");

			const history = chatService.getHistory();

			expect(history.map((m) => m.message)).toEqual(["first", "second"]);
			expect(history[0].username).toBe("alice");
		});

		it("records a lobby message even when nobody else is connected to receive it", () => {
			chatService.register("alice-id", "alice", fakeWs());

			expect(chatService.relayChat("alice-id", "", "anyone there?")).toBe(
				false,
			);
			expect(chatService.getHistory()).toHaveLength(1);
		});

		it("never stores direct messages, which the server only holds as ciphertext", () => {
			chatService.register("alice-id", "alice", fakeWs());
			chatService.register("bob-id", "bob", fakeWs());

			chatService.relayChat("alice-id", "bob", "ciphertext-blob");

			expect(chatService.getHistory()).toEqual([]);
		});

		it("does not store blank messages", () => {
			chatService.register("alice-id", "alice", fakeWs());
			chatService.relayChat("alice-id", "", "   ");
			expect(chatService.getHistory()).toEqual([]);
		});

		it("trims the backlog to the 500-row cap", () => {
			chatService.register("alice-id", "alice", fakeWs());
			for (let i = 0; i < 520; i++) {
				chatService.relayChat("alice-id", "", `msg-${i}`);
			}

			const total = db
				.prepare("SELECT COUNT(*) AS n FROM peer_chat_messages")
				.get() as { n: number };
			expect(total.n).toBe(500);

			const history = chatService.getHistory(500);
			expect(history[history.length - 1].message).toBe("msg-519");
			expect(history[0].message).toBe("msg-20");
		});

		it("honours the requested limit", () => {
			chatService.register("alice-id", "alice", fakeWs());
			for (let i = 0; i < 10; i++) {
				chatService.relayChat("alice-id", "", `msg-${i}`);
			}

			const history = chatService.getHistory(3);

			expect(history.map((m) => m.message)).toEqual([
				"msg-7",
				"msg-8",
				"msg-9",
			]);
		});

		it("keeps relaying when the backlog write fails", () => {
			chatService.register("alice-id", "alice", fakeWs());
			const bobWs = fakeWs();
			chatService.register("bob-id", "bob", bobWs);
			db.exec("DROP TABLE peer_chat_messages");
			const consoleError = jest
				.spyOn(console, "error")
				.mockImplementation(() => {});

			expect(chatService.relayChat("alice-id", "", "still delivered")).toBe(
				true,
			);
			expect(bobWs.send).toHaveBeenCalledWith(
				expect.stringContaining("still delivered"),
			);

			consoleError.mockRestore();
		});
	});

	describe("username disambiguation", () => {
		it("disambiguates duplicate usernames with incremental suffix", () => {
			const admin1Name = chatService.register(
				"admin-session-1234",
				"admin",
				fakeWs(),
			);
			const admin2Name = chatService.register(
				"admin-session-5678",
				"admin",
				fakeWs(),
			);

			expect(admin1Name).toBe("admin");
			expect(admin2Name).toBe("admin #2");

			const clients = chatService.getClients();
			expect(clients).toEqual([
				{ username: "admin", pubkey: false },
				{ username: "admin #2", pubkey: false },
			]);
		});

		it("allows multiple sessions for the same userId (browser + daemon)", () => {
			const ws1 = fakeWs();
			const ws2 = fakeWs();

			const first = chatService.register(
				"session-1",
				"homologo",
				ws1,
				false,
				42,
			);
			const second = chatService.register(
				"session-2",
				"homologo",
				ws2,
				false,
				42,
			);

			expect(first).toBe("homologo");
			expect(second).toBe("homologo #2");

			const clients = chatService.getClients();
			expect(clients).toHaveLength(2);
		});
	});

	describe("moderation features", () => {
		it("kicks connected user and notifies lobby", () => {
			const adminWs = fakeWs();
			const userWs = fakeWs();
			chatService.register("admin-id", "admin", adminWs, true);
			chatService.register("baduser-id", "baduser", userWs);

			const kicked = chatService.kickUser("admin", "baduser", "spamming");

			expect(kicked).toBe(true);
			expect(userWs.send).toHaveBeenCalledWith(
				expect.stringContaining('"type":"kicked"'),
			);
			expect(adminWs.send).toHaveBeenCalledWith(
				expect.stringContaining(
					"[System] baduser was kicked by admin (spamming)",
				),
			);
			expect(chatService.getClients()).toHaveLength(1);
		});

		it("bans user, kicks them, and prevents reconnection check", () => {
			const adminWs = fakeWs();
			const userWs = fakeWs();
			chatService.register("admin-id", "admin", adminWs, true);
			chatService.register("troll-id", "troll", userWs);

			chatService.banUser("admin", "troll", "trolling");

			expect(chatService.isBanned("troll")).toBe(true);
			expect(chatService.getClients()).toHaveLength(1);

			chatService.unbanUser("admin", "troll");
			expect(chatService.isBanned("troll")).toBe(false);
		});

		it("mutes user and prevents sending lobby messages", () => {
			const adminWs = fakeWs();
			const userWs = fakeWs();
			chatService.register("admin-id", "admin", adminWs, true);
			chatService.register("spammer-id", "spammer", userWs);

			chatService.muteUser("admin", "spammer", 10, "too fast");
			expect(chatService.isMuted("spammer")).toBe(true);

			const delivered = chatService.relayChat("spammer-id", "", "spam message");
			expect(delivered).toBe(false);
			expect(userWs.send).toHaveBeenCalledWith(
				expect.stringContaining("currently muted"),
			);

			chatService.unmuteUser("admin", "spammer");
			expect(chatService.isMuted("spammer")).toBe(false);
		});

		it("clears lobby history", () => {
			const adminWs = fakeWs();
			chatService.register("admin-id", "admin", adminWs, true);
			chatService.relayChat("admin-id", "", "test message");

			expect(chatService.getHistory()).toHaveLength(1);

			chatService.clearLobbyHistory("admin");

			expect(chatService.getHistory()).toHaveLength(0);
			expect(adminWs.send).toHaveBeenCalledWith(
				expect.stringContaining('"type":"clear_history"'),
			);
		});
	});

	describe("relayRtcSignal", () => {
		it("relays WebRTC signaling payload to the specified target session or username", () => {
			const aliceWs = fakeWs();
			const bobWs = fakeWs();
			chatService.register("alice-session-id", "alice", aliceWs);
			chatService.register("bob-session-id", "bob", bobWs);

			const signal = { type: "offer", sdp: "v=0..." };
			const delivered = chatService.relayRtcSignal(
				"alice-session-id",
				"bob-session-id",
				signal,
			);

			expect(delivered).toBe(true);
			expect(aliceWs.send).not.toHaveBeenCalled();
			expect(bobWs.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "rtc_signal",
					from: "alice",
					fromSessionId: "alice-session-id",
					to: "bob",
					toSessionId: "bob-session-id",
					signal,
				}),
			);
		});
	});
});
