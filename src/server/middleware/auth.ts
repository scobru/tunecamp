import type { Request, Response, NextFunction } from "express";
import type { AuthService, TokenPayload } from "../auth.js";
import { VisibilityGuardian, Capability, UserRole, ViewerContext } from "../common/visibility.js";

export interface AuthenticatedRequest extends Request {
    isAdmin?: boolean;
    isRootAdmin?: boolean;
    isSuperUser?: boolean;
    username?: string;
    artistId?: number | null;
    role?: UserRole;
    isActive?: boolean;
    userId?: number;
    context?: ViewerContext;
}

/**
 * Creates auth middleware that validates JWT tokens
 */
export function createAuthMiddleware(authService: AuthService) {
    /**
     * Extracts and verifies token from request
     */
    async function extractPayload(req: AuthenticatedRequest): Promise<TokenPayload | null> {
        let token: string | undefined;
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        } else if (req.query.token) {
            token = req.query.token as string;
        }

        if (!token) return null;
        return await authService.verifyToken(token);
    }

    return {
        /**
         * Middleware that requires valid admin authentication (role='admin')
         */
        async requireAdmin(
            req: AuthenticatedRequest,
            res: Response,
            next: NextFunction
        ) {
            const payload = await extractPayload(req);

            if (!payload) {
                return res.status(403).json({ error: "Access denied: Admin only" });
            }

            const context = VisibilityGuardian.deriveContext(payload);
            
            // Check if user has administrative view capabilities
            if (!VisibilityGuardian.can(context, Capability.VIEW_PRIVATE_LIBRARY)) {
                return res.status(403).json({ error: "Access denied: Admin only" });
            }

            req.isAdmin = payload.isAdmin || context.role === UserRole.ROOT_ADMIN;
            req.isSuperUser = context.role === UserRole.SUPER_USER;
            req.username = payload.username;
            req.artistId = payload.artistId;
            req.role = context.role;
            req.isActive = payload.isActive;
            req.userId = payload.userId;
            req.isRootAdmin = context.role === UserRole.ROOT_ADMIN;
            req.context = context;
            next();
        },

        /**
         * Middleware that requires any authenticated user (admin OR user role)
         */
        async requireUser(
            req: AuthenticatedRequest,
            res: Response,
            next: NextFunction
        ) {
            const payload = await extractPayload(req);

            if (!payload) {
                return res.status(401).json({ error: "No token provided" });
            }

            const context = VisibilityGuardian.deriveContext(payload);

            req.isAdmin = payload.isAdmin || context.role === UserRole.ROOT_ADMIN;
            req.isSuperUser = context.role === UserRole.SUPER_USER;
            req.username = payload.username;
            req.artistId = payload.artistId;
            req.role = context.role;
            req.isActive = payload.isActive;
            req.userId = payload.userId;
            req.isRootAdmin = context.role === UserRole.ROOT_ADMIN;
            req.context = context;
            next();
        },

        /**
         * Middleware that optionally authenticates (doesn't fail if no token)
         */
        async optionalAuth(
            req: AuthenticatedRequest,
            res: Response,
            next: NextFunction
        ) {
            const payload = await extractPayload(req);

            if (payload) {
                const context = VisibilityGuardian.deriveContext(payload);
                req.isAdmin = payload.isAdmin || context.role === UserRole.ROOT_ADMIN;
                req.isSuperUser = context.role === UserRole.SUPER_USER;
                req.username = payload.username;
                req.artistId = payload.artistId;
                req.role = context.role;
                req.isActive = payload.isActive;
                req.userId = payload.userId;
                req.isRootAdmin = context.role === UserRole.ROOT_ADMIN;
                req.context = context;
            } else {
                req.isAdmin = false;
                req.isSuperUser = false;
                req.isActive = false;
                req.isRootAdmin = false;
                req.context = { role: UserRole.GUEST };
            }

            next();
        },
        /**
         * Middleware that prevents write access for super_user role
         */
        requireWriteAccess(
            req: AuthenticatedRequest,
            res: Response,
            next: NextFunction
        ) {
            // Check if user has management capabilities (Super User and above)
            if (req.context && VisibilityGuardian.can(req.context, Capability.MANAGE_PRIVATE_LIBRARY)) {
                next();
                return;
            }
            
            // Standard users can't write to private library by default
            if (req.role === UserRole.NORMAL_USER) {
                 return res.status(403).json({ error: "Access denied: Write access required" });
            }
            
            next();
        },

        /**
         * Middleware that requires root admin access
         */
        async requireRootAdmin(
            req: AuthenticatedRequest,
            res: Response,
            next: NextFunction
        ) {
            const payload = await extractPayload(req);
            
            if (!payload) {
                return res.status(403).json({ error: "Access denied: Root Admin only" });
            }

            const context = VisibilityGuardian.deriveContext(payload);

            if (!VisibilityGuardian.can(context, Capability.MANAGE_SYSTEM)) {
                return res.status(403).json({ error: "Access denied: Root Admin only" });
            }

            req.isAdmin = true;
            req.isRootAdmin = true;
            req.username = payload.username;
            req.artistId = payload.artistId;
            req.role = context.role;
            req.isActive = payload.isActive;
            req.userId = payload.userId;
            req.context = context;
            next();
        },
    };
}
