import { describe, expect, it } from '@jest/globals';
import { getSiteHandle } from '../site-actor.js';

interface SettingReader {
    getSetting(key: string): string | undefined | null;
}

describe('site-actor', () => {
    describe('getSiteHandle', () => {
        it('returns siteHandle setting when it is set', () => {
            const mockDb = { getSetting: () => 'my-instance' } as unknown as SettingReader;
            expect(getSiteHandle(mockDb)).toBe('my-instance');
        });

        it('returns "site" when siteHandle setting is not set (undefined)', () => {
            const mockDb = { getSetting: () => undefined } as unknown as SettingReader;
            expect(getSiteHandle(mockDb)).toBe('site');
        });

        it('returns "site" when siteHandle setting is null', () => {
            const mockDb = { getSetting: () => null } as unknown as SettingReader;
            expect(getSiteHandle(mockDb)).toBe('site');
        });

        it('returns "site" when siteHandle setting is empty string', () => {
            const mockDb = { getSetting: () => '' } as unknown as SettingReader;
            expect(getSiteHandle(mockDb)).toBe('site');
        });
    });
});
