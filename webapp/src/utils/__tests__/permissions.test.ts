import { describe, test, expect } from 'vitest';
import { canPublish, canManageItem } from '../permissions';

describe('canPublish', () => {
    test('root admin flag bypasses all other checks', () => {
        expect(canPublish({ isRootAdmin: true }, 'root_admin')).toBe(true);
        expect(canPublish({ isRootAdmin: true }, 'admin')).toBe(true);
        expect(canPublish({ isRootAdmin: true }, 'super_user')).toBe(true);
        expect(canPublish({ isRootAdmin: true }, 'user')).toBe(true);
        expect(canPublish({ isRootAdmin: true }, null)).toBe(true);
        expect(canPublish({ isRootAdmin: true }, undefined)).toBe(true);
    });

    test('root_admin and admin roles bypass user checks', () => {
        expect(canPublish({ artistId: undefined }, 'root_admin')).toBe(true);
        expect(canPublish(null, 'root_admin')).toBe(true);
        expect(canPublish(undefined, 'root_admin')).toBe(true);

        expect(canPublish({ artistId: undefined }, 'admin')).toBe(true);
        expect(canPublish(null, 'admin')).toBe(true);
        expect(canPublish(undefined, 'admin')).toBe(true);
    });

    test('self-publish listener (role "user" + valid artistId) can publish', () => {
        expect(canPublish({ artistId: 42 }, 'user')).toBe(true);
        expect(canPublish({ artistId: '42' }, 'user')).toBe(true);
    });

    test('curator (role "super_user" + valid artistId) can publish', () => {
        expect(canPublish({ artistId: 1 }, 'super_user')).toBe(true);
        expect(canPublish({ artistId: '1' }, 'super_user')).toBe(true);
    });

    test('listener/curator without an artist link cannot publish', () => {
        expect(canPublish({ artistId: undefined }, 'user')).toBe(false);
        expect(canPublish(null, 'user')).toBe(false);
        expect(canPublish({}, 'user')).toBe(false);

        expect(canPublish({ artistId: undefined }, 'super_user')).toBe(false);
        expect(canPublish(null, 'super_user')).toBe(false);
        expect(canPublish({}, 'super_user')).toBe(false);
    });

    test('falsy artistIds (0, "", null) evaluate to false and block publishing', () => {
        expect(canPublish({ artistId: 0 }, 'user')).toBe(false);
        expect(canPublish({ artistId: '' }, 'user')).toBe(false);
        expect(canPublish({ artistId: null }, 'user')).toBe(false);

        expect(canPublish({ artistId: 0 }, 'super_user')).toBe(false);
        expect(canPublish({ artistId: '' }, 'super_user')).toBe(false);
        expect(canPublish({ artistId: null }, 'super_user')).toBe(false);
    });

    test('explicit isRootAdmin: false does not grant access', () => {
        expect(canPublish({ isRootAdmin: false }, 'user')).toBe(false);
        expect(canPublish({ isRootAdmin: false, artistId: 1 }, 'user')).toBe(true);
    });

    test('unauthenticated / unknown role cannot publish', () => {
        expect(canPublish(null, null)).toBe(false);
        expect(canPublish(undefined, undefined)).toBe(false);
        expect(canPublish({ artistId: 5 }, null)).toBe(false);
        expect(canPublish({ artistId: 5 }, undefined)).toBe(false);
    });
});

describe('canManageItem', () => {
    const rootAdmin = { isRootAdmin: true };
    const superUser = { userId: 5, artistId: 1 };
    const listenerArtist = { userId: 7, artistId: 10 };
    const normalUser = { userId: 7 };

    test('Managers/Root Admins manage any item', () => {
        expect(canManageItem(rootAdmin, 'root_admin', { owner_id: 999, artist_id: 1 })).toBe(true);
        expect(canManageItem(null, 'admin', { owner_id: 999 })).toBe(true);
    });

    test('Curators (super_user) do NOT implicitly own other users\' items', () => {
        expect(canManageItem(superUser, 'super_user', { owner_id: 999, artist_id: 1 })).toBe(false);
    });

    test('The direct owner manages their item', () => {
        expect(canManageItem(listenerArtist, 'user', { owner_id: 7, artist_id: 10 })).toBe(true);
    });

    test('A linked Artist manages unowned content carrying their artist_id', () => {
        expect(canManageItem(listenerArtist, 'user', { owner_id: null, artist_id: 10 })).toBe(true);
    });

    test('A linked Artist cannot manage another user\'s owned content even on the same artist', () => {
        expect(canManageItem(listenerArtist, 'user', { owner_id: 999, artist_id: 10 })).toBe(false);
    });

    test('An unrelated artist/listener cannot manage the item', () => {
        expect(canManageItem(listenerArtist, 'user', { owner_id: 999, artist_id: 55 })).toBe(false);
        expect(canManageItem(normalUser, 'user', { owner_id: 999, artist_id: 55 })).toBe(false);
    });
});
