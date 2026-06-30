import { describe, it, expect, vi, beforeEach } from 'vitest';
import { confirm } from './confirm';
import { useConfirmStore } from '../stores/useConfirmStore';

vi.mock('../stores/useConfirmStore', () => {
  return {
    useConfirmStore: {
      getState: vi.fn(),
    },
  };
});

describe('confirm utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call confirm on the store and return its result when options are provided', async () => {
    const mockConfirm = vi.fn().mockResolvedValue(true);
    vi.mocked(useConfirmStore.getState).mockReturnValue({
      confirm: mockConfirm,
    } as any);

    const result = await confirm('Are you sure?', { title: 'Warning' });

    expect(useConfirmStore.getState).toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledWith('Are you sure?', { title: 'Warning' });
    expect(result).toBe(true);
  });

  it('should work without options and return false when cancelled', async () => {
    const mockConfirm = vi.fn().mockResolvedValue(false);
    vi.mocked(useConfirmStore.getState).mockReturnValue({
      confirm: mockConfirm,
    } as any);

    const result = await confirm('Are you sure?');

    expect(useConfirmStore.getState).toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledWith('Are you sure?', undefined);
    expect(result).toBe(false);
  });

  it('should call confirm on the store correctly with an empty message string', async () => {
    const mockConfirm = vi.fn().mockResolvedValue(true);
    vi.mocked(useConfirmStore.getState).mockReturnValue({
      confirm: mockConfirm,
    } as any);

    const result = await confirm('');

    expect(useConfirmStore.getState).toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledWith('', undefined);
    expect(result).toBe(true);
  });

  it('should pass through custom text options', async () => {
    const mockConfirm = vi.fn().mockResolvedValue(true);
    vi.mocked(useConfirmStore.getState).mockReturnValue({
      confirm: mockConfirm,
    } as any);

    const options = {
      title: 'Danger',
      confirmText: 'Delete',
      cancelText: 'Keep'
    };

    const result = await confirm('Delete this item?', options);

    expect(useConfirmStore.getState).toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledWith('Delete this item?', options);
    expect(result).toBe(true);
  });

  it('should propagate errors if the store confirm method throws', async () => {
    const mockConfirm = vi.fn().mockRejectedValue(new Error('Store error'));
    vi.mocked(useConfirmStore.getState).mockReturnValue({
      confirm: mockConfirm,
    } as any);

    await expect(confirm('Error check')).rejects.toThrow('Store error');
    expect(useConfirmStore.getState).toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledWith('Error check', undefined);
  });

  it('should pass through partial ConfirmOptions', async () => {
    const mockConfirm = vi.fn().mockResolvedValue(false);
    vi.mocked(useConfirmStore.getState).mockReturnValue({
      confirm: mockConfirm,
    } as any);

    const options = {
      title: 'Partial Title',
      cancelText: 'Only Cancel'
    };

    const result = await confirm('Partial test', options);

    expect(useConfirmStore.getState).toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledWith('Partial test', options);
    expect(result).toBe(false);
  });
});
