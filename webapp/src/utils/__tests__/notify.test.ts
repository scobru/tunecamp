import { describe, it, expect } from 'vitest';
import { getErrorMessage } from '../notify.ts';

describe('getErrorMessage', () => {
  it('returns fallback if error is falsy', () => {
    expect(getErrorMessage(null)).toBe('An unexpected error occurred');
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred');
    expect(getErrorMessage(false)).toBe('An unexpected error occurred');
    expect(getErrorMessage(null, 'Custom Fallback')).toBe('Custom Fallback');
  });

  it('returns error directly if it is a string', () => {
    expect(getErrorMessage('A simple string error')).toBe('A simple string error');
  });

  it('handles Axios error: response.data is a string', () => {
    const error = {
      response: {
        data: 'String from response.data',
      },
    };
    expect(getErrorMessage(error)).toBe('String from response.data');
  });

  it('handles Axios error: response.data.error is a string', () => {
    const error = {
      response: {
        data: {
          error: 'Error string from response.data.error',
        },
      },
    };
    expect(getErrorMessage(error)).toBe('Error string from response.data.error');
  });

  it('handles Axios error: response.data.error is an object with a message', () => {
    const error = {
      response: {
        data: {
          error: {
            message: 'Nested error message',
          },
        },
      },
    };
    expect(getErrorMessage(error)).toBe('Nested error message');
  });

  it('handles Axios error: response.data.error is an object without a message (uses fallback)', () => {
    const error = {
      response: {
        data: {
          error: {},
        },
      },
    };
    expect(getErrorMessage(error, 'Fallback message')).toBe('Fallback message');
  });

  it('handles Axios error: response.data.message exists', () => {
    const error = {
      response: {
        data: {
          message: 'Message from response.data.message',
        },
      },
    };
    expect(getErrorMessage(error)).toBe('Message from response.data.message');
  });

  it('returns standard Error message', () => {
    const error = new Error('Standard JS Error message');
    expect(getErrorMessage(error)).toBe('Standard JS Error message');
  });

  it('returns message from generic object', () => {
    const error = {
      message: 'Generic object message',
    };
    expect(getErrorMessage(error)).toBe('Generic object message');
  });

  it('returns fallback if object has no recognizable properties', () => {
    const error = {
      someOtherProp: 'not a message',
    };
    expect(getErrorMessage(error, 'Fallback message')).toBe('Fallback message');
  });
});
