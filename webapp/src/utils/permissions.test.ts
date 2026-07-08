import { describe, it, expect } from 'vitest';
import { canManageItem } from './permissions';

describe('canManageItem', () => {
  it('returns true if user is root admin', () => {
    expect(canManageItem({ isRootAdmin: true }, 'user', { owner_id: 2 })).toBe(true);
  });

  it('returns true if role is in FULL_MANAGE_ROLES (admin or root_admin)', () => {
    expect(canManageItem(null, 'admin', { owner_id: 2 })).toBe(true);
    expect(canManageItem(null, 'root_admin', { owner_id: 2 })).toBe(true);
  });

  it('returns false if item is null or undefined (and user does not have global manage permissions)', () => {
    expect(canManageItem({ userId: 1 }, 'user', null)).toBe(false);
    expect(canManageItem({ userId: 1 }, 'user', undefined)).toBe(false);
  });

  it('returns true if item.owner_id matches user.userId', () => {
    expect(canManageItem({ userId: 123 }, 'user', { owner_id: 123 })).toBe(true);
  });

  it('returns false if item.owner_id does not match user.userId', () => {
    expect(canManageItem({ userId: 123 }, 'user', { owner_id: 456 })).toBe(false);
  });

  it('returns true if item is unowned (owner_id is null/undefined), item has artist_id, and it matches user.artistId as string or number', () => {
    expect(canManageItem({ artistId: 10 }, 'user', { owner_id: null, artist_id: 10 })).toBe(true);
    expect(canManageItem({ artistId: '10' }, 'user', { owner_id: null, artist_id: 10 })).toBe(true);
    // Also test explicitly with undefined for owner_id based on TS type
    expect(canManageItem({ artistId: 10 }, 'user', { owner_id: undefined, artist_id: 10 })).toBe(true);
  });

  it('returns false if item is unowned but artist_id does not match', () => {
    expect(canManageItem({ artistId: 10 }, 'user', { owner_id: null, artist_id: 20 })).toBe(false);
  });

  it('returns false if item has an owner_id even if artist_id matches user.artistId', () => {
    expect(canManageItem({ artistId: 10 }, 'user', { owner_id: 5, artist_id: 10 })).toBe(false);
  });

  it('returns false by default', () => {
    expect(canManageItem(null, null, { owner_id: 1 })).toBe(false);
    expect(canManageItem({ userId: null, artistId: null }, 'user', { owner_id: 1, artist_id: 2 })).toBe(false);
  });
});
