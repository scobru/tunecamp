import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock node-fetch and networkUtils for ESM
jest.unstable_mockModule('node-fetch', () => ({
    default: jest.fn()
}));

jest.unstable_mockModule('../../utils/networkUtils.js', () => ({
    isSafeUrl: jest.fn()
}));

const { default: fetch } = await import('node-fetch');
const { isSafeUrl } = await import('../../utils/networkUtils.js');
const { drainResponse, fetchSafe, fetchJsonSafe } = await import('./network.js');

describe('Network Utilities', () => {
    let consoleWarnSpy: any;

    beforeEach(() => {
        jest.clearAllMocks();
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleWarnSpy.mockRestore();
    });

    describe('drainResponse', () => {
        test('does nothing if response is null or undefined', async () => {
            await expect(drainResponse(null as any)).resolves.not.toThrow();
            await expect(drainResponse(undefined as any)).resolves.not.toThrow();
        });

        test('does not drain if body is already used', async () => {
            const mockRes = {
                bodyUsed: true,
                text: jest.fn()
            };
            await drainResponse(mockRes as any);
            expect(mockRes.text).not.toHaveBeenCalled();
        });

        test('drains response by calling text() if body is not used', async () => {
            const mockRes = {
                bodyUsed: false,
                text: (jest.fn() as any).mockResolvedValue('body-content')
            };
            await drainResponse(mockRes as any);
            expect(mockRes.text).toHaveBeenCalled();
        });

        test('silently catches error if text() throws', async () => {
            const mockRes = {
                bodyUsed: false,
                text: (jest.fn() as any).mockRejectedValue(new Error('Read error'))
            };
            await expect(drainResponse(mockRes as any)).resolves.not.toThrow();
            expect(mockRes.text).toHaveBeenCalled();
        });
    });

    describe('fetchSafe', () => {
        test('throws SSRF error and warns if URL is unsafe', async () => {
            (isSafeUrl as any).mockResolvedValue(false);

            await expect(fetchSafe('http://192.168.1.1/api')).rejects.toThrow('SSRF Blocked');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Blocked potential SSRF'));
            expect(fetch).not.toHaveBeenCalled();
        });

        test('calls fetch and returns response if URL is safe', async () => {
            (isSafeUrl as any).mockResolvedValue(true);
            const mockResponse = { ok: true };
            (fetch as any).mockResolvedValue(mockResponse);

            const res = await fetchSafe('https://api.example.com', { method: 'POST' });
            expect(res).toBe(mockResponse);
            expect(fetch).toHaveBeenCalledWith('https://api.example.com', { method: 'POST' });
        });
    });

    describe('fetchJsonSafe', () => {
        test('returns null and warns if URL is unsafe', async () => {
            (isSafeUrl as any).mockResolvedValue(false);

            const res = await fetchJsonSafe('http://localhost:3000');
            expect(res).toBeNull();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Blocked potential SSRF'));
            expect(fetch).not.toHaveBeenCalled();
        });

        test('drains and returns null if response is not ok', async () => {
            (isSafeUrl as any).mockResolvedValue(true);
            const mockRes = {
                ok: false,
                bodyUsed: false,
                text: (jest.fn() as any).mockResolvedValue('')
            };
            (fetch as any).mockResolvedValue(mockRes);

            const res = await fetchJsonSafe('https://api.example.com');
            expect(res).toBeNull();
            expect(mockRes.text).toHaveBeenCalled();
        });

        test('returns parsed JSON on success', async () => {
            (isSafeUrl as any).mockResolvedValue(true);
            const mockData = { key: 'value' };
            const mockRes = {
                ok: true,
                bodyUsed: false,
                json: (jest.fn() as any).mockResolvedValue(mockData)
            };
            (fetch as any).mockResolvedValue(mockRes);

            const res = await fetchJsonSafe('https://api.example.com');
            expect(res).toEqual(mockData);
            expect(mockRes.json).toHaveBeenCalled();
        });

        test('drains response and returns null if fetch or JSON parsing throws error', async () => {
            (isSafeUrl as any).mockResolvedValue(true);
            const mockRes = {
                ok: true,
                bodyUsed: false,
                json: (jest.fn() as any).mockRejectedValue(new Error('JSON Parse Error')),
                text: (jest.fn() as any).mockResolvedValue('')
            };
            (fetch as any).mockResolvedValue(mockRes);

            const res = await fetchJsonSafe('https://api.example.com');
            expect(res).toBeNull();
            expect(mockRes.text).toHaveBeenCalled();
        });
    });
});
