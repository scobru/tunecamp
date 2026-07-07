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

function makeAuthService(): AuthService {
    return {
        verifyToken: jest.fn(async (token: string) =>
            token === 'valid-token' ? PAYLOAD : null
        ),
        getUserByUsername: jest.fn(() => undefined),
        isRootAdmin: jest.fn(() => false),
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
});
