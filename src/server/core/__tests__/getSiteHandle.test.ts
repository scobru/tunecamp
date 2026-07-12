import { describe, expect, it } from '@jest/globals';
import { getSiteHandle } from '../site-actor.js';


describe('getSiteHandle', () => {
    it('returns siteHandle setting when it is set', () => {
        const mockDb = { getSetting: () => 'my-instance' } as Parameters<typeof getSiteHandle>[0];
        expect(getSiteHandle(mockDb)).toBe('my-instance');
    });

    it('returns "site" when siteHandle setting is not set (undefined)', () => {
        const mockDb = { getSetting: () => undefined } as Parameters<typeof getSiteHandle>[0];
        expect(getSiteHandle(mockDb)).toBe('site');
    });

    it('returns "site" when siteHandle setting is null', () => {
        const mockDb = { getSetting: () => null } as Parameters<typeof getSiteHandle>[0];
        expect(getSiteHandle(mockDb)).toBe('site');
    });

    it('returns "site" when siteHandle setting is empty string', () => {
        const mockDb = { getSetting: () => '' } as Parameters<typeof getSiteHandle>[0];
        expect(getSiteHandle(mockDb)).toBe('site');
    });
});
