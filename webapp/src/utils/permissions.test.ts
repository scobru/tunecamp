import { describe, it, expect } from 'vitest';
import { canManageItem } from './permissions';

describe('canManageItem', () => {
  describe('global manage permissions', () => {
    it('grants access if user is a root admin, ignoring item', () => {
      expect(canManageItem({ isRootAdmin: true }, 'user', { owner_id: 99 })).toBe(true);
      expect(canManageItem({ isRootAdmin: true }, null, null)).toBe(true);
    });

    it('grants access if role is in FULL_MANAGE_ROLES, ignoring item', () => {
      expect(canManageItem(null, 'admin', { owner_id: 99 })).toBe(true);
      expect(canManageItem(null, 'root_admin', null)).toBe(true);
    });
  });

  describe('nullish item edge cases', () => {
    it('denies access if item is null or undefined (without global permissions)', () => {
      expect(canManageItem({ userId: 1 }, 'user', null)).toBe(false);
      expect(canManageItem({ userId: 1 }, 'user', undefined)).toBe(false);
    });
  });

  describe('owner-based permissions (direct matching)', () => {
    it('grants access when item.owner_id matches user.userId exactly', () => {
      expect(canManageItem({ userId: 123 }, 'user', { owner_id: 123 })).toBe(true);
    });

    it('denies access when item.owner_id does not match user.userId', () => {
      expect(canManageItem({ userId: 123 }, 'user', { owner_id: 456 })).toBe(false);
    });

    it('handles zero values correctly for direct owner matches', () => {
      expect(canManageItem({ userId: 0 }, 'user', { owner_id: 0 })).toBe(true);
      expect(canManageItem({ userId: 0 }, 'user', { owner_id: 1 })).toBe(false);
      expect(canManageItem({ userId: 1 }, 'user', { owner_id: 0 })).toBe(false);
    });

    it('handles max safe integer boundary for owner matches', () => {
      const max = Number.MAX_SAFE_INTEGER;
      expect(canManageItem({ userId: max }, 'user', { owner_id: max })).toBe(true);
    });
  });

  describe('artist-based permissions (unowned items)', () => {
    it('grants access if item is unowned (owner_id null/undefined) and artist IDs match', () => {
      expect(canManageItem({ artistId: 10 }, 'user', { owner_id: null, artist_id: 10 })).toBe(true);
      expect(canManageItem({ artistId: '10' }, 'user', { owner_id: undefined, artist_id: 10 })).toBe(true);
    });

    it('denies access if item is unowned but artist IDs do not match', () => {
      expect(canManageItem({ artistId: 10 }, 'user', { owner_id: null, artist_id: 20 })).toBe(false);
    });

    it('denies access if item is owned (owner_id is not null/undefined), even if artist IDs match', () => {
      expect(canManageItem({ artistId: 10 }, 'user', { owner_id: 5, artist_id: 10 })).toBe(false);
      expect(canManageItem({ artistId: 10 }, 'user', { owner_id: 0, artist_id: 10 })).toBe(false);
    });

    it('handles zero values correctly for artist matching', () => {
      expect(canManageItem({ artistId: 0 }, 'user', { owner_id: null, artist_id: 0 })).toBe(true);
      expect(canManageItem({ artistId: '0' }, 'user', { owner_id: null, artist_id: 0 })).toBe(true);
    });

    it('handles max safe integer boundary for artist matching', () => {
      const max = Number.MAX_SAFE_INTEGER;
      expect(canManageItem({ artistId: max }, 'user', { owner_id: null, artist_id: max })).toBe(true);
    });
  });

  describe('default fallback', () => {
    it('denies access by default for empty or non-matching inputs', () => {
      expect(canManageItem(null, null, { owner_id: 1 })).toBe(false);
      expect(canManageItem({ userId: null, artistId: null }, 'user', { owner_id: 1, artist_id: 2 })).toBe(false);
    });
  });
});
