import { describe, it, expect } from 'vitest';
import { ApiError } from '../api';

describe('ApiError', () => {
    it('should correctly initialize properties and extend Error', () => {
        const message = 'Not Found';
        const status = 404;

        const error = new ApiError(message, status);

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(ApiError);
        expect(error.message).toBe(message);
        expect(error.status).toBe(status);
        expect(error.name).toBe('ApiError');
    });
});
