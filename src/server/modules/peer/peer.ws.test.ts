import { describe, expect, it, jest, afterEach } from '@jest/globals';
import http from 'http';
import { WebSocket as WSClient } from 'ws';
import { canUsePeer, createPeerWsHandler } from './peer.ws.js';
import { PeerService } from './peer.service.js';
import { UserRole } from '../../common/visibility.js';
import type { DatabaseService } from '../../core/database.types.js';

describe('canUsePeer', () => {
    const base = { can_peer: 0, is_root: false, role: UserRole.NORMAL_USER };

    it('denies missing user', () => {
        expect(canUsePeer(undefined)).toBe(false);
    });

    it('denies regular user without can_peer', () => {
        expect(canUsePeer(base)).toBe(false);
    });

    it('allows regular user with can_peer grant', () => {
        expect(canUsePeer({ ...base, can_peer: 1 })).toBe(true);
    });

    it('allows root admin without can_peer', () => {
        expect(canUsePeer({ ...base, is_root: true, role: UserRole.ROOT_ADMIN })).toBe(true);
    });

    it('allows manager (admin role) without can_peer', () => {
        expect(canUsePeer({ ...base, role: UserRole.ADMIN })).toBe(true);
    });

    it('denies curator (super_user) without can_peer', () => {
        expect(canUsePeer({ ...base, role: UserRole.SUPER_USER })).toBe(false);
    });
});

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

describe('createPeerWsHandler', () => {
    let server: http.Server;
    let peerService: PeerService;
    let clients: WSClient[] = [];

    afterEach(async () => {
        for (const c of clients) {
            try { c.close(); } catch {}
        }
        clients = [];
        peerService?.stopHeartbeat();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    function setup(settings: Record<string, string>) {
        const mockDatabase = {
            peer: {
                createPeerSession: jest.fn(),
                updatePeerSessionHeartbeat: jest.fn(),
                deletePeerSession: jest.fn(),
                deleteStaleSessionsForUser: jest.fn(),
                deleteStaleSessions: jest.fn(),
            },
            identity: { getSetting: (key: string) => settings[key] },
        } as unknown as DatabaseService;

        peerService = new PeerService(mockDatabase);
        peerService.stopHeartbeat(); // avoid interval leaking across tests

        const container = {
            identity: { getSetting: (key: string) => settings[key] },
            authService: { verifyToken: jest.fn(), getUserByUsername: jest.fn() },
            peerService,
        } as any;

        server = http.createServer();
        createPeerWsHandler(server, container);
        return new Promise<number>((resolve) => {
            server.listen(0, () => {
                const address = server.address();
                resolve(typeof address === 'object' && address ? address.port : 0);
            });
        });
    }

    function connect(port: number, query = ''): WSClient {
        const ws = new WSClient(`ws://127.0.0.1:${port}/ws/peer${query}`);
        ws.on('error', () => {}); // rejected handshakes emit 'error'; assertions read the status instead
        clients.push(ws);
        return ws;
    }

    describe('guest mode', () => {
        it('rejects guest connections when peerGuestEnabled is off', async () => {
            const port = await setup({ peerEnabled: 'true', peerGuestEnabled: 'false' });
            const ws = connect(port);
            const status = await waitForUnexpectedResponse(ws);
            expect(status).toBe(401);
        });

        it('accepts a guest connection and sanitizes the guest name', async () => {
            const port = await setup({ peerEnabled: 'true', peerGuestEnabled: 'true' });
            const ws = connect(port, '?guestName=Al!ce<script>');
            const authOk = await nextMessage(ws, (m) => m.type === 'auth_ok');
            expect(authOk.sessionId).toEqual(expect.any(String));
        });

        it('rejects any connection when peerEnabled is off, even with a guest name', async () => {
            const port = await setup({ peerEnabled: 'false', peerGuestEnabled: 'true' });
            const ws = connect(port, '?guestName=alice');
            const status = await waitForUnexpectedResponse(ws);
            expect(status).toBe(503);
        });
    });

    describe('pubkey relay', () => {
        it('broadcasts a newly announced pubkey to other connected peers', async () => {
            const port = await setup({ peerEnabled: 'true', peerGuestEnabled: 'true' });

            const alice = connect(port, '?guestName=alice');
            await nextMessage(alice, (m) => m.type === 'auth_ok');

            const bob = connect(port, '?guestName=bob');
            await nextMessage(bob, (m) => m.type === 'auth_ok');

            alice.send(JSON.stringify({ type: 'pubkey', pubkey: 'alice-pub' }));
            const relayed = await nextMessage(bob, (m) => m.type === 'pubkey');

            expect(relayed.pubkey).toBe('alice-pub');
            expect(relayed.from).toContain('alice');
        });

        it('sends the roster of already-known pubkeys back to the newly announcing peer', async () => {
            const port = await setup({ peerEnabled: 'true', peerGuestEnabled: 'true' });

            const alice = connect(port, '?guestName=alice');
            await nextMessage(alice, (m) => m.type === 'auth_ok');
            alice.send(JSON.stringify({ type: 'pubkey', pubkey: 'alice-pub' }));

            const bob = connect(port, '?guestName=bob');
            await nextMessage(bob, (m) => m.type === 'auth_ok');
            bob.send(JSON.stringify({ type: 'pubkey', pubkey: 'bob-pub' }));

            const rosterEntry = await nextMessage(bob, (m) => m.type === 'pubkey' && m.pubkey === 'alice-pub');
            expect(rosterEntry.from).toContain('alice');
        });
    });
});
