import { jest, describe, test, expect } from '@jest/globals';
import type { Response, NextFunction } from 'express';
import { createAuthMiddleware, AuthenticatedRequest } from '../auth.js';
import { deriveIdentity, deriveIdentityFromAccount } from '../identity.js';
import type { AuthService, TokenPayload } from '../../modules/auth/auth.service.js';
import { UserRole, VisibilityGuardian, Capability } from '../../common/visibility.js';

/**
 * The primary admin of an installation older than the `root_admin` role.
 *
 * Its row is id 1 — which is what `is_root` means everywhere in this codebase
 * — but its stored role is still `admin`, because that was the only admin
 * role when the account was created. Login has always papered over the gap
 * (`if (user.id === 1) userRole = ROOT_ADMIN`), so the token says root_admin;
 * the request path re-reads the row and, before this fix, believed `admin` and
 * refused every MANAGE_SYSTEM surface — GET /api/admin/settings among them —
 * to the owner of the instance.
 */
const LEGACY_ROOT_ROW = {
    id: 1,
    username: 'boss',
    artist_id: null,
    artist_name: null,
    role: UserRole.ADMIN,
    is_active: 1,
    is_root: true,
};

const ROOT_TOKEN: TokenPayload = {
    isAdmin: true,
    username: 'boss',
    artistId: null,
    role: UserRole.ROOT_ADMIN,
    isActive: true,
    userId: 1,
    tokenVersion: 0,
};

function makeAuthService(over: Partial<AuthService> & { payload?: TokenPayload | null } = {}): AuthService {
    const payload = over.payload !== undefined ? over.payload : ROOT_TOKEN;
    return {
        verifyToken: jest.fn(async (t: string) => (t === 'valid-token' ? payload : null)),
        getUserByUsername: jest.fn(() => undefined),
        getAdminById: jest.fn(() => undefined),
        getUserByZenPubKey: jest.fn(() => undefined),
        isRootAdmin: jest.fn(() => false),
        ...over,
    } as unknown as AuthService;
}

function makeReq(): AuthenticatedRequest {
    return {
        originalUrl: '/api/admin/settings',
        url: '/api/admin/settings',
        headers: { authorization: 'Bearer valid-token' },
        query: {},
    } as unknown as AuthenticatedRequest;
}

function makeRes(): Response & { statusCode?: number } {
    const res: any = {};
    res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
    res.json = jest.fn(() => res);
    return res;
}

describe('the primary admin whose stored role predates root_admin', () => {
    test('derives root_admin, so MANAGE_SYSTEM holds', () => {
        const identity = deriveIdentity(ROOT_TOKEN, LEGACY_ROOT_ROW as any);

        expect(identity.isRootAdmin).toBe(true);
        expect(identity.role).toBe(UserRole.ROOT_ADMIN);
        expect(VisibilityGuardian.can(identity.context, Capability.MANAGE_SYSTEM)).toBe(true);
    });

    test('reaches a root-only route instead of 403', async () => {
        const auth = makeAuthService({ getAdminById: jest.fn(() => LEGACY_ROOT_ROW) as any });
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        await createAuthMiddleware(auth).requireRootAdmin(req, res, next as unknown as NextFunction);

        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBeUndefined();
        expect(req.role).toBe(UserRole.ROOT_ADMIN);
    });

    test('the same reconciliation applies to the FID path', () => {
        const identity = deriveIdentityFromAccount(LEGACY_ROOT_ROW as any, 'zen-key');

        expect(identity.role).toBe(UserRole.ROOT_ADMIN);
        expect(VisibilityGuardian.can(identity.context, Capability.MANAGE_SYSTEM)).toBe(true);
    });

    /**
     * The promotion reconciles two spellings of "primary admin". It must never
     * hand root to an account the database has actually demoted, which is what
     * the `is_root` flag on the row — not the id in the token — decides.
     */
    test('a demoted account is still refused, root token or not', async () => {
        const auth = makeAuthService({
            getAdminById: jest.fn(() => ({
                ...LEGACY_ROOT_ROW, role: UserRole.NORMAL_USER, is_root: false,
            })) as any,
        });
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        await createAuthMiddleware(auth).requireRootAdmin(req, res, next as unknown as NextFunction);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });

    test('a Curator is not promoted by the root flag', () => {
        const identity = deriveIdentity(ROOT_TOKEN, {
            ...LEGACY_ROOT_ROW, role: UserRole.SUPER_USER,
        } as any);

        expect(identity.role).toBe(UserRole.SUPER_USER);
        expect(VisibilityGuardian.can(identity.context, Capability.MANAGE_SYSTEM)).toBe(false);
    });

    test('an inactive primary admin stays a guest', () => {
        const identity = deriveIdentity(ROOT_TOKEN, { ...LEGACY_ROOT_ROW, is_active: 0 } as any);

        expect(identity.isActive).toBe(false);
        expect(identity.context.role).toBe(UserRole.GUEST);
        expect(VisibilityGuardian.can(identity.context, Capability.MANAGE_SYSTEM)).toBe(false);
    });
});
