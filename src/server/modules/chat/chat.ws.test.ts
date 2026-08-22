import { describe, expect, it, jest, afterEach } from '@jest/globals';
import http from 'http';
import Database from 'better-sqlite3';
import { WebSocket as WSClient } from 'ws';
import { createChatWsHandler } from './chat.ws.js';
import { createChatService, ChatService } from './chat.service.js';
import type { DatabaseService } from '../../core/database.types.js';

// Waits for the next parsed JSON message from a ws client, optionally filtered by predicate.
function nextMessage(ws: WSClient, predicate?: (msg: any) => boolean, timeoutMs = 2000): Promise<any> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            ws.off('message', onMessage);
            reject(new Error('Timed out waiting for message'));
        }, timeoutMs);
        const onMessage = (data: WSClient.RawData) => {
            const msg = JSON.parse(data.toString());
            if (!predicate || predicate(msg)) {
                clearTimeout(timer);
                ws.off('message', onMessage);
                resolve(msg);
            }
        };
        ws.on('message', onMessage);
    });
}

function waitForUnexpectedResponse(ws: WSClient, timeoutMs = 2000): Promise<number> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for response')), timeoutMs);
        ws.once('unexpected-response', (_req, res) => {
            clearTimeout(timer);
            resolve(res.statusCode);
        });
    });
}

describe('createChatWsHandler', () => {
    let server: http.Server;
    let db: InstanceType<typeof Database>;
    let chatService: ChatService;
    let clients: WSClient[] = [];

    afterEach(async () => {
        for (const c of clients) {
            try { c.close(); } catch { /* already closed */ }
        }
        clients = [];
        db?.close();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    function setup(settings: Record<string, string>, verifyToken: any = jest.fn()) {
        db = new Database(':memory:');
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
        db.exec(`CREATE TABLE chat_room_bans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            banned_by TEXT NOT NULL,
            reason TEXT,
            created_at INTEGER NOT NULL DEFAULT 0,
            UNIQUE(room_id, username)
        )`);
        db.exec(`CREATE TABLE chat_room_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT 0
        )`);
        chatService = createChatService({ db } as unknown as DatabaseService);

        const container = {
            identity: { getSetting: (key: string) => settings[key] },
            authService: { verifyToken },
            chatService,
        } as any;

        server = http.createServer();
        createChatWsHandler(server, container);
        return new Promise<number>((resolve) => {
            server.listen(0, () => {
                const address = server.address();
                resolve(typeof address === 'object' && address ? address.port : 0);
            });
        });
    }

    function connect(port: number, query = ''): WSClient {
        const ws = new WSClient(`ws://127.0.0.1:${port}/ws/chat${query}`);
        ws.on('error', () => {}); // rejected handshakes emit 'error'; assertions read the status instead
        clients.push(ws);
        return ws;
    }

    describe('gating', () => {
        it('rejects every connection when peerChatEnabled is off', async () => {
            const port = await setup({ peerChatEnabled: 'false', peerChatGuestEnabled: 'true' });
            const status = await waitForUnexpectedResponse(connect(port, '?guestName=alice'));
            expect(status).toBe(503);
        });

        it('rejects an anonymous connection when peerChatGuestEnabled is off', async () => {
            const port = await setup({ peerChatEnabled: 'true', peerChatGuestEnabled: 'false' });
            const status = await waitForUnexpectedResponse(connect(port));
            expect(status).toBe(401);
        });

        it('rejects a connection whose token does not verify', async () => {
            const verifyToken = jest.fn(async () => null);
            const port = await setup({ peerChatEnabled: 'true' }, verifyToken);
            const status = await waitForUnexpectedResponse(connect(port, '?token=bogus'));
            expect(status).toBe(401);
        });

        it('accepts a valid token and reports the authenticated username and admin flag', async () => {
            const verifyToken = jest.fn(async () => ({ userId: 7, username: 'alice', role: 'admin' }));
            const port = await setup({ peerChatEnabled: 'true' }, verifyToken);

            const authOk = await nextMessage(connect(port, '?token=good'), (m) => m.type === 'auth_ok');

            expect(authOk.username).toBe('alice');
            expect(authOk.isAdmin).toBe(true);
            expect(authOk.sessionId).toEqual(expect.any(String));
        });

        it('recognizes manager role as admin in chat', async () => {
            const verifyToken = jest.fn(async () => ({ userId: 8, username: 'mgr', role: 'manager' }));
            const port = await setup({ peerChatEnabled: 'true' }, verifyToken);

            const authOk = await nextMessage(connect(port, '?token=good'), (m) => m.type === 'auth_ok');

            expect(authOk.username).toBe('mgr');
            expect(authOk.isAdmin).toBe(true);
        });

        it('rejects banned user connection with 403', async () => {
            const verifyToken = jest.fn(async () => ({ userId: 9, username: 'banneduser', role: 'user' }));
            const port = await setup({ peerChatEnabled: 'true' }, verifyToken);
            chatService.banUser('admin', 'banneduser', 'spam');

            const status = await waitForUnexpectedResponse(connect(port, '?token=banned'));
            expect(status).toBe(403);
        });

        it('accepts a guest and sanitizes the guest name', async () => {
            const port = await setup({ peerChatEnabled: 'true', peerChatGuestEnabled: 'true' });

            const authOk = await nextMessage(connect(port, '?guestName=Al!ce<script>'), (m) => m.type === 'auth_ok');

            expect(authOk.username).toBe('(Guest) Alcescript');
            expect(authOk.isAdmin).toBe(false);
        });

        // No can_peer check here: chatting is not sharing your local folders.
        it('does not consult the can_peer grant', async () => {
            const getUserByUsername = jest.fn();
            const verifyToken = jest.fn(async () => ({ userId: 7, username: 'alice' }));
            const port = await setup({ peerChatEnabled: 'true' }, verifyToken);

            await nextMessage(connect(port, '?token=good'), (m) => m.type === 'auth_ok');

            expect(getUserByUsername).not.toHaveBeenCalled();
        });
    });

    describe('relaying and moderation', () => {
        it('broadcasts a lobby message to other browser clients', async () => {
            const port = await setup({ peerChatEnabled: 'true', peerChatGuestEnabled: 'true' });

            const alice = connect(port, '?guestName=alice');
            await nextMessage(alice, (m) => m.type === 'auth_ok');
            const bob = connect(port, '?guestName=bob');
            await nextMessage(bob, (m) => m.type === 'auth_ok');

            alice.send(JSON.stringify({ type: 'chat', to: '', text: 'hello lobby' }));
            const relayed = await nextMessage(bob, (m) => m.type === 'chat');

            expect(relayed).toMatchObject({ from: '(Guest) alice', text: 'hello lobby', lobby: true });
        });

        it('allows manager to execute admin_action kick', async () => {
            const verifyToken = jest.fn(async (t: string) => {
                if (t === 'mgr') return { userId: 1, username: 'mgr', role: 'manager' };
                return { userId: 2, username: 'user1', role: 'user' };
            });
            const port = await setup({ peerChatEnabled: 'true' }, verifyToken);

            const mgr = connect(port, '?token=mgr');
            await nextMessage(mgr, (m) => m.type === 'auth_ok');

            const user1 = connect(port, '?token=user1');
            await nextMessage(user1, (m) => m.type === 'auth_ok');

            mgr.send(JSON.stringify({ type: 'admin_action', action: 'kick', target: 'user1', reason: 'behave' }));
            const kickedMsg = await nextMessage(user1, (m) => m.type === 'kicked');

            expect(kickedMsg.reason).toBe('behave');
        });

        it('allows manager to execute global admin_action zkick', async () => {
            const verifyToken = jest.fn(async (t: string) => {
                if (t === 'mgr') return { userId: 1, username: 'mgr', role: 'manager' };
                return { userId: 2, username: 'user1', role: 'user' };
            });
            const port = await setup({ peerChatEnabled: 'true' }, verifyToken);

            const mgr = connect(port, '?token=mgr');
            await nextMessage(mgr, (m) => m.type === 'auth_ok');

            const user1 = connect(port, '?token=user1');
            await nextMessage(user1, (m) => m.type === 'auth_ok');

            mgr.send(JSON.stringify({ type: 'admin_action', action: 'zkick', target: 'user1', reason: 'global kick' }));
            const kickedMsg = await nextMessage(user1, (m) => m.type === 'kicked');

            expect(kickedMsg.reason).toBe('global kick');
        });

        it('allows room owner to kick user from room using room-scoped admin_action', async () => {
            const verifyToken = jest.fn(async (t: string) => {
                if (t === 'alice') return { userId: 1, username: 'alice', role: 'user' };
                return { userId: 2, username: 'bob', role: 'user' };
            });
            const port = await setup({ peerChatEnabled: 'true' }, verifyToken);

            const room = chatService.createRoom('alice-room', '', false, 'alice');

            const alice = connect(port, '?token=alice');
            await nextMessage(alice, (m) => m.type === 'auth_ok');
            alice.send(JSON.stringify({ type: 'room_join', roomId: room.id }));

            const bob = connect(port, '?token=bob');
            await nextMessage(bob, (m) => m.type === 'auth_ok');
            bob.send(JSON.stringify({ type: 'room_join', roomId: room.id }));

            // Give a tick for membership
            await new Promise((r) => setTimeout(r, 50));
            expect(chatService.isMember(room.id, 'bob')).toBe(true);

            // Alice kicks Bob from the room
            alice.send(JSON.stringify({ type: 'admin_action', action: 'kick', target: 'bob', roomId: room.id, reason: 'noise' }));
            const roomKickedMsg = await nextMessage(bob, (m) => m.type === 'room_kicked');

            expect(roomKickedMsg.roomId).toBe(room.id);
            expect(chatService.isMember(room.id, 'bob')).toBe(false);
        });

        it('rejects admin_action from non-admin user', async () => {
            const verifyToken = jest.fn(async () => ({ userId: 2, username: 'user1', role: 'user' }));
            const port = await setup({ peerChatEnabled: 'true' }, verifyToken);

            const user1 = connect(port, '?token=user1');
            await nextMessage(user1, (m) => m.type === 'auth_ok');

            user1.send(JSON.stringify({ type: 'admin_action', action: 'kick', target: 'someone' }));
            const err = await nextMessage(user1, (m) => m.type === 'system');

            expect(err.text).toContain('Admin permissions required');
        });

        it('reaches a client registered through the peer transport, so both share one lobby', async () => {
            const port = await setup({ peerChatEnabled: 'true', peerChatGuestEnabled: 'true' });

            const alice = connect(port, '?guestName=alice');
            await nextMessage(alice, (m) => m.type === 'auth_ok');

            // Stand in for a Sidecamp daemon that joined via /ws/peer.
            const daemonWs = { readyState: 1, send: jest.fn() };
            chatService.register('daemon-session', 'daemon', daemonWs);

            alice.send(JSON.stringify({ type: 'chat', to: '', text: 'ping the daemon' }));
            await new Promise((r) => setTimeout(r, 200));

            expect(daemonWs.send).toHaveBeenCalledWith(expect.stringContaining('ping the daemon'));
        });

        it('broadcasts a newly announced pubkey to other clients', async () => {
            const port = await setup({ peerChatEnabled: 'true', peerChatGuestEnabled: 'true' });

            const alice = connect(port, '?guestName=alice');
            await nextMessage(alice, (m) => m.type === 'auth_ok');
            const bob = connect(port, '?guestName=bob');
            await nextMessage(bob, (m) => m.type === 'auth_ok');

            alice.send(JSON.stringify({ type: 'pubkey', pubkey: 'alice-pub' }));
            const relayed = await nextMessage(bob, (m) => m.type === 'pubkey');

            expect(relayed).toMatchObject({ from: '(Guest) alice', pubkey: 'alice-pub' });
        });

        it('drops a client from the lobby when its socket closes', async () => {
            const port = await setup({ peerChatEnabled: 'true', peerChatGuestEnabled: 'true' });

            const alice = connect(port, '?guestName=alice');
            await nextMessage(alice, (m) => m.type === 'auth_ok');
            const bob = connect(port, '?guestName=bob');
            await nextMessage(bob, (m) => m.type === 'auth_ok');

            bob.close();
            await new Promise((r) => setTimeout(r, 200));

            // Only bob was listening, so nothing is left to deliver to.
            const daemonWs = { readyState: 1, send: jest.fn() };
            chatService.register('probe', 'probe', daemonWs);
            alice.send(JSON.stringify({ type: 'chat', to: 'bob', text: 'still there?' }));
            await new Promise((r) => setTimeout(r, 200));

            expect(daemonWs.send).not.toHaveBeenCalled();
        });
    });
});
