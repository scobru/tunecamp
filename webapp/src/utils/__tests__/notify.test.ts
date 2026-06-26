import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notify } from '../notify';
import toast from 'react-hot-toast';

vi.mock('react-hot-toast', () => {
  const toastMock = vi.fn() as any;
  toastMock.success = vi.fn();
  toastMock.error = vi.fn();
  return { default: toastMock };
});

describe('notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('success', () => {
    it('calls toast.success with the message', () => {
      notify.success('Success message');
      expect(toast.success).toHaveBeenCalledWith('Success message');
    });
  });

  describe('error / getErrorMessage', () => {
    it('returns fallback message when error is falsy', () => {
      notify.error(null);
      expect(toast.error).toHaveBeenCalledWith('An unexpected error occurred');
    });

    it('returns string error directly', () => {
      notify.error('String error');
      expect(toast.error).toHaveBeenCalledWith('String error');
    });

    it('extracts error from Axios/Fetch response data (string)', () => {
      notify.error({ response: { data: 'Axios string error' } });
      expect(toast.error).toHaveBeenCalledWith('Axios string error');
    });

    it('extracts error from Axios/Fetch response data.error (string)', () => {
      notify.error({ response: { data: { error: 'Axios data error' } } });
      expect(toast.error).toHaveBeenCalledWith('Axios data error');
    });

    it('extracts error from Axios/Fetch response data.error.message', () => {
      notify.error({ response: { data: { error: { message: 'Axios error message' } } } });
      expect(toast.error).toHaveBeenCalledWith('Axios error message');
    });

    it('extracts error from Axios/Fetch response data.message', () => {
      notify.error({ response: { data: { message: 'Axios data message' } } });
      expect(toast.error).toHaveBeenCalledWith('Axios data message');
    });

    it('extracts message from standard Error', () => {
      notify.error(new Error('Standard error message'));
      expect(toast.error).toHaveBeenCalledWith('Standard error message');
    });

    it('extracts message from object with message property', () => {
      notify.error({ message: 'Custom message property' });
      expect(toast.error).toHaveBeenCalledWith('Custom message property');
    });

    it('uses fallback message when no property matched', () => {
      notify.error({ someProperty: 'value' });
      expect(toast.error).toHaveBeenCalledWith('An unexpected error occurred');
    });

    it('uses custom fallback message', () => {
      notify.error(null, 'Custom fallback');
      expect(toast.error).toHaveBeenCalledWith('Custom fallback');
    });
  });

  describe('warning', () => {
    it('calls toast with warning icon', () => {
      notify.warning('Warning message');
      expect(toast).toHaveBeenCalledWith('Warning message', { icon: '⚠️' });
    });
  });

  describe('info', () => {
    it('calls toast with info icon', () => {
      notify.info('Info message');
      expect(toast).toHaveBeenCalledWith('Info message', { icon: 'ℹ️' });
    });
  });

  describe('custom', () => {
    it('calls toast with custom options', () => {
      notify.custom('Custom message', { duration: 5000 });
      expect(toast).toHaveBeenCalledWith('Custom message', { duration: 5000 });
    });
  });
});
