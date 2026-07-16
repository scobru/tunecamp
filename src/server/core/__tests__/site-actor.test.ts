import { describe, expect, it } from '@jest/globals';
import { getSiteHandle, isSiteHandle, slugifySiteName } from '../site-actor.js';

type SettingReaderMock = Parameters<typeof getSiteHandle>[0];

describe('site-actor', () => {
    describe('getSiteHandle', () => {
        it('returns siteHandle setting when it is set', () => {
            const mockDb = { getSetting: () => 'my-instance' } as SettingReaderMock;
            expect(getSiteHandle(mockDb)).toBe('my-instance');
        });

        it('returns "site" when siteHandle setting is not set (undefined)', () => {
            const mockDb = { getSetting: () => undefined } as SettingReaderMock;
            expect(getSiteHandle(mockDb)).toBe('site');
        });

        it('returns "site" when siteHandle setting is null', () => {
            const mockDb = { getSetting: () => null } as SettingReaderMock;
            expect(getSiteHandle(mockDb)).toBe('site');
        });

        it('returns "site" when siteHandle setting is empty string', () => {
            const mockDb = { getSetting: () => '' } as SettingReaderMock;
            expect(getSiteHandle(mockDb)).toBe('site');
        });
    });

    describe('isSiteHandle', () => {
        it('returns true if handle matches configured siteHandle', () => {
            const mockDb = { getSetting: () => 'custom-handle' } as SettingReaderMock;
            expect(isSiteHandle('custom-handle', mockDb)).toBe(true);
        });

        it('returns true if handle is the legacy DEFAULT_SITE_HANDLE ("site")', () => {
            const mockDb = { getSetting: () => 'custom-handle' } as SettingReaderMock;
            expect(isSiteHandle('site', mockDb)).toBe(true);
        });

        it('returns true if handle is DEFAULT_SITE_HANDLE when no siteHandle is configured', () => {
            const mockDb = { getSetting: () => undefined } as SettingReaderMock;
            expect(isSiteHandle('site', mockDb)).toBe(true);
        });

        it('returns false for other handles', () => {
            const mockDb = { getSetting: () => 'custom-handle' } as SettingReaderMock;
            expect(isSiteHandle('other-handle', mockDb)).toBe(false);
        });

        it('returns false when handle is an empty string', () => {
            const mockDb = { getSetting: () => 'custom-handle' } as SettingReaderMock;
            expect(isSiteHandle('', mockDb)).toBe(false);
        });
    });

    describe('slugifySiteName', () => {
        it('returns a slugified site name', () => {
            expect(slugifySiteName('My Awesome Site!')).toBe('my-awesome-site');
        });

        it('returns DEFAULT_SITE_HANDLE when name is empty', () => {
            expect(slugifySiteName('')).toBe('site');
        });

        it('returns DEFAULT_SITE_HANDLE when name is undefined', () => {
            expect(slugifySiteName(undefined)).toBe('site');
        });

        it('returns DEFAULT_SITE_HANDLE when name is null', () => {
            expect(slugifySiteName(null)).toBe('site');
        });
    });
});
