import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import type { Response, NextFunction } from 'express';
import { createAuthMiddleware, AuthenticatedRequest } from '../auth.js';
import type { AuthService, TokenPayload } from '../../modules/auth/auth.service.js';
import { UserRole } from '../../common/visibility.js';

const PAYLOAD: TokenPayload = {
    isAdmin: false,
    username: 'listener',
    artistId: null,
    role: UserRole.NORMAL_USER,
    isActive: true,
    userId: 42,
    tokenVersion: 1,
};

function makeAuthService(overrides: Partial<AuthService> & { payload?: TokenPayload | null } = {}): AuthService {
    const payload = overrides.payload !== undefined ? overrides.payload : PAYLOAD;
    return {
        verifyToken: jest.fn(async (token: string) =>
            token === 'valid-token' ? payload : null
        ),
        getUserByUsername: jest.fn(() => undefined),
        getUserByZenPubKey: jest.fn(() => undefined),
        isRootAdmin: jest.fn(() => false),
        ...overrides,
    } as unknown as AuthService;
}

function makeReq(originalUrl: string, opts: { queryToken?: string; header?: string } = {}): AuthenticatedRequest {
    return {
        originalUrl,
        url: originalUrl,
        headers: opts.header ? { authorization: opts.header } : {},
        query: opts.queryToken ? { token: opts.queryToken } : {},
    } as unknown as AuthenticatedRequest;
}

function makeRes(): Response {
    return {
        status: jest.fn().mockReturnThis() as any,
        json: jest.fn().mockReturnThis() as any,
    } as unknown as Response;
}

describe('auth middleware query-token scoping', () => {
    let middleware: ReturnType<typeof createAuthMiddleware>;
    let next: NextFunction;

    beforeEach(() => {
        middleware = createAuthMiddleware(makeAuthService());
        next = jest.fn();
    });

    test('accepts ?token= on track stream URLs (native <audio> cannot set headers)', async () => {
        const req = makeReq('/api/tracks/123/stream?token=valid-token', { queryToken: 'valid-token' });
        await middleware.optionalAuth(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.username).toBe('listener');
        expect(req.role).toBe(UserRole.NORMAL_USER);
    });

    test('accepts ?token= on download URLs', async () => {
        const req = makeReq('/api/tracks/123/download?token=valid-token', { queryToken: 'valid-token' });
        await middleware.requireUser(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.userId).toBe(42);
    });

    test('accepts ?token= on the board SSE stream (EventSource cannot set headers)', async () => {
        const req = makeReq('/api/board/stream?token=valid-token', { queryToken: 'valid-token' });
        await middleware.optionalAuth(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.username).toBe('listener');
    });

    test('accepts ?token= on admin backup download links', async () => {
        const req = makeReq('/api/admin/backup/full?token=valid-token', { queryToken: 'valid-token' });
        await middleware.optionalAuth(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.username).toBe('listener');
    });

    test('ignores ?token= on generic API routes (header-only, avoids log leakage)', async () => {
        const req = makeReq('/api/tracks?token=valid-token', { queryToken: 'valid-token' });
        const res = makeRes();
        await middleware.requireUser(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    test('treats query token as anonymous on generic routes with optionalAuth', async () => {
        const req = makeReq('/api/playlists?token=valid-token', { queryToken: 'valid-token' });
        await middleware.optionalAuth(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.username).toBeUndefined();
        expect(req.role).toBe(UserRole.GUEST);
    });

    test('Authorization header still works everywhere', async () => {
        const req = makeReq('/api/playlists', { header: 'Bearer valid-token' });
        await middleware.requireUser(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.username).toBe('listener');
    });

    test('rejects an invalid query token on media routes', async () => {
        const req = makeReq('/api/tracks/123/stream?token=bogus', { queryToken: 'bogus' });
        const res = makeRes();
        await middleware.requireUser(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    test('requireUser: DB user overrides token role', async () => {
        const dbMiddleware = createAuthMiddleware(makeAuthService({
            getUserByUsername: jest.fn(() => ({
                id: 42, username: 'listener', artist_id: 5, artist_name: null,
                role: UserRole.SUPER_USER, storage_quota: 0, is_active: 1,
                created_at: '', is_root: false, can_peer: 0,
            })),
        }));
        const req = makeReq('/api/playlists', { header: 'Bearer valid-token' });
        await dbMiddleware.requireUser(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.role).toBe(UserRole.SUPER_USER);
        expect(req.artistId).toBe(5);
    });

    test('optionalAuth: DB user overrides token role', async () => {
        const dbMiddleware = createAuthMiddleware(makeAuthService({
            getUserByUsername: jest.fn(() => ({
                id: 42, username: 'listener', artist_id: 5, artist_name: null,
                role: UserRole.ADMIN, storage_quota: 0, is_active: 1,
                created_at: '', is_root: false, can_peer: 0,
            })),
        }));
        const req = makeReq('/api/playlists', { header: 'Bearer valid-token' });
        await dbMiddleware.optionalAuth(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.role).toBe(UserRole.ADMIN);
        expect(req.isAdmin).toBe(true);
    });
});

describe('auth middleware requireAdmin', () => {
    let next: NextFunction;

    beforeEach(() => {
        next = jest.fn();
    });

    test('rejects when no token provided', async () => {
        const middleware = createAuthMiddleware(makeAuthService());
        const req = makeReq('/api/admin/users', { header: 'Bearer nope' });
        const res = makeRes();
        await middleware.requireAdmin(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('rejects a plain user role (no VIEW_PRIVATE_LIBRARY capability)', async () => {
        const middleware = createAuthMiddleware(makeAuthService());
        const req = makeReq('/api/admin/users', { header: 'Bearer valid-token' });
        const res = makeRes();
        await middleware.requireAdmin(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'Access denied: Admin only' });
    });

    test('allows admin role and sets req flags from token payload', async () => {
        const middleware = createAuthMiddleware(makeAuthService({
            payload: { ...PAYLOAD, role: UserRole.ADMIN, isRootAdmin: false },
        }));
        const req = makeReq('/api/admin/users', { header: 'Bearer valid-token' });
        await middleware.requireAdmin(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.isAdmin).toBe(true);
        expect(req.isRootAdmin).toBe(false);
    });

    test('DB user overrides token role and isActive', async () => {
        const middleware = createAuthMiddleware(makeAuthService({
            payload: { ...PAYLOAD, role: UserRole.NORMAL_USER },
            getUserByUsername: jest.fn(() => ({
                id: 42, username: 'listener', artist_id: null, artist_name: null,
                role: UserRole.SUPER_USER, storage_quota: 0, is_active: 0,
                created_at: '', is_root: false, can_peer: 0,
            })),
        }));
        const req = makeReq('/api/admin/users', { header: 'Bearer valid-token' });
        await middleware.requireAdmin(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.role).toBe(UserRole.SUPER_USER);
        expect(req.isActive).toBe(false);
    });

    test('isRootAdmin comes from authService.isRootAdmin when a DB user exists', async () => {
        const middleware = createAuthMiddleware(makeAuthService({
            payload: { ...PAYLOAD, role: UserRole.ADMIN },
            getUserByUsername: jest.fn(() => ({
                id: 42, username: 'listener', artist_id: null, artist_name: null,
                role: UserRole.ADMIN, storage_quota: 0, is_active: 1,
                created_at: '', is_root: false, can_peer: 0,
            })),
            isRootAdmin: jest.fn(() => true),
        }));
        const req = makeReq('/api/admin/users', { header: 'Bearer valid-token' });
        await middleware.requireAdmin(req, makeRes(), next);

        expect(req.isRootAdmin).toBe(true);
    });
});

describe('auth middleware requireManager', () => {
    let next: NextFunction;

    beforeEach(() => {
        next = jest.fn();
    });

    test('rejects when no token provided', async () => {
        const middleware = createAuthMiddleware(makeAuthService());
        const req = makeReq('/api/admin/x', {});
        const res = makeRes();
        await middleware.requireManager(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'Access denied: Manager only' });
    });

    test('rejects a non-admin role', async () => {
        const middleware = createAuthMiddleware(makeAuthService());
        const req = makeReq('/api/admin/x', { header: 'Bearer valid-token' });
        const res = makeRes();
        await middleware.requireManager(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('allows admin role, isRootAdmin false', async () => {
        const middleware = createAuthMiddleware(makeAuthService({
            payload: { ...PAYLOAD, role: UserRole.ADMIN },
        }));
        const req = makeReq('/api/admin/x', { header: 'Bearer valid-token' });
        await middleware.requireManager(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.isAdmin).toBe(true);
        expect(req.isRootAdmin).toBe(false);
    });

    test('allows root_admin role, isRootAdmin true', async () => {
        const middleware = createAuthMiddleware(makeAuthService({
            payload: { ...PAYLOAD, role: UserRole.ROOT_ADMIN },
        }));
        const req = makeReq('/api/admin/x', { header: 'Bearer valid-token' });
        await middleware.requireManager(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.isRootAdmin).toBe(true);
    });
});

describe('auth middleware requireRootAdmin', () => {
    let next: NextFunction;

    beforeEach(() => {
        next = jest.fn();
    });

    test('rejects when no token provided', async () => {
        const middleware = createAuthMiddleware(makeAuthService());
        const req = makeReq('/api/admin/x', {});
        const res = makeRes();
        await middleware.requireRootAdmin(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'Access denied: Root Admin only' });
    });

    test('rejects a plain admin role (MANAGE_SYSTEM requires root_admin)', async () => {
        const middleware = createAuthMiddleware(makeAuthService({
            payload: { ...PAYLOAD, role: UserRole.ADMIN },
        }));
        const req = makeReq('/api/admin/x', { header: 'Bearer valid-token' });
        const res = makeRes();
        await middleware.requireRootAdmin(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('allows root_admin role', async () => {
        const middleware = createAuthMiddleware(makeAuthService({
            payload: { ...PAYLOAD, role: UserRole.ROOT_ADMIN },
        }));
        const req = makeReq('/api/admin/x', { header: 'Bearer valid-token' });
        await middleware.requireRootAdmin(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.isRootAdmin).toBe(true);
        expect(req.isAdmin).toBe(true);
    });
});

describe('auth middleware requireFidAuth', () => {
    let next: NextFunction;

    beforeEach(() => {
        next = jest.fn();
    });

    test('rejects when no FID header present', async () => {
        const middleware = createAuthMiddleware(makeAuthService());
        const req = makeReq('/api/mcp/x', {});
        const res = makeRes();
        await middleware.requireFidAuth(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'FID authentication required' });
    });

    test('rejects a Bearer header (not FID-prefixed)', async () => {
        const middleware = createAuthMiddleware(makeAuthService());
        const req = makeReq('/api/mcp/x', { header: 'Bearer valid-token' });
        const res = makeRes();
        await middleware.requireFidAuth(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    test('rejects an empty FID key', async () => {
        const middleware = createAuthMiddleware(makeAuthService());
        const req = makeReq('/api/mcp/x', { header: 'FID   ' });
        const res = makeRes();
        await middleware.requireFidAuth(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid FID header' });
    });

    test('rejects an unknown zen_pub key', async () => {
        const middleware = createAuthMiddleware(makeAuthService({
            getUserByZenPubKey: jest.fn(() => undefined),
        }));
        const req = makeReq('/api/mcp/x', { header: 'FID zenpub123' });
        const res = makeRes();
        await middleware.requireFidAuth(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'FID identity not found' });
    });

    test('rejects an inactive user', async () => {
        const middleware = createAuthMiddleware(makeAuthService({
            getUserByZenPubKey: jest.fn(() => ({
                id: 7, username: 'zenuser', artist_id: null, artist_name: null,
                role: UserRole.NORMAL_USER, storage_quota: 0, is_active: 0,
                created_at: '', is_root: false, can_peer: 0,
            })),
        }));
        const req = makeReq('/api/mcp/x', { header: 'FID zenpub123' });
        const res = makeRes();
        await middleware.requireFidAuth(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'Account is inactive' });
    });

    test('authenticates an active zen_pub identity and sets zenPubKey', async () => {
        const middleware = createAuthMiddleware(makeAuthService({
            getUserByZenPubKey: jest.fn(() => ({
                id: 7, username: 'zenuser', artist_id: 3, artist_name: 'Artist',
                role: UserRole.ADMIN, storage_quota: 0, is_active: 1,
                created_at: '', is_root: false, can_peer: 0,
            })),
        }));
        const req = makeReq('/api/mcp/x', { header: 'FID  zenpub123  ' });
        await middleware.requireFidAuth(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
        expect(req.zenPubKey).toBe('zenpub123');
        expect(req.username).toBe('zenuser');
        expect(req.isAdmin).toBe(true);
        expect(req.artistId).toBe(3);
    });
});

describe('auth middleware requireWriteAccess', () => {
    let next: NextFunction;

    beforeEach(() => {
        next = jest.fn();
    });

    function makeReqWithContext(role: UserRole, artistId: number | null = null): AuthenticatedRequest {
        return {
            role,
            context: { role, artistId, userId: 1 },
        } as unknown as AuthenticatedRequest;
    }

    test('allows a super_user via MANAGE_PRIVATE_LIBRARY', () => {
        const middleware = createAuthMiddleware(makeAuthService());
        const req = makeReqWithContext(UserRole.SUPER_USER);
        middleware.requireWriteAccess(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
    });

    test('allows a listener with a linked artist profile (self-publishing artist)', () => {
        const middleware = createAuthMiddleware(makeAuthService());
        const req = makeReqWithContext(UserRole.NORMAL_USER, 9);
        middleware.requireWriteAccess(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
    });

    test('rejects a listener with no linked artist profile', () => {
        const middleware = createAuthMiddleware(makeAuthService());
        const req = makeReqWithContext(UserRole.NORMAL_USER, null);
        const res = makeRes();
        middleware.requireWriteAccess(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'Access denied: Write access required' });
    });

    test('guest role with no capabilities falls through to next (only NORMAL_USER is explicitly blocked)', () => {
        const middleware = createAuthMiddleware(makeAuthService());
        const req = makeReqWithContext(UserRole.GUEST, null);
        middleware.requireWriteAccess(req, makeRes(), next);

        expect(next).toHaveBeenCalled();
    });
});
