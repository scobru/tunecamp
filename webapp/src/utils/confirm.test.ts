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
});
