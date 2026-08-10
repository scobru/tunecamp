// Chat relay shared by every transport that can carry messages: the peer
// daemon socket (/ws/peer) and the browser socket (/ws/chat). Both register
// their sockets here, so a Sidecamp daemon and a webapp tab sit in the same
// lobby instead of two invisible rooms.
//
// The server is deliberately opaque to direct messages: `text` is ciphertext
// produced client-side (Zen SEA, secp256k1 ECDH shared secret) and is relayed
// verbatim. Only the lobby carries plaintext.

import { randomUUID } from "crypto";
import type { DatabaseService } from "../../core/database.types.js";

// Structural socket type: keeps this module independent of `ws` and of the
// peer module, and lets tests pass a plain object.
export interface ChatSocket {
	readyState: number;
	send(data: string): void;
	close?(): void;
}

interface ChatClient {
	id: string;
	rawUsername: string;
	username: string;
	ws: ChatSocket;
	pubkey?: string;
	isAdmin?: boolean;
	userId?: number | string;
	rooms: Set<number>;
}

export interface LobbyMessage {
	username: string;
	message: string;
	created_at: number;
}

export interface ChatRoom {
	id: number;
	global_id: string;
	name: string;
	description: string | null;
	is_private: number;
}

const OPEN = 1;
const MAX_TEXT_LENGTH = 2000;
// Backlog handed to a client that just joined. Older rows are dropped on insert:
// this is a chat lobby, not an archive.
const LOBBY_HISTORY_CAP = 500;
const ROOM_HISTORY_CAP = 500;

export class ChatService {
	private clients = new Map<string, ChatClient>();
	private userIdMap = new Map<number | string, string>();

	constructor(private database: DatabaseService) {}

	register(
		clientId: string,
		rawUsername: string,
		ws: ChatSocket,
		isAdmin = false,
		userId?: number | string,
	): string {
		let username = rawUsername;
		let suffix = 2;

		while (true) {
			let collision = false;
			for (const client of this.clients.values()) {
				if (client.username === username) {
					if (userId !== undefined && client.userId === userId) {
						// Group multiple connections (e.g. browser tab + Sidecamp daemon)
						// under the same username instead of appending a #2 suffix.
						collision = false;
					} else {
						collision = true;
					}
					break;
				}
			}
			if (!collision) break;
			username = `${rawUsername} #${suffix}`;
			suffix++;
		}

		this.clients.set(clientId, {
			id: clientId,
			rawUsername,
			username,
			ws,
			isAdmin,
			userId,
			rooms: new Set(),
		});
		if (userId !== undefined) {
			this.userIdMap.set(userId, clientId);
		}
		return username;
	}

	unregister(clientId: string): void {
		const client = this.clients.get(clientId);
		if (client?.userId !== undefined) {
			this.userIdMap.delete(client.userId);
		}
		this.clients.delete(clientId);
	}

	isBanned(username: string): boolean {
		try {
			const ban = this.database.db
				.prepare(
					"SELECT id FROM peer_chat_bans WHERE LOWER(username) = LOWER(?)",
				)
				.get(username);
			return !!ban;
		} catch {
			return false;
		}
	}

	isMuted(username: string): boolean {
		try {
			const row = this.database.db
				.prepare(
					"SELECT expires_at FROM peer_chat_mutes WHERE LOWER(username) = LOWER(?)",
				)
				.get(username) as { expires_at: number } | undefined;
			if (!row) return false;
			if (Date.now() > row.expires_at) {
				this.database.db
					.prepare(
						"DELETE FROM peer_chat_mutes WHERE LOWER(username) = LOWER(?)",
					)
					.run(username);
				return false;
			}
			return true;
		} catch {
			return false;
		}
	}

	broadcastSystemMessage(text: string): void {
		for (const client of this.clients.values()) {
			if (client.ws.readyState === OPEN) {
				try {
					client.ws.send(
						JSON.stringify({
							type: "system",
							text,
							ts: Date.now(),
						}),
					);
				} catch (err) {
					console.error("[ChatService] error:", err);
				}
			}
		}
	}

	kickUser(
		adminUsername: string,
		targetUsername: string,
		reason?: string,
	): boolean {
		let kicked = false;
		const targetLower = targetUsername.toLowerCase().trim();

		for (const [clientId, client] of Array.from(this.clients.entries())) {
			if (
				client.username.toLowerCase() === targetLower ||
				client.rawUsername.toLowerCase() === targetLower ||
				client.username.toLowerCase().startsWith(`${targetLower} #`)
			) {
				try {
					client.ws.send(
						JSON.stringify({
							type: "kicked",
							reason: reason || "Kicked by admin",
						}),
					);
				} catch (err) {
					console.error("[ChatService] error:", err);
				}
				this.unregister(clientId);
				kicked = true;
			}
		}

		if (kicked) {
			this.broadcastSystemMessage(
				`[System] ${targetUsername} was kicked by ${adminUsername}${
					reason ? ` (${reason})` : ""
				}`,
			);
		}
		return kicked;
	}

	banUser(
		adminUsername: string,
		targetUsername: string,
		reason?: string,
	): boolean {
		const targetClean = targetUsername.trim();
		try {
			this.database.db
				.prepare(
					"INSERT OR REPLACE INTO peer_chat_bans (username, banned_by, reason, created_at) VALUES (?, ?, ?, ?)",
				)
				.run(
					targetClean.toLowerCase(),
					adminUsername,
					reason || null,
					Date.now(),
				);
		} catch (err) {
			console.error("[ChatService] Failed to record ban:", err);
		}

		this.kickUser(
			adminUsername,
			targetClean,
			reason ? `Banned: ${reason}` : "Banned by admin",
		);
		this.broadcastSystemMessage(
			`[System] ${targetClean} was banned by ${adminUsername}${
				reason ? ` (${reason})` : ""
			}`,
		);
		return true;
	}

	unbanUser(adminUsername: string, targetUsername: string): boolean {
		const targetClean = targetUsername.trim();
		try {
			this.database.db
				.prepare("DELETE FROM peer_chat_bans WHERE LOWER(username) = LOWER(?)")
				.run(targetClean);
		} catch (err) {
			console.error("[ChatService] Failed to remove ban:", err);
		}
		this.broadcastSystemMessage(
			`[System] ${targetClean} was unbanned by ${adminUsername}`,
		);
		return true;
	}

	muteUser(
		adminUsername: string,
		targetUsername: string,
		durationMinutes = 15,
		reason?: string,
	): boolean {
		const targetClean = targetUsername.trim();
		const expiresAt = Date.now() + durationMinutes * 60 * 1000;
		try {
			this.database.db
				.prepare(
					"INSERT OR REPLACE INTO peer_chat_mutes (username, muted_by, expires_at, reason, created_at) VALUES (?, ?, ?, ?, ?)",
				)
				.run(
					targetClean.toLowerCase(),
					adminUsername,
					expiresAt,
					reason || null,
					Date.now(),
				);
		} catch (err) {
			console.error("[ChatService] Failed to record mute:", err);
		}

		this.broadcastSystemMessage(
			`[System] ${targetClean} was muted by ${adminUsername} for ${durationMinutes}m${
				reason ? ` (${reason})` : ""
			}`,
		);
		return true;
	}

	unmuteUser(adminUsername: string, targetUsername: string): boolean {
		const targetClean = targetUsername.trim();
		try {
			this.database.db
				.prepare("DELETE FROM peer_chat_mutes WHERE LOWER(username) = LOWER(?)")
				.run(targetClean);
		} catch (err) {
			console.error("[ChatService] Failed to remove mute:", err);
		}
		this.broadcastSystemMessage(
			`[System] ${targetClean} was unmuted by ${adminUsername}`,
		);
		return true;
	}

	clearLobbyHistory(adminUsername: string): void {
		try {
			this.database.db.prepare("DELETE FROM peer_chat_messages").run();
		} catch (err) {
			console.error("[ChatService] Failed to clear lobby history:", err);
		}

		for (const client of this.clients.values()) {
			if (client.ws.readyState === OPEN) {
				try {
					client.ws.send(
						JSON.stringify({ type: "clear_history", ts: Date.now() }),
					);
				} catch (err) {
					console.error("[ChatService] error:", err);
				}
			}
		}

		this.broadcastSystemMessage(
			`[System] Chat history was cleared by ${adminUsername}`,
		);
	}

	// Relay a chat message. An empty toUsername broadcasts to every other live
	// client (lobby); otherwise it's delivered only to clients of that username.
	// Returns true if delivered to at least one socket.
	relayChat(fromClientId: string, toUsername: string, text: string): boolean {
		const from = this.clients.get(fromClientId);
		if (!from) return false;
		const clean = String(text ?? "").slice(0, MAX_TEXT_LENGTH);
		if (!clean.trim()) return false;
		const isLobby = !toUsername;

		if (
			isLobby &&
			(this.isMuted(from.username) || this.isMuted(from.rawUsername))
		) {
			try {
				from.ws.send(
					JSON.stringify({
						type: "system",
						text: "You are currently muted in the chat lobby.",
						ts: Date.now(),
					}),
				);
			} catch (err) {
				console.error("[ChatService] error:", err);
			}
			return false;
		}

		if (isLobby) this.persistLobbyMessage(from.username, clean);
		let delivered = false;
		for (const client of this.clients.values()) {
			if (client.id === fromClientId || client.ws.readyState !== OPEN) continue;
			if (
				isLobby ||
				client.username === toUsername ||
				client.rawUsername === toUsername
			) {
				client.ws.send(
					JSON.stringify({
						type: "chat",
						from: from.username,
						text: clean,
						ts: Date.now(),
						lobby: isLobby,
					}),
				);
				delivered = true;
			}
		}
		return delivered;
	}

	// Store a client's E2E public key (opaque to the server — just relayed for
	// client-side encryption), broadcast it to already-connected clients, and
	// return the keys already known for those clients so the caller can send
	// them back to the newly-announcing one.
	setPubkey(
		clientId: string,
		pubkey: string,
	): { username: string; pubkey: string }[] {
		const client = this.clients.get(clientId);
		if (!client) return [];
		client.pubkey = pubkey;
		const pubkeyMap = new Map<string, string>();
		for (const other of this.clients.values()) {
			if (other.id === clientId) continue;
			if (other.ws.readyState === OPEN) {
				other.ws.send(
					JSON.stringify({ type: "pubkey", from: client.username, pubkey }),
				);
			}
			if (other.pubkey) pubkeyMap.set(other.username, other.pubkey);
		}

		return Array.from(pubkeyMap, ([username, pubkey]) => ({
			username,
			pubkey,
		}));
	}

	/** Live session key announced over the socket. Trust-on-first-use: it is
	 * whatever the client said, and it only exists while that client is online. */
	getPubkey(username: string): string | undefined {
		for (const client of this.clients.values()) {
			if (client.rawUsername === username && client.pubkey) {
				return client.pubkey;
			}
		}
		return undefined;
	}

	/**
	 * The account's Zen identity key. Preferred over `getPubkey`: it is bound to
	 * the account rather than to a socket, so it also answers for a user who is
	 * offline, and it is the same key on every instance — which is what lets a
	 * user verify it out of band instead of trusting whatever we hand them.
	 * Null for accounts that have not bound a Zen identity yet.
	 */
	getIdentityPubkey(username: string): string | undefined {
		try {
			const row = this.database.db
				.prepare("SELECT zen_pub FROM admin WHERE username = ?")
				.get(username) as { zen_pub: string | null } | undefined;
			return row?.zen_pub || undefined;
		} catch {
			return undefined;
		}
	}

	// Lobby backlog, oldest first — the order a client renders it in.
	getHistory(limit = 100): LobbyMessage[] {
		try {
			const rows = this.database.db
				.prepare(
					"SELECT username, message, created_at FROM peer_chat_messages ORDER BY id DESC LIMIT ?",
				)
				.all(Math.min(limit, LOBBY_HISTORY_CAP)) as LobbyMessage[];
			return rows.reverse();
		} catch (err) {
			console.error("[ChatService] Failed to fetch lobby history:", err);
			return [];
		}
	}

	getClients(): { username: string; pubkey: boolean }[] {
		const map = new Map<string, boolean>();
		for (const client of this.clients.values()) {
			if (!map.has(client.username) || client.pubkey) {
				map.set(client.username, !!client.pubkey);
			}
		}
		return Array.from(map, ([username, pubkey]) => ({ username, pubkey }));
	}

	relayRtcSignal(
		fromClientId: string,
		targetIdOrUsername: string,
		signal: any,
	): boolean {
		const from = this.clients.get(fromClientId);
		if (!from) return false;

		let delivered = false;
		const targetLower = String(targetIdOrUsername || "")
			.toLowerCase()
			.trim();

		for (const client of this.clients.values()) {
			if (client.id === fromClientId || client.ws.readyState !== OPEN) continue;

			if (
				client.id === targetIdOrUsername ||
				client.username.toLowerCase() === targetLower ||
				client.rawUsername.toLowerCase() === targetLower
			) {
				try {
					client.ws.send(
						JSON.stringify({
							type: "rtc_signal",
							from: from.username,
							fromSessionId: fromClientId,
							to: client.username,
							toSessionId: client.id,
							signal,
						}),
					);
					delivered = true;
				} catch (err) {
					console.error("[ChatService] rtc_signal error:", err);
				}
			}
		}
		return delivered;
	}

	// Chat must keep flowing even if the write fails: a broken backlog is an
	// annoyance, a relay that throws mid-broadcast drops live messages.
	private persistLobbyMessage(username: string, message: string): void {
		try {
			this.database.db
				.prepare(
					"INSERT INTO peer_chat_messages (username, message, created_at) VALUES (?, ?, ?)",
				)
				.run(username, message, Date.now());
			this.database.db
				.prepare(
					"DELETE FROM peer_chat_messages WHERE id <= (SELECT MAX(id) FROM peer_chat_messages) - ?",
				)
				.run(LOBBY_HISTORY_CAP);
		} catch (err) {
			console.error("[ChatService] Failed to persist lobby message:", err);
		}
	}
	/**
	 * Relay a message that arrived from a federated peer. The display
	 * username is already qualified (`user@instance`) so local clients can
	 * tell it did not originate on this instance. Lobby messages are persisted
	 * like any other; DMs are delivered verbatim — the ciphertext is
	 * end-to-end, so the server never sees plaintext.
	 */
	relayFederatedMessage(
		qualifiedFrom: string,
		text: string,
		ts: number,
		isLobby: boolean,
		toUsername?: string,
		roomGlobalId?: string,
	): boolean {
		const clean = String(text ?? "").slice(0, MAX_TEXT_LENGTH);
		if (!clean.trim()) return false;

		if (roomGlobalId) {
			return this.relayFederatedRoomMessage(
				qualifiedFrom,
				roomGlobalId,
				clean,
				ts,
			);
		}

		if (isLobby) {
			this.persistLobbyMessage(qualifiedFrom, clean);
		}

		let delivered = false;
		for (const client of this.clients.values()) {
			if (client.ws.readyState !== OPEN) continue;

			const matchesTarget =
				!toUsername ||
				client.username === toUsername ||
				client.rawUsername === toUsername;

			if (!isLobby && !matchesTarget) continue;

			try {
				client.ws.send(
					JSON.stringify({
						type: "chat",
						from: qualifiedFrom,
						text: clean,
						ts: ts || Date.now(),
						lobby: isLobby,
					}),
				);
				delivered = true;
			} catch (err) {
				console.error("[ChatService] federated relay error:", err);
			}
		}
		return delivered;
	}

	/**
	 * A federated room message addresses a room by its `global_id`, never by the
	 * sender's local row id — those are per-instance AUTOINCREMENT and would
	 * deliver a remote room's traffic into an unrelated local room.
	 * A room this instance has never heard of is dropped: room discovery and
	 * federated membership do not exist yet, so there is nothing to join.
	 */
	private relayFederatedRoomMessage(
		qualifiedFrom: string,
		roomGlobalId: string,
		text: string,
		ts: number,
	): boolean {
		const room = this.getRoom(roomGlobalId);
		if (!room) return false;

		this.persistRoomMessage(room.id, qualifiedFrom, text, ts);

		let delivered = false;
		for (const client of this.clients.values()) {
			if (client.ws.readyState !== OPEN || !client.rooms.has(room.id)) continue;
			try {
				client.ws.send(
					JSON.stringify({
						type: "room_chat",
						roomId: room.id,
						roomGlobalId,
						from: qualifiedFrom,
						text,
						ts: ts || Date.now(),
					}),
				);
				delivered = true;
			} catch (err) {
				console.error("[ChatService] federated room relay error:", err);
			}
		}
		return delivered;
	}
	/**
	 * Rooms: first-class chat spaces beyond the global lobby.
	 * Each client tracks joined rooms; messages are delivered only to
	 * subscribers of that room.
	 */

	createRoom(
		name: string,
		description: string,
		isPrivate: boolean,
		createdBy: string,
	): { id: number; globalId: string; name: string } {
		const safeName = String(name).trim().slice(0, 100);
		if (!safeName) throw new Error("Room name required");
		const globalId = randomUUID();
		const result = this.database.db
			.prepare(
				"INSERT INTO chat_rooms (global_id, name, description, is_private, created_by) VALUES (?, ?, ?, ?, ?)",
			)
			.run(
				globalId,
				safeName,
				description || null,
				isPrivate ? 1 : 0,
				createdBy || "",
			);
		return { id: Number(result.lastInsertRowid), globalId, name: safeName };
	}

	/** Single room row, by local id or by federation-wide global_id. */
	getRoom(idOrGlobalId: number | string): ChatRoom | undefined {
		const column = typeof idOrGlobalId === "number" ? "id" : "global_id";
		return this.database.db
			.prepare(
				`SELECT id, global_id, name, description, is_private FROM chat_rooms WHERE ${column} = ?`,
			)
			.get(idOrGlobalId) as ChatRoom | undefined;
	}

	deleteRoom(roomId: number, requester: string, isAdmin = false): boolean {
		const room = this.database.db
			.prepare("SELECT id, created_by FROM chat_rooms WHERE id = ?")
			.get(roomId) as { id: number; created_by: string } | undefined;
		if (!room) return false;
		const isCreator = Boolean(
			room.created_by &&
				requester &&
				room.created_by.toLowerCase() === requester.toLowerCase(),
		);
		if (!isCreator && !isAdmin) return false;
		this.database.db.prepare("DELETE FROM chat_rooms WHERE id = ?").run(roomId);
		try {
			this.database.db
				.prepare("DELETE FROM chat_room_members WHERE room_id = ?")
				.run(roomId);
			this.database.db
				.prepare("DELETE FROM chat_room_messages WHERE room_id = ?")
				.run(roomId);
		} catch {
			/* handled by CASCADE */
		}
		return true;
	}

	joinRoom(clientId: string, roomId: number): boolean {
		const client = this.clients.get(clientId);
		if (!client) return false;
		return this.joinRoomByUser(client.username, roomId);
	}

	leaveRoom(clientId: string, roomId: number): boolean {
		const client = this.clients.get(clientId);
		if (!client) return false;
		return this.leaveRoomByUser(client.username, roomId);
	}

	/** Membership is keyed by username, not by socket: a user joined from the
	 * webapp stays a member for their Sidecamp daemon, and across reconnects.
	 * Every live socket of that user is subscribed too, so delivery is immediate. */
	joinRoomByUser(username: string, roomId: number): boolean {
		if (!this.getRoom(roomId)) return false;
		try {
			this.database.db
				.prepare(
					"INSERT OR IGNORE INTO chat_room_members (room_id, username) VALUES (?, ?)",
				)
				.run(roomId, username);
			for (const client of this.clientsOf(username)) client.rooms.add(roomId);
			return true;
		} catch {
			return false;
		}
	}

	leaveRoomByUser(username: string, roomId: number): boolean {
		this.database.db
			.prepare(
				"DELETE FROM chat_room_members WHERE room_id = ? AND username = ?",
			)
			.run(roomId, username);
		for (const client of this.clientsOf(username)) client.rooms.delete(roomId);
		return true;
	}

	private *clientsOf(username: string): Iterable<ChatClient> {
		for (const client of this.clients.values()) {
			if (client.username === username || client.rawUsername === username) {
				yield client;
			}
		}
	}

	listRooms(): {
		id: number;
		globalId: string;
		name: string;
		description: string | null;
		is_private: boolean;
		created_by: string;
		member_count: number;
	}[] {
		try {
			// created_by ships with the row so a client can tell whether to offer
			// Delete at all: deleteRoom is creator-only, and a button that fails
			// for everyone but one person is worse than no button.
			const rooms = this.database.db
				.prepare(
					`SELECT r.id, r.global_id, r.name, r.description, r.is_private, r.created_by,
					 COUNT(m.username) AS member_count
					 FROM chat_rooms r
					 LEFT JOIN chat_room_members m ON m.room_id = r.id
					 GROUP BY r.id
					 ORDER BY r.id ASC`,
				)
				.all() as any[];
			return rooms.map((r) => ({
				id: r.id,
				globalId: r.global_id,
				name: r.name,
				description: r.description,
				is_private: !!r.is_private,
				created_by: r.created_by,
				member_count: r.member_count,
			}));
		} catch (err) {
			console.error("[ChatService] Failed to list rooms:", err);
			return [];
		}
	}

	getMembers(roomId: number): string[] {
		try {
			const rows = this.database.db
				.prepare(
					"SELECT username FROM chat_room_members WHERE room_id = ? ORDER BY joined_at ASC",
				)
				.all(roomId) as { username: string }[];
			return rows.map((r) => r.username);
		} catch {
			return [];
		}
	}

	getRoomHistory(
		roomId: number,
		limit = 100,
	): { username: string; message: string; created_at: number }[] {
		try {
			return this.database.db
				.prepare(
					"SELECT username, message, created_at FROM chat_room_messages WHERE room_id = ? ORDER BY id DESC LIMIT ?",
				)
				.all(roomId, Math.min(limit, ROOM_HISTORY_CAP)) as any[];
		} catch {
			return [];
		}
	}

	/** Relay a message to every client subscribed to roomId. */
	relayRoomMessage(
		roomId: number,
		fromClientId: string,
		text: string,
	): boolean {
		const from = this.clients.get(fromClientId);
		if (!from) return false;
		const clean = String(text ?? "").slice(0, MAX_TEXT_LENGTH);
		if (!clean.trim()) return false;
		if (!this.isMember(roomId, from.username)) return false;

		const ts = Date.now();
		this.persistRoomMessage(roomId, from.username, clean, ts);

		let delivered = false;
		for (const client of this.clients.values()) {
			if (
				client.ws.readyState !== OPEN ||
				!client.rooms.has(roomId) ||
				client.id === fromClientId
			)
				continue;
			try {
				client.ws.send(
					JSON.stringify({
						type: "room_chat",
						roomId,
						from: from.username,
						text: clean,
						ts,
					}),
				);
				delivered = true;
			} catch (err) {
				console.error("[ChatService] room relay error:", err);
			}
		}
		return delivered;
	}

	isMember(roomId: number, username: string): boolean {
		try {
			return !!this.database.db
				.prepare(
					"SELECT 1 FROM chat_room_members WHERE room_id = ? AND LOWER(username) = LOWER(?)",
				)
				.get(roomId, username);
		} catch {
			return false;
		}
	}

	// Timestamps are milliseconds everywhere on the wire, so room history must
	// not fall back to the table's strftime('%s') default (seconds).
	private persistRoomMessage(
		roomId: number,
		username: string,
		message: string,
		ts: number,
	): void {
		try {
			this.database.db
				.prepare(
					"INSERT INTO chat_room_messages (room_id, username, message, created_at) VALUES (?, ?, ?, ?)",
				)
				.run(roomId, username, message, ts || Date.now());
			this.database.db
				.prepare(
					"DELETE FROM chat_room_messages WHERE room_id = ? AND id <= (SELECT MAX(id) FROM chat_room_messages WHERE room_id = ?) - ?",
				)
				.run(roomId, roomId, ROOM_HISTORY_CAP);
		} catch (err) {
			console.error("[ChatService] Failed to persist room message:", err);
		}
	}
}

export function createChatService(database: DatabaseService): ChatService {
	return new ChatService(database);
}
