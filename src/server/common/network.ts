import { isSafeUrl } from '../../utils/networkUtils.js';

/**
 * Ensures the response body is always consumed to prevent leaking the
 * underlying socket when the caller doesn't read the body.
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
 * Liveness probe that distinguishes a *running TuneCamp instance* from any host
 * that merely answers HTTP (a reverse proxy, a CapRover placeholder, or a
 * different app that replaced the instance on the same domain).
 *
 * A plain `HEAD /` returns 200 in all those cases, which is why dead instances
 * survived registry pruning. Instead we GET `/api/catalog` and require a JSON
 * body shaped like a catalog (a `releases` or `tracks` array — exactly what the
 * federation catalog parser keys on). An empty catalog still has `releases: []`,
 * so quiet-but-alive instances pass; HTML error pages and unrelated JSON fail.
 */
export async function isLiveTuneCamp(url: string, timeoutMs = 5000): Promise<boolean> {
    if (!url) return false;
    const base = url.replace(/\/$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        if (!(await isSafeUrl(base))) return false;
        // Use the global fetch (same as the peer catalog cache) so liveness and
        // catalog retrieval behave identically and stay mockable in tests.
        const res: any = await (globalThis as any).fetch(`${base}/api/catalog`, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json', 'User-Agent': 'TuneCamp-HealthCheck/2.0' }
        });
        if (!res || !res.ok) {
            try { await res?.text?.(); } catch { /* drain */ }
            return false;
        }
        const data: any = await res.json();
        return !!data && (Array.isArray(data.releases) || Array.isArray(data.tracks));
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Safely fetches JSON, ensuring the body is always consumed or drained.
 */
async function fetchJsonSafe<T>(url: string, init?: RequestInit): Promise<T | null> {
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
