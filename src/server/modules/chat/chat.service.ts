// Chat relay shared by every transport that can carry messages: the peer
// daemon socket (/ws/peer) and the browser socket (/ws/chat). Both register
// their sockets here, so a Sidecamp daemon and a webapp tab sit in the same
// lobby instead of two invisible rooms.
//
// The server is deliberately opaque to direct messages: `text` is ciphertext
// produced client-side (Curve25519/XSalsa20-Poly1305) and is relayed verbatim.
// Only the lobby carries plaintext.

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
}

export interface LobbyMessage {
	username: string;
	message: string;
	created_at: number;
}

const OPEN = 1;
const MAX_TEXT_LENGTH = 2000;
// Backlog handed to a client that just joined. Older rows are dropped on insert:
// this is a chat lobby, not an archive.
const LOBBY_HISTORY_CAP = 500;

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
		// If this user already has an active chat session, replace it to avoid duplicate lobby entries from browser + peer daemon.
		if (userId !== undefined) {
			const existingId = this.userIdMap.get(userId);
			if (existingId !== undefined && existingId !== clientId) {
				const existing = this.clients.get(existingId);
				if (existing) {
					try {
						existing.ws.close?.();
					} catch (err) {
						console.error(
							"[ChatService] Failed to close replaced session:",
							err,
						);
					}
				}
				this.clients.delete(existingId);
			}
		}

		// Disambiguate duplicate usernames by appending an incremental suffix
		const existingWithSameName = Array.from(this.clients.values()).filter(
			(c) => c.rawUsername === rawUsername,
		);
		const collisionCount = existingWithSameName.length;
		const username =
			collisionCount > 0
				? `${rawUsername} #${collisionCount + 1}`
				: rawUsername;

		this.clients.set(clientId, {
			id: clientId,
			rawUsername,
			username,
			ws,
			isAdmin,
			userId,
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
		const roster: { username: string; pubkey: string }[] = [];
		for (const other of this.clients.values()) {
			if (other.id === clientId) continue;
			if (other.ws.readyState === OPEN) {
				other.ws.send(
					JSON.stringify({ type: "pubkey", from: client.username, pubkey }),
				);
			}
			if (other.pubkey)
				roster.push({ username: other.username, pubkey: other.pubkey });
		}
		return roster;
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
		const result: { username: string; pubkey: boolean }[] = [];
		for (const client of this.clients.values()) {
			result.push({ username: client.username, pubkey: !!client.pubkey });
		}
		return result;
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
}

export function createChatService(database: DatabaseService): ChatService {
	return new ChatService(database);
}
