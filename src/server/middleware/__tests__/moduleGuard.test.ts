import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { requireModuleEnabled } from '../moduleGuard.js';
import type { ServiceContainer } from '../../core/container.js';

describe('moduleGuard middleware', () => {
    let mockGetSetting: ReturnType<typeof jest.fn>;
    let mockContainer: ServiceContainer;
    let mockNext: ReturnType<typeof jest.fn>;

    beforeEach(() => {
        mockGetSetting = jest.fn();
        mockContainer = {
            identity: {
                getSetting: mockGetSetting
            }
        } as unknown as ServiceContainer;
        mockNext = jest.fn();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    const createRes = () => {
        const res: any = {
            statusCode: 0,
            body: null,
            status(code: number) { this.statusCode = code; return this; },
            json(payload: any) { this.body = payload; return this; }
        };
        return res;
    };

    const createReq = (overrides = {}) => {
        return { ...overrides } as any;
    };

    describe('default polarity (invert: false)', () => {
        test('allows request if setting is not "true" (not hidden)', () => {
            mockGetSetting.mockReturnValue('false');
            const middleware = requireModuleEnabled(mockContainer, 'hideDig');
            const res = createRes();
            middleware(createReq(), res, mockNext);

            expect(mockGetSetting).toHaveBeenCalledWith('hideDig');
            expect(mockNext).toHaveBeenCalled();
            expect(res.statusCode).toBe(0);
        });

        test('blocks request if setting is "true" (hidden)', () => {
            mockGetSetting.mockReturnValue('true');
            const middleware = requireModuleEnabled(mockContainer, 'hideDig');
            const res = createRes();
            middleware(createReq(), res, mockNext);

            expect(mockNext).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
            expect(res.body).toEqual({ error: 'This module is disabled on this instance' });
        });
    });

    describe('positive polarity (invert: true)', () => {
        test('allows request if setting is "true" (enabled)', () => {
            mockGetSetting.mockReturnValue('true');
            const middleware = requireModuleEnabled(mockContainer, 'chatEnabled', { invert: true });
            const res = createRes();
            middleware(createReq(), res, mockNext);

            expect(mockGetSetting).toHaveBeenCalledWith('chatEnabled');
            expect(mockNext).toHaveBeenCalled();
        });

        test('blocks request if setting is not "true" (disabled)', () => {
            mockGetSetting.mockReturnValue('false');
            const middleware = requireModuleEnabled(mockContainer, 'chatEnabled', { invert: true });
            const res = createRes();
            middleware(createReq(), res, mockNext);

            expect(mockNext).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
        });
    });

    describe('boardEnabled fallback', () => {
        test('falls back to chatEnabled when boardEnabled is null', () => {
            mockGetSetting.mockImplementation((key: string) => {
                if (key === 'boardEnabled') return null;
                if (key === 'chatEnabled') return 'true';
                return 'false';
            });

            const middleware = requireModuleEnabled(mockContainer, 'boardEnabled', { invert: true });
            const res = createRes();
            middleware(createReq(), res, mockNext);

            // Since it falls back to chatEnabled='true' and invert=true, it should be allowed
            expect(mockGetSetting).toHaveBeenCalledWith('boardEnabled');
            expect(mockGetSetting).toHaveBeenCalledWith('chatEnabled');
            expect(mockNext).toHaveBeenCalled();
        });

        test('does not fall back if boardEnabled is explicitly set', () => {
            mockGetSetting.mockImplementation((key: string) => {
                if (key === 'boardEnabled') return 'false';
                return 'true';
            });

            const middleware = requireModuleEnabled(mockContainer, 'boardEnabled', { invert: true });
            const res = createRes();
            middleware(createReq(), res, mockNext);

            expect(mockGetSetting).toHaveBeenCalledWith('boardEnabled');
            expect(mockGetSetting).not.toHaveBeenCalledWith('chatEnabled');
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('allowAdmin bypass', () => {
        test('blocks admin if allowAdmin is false', () => {
            mockGetSetting.mockReturnValue('true');
            const middleware = requireModuleEnabled(mockContainer, 'hideDig', { allowAdmin: false });
            const res = createRes();
            const req = createReq({ isAdmin: true });
            middleware(req, res, mockNext);

            expect(mockNext).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
        });

        test('allows admin if allowAdmin is true', () => {
            mockGetSetting.mockReturnValue('true');
            const middleware = requireModuleEnabled(mockContainer, 'hideDig', { allowAdmin: true });
            const res = createRes();
            const req = createReq({ isAdmin: true });
            middleware(req, res, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(res.statusCode).toBe(0);
        });

        test('allows superUser if allowAdmin is true', () => {
            mockGetSetting.mockReturnValue('true');
            const middleware = requireModuleEnabled(mockContainer, 'hideDig', { allowAdmin: true });
            const res = createRes();
            const req = createReq({ isSuperUser: true });
            middleware(req, res, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        test('allows rootAdmin if allowAdmin is true', () => {
            mockGetSetting.mockReturnValue('true');
            const middleware = requireModuleEnabled(mockContainer, 'hideDig', { allowAdmin: true });
            const res = createRes();
            const req = createReq({ isRootAdmin: true });
            middleware(req, res, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        test('blocks non-admin even if allowAdmin is true', () => {
            mockGetSetting.mockReturnValue('true');
            const middleware = requireModuleEnabled(mockContainer, 'hideDig', { allowAdmin: true });
            const res = createRes();
            const req = createReq({ isAdmin: false, isSuperUser: false, isRootAdmin: false });
            middleware(req, res, mockNext);

            expect(mockNext).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
        });
    });

    describe('error handling', () => {
        test('falls through and calls next when getSetting throws', () => {
            mockGetSetting.mockImplementation(() => {
                throw new Error('Database disconnected');
            });
            const middleware = requireModuleEnabled(mockContainer, 'hideDig');
            const res = createRes();
            middleware(createReq(), res, mockNext);

            expect(console.warn).toHaveBeenCalledWith(
                "[moduleGuard] Could not read setting 'hideDig':",
                'Database disconnected'
            );
            expect(mockNext).toHaveBeenCalled();
            expect(res.statusCode).toBe(0);
        });
    });
});
