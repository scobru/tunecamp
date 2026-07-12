import { encryptZenPrivHelper, decryptZenPrivHelper } from './auth.service.js';
import { describe, test, expect } from '@jest/globals';

describe('encryptZenPrivHelper', () => {
    const TEST_SECRET = 'super-secret-key-12345';
    const TEST_DATA = { user: 'test', id: 42 };

    test('should return a string in the format IV:Data:AuthTag', () => {
        const encrypted = encryptZenPrivHelper(TEST_DATA, TEST_SECRET);
        expect(typeof encrypted).toBe('string');
        const parts = encrypted.split(':');
        expect(parts.length).toBe(3);
        // IV is 12 bytes -> 24 hex chars
        expect(parts[0].length).toBe(24);
        // AuthTag is 16 bytes -> 32 hex chars
        expect(parts[2].length).toBe(32);
        // Data length varies, just ensure it's not empty
        expect(parts[1].length).toBeGreaterThan(0);
    });

    test('should generate different IVs for the same data and secret', () => {
        const encrypted1 = encryptZenPrivHelper(TEST_DATA, TEST_SECRET);
        const encrypted2 = encryptZenPrivHelper(TEST_DATA, TEST_SECRET);
        expect(encrypted1).not.toBe(encrypted2);
        const iv1 = encrypted1.split(':')[0];
        const iv2 = encrypted2.split(':')[0];
        expect(iv1).not.toBe(iv2);
    });

    test('encrypted data should be decryptable by decryptZenPrivHelper', () => {
        const encrypted = encryptZenPrivHelper(TEST_DATA, TEST_SECRET);
        const decrypted = decryptZenPrivHelper(encrypted, TEST_SECRET);
        expect(decrypted).toEqual(TEST_DATA);
    });

    test('should handle string data correctly', () => {
        const stringData = "just a simple string";
        const encrypted = encryptZenPrivHelper(stringData, TEST_SECRET);
        const decrypted = decryptZenPrivHelper(encrypted, TEST_SECRET);
        expect(decrypted).toBe(stringData);
    });

    test('should handle arrays correctly', () => {
        const arrayData = [1, 2, 3, "four"];
        const encrypted = encryptZenPrivHelper(arrayData, TEST_SECRET);
        const decrypted = decryptZenPrivHelper(encrypted, TEST_SECRET);
        expect(decrypted).toEqual(arrayData);
    });

    test('should handle null data correctly', () => {
        const nullData = null;
        const encrypted = encryptZenPrivHelper(nullData, TEST_SECRET);
        const decrypted = decryptZenPrivHelper(encrypted, TEST_SECRET);
        expect(decrypted).toBeNull();
    });
});
