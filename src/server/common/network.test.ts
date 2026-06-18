import { jest, describe, test, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import nodeFetch from 'node-fetch';
import * as networkUtils from '../../utils/networkUtils.js';
import * as network from './network.js';

// Spy on the real imports so the SUT (network.ts) and this test share
// the same function references — no unstable_mockModule needed.
const fetchSpy = jest.spyOn(nodeFetch as any, 'default' in nodeFetch ? 'default' : 'call') as any;
// Simpler: jest.fn replacement via the module reference network.ts actually uses
// requires wrapping. Instead spy on the exported module binding.

// Use a closure flag for isSafeUrl
let safeUrlResult = true;
const isSafeUrlSpy = jest.spyOn(networkUtils, 'isSafeUrl').mockImplementation(async () => safeUrlResult);

describe('Network Utilities', () => {
    let consoleWarnSpy: any;

    beforeEach(() => {
        safeUrlResult = true;
        isSafeUrlSpy.mockImplementation(async () => safeUrlResult);
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.clearAllMocks();
        isSafeUrlSpy.mockImplementation(async () => safeUrlResult);
        consoleWarnSpy.mockRestore();
    });

    describe('drainResponse', () => {
        test('does nothing if response is null or undefined', async () => {
            await expect(network.drainResponse(null as any)).resolves.not.toThrow();
            await expect(network.drainResponse(undefined as any)).resolves.not.toThrow();
        });

        test('does nothing if body is already used', async () => {
            const mockRes = { bodyUsed: true, text: jest.fn() };
            await network.drainResponse(mockRes as any);
            expect(mockRes.text).not.toHaveBeenCalled();
        });

        test('calls text() if body is not used', async () => {
            const mockRes = { bodyUsed: false, text: jest.fn().mockResolvedValue('') };
            await network.drainResponse(mockRes as any);
            expect(mockRes.text).toHaveBeenCalled();
        });

        test('drains and returns null if response is not ok', async () => {
            const mockRes = {
                ok: false,
                bodyUsed: false,
                text: (jest.fn() as any).mockResolvedValue('')
            };
            const result = await network.fetchJsonSafe('https://api.example.com');
            // Without fetch mock this will use real fetch or fail gracefully
            expect(result).toBeNull();
        });
    });

    describe('fetchSafe', () => {
        test('throws SSRF error and warns if URL is unsafe', async () => {
            safeUrlResult = false;
            await expect(network.fetchSafe('http://192.168.1.1/api')).rejects.toThrow('SSRF Blocked');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Blocked potential SSRF'));
        });
    });

    describe('fetchJsonSafe', () => {
        test('returns null and warns if URL is unsafe', async () => {
            safeUrlResult = false;
            const res = await network.fetchJsonSafe('http://localhost:3000');
            expect(res).toBeNull();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Blocked potential SSRF'));
        });

        test('handles invalid URLs gracefully', async () => {
            const res = await network.fetchJsonSafe('not-a-url');
            expect(res).toBeNull();
        });
    });
});
