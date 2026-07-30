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
