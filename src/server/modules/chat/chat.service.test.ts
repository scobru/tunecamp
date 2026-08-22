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
		db.exec(`CREATE TABLE chat_rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            global_id TEXT UNIQUE,
            name TEXT NOT NULL,
            description TEXT,
            is_private INTEGER NOT NULL DEFAULT 0,
            created_by TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT 0
        )`);
		db.exec(`CREATE TABLE chat_room_members (
            room_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            joined_at INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (room_id, username)
        )`);
		db.exec(`CREATE TABLE chat_room_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT 0
        )`);
		db.exec(`CREATE TABLE chat_room_bans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            banned_by TEXT NOT NULL,
            reason TEXT,
            created_at INTEGER NOT NULL DEFAULT 0,
            UNIQUE(room_id, username)
        )`);
		db.exec(`CREATE TABLE admin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            zen_pub TEXT,
            zen_priv TEXT
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
			// Alice gets an ack carrying the id of what she just sent, but never
			// the message itself echoed back at her.
			expect(aliceWs.send).not.toHaveBeenCalledWith(
				expect.stringContaining('"type":"chat"'),
			);
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

	describe("getPubkey", () => {
		it("returns the pubkey for a connected client", () => {
			const aliceWs = fakeWs();
			chatService.register("alice-id", "alice", aliceWs);
			chatService.setPubkey("alice-id", "alice-pub");

			expect(chatService.getPubkey("alice")).toBe("alice-pub");
		});

		it("returns undefined when no client matches", () => {
			expect(chatService.getPubkey("nobody")).toBeUndefined();
		});

		it("returns undefined for a client without a pubkey", () => {
			const bobWs = fakeWs();
			chatService.register("bob-id", "bob", bobWs);

			expect(chatService.getPubkey("bob")).toBeUndefined();
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
			expect(second).toBe("homologo");

			const clients = chatService.getClients();
			expect(clients).toHaveLength(1);
			expect(clients[0].username).toBe("homologo");
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

	// A client that has to recognise a message by sender and timestamp loses one
	// of any two that land in the same millisecond. These cover the id that
	// replaces that guess.
	describe("message ids", () => {
		function parseSent(ws: any, type: string) {
			return (ws.send.mock.calls as string[][])
				.map((call) => JSON.parse(call[0]))
				.filter((msg) => msg.type === type);
		}

		it("gives two lobby messages sent in the same millisecond distinct ids", () => {
			const aliceWs = fakeWs();
			const bobWs = fakeWs();
			chatService.register("alice-id", "alice", aliceWs);
			chatService.register("bob-id", "bob", bobWs);
			const now = jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

			chatService.relayChat("alice-id", "", "first");
			chatService.relayChat("alice-id", "", "second");
			now.mockRestore();

			const sent = parseSent(bobWs, "chat");
			expect(sent).toHaveLength(2);
			expect(sent[0].ts).toBe(sent[1].ts);
			expect(sent[0].id).not.toBe(sent[1].id);

			// Both survive the round trip that a ts-keyed client would collapse.
			const history = chatService.getHistory();
			expect(history.map((m) => m.message)).toEqual(["first", "second"]);
			expect(new Set(history.map((m) => m.id)).size).toBe(2);
		});

		it("hands every recipient the same id and ts for one message", () => {
			const aliceWs = fakeWs();
			const bobWs = fakeWs();
			const carolWs = fakeWs();
			chatService.register("alice-id", "alice", aliceWs);
			chatService.register("bob-id", "bob", bobWs);
			chatService.register("carol-id", "carol", carolWs);

			chatService.relayChat("alice-id", "", "hi everyone");

			const [toBob] = parseSent(bobWs, "chat");
			const [toCarol] = parseSent(carolWs, "chat");
			expect(toBob.id).toBe(toCarol.id);
			expect(toBob.ts).toBe(toCarol.ts);
			// The id has to name the row, or history cannot be matched to it.
			expect(chatService.getHistory()[0].id).toBe(toBob.id);
		});

		it("acks the sender with the id and ref of what they just sent", () => {
			const aliceWs = fakeWs();
			const bobWs = fakeWs();
			chatService.register("alice-id", "alice", aliceWs);
			chatService.register("bob-id", "bob", bobWs);

			chatService.relayChat("alice-id", "", "hi", "ref-7");

			const [ack] = parseSent(aliceWs, "chat_ack");
			const [toBob] = parseSent(bobWs, "chat");
			expect(ack.ref).toBe("ref-7");
			expect(ack.id).toBe(toBob.id);
			expect(ack.ts).toBe(toBob.ts);
		});

		it("keeps lobby and room ids apart even at the same row number", () => {
			const aliceWs = fakeWs();
			const bobWs = fakeWs();
			chatService.register("alice-id", "alice", aliceWs);
			chatService.register("bob-id", "bob", bobWs);
			const room = chatService.createRoom("general", "", false, "alice");
			chatService.joinRoomByUser("alice", room.id);
			chatService.joinRoomByUser("bob", room.id);
			chatService.joinRoom("bob-id", room.id);

			chatService.relayChat("alice-id", "", "lobby one");
			chatService.relayRoomMessage(room.id, "alice-id", "room one");

			// Both are row 1 of their table; they share one list on the client.
			const [lobby] = parseSent(bobWs, "chat");
			const [inRoom] = parseSent(bobWs, "room_chat");
			expect(lobby.id).not.toBe(inRoom.id);
			expect(chatService.getRoomHistory(room.id)[0].id).toBe(inRoom.id);
		});

		it("leaves a DM without an id, since nothing stores it", () => {
			const aliceWs = fakeWs();
			const bobWs = fakeWs();
			chatService.register("alice-id", "alice", aliceWs);
			chatService.register("bob-id", "bob", bobWs);

			chatService.relayChat("alice-id", "bob", "ciphertext-blob", "ref-1");

			expect(parseSent(bobWs, "chat")[0].id).toBeUndefined();
			expect(parseSent(aliceWs, "chat_ack")).toHaveLength(0);
		});
	});

	describe("rooms", () => {
		it("createRoom returns id and persists row", () => {
			const room = chatService.createRoom("general", "", false, "alice");
			expect(room.id).toBeGreaterThan(0);
			expect(room.name).toBe("general");
			expect(chatService.listRooms()).toHaveLength(1);
		});

		it("listRooms reports the creator, so a client can gate the Delete button", () => {
			chatService.createRoom("general", "", false, "alice");
			expect(chatService.listRooms()[0]).toEqual(
				expect.objectContaining({ created_by: "alice", member_count: 0 }),
			);
		});

		it("deleteRoom is creator-only unless admin (non-creator returns false)", () => {
			const room = chatService.createRoom("secret", "", true, "alice");
			expect(chatService.deleteRoom(room.id, "bob")).toBe(false);
			expect(chatService.listRooms()).toHaveLength(1);
			expect(chatService.deleteRoom(room.id, "Alice")).toBe(true);
			expect(chatService.listRooms()).toHaveLength(0);

			const room2 = chatService.createRoom("admin-test", "", false, "charlie");
			expect(chatService.deleteRoom(room2.id, "admin_user", true)).toBe(true);
			expect(chatService.listRooms()).toHaveLength(0);
		});

		it("joinRoomByUser writes DB membership and subscribes live sockets", () => {
			const room = chatService.createRoom("music", "", false, "alice");
			const aliceWs = fakeWs();
			chatService.register("alice-id", "alice", aliceWs);

			expect(chatService.joinRoomByUser("alice", room.id)).toBe(true);
			expect(chatService.getMembers(room.id)).toEqual(["alice"]);

			const delivered = chatService.relayRoomMessage(
				room.id,
				"alice-id",
				"hello room",
			);
			expect(delivered).toBe(false); // no other subscriber than sender
			expect(aliceWs.send).not.toHaveBeenCalledWith(
				expect.stringContaining('"room_chat"'),
			);
			expect(chatService.getRoomHistory(room.id)).toHaveLength(1);
		});

		it("relayRoomMessage trims only the target room, not others", () => {
			const r1 = chatService.createRoom("r1", "", false, "alice");
			const r2 = chatService.createRoom("r2", "", false, "alice");
			const ws = fakeWs();
			chatService.register("uid", "alice", ws);
			chatService.joinRoomByUser("alice", r1.id);
			chatService.joinRoomByUser("alice", r2.id);

			for (let i = 0; i < 5; i++) {
				chatService.relayRoomMessage(r1.id, "uid", `r1-${i}`);
				chatService.relayRoomMessage(r2.id, "uid", `r2-${i}`);
			}
			expect(chatService.getRoomHistory(r1.id)).toHaveLength(5);
			expect(chatService.getRoomHistory(r2.id)).toHaveLength(5);
		});

		it("kicks user from a specific room only without affecting other rooms or lobby", () => {
			const room = chatService.createRoom("test-room", "", false, "owner");
			const otherRoom = chatService.createRoom("other-room", "", false, "owner");
			const userWs = fakeWs();
			const ownerWs = fakeWs();
			chatService.register("user-id", "spammer", userWs);
			chatService.register("owner-id", "owner", ownerWs);

			chatService.joinRoomByUser("spammer", room.id);
			chatService.joinRoomByUser("spammer", otherRoom.id);

			const kicked = chatService.kickUserFromRoom("owner", "spammer", room.id, "bad behavior");
			expect(kicked).toBe(true);

			// User is removed from target room
			expect(chatService.isMember(room.id, "spammer")).toBe(false);
			// User is still member of other room and lobby
			expect(chatService.isMember(otherRoom.id, "spammer")).toBe(true);

			// Target user got room_kicked message
			expect(userWs.send).toHaveBeenCalledWith(
				expect.stringContaining('"type":"room_kicked"'),
			);
		});

		it("bans user from a specific room and prevents joining", () => {
			const room = chatService.createRoom("test-room", "", false, "owner");
			const userWs = fakeWs();
			chatService.register("user-id", "troll", userWs);
			chatService.joinRoomByUser("troll", room.id);

			const banned = chatService.banUserFromRoom("owner", "troll", room.id, "spam", false);
			expect(banned).toBe(true);

			expect(chatService.isRoomBanned(room.id, "troll")).toBe(true);
			expect(chatService.isMember(room.id, "troll")).toBe(false);

			// Trying to rejoin fails
			const rejoin = chatService.joinRoomByUser("troll", room.id);
			expect(rejoin).toBe(false);

			// Unbanning allows rejoining
			chatService.unbanUserFromRoom("owner", "troll", room.id, false);
			expect(chatService.isRoomBanned(room.id, "troll")).toBe(false);
			expect(chatService.joinRoomByUser("troll", room.id)).toBe(true);
		});
	});

	describe("getIdentityPubkey", () => {
		it("returns the account's Zen identity key even while the user is offline", () => {
			db.prepare(
				"INSERT INTO admin (username, zen_pub) VALUES ('alice', 'zen-pub-alice')",
			).run();

			// No socket registered for alice at all.
			expect(chatService.getPubkey("alice")).toBeUndefined();
			expect(chatService.getIdentityPubkey("alice")).toBe("zen-pub-alice");
		});

		it("is undefined for an account that has not bound a Zen identity", () => {
			db.prepare("INSERT INTO admin (username) VALUES ('bob')").run();
			expect(chatService.getIdentityPubkey("bob")).toBeUndefined();
		});

		it("is undefined for an unknown user", () => {
			expect(chatService.getIdentityPubkey("nobody")).toBeUndefined();
		});

		it("does not follow the socket-announced key", () => {
			db.prepare(
				"INSERT INTO admin (username, zen_pub) VALUES ('alice', 'zen-pub-alice')",
			).run();
			chatService.register("alice-id", "alice", fakeWs());
			chatService.setPubkey("alice-id", "session-key-that-differs");

			// The session key is still served by getPubkey, but the identity key is
			// the account's own and is what the route prefers.
			expect(chatService.getPubkey("alice")).toBe("session-key-that-differs");
			expect(chatService.getIdentityPubkey("alice")).toBe("zen-pub-alice");
		});
	});
});
