import { describe, expect, it } from '@jest/globals';
import { canUsePeer } from './peer.ws.js';
import { UserRole } from '../../common/visibility.js';

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
