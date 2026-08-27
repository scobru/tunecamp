import { jest, describe, test, expect } from '@jest/globals';
import type { Response, NextFunction } from 'express';
import { createAuthMiddleware, AuthenticatedRequest } from '../auth.js';
import type { AuthService, TokenPayload } from '../../modules/auth/auth.service.js';
import { UserRole } from '../../common/visibility.js';

/**
 * Characterization tests for how each guard turns a token into a request
 * identity. Written against the CURRENT implementation, before the derivation
 * is extracted into one module, so the extraction can be proven to change
 * nothing except what we intend it to change.
 *
 * The derivation is presently copied across six guards and the copies have
 * drifted. Three behaviours coexist:
 *
 *   Group A  requireAdmin, requireUser, optionalAuth
 *            re-read the account row and prefer the DB's role over the token's
 *   Group B  requireManager, requireRootAdmin
 *            never touch the DB; trust role/isActive/artistId from the token
 *   Group C  requireFidAuth
 *            no JWT at all; derives from a zen_pub lookup
 *
 * Tests tagged INTENDED TO CHANGE pin behaviour we have decided to replace.
 * They are expected to be inverted in the commit that extracts the module.
 * Every other test here must stay green through the refactor; a red one is a
 * regression, not a decision.
 */

const LISTENER: TokenPayload = {
    isAdmin: false,
    username: 'listener',
    artistId: null,
    role: UserRole.NORMAL_USER,
    isActive: true,
    userId: 42,
    tokenVersion: 1,
};

const ROOT: TokenPayload = {
    isAdmin: true,
    username: 'boss',
    artistId: null,
    role: UserRole.ROOT_ADMIN,
    isActive: true,
    userId: 1,
    tokenVersion: 0,
};

/** An account row as getAdminById returns it. */
function dbRow(over: Record<string, unknown> = {}) {
    return {
        id: 42,
        username: 'listener',
        artist_id: null,
        artist_name: null,
        role: UserRole.NORMAL_USER,
        is_active: 1,
        is_root: false,
        ...over,
    };
}

function makeAuthService(
    over: Partial<AuthService> & { payload?: TokenPayload | null } = {}
): AuthService {
    const payload = over.payload !== undefined ? over.payload : LISTENER;
    return {
        verifyToken: jest.fn(async (t: string) => (t === 'valid-token' ? payload : null)),
        getUserByUsername: jest.fn(() => undefined),
        getAdminById: jest.fn(() => undefined),
        getUserByZenPubKey: jest.fn(() => undefined),
        isRootAdmin: jest.fn(() => false),
        ...over,
    } as unknown as AuthService;
}

function makeReq(header = 'Bearer valid-token'): AuthenticatedRequest {
    return {
        originalUrl: '/api/whatever',
        url: '/api/whatever',
        headers: header ? { authorization: header } : {},
        query: {},
    } as unknown as AuthenticatedRequest;
}

function makeRes(): Response & { statusCode?: number } {
    const res: any = {};
    res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
    res.json = jest.fn(() => res);
    return res;
}

/** Field names a guard stamped onto the request. */
function stamped(req: AuthenticatedRequest): string[] {
    return ['isAdmin', 'isSuperUser', 'username', 'role', 'isActive', 'userId', 'isRootAdmin', 'artistId', 'context', 'zenPubKey']
        .filter((k) => (req as any)[k] !== undefined)
        .sort();
}

describe('identity derivation — the shape each guard stamps', () => {
    test('Group A stamps nine fields, isSuperUser among them', async () => {
        const mw = createAuthMiddleware(makeAuthService());
        const req = makeReq();
        const next = jest.fn();
        await mw.requireUser(req, makeRes(), next as unknown as NextFunction);

        expect(next).toHaveBeenCalled();
        expect(stamped(req)).toEqual(
            ['artistId', 'context', 'isActive', 'isAdmin', 'isRootAdmin', 'isSuperUser', 'role', 'userId', 'username'].sort()
        );
    });

    /**
     * CHANGED — a consequence of unifying the shape rather than a decision taken
     * up front. Group B used to leave isSuperUser unset while Group A set it, so
     * whether the field existed depended on which guard the route happened to
     * use. One module means one shape: every guard now stamps all nine fields.
     */
    test('CHANGED — every guard stamps isSuperUser, including the admin guards', async () => {
        const mw = createAuthMiddleware(makeAuthService({
            payload: ROOT,
            getAdminById: jest.fn(() => dbRow({ id: 1, username: 'boss', role: UserRole.ROOT_ADMIN, is_root: true })) as any,
        }));
        const req = makeReq();
        const next = jest.fn();
        await mw.requireRootAdmin(req, makeRes(), next as unknown as NextFunction);

        expect(next).toHaveBeenCalled();
        expect(req.isSuperUser).toBe(false);
        expect(stamped(req)).toContain('isSuperUser');
    });

    test('the guest branch of optionalAuth stamps six fields, leaving identity ones unset', async () => {
        const mw = createAuthMiddleware(makeAuthService({ payload: null }));
        const req = makeReq('');
        const next = jest.fn();
        await mw.optionalAuth(req, makeRes(), next as unknown as NextFunction);

        expect(next).toHaveBeenCalled();
        expect(req.role).toBe(UserRole.GUEST);
        expect(req.username).toBeUndefined();
        expect(req.userId).toBeUndefined();
        expect(req.artistId).toBeUndefined();
    });
});

describe('identity derivation — where the role comes from', () => {
    test('Group A prefers the database role over the token role', async () => {
        // Token says listener; the account was since promoted to admin.
        const auth = makeAuthService({
            getAdminById: jest.fn(() => dbRow({ role: UserRole.ADMIN })) as any,
        });
        const mw = createAuthMiddleware(auth);
        const req = makeReq();
        const next = jest.fn();
        await mw.requireUser(req, makeRes(), next as unknown as NextFunction);

        expect(req.role).toBe(UserRole.ADMIN);
        expect(req.isAdmin).toBe(true);
    });

    test('Group A refuses a demoted account even while its token still says admin', async () => {
        const adminToken: TokenPayload = { ...LISTENER, role: UserRole.ADMIN, isAdmin: true };
        const auth = makeAuthService({
            payload: adminToken,
            getAdminById: jest.fn(() => dbRow({ role: UserRole.NORMAL_USER })) as any,
        });
        const mw = createAuthMiddleware(auth);
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();
        await mw.requireAdmin(req, res, next as unknown as NextFunction);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });

    /**
     * INTENDED TO CHANGE (Q1).
     *
     * This is the divergence the extraction exists to remove. requireRootAdmin
     * guards MANAGE_SYSTEM — the most privileged surface there is — and yet it
     * is the one that never re-reads the account. A root admin demoted in the
     * database keeps passing it until the token expires, because updateAdmin
     * changes `role` without bumping token_version, and verifyToken only
     * re-reads token_version and is_active, never the role.
     *
     * After the extraction this must assert the opposite: next NOT called, 403.
     */
    test('CHANGED — requireRootAdmin now refuses a demoted account despite a stale token role', async () => {
        const auth = makeAuthService({
            payload: ROOT,
            // Demoted in the database; the token has not caught up.
            getAdminById: jest.fn(() => dbRow({ id: 1, username: 'boss', role: UserRole.NORMAL_USER, is_root: false })) as any,
        });
        const mw = createAuthMiddleware(auth);
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();
        await mw.requireRootAdmin(req, res, next as unknown as NextFunction);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
        expect(auth.getAdminById).toHaveBeenCalled();
    });

    /** CHANGED (Q1) — same divergence, via requireManager. */
    test('CHANGED — requireManager now consults the database and refuses the demoted account', async () => {
        const auth = makeAuthService({
            payload: { ...ROOT, role: UserRole.ADMIN },
            getAdminById: jest.fn(() => dbRow({ role: UserRole.NORMAL_USER })) as any,
        });
        const mw = createAuthMiddleware(auth);
        const res = makeRes();
        const next = jest.fn();
        await mw.requireManager(makeReq(), res, next as unknown as NextFunction);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
        expect(auth.getAdminById).toHaveBeenCalled();
    });

    /**
     * INTENDED TO CHANGE (Q6).
     *
     * Group A resolves the account by username, and getUserByUsername matches
     * `username COLLATE NOCASE OR alias COLLATE NOCASE`. verifyToken has
     * already resolved the same account by id. Deriving from userId instead
     * removes the ambiguity; this test pins that today it is username.
     */
    test('CHANGED — the account is resolved by id, never by the ambiguous username lookup', async () => {
        const seen: unknown[] = [];
        const auth = makeAuthService({
            getAdminById: jest.fn((id: unknown) => { seen.push(id); return dbRow(); }) as any,
        });
        const mw = createAuthMiddleware(auth);
        const next = jest.fn();
        await mw.requireUser(makeReq(), makeRes(), next as unknown as NextFunction);

        expect(seen).toEqual([42]);
        expect(auth.getUserByUsername).not.toHaveBeenCalled();
    });
});

describe('identity derivation — fallback when the account row is missing', () => {
    test('Group A falls back to the token values when no row is found', async () => {
        const mw = createAuthMiddleware(makeAuthService()); // getUserByUsername -> undefined
        const req = makeReq();
        const next = jest.fn();
        await mw.requireUser(req, makeRes(), next as unknown as NextFunction);

        expect(next).toHaveBeenCalled();
        expect(req.role).toBe(UserRole.NORMAL_USER);
        expect(req.isActive).toBe(true);
        expect(req.userId).toBe(42);
    });
});

describe('identity derivation — refusal codes', () => {
    test('requireUser answers 401 with no token; the admin guards answer 403', async () => {
        const mw = createAuthMiddleware(makeAuthService({ payload: null }));

        const r1 = makeRes();
        await mw.requireUser(makeReq(''), r1, jest.fn() as unknown as NextFunction);
        expect(r1.statusCode).toBe(401);

        for (const guard of ['requireAdmin', 'requireManager', 'requireRootAdmin'] as const) {
            const res = makeRes();
            await mw[guard](makeReq(''), res, jest.fn() as unknown as NextFunction);
            expect(res.statusCode).toBe(403);
        }
    });
});

describe('identity derivation — the FID adapter', () => {
    const fidUser = { id: 7, username: 'fid-user', role: UserRole.ADMIN, artist_id: null, is_active: 1 };

    test('derives an identity from a zen_pub lookup and records the key', async () => {
        const auth = makeAuthService({ getUserByZenPubKey: jest.fn(() => fidUser) as any });
        const mw = createAuthMiddleware(auth);
        const req = makeReq('FID zen-pub-key-abc');
        const next = jest.fn();
        await mw.requireFidAuth(req, makeRes(), next as unknown as NextFunction);

        expect(next).toHaveBeenCalled();
        expect(req.username).toBe('fid-user');
        expect(req.userId).toBe(7);
        expect(req.zenPubKey).toBe('zen-pub-key-abc');
        expect(req.isAdmin).toBe(true);
    });

    test('refuses an inactive FID account with 403', async () => {
        const auth = makeAuthService({
            getUserByZenPubKey: jest.fn(() => ({ ...fidUser, is_active: 0 })) as any,
        });
        const mw = createAuthMiddleware(auth);
        const res = makeRes();
        const next = jest.fn();
        await mw.requireFidAuth(makeReq('FID k'), res, next as unknown as NextFunction);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });
});
