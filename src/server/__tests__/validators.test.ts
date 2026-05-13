import { describe, expect, test } from '@jest/globals';
import { validatePassword } from '../common/validators.js';

describe('Validators', () => {
    describe('validatePassword', () => {
        test('should return valid: false when password is empty', () => {
            const result = validatePassword('');
            expect(result.valid).toBe(false);
            expect(result.error).toBe("Password is required");
        });

        test('should return valid: false when password length is less than 8', () => {
            const result = validatePassword('1234567');
            expect(result.valid).toBe(false);
            expect(result.error).toBe("Password must be at least 8 characters long");
        });

        test('should return valid: true when password length is exactly 8', () => {
            const result = validatePassword('12345678');
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        test('should return valid: true when password length is more than 8', () => {
            const result = validatePassword('1234567890');
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });
    });
});
