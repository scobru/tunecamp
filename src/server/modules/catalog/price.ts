import { drainResponse } from '../../common/network.js';

interface PriceCache {
    rate: number;
    timestamp: number;
}

let cache: PriceCache | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch the current ETH pool price in USD.
 * Uses multiple public APIs (CoinGecko, CryptoCompare) with local caching for redundancy.
 */
export async function getEthUsdRate(): Promise<number> {
    const now = Date.now();

    // Return cached rate if valid
    if (cache && (now - cache.timestamp) < CACHE_DURATION) {
        return cache.rate;
    }

    // Provider 1: CoinGecko
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        if (response.ok) {
            const data = await response.json() as any;
            const rate = data?.ethereum?.usd;
            if (rate) {
                cache = { rate, timestamp: now };
                return rate;
            }
        } else {
            await drainResponse(response);
        }
    } catch (error) {
        console.warn('CoinGecko price fetch failed, trying fallback...');
    }

    // Provider 2: CryptoCompare (Redundancy)
    try {
        const response = await fetch('https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD');
        if (response.ok) {
            const data = await response.json() as any;
            const rate = data?.USD;
            if (rate) {
                console.log('Successfully fetched price from CryptoCompare fallback');
                cache = { rate, timestamp: now };
                return rate;
            }
        } else {
            await drainResponse(response);
        }
    } catch (error) {
        console.error('All price providers failed:', error);
    }

    // If we have an expired cache, return it as fallback instead of failing
    if (cache) {
        console.warn('Using expired price cache as final fallback');
        return cache.rate;
    }

    // Extreme fallback: No data available. We MUST throw an error instead of using a hardcoded price.
    // A hardcoded price could lead to massive loss of funds for artists (underpricing) or users (overpricing)
    // if the real ETH price fluctuates significantly while APIs are down.
    console.error('CRITICAL: No price data available and cache is empty. Failing gracefully to protect funds.');
    throw new Error('Price feed unavailable. Checkout temporarily disabled to protect funds.');
}
