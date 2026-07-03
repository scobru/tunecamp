import dns from 'dns';
import { isIP } from 'net';

/**
 * Checks if an IP address is private or reserved.
 * Handles IPv4 and IPv6.
 */
function isPrivateIP(ip: string): boolean {
    if (!isIP(ip)) return false;

    // IPv6
    if (ip.includes(':')) {
        // Handle IPv4-mapped IPv6 addresses (::ffff:192.168.1.1)
        if (ip.toLowerCase().startsWith('::ffff:')) {
            const ipv4 = ip.substring(7);
            // If it's a valid IPv4 part, check it
            if (isIP(ipv4) === 4) {
                return isPrivateIP(ipv4);
            }
            // If it's hex part, we treat it as IPv6 general check below
        }

        // Loopback (::1)
        if (ip === '::1') return true;

        // Unique Local Address (fc00::/7) -> fc00 to fdff
        // Use normalized check if possible, but regex works for standard form
        if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;

        // Link-local Address (fe80::/10) -> fe80 to febf
        if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;

        return false;
    }

    // IPv4
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return false;

    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;

    // 10.0.0.0/8 (Private)
    if (parts[0] === 10) return true;

    // 172.16.0.0/12 (Private)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

    // 192.168.0.0/16 (Private)
    if (parts[0] === 192 && parts[1] === 168) return true;

    // 169.254.0.0/16 (Link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;

    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;

    return false;
}

/**
 * Validates if a URL is safe to request (no private IPs).
 * Resolves DNS to check against private IP ranges.
 */
export function isSafeUrl(urlStr: string): Promise<boolean> {
    try {
        const url = new URL(urlStr);

        // Protocol check
        if (!['http:', 'https:'].includes(url.protocol)) return Promise.resolve(false);

        const hostname = url.hostname;

        // If hostname is empty, invalid
        if (!hostname) return Promise.resolve(false);

        // Bypass security/SSRF checks for local development to allow local multi-instance federation
        const allowPrivate = process.env.TUNECAMP_ALLOW_PRIVATE_IP === 'true' || 
                             (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test');
        if (allowPrivate) {
            return Promise.resolve(true);
        }

        // If hostname is localhost, block it
        if (hostname === 'localhost') {
            return Promise.resolve(false);
        }

        // If it's an IP, check directly
        if (isIP(hostname)) {
            return Promise.resolve(!isPrivateIP(hostname));
        }

        // Resolve DNS
        return new Promise((resolve) => {
            dns.lookup(hostname, { all: true }, (err, addresses) => {
                if (err) {
                    // DNS lookup failed -> consider unsafe or unreachable
                    resolve(false);
                    return;
                }

                // Check all resolved addresses
                // We use type assertion or check because types might vary depending on env
                const addrs = Array.isArray(addresses) ? addresses : [addresses];

                const isSafe = addrs.every((addr: string | dns.LookupAddress) => {
                    const ip = typeof addr === 'string' ? addr : addr.address;
                    return !isPrivateIP(ip);
                });

                resolve(isSafe);
            });
        });
    } catch (e) {
        return Promise.resolve(false);
    }
}
