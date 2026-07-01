import type { Request, Response, NextFunction } from "express";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

/**
 * Creates a rate limiter middleware.
 *
 * @param options Configuration options
 * @param options.windowMs Time window in milliseconds
 * @param options.max Max number of requests within the window
 * @param options.message Custom error message
 */
export function rateLimit(options: RateLimitOptions) {
  // Stores request timestamps for each IP, scoped to this middleware instance
  const hits = new Map<string, number[]>();

  // ponytail: lazy eviction only (on each request), no background interval.
  // Map only grows with distinct IPs hitting this route, which is bounded in
  // practice; add a periodic sweep if that stops being true.
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || (req.socket ? req.socket.remoteAddress : "unknown") || "unknown";
    const now = Date.now();

    const timestamps = (hits.get(ip) || []).filter(t => now - t < options.windowMs);

    if (timestamps.length >= options.max) {
      hits.set(ip, timestamps);
      return res.status(429).json({
        error: options.message || "Too many requests, please try again later."
      });
    }

    timestamps.push(now);
    hits.set(ip, timestamps);

    next();
  };
}
