import { describe, test, expect } from 'vitest';
import { canPublish } from '../permissions';

describe('canPublish', () => {
    test('root admin can always publish, even without an artist link', () => {
        expect(canPublish({ isRootAdmin: true }, 'root_admin')).toBe(true);
        expect(canPublish({ isRootAdmin: true }, null)).toBe(true);
        expect(canPublish({ artistId: undefined }, 'root_admin')).toBe(true);
    });

    test('self-publish listener (role "user" + artistId) can publish', () => {
        expect(canPublish({ artistId: 42 }, 'user')).toBe(true);
        expect(canPublish({ artistId: '42' }, 'user')).toBe(true);
    });

    test('listener without an artist link cannot publish', () => {
        expect(canPublish({ artistId: undefined }, 'user')).toBe(false);
        expect(canPublish(null, 'user')).toBe(false);
        expect(canPublish({}, 'user')).toBe(false);
    });

    test('curator and manager can publish only when linked to an artist', () => {
        expect(canPublish({ artistId: 1 }, 'super_user')).toBe(true);
        expect(canPublish({ artistId: 1 }, 'admin')).toBe(true);
        expect(canPublish({ artistId: undefined }, 'super_user')).toBe(false);
        expect(canPublish({ artistId: undefined }, 'admin')).toBe(false);
    });

    test('unauthenticated / unknown role cannot publish', () => {
        expect(canPublish(null, null)).toBe(false);
        expect(canPublish(undefined, undefined)).toBe(false);
        expect(canPublish({ artistId: 5 }, null)).toBe(false);
    });
});
