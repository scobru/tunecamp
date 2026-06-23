import { jest, describe, test, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';

let fetch: any;
let getEthUsdRate: any;
let clearCache: any;

beforeAll(async () => {
    fetch = jest.fn();
    (globalThis as any).fetch = fetch;
    ({ getEthUsdRate, clearCache } = await import('../price.js'));
});

describe('Price Module - getEthUsdRate', () => {
    let mockNow = 1000000;
    let dateSpy: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockNow = 1000000;
        dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => mockNow);
        clearCache();
    });

    afterEach(() => {
        dateSpy.mockRestore();
    });

    test('throws an error if both providers fail and cache is empty', async () => {
        (fetch as any)
            .mockRejectedValueOnce(new Error('CoinGecko down'))
            .mockRejectedValueOnce(new Error('CryptoCompare down'));

        await expect(async () => {
            await getEthUsdRate();
        }).rejects.toThrow('Price feed unavailable');
    });

    test('successfully fetches eth rate from CoinGecko', async () => {
        (fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                ethereum: { usd: 3123.45 }
            })
        });

        const rate = await getEthUsdRate();

        expect(rate).toBe(3123.45);
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('coingecko.com')
        );
    });

    test('uses cached rate if requested within 5 minutes', async () => {
        (fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                ethereum: { usd: 3000 }
            })
        });

        const rate1 = await getEthUsdRate();
        expect(rate1).toBe(3000);

        // Call again immediately
        const rate2 = await getEthUsdRate();
        expect(rate2).toBe(3000);
        expect(fetch).toHaveBeenCalledTimes(1);

        // Move time forward by 4 minutes (still cached)
        mockNow += 4 * 60 * 1000;
        const rate3 = await getEthUsdRate();
        expect(rate3).toBe(3000);
        expect(fetch).toHaveBeenCalledTimes(1);

        // Move time forward past 5 minutes (cache expired)
        mockNow += 2 * 60 * 1000;

        (fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                ethereum: { usd: 3100 }
            })
        });

        const rate4 = await getEthUsdRate();
        expect(rate4).toBe(3100);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('falls back to CryptoCompare if CoinGecko fails', async () => {
        // Force cache expiration
        mockNow += 10 * 60 * 1000;

        // CoinGecko fails, CryptoCompare succeeds
        (fetch as any)
            .mockRejectedValueOnce(new Error('CoinGecko offline'))
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ USD: 3200.5 })
            });

        const rate = await getEthUsdRate();

        expect(rate).toBe(3200.5);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('coingecko.com'));
        expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('cryptocompare.com'));
    });

    test('uses expired cache as last fallback if both providers fail', async () => {
        // Populate cache first
        (fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ ethereum: { usd: 3200.5 } })
        });
        await getEthUsdRate();

        // Expire cache
        mockNow += 10 * 60 * 1000;

        // Both providers fail
        (fetch as any)
            .mockRejectedValueOnce(new Error('CoinGecko down'))
            .mockRejectedValueOnce(new Error('CryptoCompare down'));

        const rate = await getEthUsdRate();

        expect(rate).toBe(3200.5);
    });
});
