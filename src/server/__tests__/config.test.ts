import fs from 'fs';
import crypto from 'crypto';
import { jest } from '@jest/globals';
import { loadConfig } from '../core/config.js';

describe('ServerConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        // jest.resetModules(); // Not needed as loadConfig reads env every time
        process.env = { ...originalEnv };
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('should default to empty array for corsOrigins when TUNECAMP_CORS_ORIGINS is not set', async () => {
        delete process.env.TUNECAMP_CORS_ORIGINS;
        const config = await loadConfig();
        // This test is expected to fail initially as the current default is ["*"]
        expect(config.corsOrigins).toEqual([]);
    });

    test('should parse TUNECAMP_CORS_ORIGINS correctly', async () => {
        process.env.TUNECAMP_CORS_ORIGINS = 'http://localhost:3000,https://example.com';
        const config = await loadConfig();
        expect(config.corsOrigins).toEqual(['http://localhost:3000', 'https://example.com']);
    });

    test('should use TUNECAMP_JWT_SECRET from environment', async () => {
        process.env.TUNECAMP_JWT_SECRET = 'test-secret';
        const config = await loadConfig();
        expect(config.jwtSecret).toBe('test-secret');
    });

    test('should use jwtSecret override', async () => {
        const config = await loadConfig({ jwtSecret: 'override-secret' });
        expect(config.jwtSecret).toBe('override-secret');
    });

    test('should read jwtSecret from .jwt-secret file if it exists', async () => {
        const existsSpy = jest.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
        const readSpy = jest.spyOn(fs.promises, 'readFile').mockResolvedValue('file-secret');

        const config = await loadConfig();

        expect(existsSpy).toHaveBeenCalledWith(expect.stringContaining('.jwt-secret'));
        expect(readSpy).toHaveBeenCalledWith(expect.stringContaining('.jwt-secret'), 'utf-8');
        expect(config.jwtSecret).toBe('file-secret');
    });

    test('should generate and save new jwtSecret if it does not exist', async () => {
        jest.spyOn(fs.promises, 'access').mockRejectedValue(new Error('ENOENT'));
        const writeSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
        const mkdirSpy = jest.spyOn(fs.promises, 'mkdir').mockResolvedValue('' as any);
        const randomBytesSpy = jest.spyOn(crypto, 'randomBytes').mockReturnValue({
            toString: () => 'generated-secret'
        } as any);

        const config = await loadConfig();

        // Wait for background promises to settle
        await new Promise(process.nextTick);

        expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('.jwt-secret'), 'generated-secret', expect.anything());
        expect(config.jwtSecret).toBe('generated-secret');
    });

    test('should still return generated secret if saving to file fails', async () => {
        jest.spyOn(fs.promises, 'access').mockRejectedValue(new Error('ENOENT'));
        jest.spyOn(fs.promises, 'mkdir').mockResolvedValue('' as any);
        jest.spyOn(fs.promises, 'writeFile').mockRejectedValue(new Error('disk full'));
        jest.spyOn(crypto, 'randomBytes').mockReturnValue({
            toString: () => 'generated-secret'
        } as any);
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const config = await loadConfig();

        // Wait for background promises to settle
        await new Promise(process.nextTick);

        expect(config.jwtSecret).toBe('generated-secret');
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Could not save JWT secret'), expect.any(Error));
    });
});
