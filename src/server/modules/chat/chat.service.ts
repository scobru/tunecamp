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
	/** Stable handle for this stored message. See `wireId`. */
	id?: string;
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
	created_by?: string;
}

/**
 * Identity of a stored message, for clients that would otherwise have to guess
 * it from sender and timestamp — which drops a genuine message whenever two
 * land in the same millisecond.
 *
 * The row id alone will not do: lobby and room messages come from two
 * AUTOINCREMENT tables and end up in one client-side list, so their ids
 * collide. The prefix separates them.
 *
 * Scope is this instance. A client talks to exactly one, and a federated
 * message is stored locally and numbered locally like any other, so no
 * cross-instance equality is claimed or needed.
 */
function wireId(table: "l" | "r", rowId: number | bigint): string {
	return `${table}${rowId}`;
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

	broadcastRoomSystemMessage(roomId: number, text: string): void {
		for (const client of this.clients.values()) {
			if (client.ws.readyState === OPEN && client.rooms.has(roomId)) {
				try {
					client.ws.send(
						JSON.stringify({
							type: "system",
							roomId,
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

	// --- Contacts & Blocks ---

	sendContactRequest(sender: string, receiver: string): boolean {
		try {
			this.database.db.prepare(`
				INSERT INTO contact_requests (sender, receiver, status, created_at, updated_at)
				VALUES (?, ?, 'pending', ?, ?)
				ON CONFLICT(sender, receiver) DO UPDATE SET status = 'pending', updated_at = excluded.updated_at
			`).run(sender, receiver, Date.now(), Date.now());
			return true;
		} catch (err) {
			console.error("[ChatService] error in sendContactRequest:", err);
			return false;
		}
	}

	acceptContactRequest(receiver: string, sender: string): boolean {
		try {
			const res = this.database.db.prepare(`
				UPDATE contact_requests SET status = 'accepted', updated_at = ?
				WHERE LOWER(receiver) = LOWER(?) AND LOWER(sender) = LOWER(?)
			`).run(Date.now(), receiver, sender);
			
			// Also auto-accept the reverse if it exists, or create it so it's a two-way street
			this.database.db.prepare(`
				INSERT INTO contact_requests (sender, receiver, status, created_at, updated_at)
				VALUES (?, ?, 'accepted', ?, ?)
				ON CONFLICT(sender, receiver) DO UPDATE SET status = 'accepted', updated_at = excluded.updated_at
			`).run(receiver, sender, Date.now(), Date.now());
			return res.changes > 0;
		} catch (err) {
			console.error("[ChatService] error in acceptContactRequest:", err);
			return false;
		}
	}

	rejectContactRequest(receiver: string, sender: string): boolean {
		try {
			const res = this.database.db.prepare(`
				UPDATE contact_requests SET status = 'rejected', updated_at = ?
				WHERE LOWER(receiver) = LOWER(?) AND LOWER(sender) = LOWER(?)
			`).run(Date.now(), receiver, sender);
			return res.changes > 0;
		} catch (err) {
			console.error("[ChatService] error in rejectContactRequest:", err);
			return false;
		}
	}

	getContactsAndRequests(username: string) {
		try {
			const contacts = this.database.db.prepare(`
				SELECT receiver as peer FROM contact_requests WHERE LOWER(sender) = LOWER(?) AND status = 'accepted'
			`).all(username) as { peer: string }[];
			
			const pendingIn = this.database.db.prepare(`
				SELECT sender as peer FROM contact_requests WHERE LOWER(receiver) = LOWER(?) AND status = 'pending'
			`).all(username) as { peer: string }[];
			
			const pendingOut = this.database.db.prepare(`
				SELECT receiver as peer FROM contact_requests WHERE LOWER(sender) = LOWER(?) AND status = 'pending'
			`).all(username) as { peer: string }[];

			return {
				contacts: contacts.map(c => c.peer),
				pendingIn: pendingIn.map(c => c.peer),
				pendingOut: pendingOut.map(c => c.peer),
			};
		} catch (err) {
			console.error("[ChatService] error in getContactsAndRequests:", err);
			return { contacts: [], pendingIn: [], pendingOut: [] };
		}
	}

	blockUser(blocker: string, blocked: string): boolean {
		try {
			this.database.db.prepare(`
				INSERT OR IGNORE INTO user_blocks (blocker, blocked, created_at)
				VALUES (?, ?, ?)
			`).run(blocker, blocked, Date.now());
			return true;
		} catch (err) {
			console.error("[ChatService] error in blockUser:", err);
			return false;
		}
	}

	unblockUser(blocker: string, blocked: string): boolean {
		try {
			this.database.db.prepare(`
				DELETE FROM user_blocks WHERE LOWER(blocker) = LOWER(?) AND LOWER(blocked) = LOWER(?)
			`).run(blocker, blocked);
			return true;
		} catch (err) {
			console.error("[ChatService] error in unblockUser:", err);
			return false;
		}
	}

	getBlocklist(username: string): string[] {
		try {
			const rows = this.database.db.prepare(`
				SELECT blocked FROM user_blocks WHERE LOWER(blocker) = LOWER(?)
			`).all(username) as { blocked: string }[];
			return rows.map(r => r.blocked);
		} catch (err) {
			console.error("[ChatService] error in getBlocklist:", err);
			return [];
		}
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

	isBlockedBy(userA: string, userB: string): boolean {
		try {
			const isBlocked = this.database.db.prepare(`
				SELECT 1 FROM user_blocks 
				WHERE (LOWER(blocker) = LOWER(?) AND LOWER(blocked) = LOWER(?))
				   OR (LOWER(blocker) = LOWER(?) AND LOWER(blocked) = LOWER(?))
			`).get(userA, userB, userB, userA);
			return !!isBlocked;
		} catch (err) {
			console.error("[ChatService] Failed to check block status:", err);
			return false;
		}
	}

	// Relay a chat message. An empty toUsername broadcasts to every other live
	// client (lobby); otherwise it's delivered only to clients of that username.
	// Returns true if delivered to at least one socket.
	relayChat(
		fromClientId: string,
		toUsername: string,
		text: string,
		ref?: string,
	): boolean {
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

		if (!isLobby) {
			if (this.isBlockedBy(toUsername, from.rawUsername)) {
				return false;
			}
		}

		// One timestamp for the whole message rather than one per recipient:
		// otherwise every client is told a different `ts` for the same message,
		// and none of them matches the row that was stored.
		const ts = Date.now();
		// DMs are never persisted -- the server only sees ciphertext -- so they
		// have no row and honestly no id. They also have no history to dedupe
		// against, so nothing needs one.
		const rowId = isLobby
			? this.persistLobbyMessage(from.username, clean, ts)
			: null;
		const id = rowId === null ? undefined : wireId("l", rowId);

		let delivered = false;
		for (const client of this.clients.values()) {
			if (client.id === fromClientId || client.ws.readyState !== OPEN) continue;
			if (
				isLobby ||
				client.username === toUsername ||
				client.rawUsername === toUsername
			) {
				if (isLobby && this.isBlockedBy(client.rawUsername, from.rawUsername)) continue;

				client.ws.send(
					JSON.stringify({
						type: "chat",
						id,
						from: from.username,
						text: clean,
						ts,
						lobby: isLobby,
					}),
				);
				delivered = true;
			}
		}
		this.sendAck(from, "chat_ack", id, ts, ref);
		return delivered;
	}

	/**
	 * Tell the sender what their own message ended up as. They are skipped in
	 * every fan-out above, so without this they never learn its id or the
	 * server's timestamp, and the copy they rendered optimistically appears a
	 * second time as soon as history is fetched.
	 *
	 * `ref` is whatever the client attached on the way out; it is echoed
	 * untouched so a client with several messages in flight can tell the acks
	 * apart. Older clients send none and simply ignore the frame.
	 */
	private sendAck(
		client: ChatClient,
		type: "chat_ack" | "room_chat_ack",
		id: string | undefined,
		ts: number,
		ref?: string,
		roomId?: number,
	): void {
		if (!id || client.ws.readyState !== OPEN) return;
		try {
			client.ws.send(JSON.stringify({ type, id, ts, ref, roomId }));
		} catch (err) {
			console.error("[ChatService] ack error:", err);
		}
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
					"SELECT id, username, message, created_at FROM peer_chat_messages ORDER BY id DESC LIMIT ?",
				)
				.all(Math.min(limit, LOBBY_HISTORY_CAP)) as (Omit<
				LobbyMessage,
				"id"
			> & { id: number })[];
			return rows.reverse().map((r) => ({ ...r, id: wireId("l", r.id) }));
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
	// annoyance, a relay that throws mid-broadcast drops live messages. A null
	// return means the row is gone, so the message goes out without an id
	// rather than with one that points at nothing.
	private persistLobbyMessage(
		username: string,
		message: string,
		ts: number,
	): number | null {
		try {
			const result = this.database.db
				.prepare(
					"INSERT INTO peer_chat_messages (username, message, created_at) VALUES (?, ?, ?)",
				)
				.run(username, message, ts || Date.now());
			this.database.db
				.prepare(
					"DELETE FROM peer_chat_messages WHERE id <= (SELECT MAX(id) FROM peer_chat_messages) - ?",
				)
				.run(LOBBY_HISTORY_CAP);
			return Number(result.lastInsertRowid);
		} catch (err) {
			console.error("[ChatService] Failed to persist lobby message:", err);
			return null;
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

		// The sender's timestamp, not ours: the row has to carry what every
		// client is told on the wire below, or history and live traffic
		// disagree about the same message. Freshness is already bounded by the
		// federation service before we get here.
		const wireTs = ts || Date.now();
		const rowId = isLobby
			? this.persistLobbyMessage(qualifiedFrom, clean, wireTs)
			: null;
		const id = rowId === null ? undefined : wireId("l", rowId);

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
						id,
						from: qualifiedFrom,
						text: clean,
						ts: wireTs,
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

		const rowId = this.persistRoomMessage(room.id, qualifiedFrom, text, ts);
		const id = rowId === null ? undefined : wireId("r", rowId);

		let delivered = false;
		for (const client of this.clients.values()) {
			if (client.ws.readyState !== OPEN || !client.rooms.has(room.id)) continue;
			try {
				client.ws.send(
					JSON.stringify({
						type: "room_chat",
						id,
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
				`SELECT id, global_id, name, description, is_private, created_by FROM chat_rooms WHERE ${column} = ?`,
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

	isRoomBanned(roomId: number, username: string): boolean {
		try {
			const ban = this.database.db
				.prepare(
					"SELECT id FROM chat_room_bans WHERE room_id = ? AND LOWER(username) = LOWER(?)",
				)
				.get(roomId, username.trim());
			return !!ban;
		} catch {
			return false;
		}
	}

	/** Membership is keyed by username, not by socket: a user joined from the
	 * webapp stays a member for their Sidecamp daemon, and across reconnects.
	 * Every live socket of that user is subscribed too, so delivery is immediate. */
	joinRoomByUser(username: string, roomId: number): boolean {
		if (!this.getRoom(roomId)) return false;
		if (this.isRoomBanned(roomId, username)) return false;
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

	kickUserFromRoom(
		adminOrOwnerUsername: string,
		targetUsername: string,
		roomId: number,
		reason?: string,
		isAdmin = false,
	): boolean {
		const room = this.getRoom(roomId);
		if (!room) return false;
		const isOwner = Boolean(
			room.created_by &&
				adminOrOwnerUsername &&
				room.created_by.toLowerCase() === adminOrOwnerUsername.toLowerCase(),
		);
		if (!isOwner && !isAdmin) return false;

		const targetClean = targetUsername.trim();
		this.leaveRoomByUser(targetClean, roomId);

		// Notify target user sockets that they were kicked from the room
		for (const client of this.clientsOf(targetClean)) {
			if (client.ws.readyState === OPEN) {
				try {
					client.ws.send(
						JSON.stringify({
							type: "room_kicked",
							roomId,
							reason: reason || `Kicked from ${room.name}`,
						}),
					);
				} catch (err) {
					console.error("[ChatService] error sending room_kicked:", err);
				}
			}
		}

		this.broadcastRoomSystemMessage(
			roomId,
			`[System] ${targetClean} was kicked from this room by ${adminOrOwnerUsername}${
				reason ? ` (${reason})` : ""
			}`,
		);
		return true;
	}

	banUserFromRoom(
		adminOrOwnerUsername: string,
		targetUsername: string,
		roomId: number,
		reason?: string,
		isAdmin = false,
	): boolean {
		const room = this.getRoom(roomId);
		if (!room) return false;
		const isOwner = Boolean(
			room.created_by &&
				adminOrOwnerUsername &&
				room.created_by.toLowerCase() === adminOrOwnerUsername.toLowerCase(),
		);
		if (!isOwner && !isAdmin) return false;

		const targetClean = targetUsername.trim();
		try {
			this.database.db
				.prepare(
					"INSERT OR REPLACE INTO chat_room_bans (room_id, username, banned_by, reason, created_at) VALUES (?, ?, ?, ?, ?)",
				)
				.run(
					roomId,
					targetClean.toLowerCase(),
					adminOrOwnerUsername,
					reason || null,
					Date.now(),
				);
		} catch (err) {
			console.error("[ChatService] Failed to record room ban:", err);
		}

		this.kickUserFromRoom(
			adminOrOwnerUsername,
			targetClean,
			roomId,
			reason ? `Banned: ${reason}` : `Banned from ${room.name}`,
			isAdmin,
		);

		this.broadcastRoomSystemMessage(
			roomId,
			`[System] ${targetClean} was banned from this room by ${adminOrOwnerUsername}${
				reason ? ` (${reason})` : ""
			}`,
		);
		return true;
	}

	unbanUserFromRoom(
		adminOrOwnerUsername: string,
		targetUsername: string,
		roomId: number,
		isAdmin = false,
	): boolean {
		const room = this.getRoom(roomId);
		if (!room) return false;
		const isOwner = Boolean(
			room.created_by &&
				adminOrOwnerUsername &&
				room.created_by.toLowerCase() === adminOrOwnerUsername.toLowerCase(),
		);
		if (!isOwner && !isAdmin) return false;

		const targetClean = targetUsername.trim();
		try {
			this.database.db
				.prepare(
					"DELETE FROM chat_room_bans WHERE room_id = ? AND LOWER(username) = LOWER(?)",
				)
				.run(roomId, targetClean);
		} catch (err) {
			console.error("[ChatService] Failed to remove room ban:", err);
		}

		this.broadcastRoomSystemMessage(
			roomId,
			`[System] ${targetClean} was unbanned from this room by ${adminOrOwnerUsername}`,
		);
		return true;
	}

	getRoomBans(
		roomId: number,
	): {
		username: string;
		banned_by: string;
		reason: string | null;
		created_at: number;
	}[] {
		try {
			return this.database.db
				.prepare(
					"SELECT username, banned_by, reason, created_at FROM chat_room_bans WHERE room_id = ? ORDER BY created_at DESC",
				)
				.all(roomId) as any[];
		} catch {
			return [];
		}
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
	): {
		id: string;
		username: string;
		message: string;
		created_at: number;
	}[] {
		try {
			const rows = this.database.db
				.prepare(
					"SELECT id, username, message, created_at FROM chat_room_messages WHERE room_id = ? ORDER BY id DESC LIMIT ?",
				)
				.all(roomId, Math.min(limit, ROOM_HISTORY_CAP)) as {
				id: number;
				username: string;
				message: string;
				created_at: number;
			}[];
			return rows.map((r) => ({ ...r, id: wireId("r", r.id) }));
		} catch {
			return [];
		}
	}

	/** Relay a message to every client subscribed to roomId. */
	relayRoomMessage(
		roomId: number,
		fromClientId: string,
		text: string,
		ref?: string,
	): boolean {
		const from = this.clients.get(fromClientId);
		if (!from) return false;
		const clean = String(text ?? "").slice(0, MAX_TEXT_LENGTH);
		if (!clean.trim()) return false;
		if (!this.isMember(roomId, from.username)) return false;

		const ts = Date.now();
		const rowId = this.persistRoomMessage(roomId, from.username, clean, ts);
		const id = rowId === null ? undefined : wireId("r", rowId);

		let delivered = false;
		for (const client of this.clients.values()) {
			if (
				client.ws.readyState !== OPEN ||
				!client.rooms.has(roomId) ||
				client.id === fromClientId
			)
				continue;
			
			if (this.isBlockedBy(client.rawUsername, from.rawUsername)) continue;

			try {
				client.ws.send(
					JSON.stringify({
						type: "room_chat",
						id,
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
		this.sendAck(from, "room_chat_ack", id, ts, ref, roomId);
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
	// not fall back to the table's strftime('%s') default (seconds). A null
	// return means the row is gone; see `persistLobbyMessage`.
	private persistRoomMessage(
		roomId: number,
		username: string,
		message: string,
		ts: number,
	): number | null {
		try {
			const result = this.database.db
				.prepare(
					"INSERT INTO chat_room_messages (room_id, username, message, created_at) VALUES (?, ?, ?, ?)",
				)
				.run(roomId, username, message, ts || Date.now());
			this.database.db
				.prepare(
					"DELETE FROM chat_room_messages WHERE room_id = ? AND id <= (SELECT MAX(id) FROM chat_room_messages WHERE room_id = ?) - ?",
				)
				.run(roomId, roomId, ROOM_HISTORY_CAP);
			return Number(result.lastInsertRowid);
		} catch (err) {
			console.error("[ChatService] Failed to persist room message:", err);
			return null;
		}
	}
}

export function createChatService(database: DatabaseService): ChatService {
	return new ChatService(database);
}
