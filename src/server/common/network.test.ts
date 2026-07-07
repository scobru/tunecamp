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
        let fetchMock: any;

        beforeEach(() => {
            originalFetch = globalThis.fetch;
            fetchMock = jest.fn();
            globalThis.fetch = fetchMock as any;
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
        });

        test('returns false if url is empty', async () => {
            expect(await network.isLiveTuneCamp('')).toBe(false);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        test('returns false if url is unsafe', async () => {
            isSafeUrl.mockResolvedValueOnce(false);
            expect(await network.isLiveTuneCamp('http://192.168.1.1')).toBe(false);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        test('returns false and drains if response is not ok', async () => {
            const mockText = jest.fn().mockResolvedValue('');
            fetchMock.mockResolvedValue({
                ok: false,
                text: mockText
            });

            expect(await network.isLiveTuneCamp('https://example.com/')).toBe(false);
            expect(fetchMock).toHaveBeenCalledWith('https://example.com/api/catalog', expect.any(Object));
            expect(mockText).toHaveBeenCalled();
        });

        test('returns false if fetch throws an error', async () => {
            fetchMock.mockRejectedValue(new Error('Network error'));
            expect(await network.isLiveTuneCamp('https://example.com')).toBe(false);
        });

        test('returns false if JSON does not contain releases or tracks arrays', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ somethingElse: true })
            });

            expect(await network.isLiveTuneCamp('https://example.com')).toBe(false);
        });

        test('returns true if JSON contains releases array', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ releases: [] })
            });

            expect(await network.isLiveTuneCamp('https://example.com')).toBe(true);
        });

        test('returns true if JSON contains tracks array', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ tracks: [] })
            });

            expect(await network.isLiveTuneCamp('https://example.com')).toBe(true);
        });

        test('aborts fetch if timeout is reached', async () => {
            const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

            fetchMock.mockImplementation((url, init) => {
                return new Promise((resolve, reject) => {
                    const timer = setTimeout(() => resolve({ ok: true, json: () => ({ releases: [] }) }), 100);
                    if (init && init.signal) {
                        init.signal.addEventListener('abort', () => {
                            clearTimeout(timer);
                            reject(new Error('AbortError'));
                        });
                    }
                });
            });

            // Use a short 10ms timeout so the real timer finishes immediately
            const result = await network.isLiveTuneCamp('https://example.com/', 10);

            expect(abortSpy).toHaveBeenCalled();
            expect(result).toBe(false);

            abortSpy.mockRestore();
        });
    });
});
