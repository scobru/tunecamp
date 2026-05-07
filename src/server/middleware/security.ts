import { Request, Response, NextFunction } from "express";

/**
 * Middleware to set security headers for enhanced protection
 *
 * Headers:
 * - X-Content-Type-Options: nosniff (Prevents MIME sniffing)
 * - Referrer-Policy: strict-origin-when-cross-origin (Privacy)
 * - X-XSS-Protection: 1; mode=block (Legacy XSS protection)
 * - Permissions-Policy: geolocation=(), microphone=(), etc. (Disables unused features)
 * - Content-Security-Policy: restrict origins for scripts, styles, images, etc.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=(), usb=()");
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.paypal.com https://www.sandbox.paypal.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https: https://*.stripe.com; font-src 'self' data: https: https://fonts.gstatic.com; media-src 'self' data: blob: https:; connect-src 'self' ws: wss: http: https: https://api.stripe.com https://www.paypal.com; frame-src 'self' https: https://js.stripe.com https://www.paypal.com;"
    );
    next();
}
