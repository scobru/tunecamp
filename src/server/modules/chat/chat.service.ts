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
}

interface ChatClient {
    id: string;
    username: string;
    ws: ChatSocket;
    pubkey?: string;
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

    constructor(private database: DatabaseService) {}

    register(clientId: string, username: string, ws: ChatSocket): void {
        this.clients.set(clientId, { id: clientId, username, ws });
    }

    unregister(clientId: string): void {
        this.clients.delete(clientId);
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
        if (isLobby) this.persistLobbyMessage(from.username, clean);
        let delivered = false;
        for (const client of this.clients.values()) {
            if (client.id === fromClientId || client.ws.readyState !== OPEN) continue;
            if (isLobby || client.username === toUsername) {
                client.ws.send(JSON.stringify({ type: "chat", from: from.username, text: clean, ts: Date.now(), lobby: isLobby }));
                delivered = true;
            }
        }
        return delivered;
    }

    // Store a client's E2E public key (opaque to the server — just relayed for
    // client-side encryption), broadcast it to already-connected clients, and
    // return the keys already known for those clients so the caller can send
    // them back to the newly-announcing one.
    setPubkey(clientId: string, pubkey: string): { username: string; pubkey: string }[] {
        const client = this.clients.get(clientId);
        if (!client) return [];
        client.pubkey = pubkey;
        const roster: { username: string; pubkey: string }[] = [];
        for (const other of this.clients.values()) {
            if (other.id === clientId) continue;
            if (other.ws.readyState === OPEN) {
                other.ws.send(JSON.stringify({ type: "pubkey", from: client.username, pubkey }));
            }
            if (other.pubkey) roster.push({ username: other.username, pubkey: other.pubkey });
        }
        return roster;
    }

    // Lobby backlog, oldest first — the order a client renders it in.
    getHistory(limit = 100): LobbyMessage[] {
        try {
            const rows = this.database.db.prepare(
                "SELECT username, message, created_at FROM peer_chat_messages ORDER BY id DESC LIMIT ?"
            ).all(Math.min(limit, LOBBY_HISTORY_CAP)) as LobbyMessage[];
            return rows.reverse();
        } catch (err) {
            console.error("[ChatService] Failed to fetch lobby history:", err);
            return [];
        }
    }

    // Chat must keep flowing even if the write fails: a broken backlog is an
    // annoyance, a relay that throws mid-broadcast drops live messages.
    private persistLobbyMessage(username: string, message: string): void {
        try {
            this.database.db.prepare(
                "INSERT INTO peer_chat_messages (username, message, created_at) VALUES (?, ?, ?)"
            ).run(username, message, Date.now());
            this.database.db.prepare(
                "DELETE FROM peer_chat_messages WHERE id <= (SELECT MAX(id) FROM peer_chat_messages) - ?"
            ).run(LOBBY_HISTORY_CAP);
        } catch (err) {
            console.error("[ChatService] Failed to persist lobby message:", err);
        }
    }
}

export function createChatService(database: DatabaseService): ChatService {
    return new ChatService(database);
}
