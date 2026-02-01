import type { Request, Response, NextFunction } from "express";
import type { AuthService } from "../auth.js";

export interface AuthenticatedRequest extends Request {
    isAdmin?: boolean;
    username?: string;
    artistId?: number | null;
}

/**
 * Creates auth middleware that validates JWT tokens
 */
export function createAuthMiddleware(authService: AuthService) {
    return {
        /**
         * Middleware that requires valid admin authentication
         */
        requireAdmin(
            req: AuthenticatedRequest,
            res: Response,
            next: NextFunction
        ) {
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                return res.status(401).json({ error: "No token provided" });
            }

            const token = authHeader.substring(7);
            const payload = authService.verifyToken(token);

            if (!payload || !payload.isAdmin) {
                return res.status(401).json({ error: "Invalid or expired token" });
            }

            req.isAdmin = true;
            req.username = payload.username;
            req.artistId = payload.artistId;
            next();
        },

        /**
         * Middleware that optionally authenticates (doesn't fail if no token)
         */
        optionalAuth(
            req: AuthenticatedRequest,
            res: Response,
            next: NextFunction
        ) {
            const authHeader = req.headers.authorization;

            if (authHeader && authHeader.startsWith("Bearer ")) {
                const token = authHeader.substring(7);
                const payload = authService.verifyToken(token);
                req.isAdmin = payload?.isAdmin || false;
                if (payload?.username) {
                    req.username = payload.username;
                    req.artistId = payload.artistId;
                }
            } else {
                req.isAdmin = false;
            }

            next();
        },
    };
}
