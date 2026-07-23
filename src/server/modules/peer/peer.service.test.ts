import { describe, expect, it, jest, afterEach, beforeEach } from '@jest/globals';
import { createPeerService, PeerService } from './peer.service.js';
import type { DatabaseService } from '../../core/database.types.js';

describe('createPeerService', () => {
    let mockDatabase: DatabaseService;
    let peerService: PeerService | undefined;

    beforeEach(() => {
        mockDatabase = {} as DatabaseService;
    });

    afterEach(() => {
        if (peerService) {
            peerService.stopHeartbeat();
        }
    });

    it('creates a PeerService instance with required database argument', () => {
        peerService = createPeerService(mockDatabase);

        expect(peerService).toBeInstanceOf(PeerService);
        expect(peerService).toBe(peerService);
    });

    it('creates a PeerService instance with optional apService argument', () => {
        const mockApService = {} as any;
        peerService = createPeerService(mockDatabase, mockApService);

        expect(peerService).toBeInstanceOf(PeerService);
    });
});

function fakeWs() {
    return { readyState: 1, send: jest.fn(), close: jest.fn() } as any;
}

describe('PeerService lobby chat and pubkey relay', () => {
    let peerService: PeerService;

    beforeEach(() => {
        const mockDatabase = {
            peer: {
                createPeerSession: jest.fn(),
                updatePeerSessionHeartbeat: jest.fn(),
                deletePeerSession: jest.fn(),
                deleteStaleSessionsForUser: jest.fn(),
                deleteStaleSessions: jest.fn(),
            },
        } as unknown as DatabaseService;
        peerService = createPeerService(mockDatabase);
        peerService.stopHeartbeat();
    });

    afterEach(() => {
        peerService.stopHeartbeat();
    });

    describe('relayChat', () => {
        it('broadcasts a lobby message (empty toUsername) to every other connected peer', () => {
            const aliceWs = fakeWs();
            const bobWs = fakeWs();
            const carolWs = fakeWs();
            const aliceId = peerService.registerSession(aliceWs, 1, 'alice', null, true);
            peerService.registerSession(bobWs, 2, 'bob', null, true);
            peerService.registerSession(carolWs, 3, 'carol', null, true);

            const delivered = peerService.relayChat(aliceId, '', 'hi everyone');

            expect(delivered).toBe(true);
            expect(aliceWs.send).not.toHaveBeenCalled();
            expect(bobWs.send).toHaveBeenCalledWith(expect.stringContaining('"lobby":true'));
            expect(carolWs.send).toHaveBeenCalledWith(expect.stringContaining('"lobby":true'));
        });

        it('delivers a direct message only to the named recipient', () => {
            const aliceWs = fakeWs();
            const bobWs = fakeWs();
            const carolWs = fakeWs();
            const aliceId = peerService.registerSession(aliceWs, 1, 'alice', null, true);
            peerService.registerSession(bobWs, 2, 'bob', null, true);
            peerService.registerSession(carolWs, 3, 'carol', null, true);

            const delivered = peerService.relayChat(aliceId, 'bob', 'psst');

            expect(delivered).toBe(true);
            expect(bobWs.send).toHaveBeenCalledWith(expect.stringContaining('"lobby":false'));
            expect(carolWs.send).not.toHaveBeenCalled();
        });

        it('returns false and delivers nothing for an unknown sender session', () => {
            const delivered = peerService.relayChat('nonexistent-session', '', 'hi');
            expect(delivered).toBe(false);
        });

        it('returns false and delivers nothing for blank text', () => {
            const aliceWs = fakeWs();
            const bobWs = fakeWs();
            const aliceId = peerService.registerSession(aliceWs, 1, 'alice', null, true);
            peerService.registerSession(bobWs, 2, 'bob', null, true);

            const delivered = peerService.relayChat(aliceId, '', '   ');

            expect(delivered).toBe(false);
            expect(bobWs.send).not.toHaveBeenCalled();
        });
    });

    describe('setPubkey', () => {
        it('broadcasts the announcing pubkey to other sessions and returns their known keys', () => {
            const aliceWs = fakeWs();
            const bobWs = fakeWs();
            const aliceId = peerService.registerSession(aliceWs, 1, 'alice', null, true);
            const bobId = peerService.registerSession(bobWs, 2, 'bob', null, true);

            peerService.setPubkey(bobId, 'bob-pub');
            bobWs.send.mockClear();

            const roster = peerService.setPubkey(aliceId, 'alice-pub');

            expect(bobWs.send).toHaveBeenCalledWith(
                JSON.stringify({ type: 'pubkey', from: 'alice', pubkey: 'alice-pub' })
            );
            expect(roster).toEqual([{ username: 'bob', pubkey: 'bob-pub' }]);
        });

        it('returns an empty roster for an unknown session', () => {
            expect(peerService.setPubkey('nonexistent-session', 'pub')).toEqual([]);
        });
    });
});
