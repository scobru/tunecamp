import { decryptZenPrivHelper, encryptZenPrivHelper } from './auth.service.js';
import { describe, test, expect } from '@jest/globals';
import crypto from 'crypto';

describe('decryptZenPrivHelper', () => {
    const TEST_SECRET = 'super-secret-key-12345';
    const TEST_DATA = { user: 'test', id: 42 };

    test('should successfully decrypt GCM (New Format) encrypted data', () => {
        const encrypted = encryptZenPrivHelper(TEST_DATA, TEST_SECRET);
        const decrypted = decryptZenPrivHelper(encrypted, TEST_SECRET);
        expect(decrypted).toEqual(TEST_DATA);
    });

    test('should successfully decrypt CBC (Legacy Format) encrypted data', () => {
        const key = crypto.createHash('sha256').update(TEST_SECRET).digest();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
        let dataHex = cipher.update(JSON.stringify(TEST_DATA), "utf8", "hex");
        dataHex += cipher.final("hex");
        const legacyEncrypted = `${iv.toString('hex')}:${dataHex}`;

        const decrypted = decryptZenPrivHelper(legacyEncrypted, TEST_SECRET);
        expect(decrypted).toEqual(TEST_DATA);
    });

    test('should throw error when secret is incorrect for GCM format', () => {
        const encrypted = encryptZenPrivHelper(TEST_DATA, TEST_SECRET);
        expect(() => decryptZenPrivHelper(encrypted, 'wrong-secret')).toThrow();
    });

    test('should throw error when GCM auth tag is tampered', () => {
        const encrypted = encryptZenPrivHelper(TEST_DATA, TEST_SECRET);
        const parts = encrypted.split(':');
        // tamper auth tag by flipping one char
        parts[2] = parts[2].replace(/[0-9a-f]/, (c) => c === '0' ? '1' : '0');
        const tampered = parts.join(':');

        expect(() => decryptZenPrivHelper(tampered, TEST_SECRET)).toThrow();
    });

    test('should throw error when secret is incorrect for CBC format', () => {
        const key = crypto.createHash('sha256').update(TEST_SECRET).digest();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
        let dataHex = cipher.update(JSON.stringify(TEST_DATA), "utf8", "hex");
        dataHex += cipher.final("hex");
        const legacyEncrypted = `${iv.toString('hex')}:${dataHex}`;

        expect(() => decryptZenPrivHelper(legacyEncrypted, 'wrong-secret')).toThrow();
    });

    test('should throw error when data is not valid JSON in GCM format', () => {
        const key = crypto.createHash('sha256').update(TEST_SECRET).digest();
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
        let dataHex = cipher.update("invalid-json", "utf8", "hex");
        dataHex += cipher.final("hex");
        const authTagHex = cipher.getAuthTag().toString('hex');
        const encrypted = `${iv.toString('hex')}:${dataHex}:${authTagHex}`;

        expect(() => decryptZenPrivHelper(encrypted, TEST_SECRET)).toThrow();
    });

    test('should throw error when data is not valid JSON in CBC format', () => {
        const key = crypto.createHash('sha256').update(TEST_SECRET).digest();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
        let dataHex = cipher.update("invalid-json", "utf8", "hex");
        dataHex += cipher.final("hex");
        const encrypted = `${iv.toString('hex')}:${dataHex}`;

        expect(() => decryptZenPrivHelper(encrypted, TEST_SECRET)).toThrow();
    });

    test('should throw error for malformed input strings', () => {
        expect(() => decryptZenPrivHelper("", TEST_SECRET)).toThrow();
        expect(() => decryptZenPrivHelper("just-one-part", TEST_SECRET)).toThrow();
        expect(() => decryptZenPrivHelper("too:many:parts:here:yes", TEST_SECRET)).toThrow();
    });
});
