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

  it('should pass all confirm options to the underlying store', async () => {
    const mockConfirm = vi.fn().mockResolvedValue(true);
    vi.mocked(useConfirmStore.getState).mockReturnValue({
      confirm: mockConfirm,
    } as any);

    const fullOptions = {
      title: 'Warning',
      confirmText: 'Yes',
      cancelText: 'No',
    };

    const result = await confirm('Proceed?', fullOptions);

    expect(useConfirmStore.getState).toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledWith('Proceed?', fullOptions);
    expect(result).toBe(true);
  });
});
