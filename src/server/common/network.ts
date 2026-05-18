import fetch, { Response, RequestInit } from 'node-fetch';
import { isSafeUrl } from '../../utils/networkUtils.js';

/**
 * Ensures the response body is always consumed to prevent memory leaks in node-fetch.
 */
export async function drainResponse(res: Response): Promise<void> {
    if (!res) return;
    try {
        // Only drain if body hasn't been used yet
        if (!res.bodyUsed) {
            await res.text();
        }
    } catch (e) {
        // Silently fail as we are just cleaning up
    }
}
/**
 * SAFELY executes a fetch request.
 * If the response is not consumed by the caller, they MUST call drainResponse(res).
 * Implements SSRF protection.
 */
export async function fetchSafe(url: string, init?: RequestInit): Promise<Response> {
    const isSafe = await isSafeUrl(url);
    if (!isSafe) {
        console.warn(`[Security] Blocked potential SSRF request to: ${url}`);
        throw new Error(`SSRF Blocked: Invalid or private destination.`);
    }
    return fetch(url, init);
}

/**
 * Safely fetches JSON, ensuring the body is always consumed or drained.
 */
export async function fetchJsonSafe<T>(url: string, init?: RequestInit): Promise<T | null> {
    let res: Response | null = null;
    try {
        const isSafe = await isSafeUrl(url);
        if (!isSafe) {
            console.warn(`[Security] Blocked potential SSRF request to: ${url}`);
            return null;
        }

        res = await fetch(url, init);
        if (!res.ok) {
            await drainResponse(res);
            return null;
        }
        return await res.json() as T;
    } catch (error) {
        if (res) await drainResponse(res);
        return null;
    }
}
