import { describe, expect, it } from '@jest/globals';
import { isSiteHandle } from '../site-actor.js';

interface SettingReader {
    getSetting(key: string): string | undefined | null;
}

describe('isSiteHandle', () => {
    it('returns true if handle matches configured siteHandle', () => {
        const mockDb = { getSetting: () => 'custom-handle' } as unknown as SettingReader;
        expect(isSiteHandle('custom-handle', mockDb)).toBe(true);
    });

    it('returns true if handle is the legacy DEFAULT_SITE_HANDLE ("site")', () => {
        const mockDb = { getSetting: () => 'custom-handle' } as unknown as SettingReader;
        expect(isSiteHandle('site', mockDb)).toBe(true);
    });

    it('returns true if handle is DEFAULT_SITE_HANDLE when no siteHandle is configured', () => {
        const mockDb = { getSetting: () => undefined } as unknown as SettingReader;
        expect(isSiteHandle('site', mockDb)).toBe(true);
    });

    it('returns false for other handles', () => {
        const mockDb = { getSetting: () => 'custom-handle' } as unknown as SettingReader;
        expect(isSiteHandle('other-handle', mockDb)).toBe(false);
    });
});
