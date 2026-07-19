import { describe, it, expect } from 'vitest';
import { getRoleLabel, getRoleBadgeClass } from './roles';

describe('roles utility', () => {
  describe('getRoleLabel', () => {
    it('should return correct label for root_admin', () => {
      expect(getRoleLabel('root_admin')).toBe('Root Admin');
    });

    it('should return correct label for admin', () => {
      expect(getRoleLabel('admin')).toBe('Manager');
    });

    it('should return correct label for super_user', () => {
      expect(getRoleLabel('super_user')).toBe('Curator');
    });

    it('should return Listener for user by default', () => {
      expect(getRoleLabel('user')).toBe('Listener');
    });

    it('should return Artist for user if hasArtistProfile is true', () => {
      expect(getRoleLabel('user', true)).toBe('Artist');
    });

    it('should return Listener for unknown role', () => {
      expect(getRoleLabel('unknown')).toBe('Listener');
    });

    it('should return Listener for null role', () => {
      expect(getRoleLabel(null)).toBe('Listener');
    });

    it('should return Listener for undefined role', () => {
      expect(getRoleLabel(undefined)).toBe('Listener');
    });
  });

  describe('getRoleBadgeClass', () => {
    it('should return correct class for root_admin', () => {
      expect(getRoleBadgeClass('root_admin')).toBe('bg-red-500/10 text-red-500 border-red-500/20');
    });

    it('should return correct class for admin', () => {
      expect(getRoleBadgeClass('admin')).toBe('bg-primary/10 text-primary border-primary/20');
    });

    it('should return correct class for super_user', () => {
      expect(getRoleBadgeClass('super_user')).toBe('bg-secondary/10 text-secondary border-secondary/20');
    });

    it('should return correct class for user by default', () => {
      expect(getRoleBadgeClass('user')).toBe('bg-base-content/5 text-base-content/60 border-base-content/10');
    });

    it('should return correct class for user if hasArtistProfile is true', () => {
      expect(getRoleBadgeClass('user', true)).toBe('bg-accent/10 text-accent border-accent/20');
    });

    it('should return correct class for unknown role', () => {
      expect(getRoleBadgeClass('unknown')).toBe('bg-base-content/5 text-base-content/60 border-base-content/10');
    });

    it('should return correct class for null role', () => {
      expect(getRoleBadgeClass(null)).toBe('bg-base-content/5 text-base-content/60 border-base-content/10');
    });

    it('should return correct class for undefined role', () => {
      expect(getRoleBadgeClass(undefined)).toBe('bg-base-content/5 text-base-content/60 border-base-content/10');
    });
  });
});
