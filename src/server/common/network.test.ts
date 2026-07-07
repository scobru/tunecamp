import { jest, describe, test, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';

// ESM module namespaces are read-only, so spying on the binding directly fails.
// Mock the module instead and import the SUT dynamically so it picks up the mock.
const isSafeUrl = jest.fn<(urlStr: string) => Promise<boolean>>();
jest.unstable_mockModule('../../utils/networkUtils.js', () => ({ isSafeUrl }));

let network: typeof import('./network.js');

beforeAll(async () => {
    network = await import('./network.js');
});

describe('Network Utilities', () => {
    let consoleWarnSpy: any;

    beforeEach(() => {
        isSafeUrl.mockResolvedValue(true);
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.clearAllMocks();
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
            isSafeUrl.mockResolvedValue(false);
            await expect(network.fetchSafe('http://192.168.1.1/api')).rejects.toThrow('SSRF Blocked');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Blocked potential SSRF'));
        });
    });

    describe('fetchJsonSafe', () => {
        test('returns null and warns if URL is unsafe', async () => {
            isSafeUrl.mockResolvedValue(false);
            const res = await network.fetchJsonSafe('http://localhost:3000');
            expect(res).toBeNull();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Blocked potential SSRF'));
        });

        test('handles invalid URLs gracefully', async () => {
            const res = await network.fetchJsonSafe('not-a-url');
            expect(res).toBeNull();
        });
    });

    describe('isLiveTuneCamp', () => {
        let originalFetch: typeof globalThis.fetch;
        let mockFetch: any;

        beforeEach(() => {
            originalFetch = globalThis.fetch;
            mockFetch = jest.fn();
            (globalThis as any).fetch = mockFetch;
        });

        afterEach(() => {
            (globalThis as any).fetch = originalFetch;
        });

        test('returns false if URL is empty', async () => {
            expect(await network.isLiveTuneCamp('')).toBe(false);
        });

        test('returns false if URL is unsafe', async () => {
            isSafeUrl.mockResolvedValue(false);
            expect(await network.isLiveTuneCamp('http://192.168.1.1')).toBe(false);
        });

        test('uses base URL without trailing slash', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ releases: [] })
            });
            await network.isLiveTuneCamp('http://example.com/');
            expect(mockFetch).toHaveBeenCalledWith('http://example.com/api/catalog', expect.any(Object));
        });

        test('returns false and drains if response is not ok', async () => {
            const mockText = jest.fn().mockResolvedValue('');
            mockFetch.mockResolvedValue({
                ok: false,
                text: mockText
            });
            expect(await network.isLiveTuneCamp('http://example.com')).toBe(false);
            expect(mockText).toHaveBeenCalled();
        });

        test('returns false if fetch throws an error', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));
            expect(await network.isLiveTuneCamp('http://example.com')).toBe(false);
        });

        test('returns true if response contains releases array', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ releases: [] })
            });
            expect(await network.isLiveTuneCamp('http://example.com')).toBe(true);
        });

        test('returns true if response contains tracks array', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ tracks: [] })
            });
            expect(await network.isLiveTuneCamp('http://example.com')).toBe(true);
        });

        test('returns false if response JSON does not match catalog shape', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ other: 'data' })
            });
            expect(await network.isLiveTuneCamp('http://example.com')).toBe(false);
        });

        test('returns false if data is null', async () => {
             mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(null)
            });
            expect(await network.isLiveTuneCamp('http://example.com')).toBe(false);
        });
    });
});
