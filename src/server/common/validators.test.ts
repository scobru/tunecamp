import { describe, test, expect } from '@jest/globals';
import { validatePassword } from './validators.js';

describe('validatePassword', () => {
    test('returns valid result for passwords 8 characters or longer', () => {
        expect(validatePassword('12345678')).toEqual({ valid: true });
        expect(validatePassword('1234567890')).toEqual({ valid: true });
        expect(validatePassword('supersecret')).toEqual({ valid: true });
    });

    test('returns error when password is empty', () => {
        expect(validatePassword('')).toEqual({ valid: false, error: "Password is required" });

        // Suppress TS compiler errors to verify runtime behavior with invalid types
        // @ts-ignore
        expect(validatePassword(null)).toEqual({ valid: false, error: "Password is required" });
        // @ts-ignore
        expect(validatePassword(undefined)).toEqual({ valid: false, error: "Password is required" });
    });

    test('returns error when password is less than 8 characters', () => {
        expect(validatePassword('1234567')).toEqual({ valid: false, error: "Password must be at least 8 characters long" });
        expect(validatePassword('short')).toEqual({ valid: false, error: "Password must be at least 8 characters long" });
        expect(validatePassword('1')).toEqual({ valid: false, error: "Password must be at least 8 characters long" });
    });
});
