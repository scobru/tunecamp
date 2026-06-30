import { describe, it, expect, beforeEach } from 'vitest';
import { useConfirmStore } from '../useConfirmStore';

describe('useConfirmStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useConfirmStore.setState({
      isOpen: false,
      message: '',
      options: {},
      resolve: null,
    });
  });

  describe('confirm', () => {
    it('should set state correctly and return a promise', () => {
      const promise = useConfirmStore.getState().confirm('Are you sure?', { title: 'Warning' });

      const state = useConfirmStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.message).toBe('Are you sure?');
      expect(state.options).toEqual({ title: 'Warning' });
      expect(typeof state.resolve).toBe('function');

      // We don't await the promise here, just verify it's a promise
      expect(promise).toBeInstanceOf(Promise);
    });

    it('should handle missing options gracefully', () => {
      useConfirmStore.getState().confirm('Delete item?');

      const state = useConfirmStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.message).toBe('Delete item?');
      expect(state.options).toEqual({});
    });
  });

  describe('accept', () => {
    it('should resolve the promise with true and close the modal', async () => {
      const promise = useConfirmStore.getState().confirm('Accept this?');

      useConfirmStore.getState().accept();

      const result = await promise;
      expect(result).toBe(true);

      const state = useConfirmStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.resolve).toBeNull();
    });

    it('should safely do nothing if called without an active confirmation', () => {
      // Ensure initial state
      expect(useConfirmStore.getState().resolve).toBeNull();

      // Should not throw
      useConfirmStore.getState().accept();

      expect(useConfirmStore.getState().isOpen).toBe(false);
    });
  });

  describe('cancel', () => {
    it('should resolve the promise with false and close the modal', async () => {
      const promise = useConfirmStore.getState().confirm('Cancel this?');

      useConfirmStore.getState().cancel();

      const result = await promise;
      expect(result).toBe(false);

      const state = useConfirmStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.resolve).toBeNull();
    });

    it('should safely do nothing if called without an active confirmation', () => {
      // Ensure initial state
      expect(useConfirmStore.getState().resolve).toBeNull();

      // Should not throw
      useConfirmStore.getState().cancel();

      expect(useConfirmStore.getState().isOpen).toBe(false);
    });
  });
});
