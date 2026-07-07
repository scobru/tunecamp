import { describe, test, expect } from '@jest/globals';
import { validatePassword, validateEmail } from './validators.js';

describe('validateEmail', () => {
    test('returns valid result for correct email addresses', () => {
        expect(validateEmail('test@example.com')).toEqual({ valid: true });
        expect(validateEmail('user.name+tag@example.co.uk')).toEqual({ valid: true });
        expect(validateEmail('a@b.c')).toEqual({ valid: true });
    });

    test('returns error when email is empty', () => {
        expect(validateEmail('')).toEqual({ valid: false, error: "Invalid email address" });

        // Suppress TS compiler errors to verify runtime behavior with invalid types
        // @ts-ignore
        expect(validateEmail(null)).toEqual({ valid: false, error: "Invalid email address" });
        // @ts-ignore
        expect(validateEmail(undefined)).toEqual({ valid: false, error: "Invalid email address" });
    });

    test('returns error for invalid email formats', () => {
        expect(validateEmail('invalid-email')).toEqual({ valid: false, error: "Invalid email address" });
        expect(validateEmail('test@example')).toEqual({ valid: false, error: "Invalid email address" });
        expect(validateEmail('@example.com')).toEqual({ valid: false, error: "Invalid email address" });
        expect(validateEmail('test@.com')).toEqual({ valid: false, error: "Invalid email address" });
        expect(validateEmail(' test@example.com')).toEqual({ valid: false, error: "Invalid email address" });
        expect(validateEmail('test@example.com ')).toEqual({ valid: false, error: "Invalid email address" });
    });
});

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
