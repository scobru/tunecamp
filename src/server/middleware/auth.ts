import type { Request, Response, NextFunction } from "express";
import type { AuthService, TokenPayload } from "../modules/auth/auth.service.js";
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
    zenPubKey?: string;
}

/**
 * Routes loaded by native browser consumers that cannot set an Authorization
 * header: <audio>/<video> elements (track streaming), EventSource (board
 * stream), and plain <a> download links (track/album/release downloads,
 * admin backups). Only these routes may authenticate via the `token` query
 * parameter; every other route is header-only so session tokens don't leak
 * into request logs through generic API URLs.
 */
const QUERY_TOKEN_ROUTES = /\/(stream|download)(\/|\.|$)|^\/api\/admin\/backup\//;

function allowsQueryToken(req: Request): boolean {
    const path = (req.originalUrl || req.url || "").split("?")[0];
    return QUERY_TOKEN_ROUTES.test(path);
}

/**
 * The only endpoints reachable by a session whose account still has a default
 * password: reading its own auth state, and setting a new password. Everything
 * else is refused by `requirePasswordChanged`.
 */
const PASSWORD_LOCKDOWN_ALLOWLIST = /^\/api\/auth\/(password|status|login|setup)$/;

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
        } else if (typeof req.query.token === "string" && allowsQueryToken(req)) {
            token = req.query.token;
        }

        if (!token) return null;
        return await authService.verifyToken(token);
    }

    return {
        /**
         * Instance lockdown while an account still has a built-in default
         * password (`admin` / the `tunecamp` reset sentinel).
         *
         * The frontend already shows a non-dismissable setup wizard, but that
         * is cosmetic: the login endpoint hands out a fully-privileged 7-day
         * JWT regardless, so anyone who skips the React app and posts straight
         * to /api/auth/login owns the instance. This guard is the server-side
         * half — a session authenticated with a default password may only
         * reach the endpoints needed to change that password.
         *
         * Deliberately scoped to *authenticated* requests: anonymous public
         * browsing, streaming and federation are unaffected, so a locked-down
         * instance still serves its listeners while the admin is locked out of
         * everything except fixing the credential.
         */
        async requirePasswordChanged(
            req: AuthenticatedRequest,
            res: Response,
            next: NextFunction
        ) {
            const payload = await extractPayload(req);
            const path = (req.originalUrl || req.url || "").split("?")[0];
            // Subsonic authenticates by `u`/`p` query params rather than a JWT,
            // so fall back to the username it claims; a default password there
            // is refused outright (you cannot fix it over the Subsonic API).
            // Scoped to /rest: on /api a `u` param means whatever that route
            // wants it to mean, and must not be read as an identity claim.
            const username = payload?.username
                ?? (path.startsWith("/rest") && typeof req.query.u === "string"
                    ? req.query.u
                    : undefined);
            if (!username) return next();

            if (!(await authService.isDefaultPassword(username))) return next();

            if (PASSWORD_LOCKDOWN_ALLOWLIST.test(path)) return next();

            return res.status(403).json({
                error: "Account is still using a default password. Change it before using this instance.",
                code: "DEFAULT_PASSWORD_LOCKDOWN",
                mustChangePassword: true,
            });
        },

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

            let context = VisibilityGuardian.deriveContext(payload);
            let userRole = context.role;
            
            const dbUser = payload.username ? authService.getUserByUsername(payload.username) : undefined;
            if (dbUser) {
                userRole = dbUser.role;
                context = VisibilityGuardian.deriveContext({
                    ...payload,
                    role: dbUser.role
                });
            }

            // Check if user has administrative view capabilities
            if (!VisibilityGuardian.can(context, Capability.VIEW_PRIVATE_LIBRARY)) {
                return res.status(403).json({ error: "Access denied: Admin only" });
            }

            req.isAdmin = VisibilityGuardian.isAdminRole(userRole);
            req.isSuperUser = userRole === UserRole.SUPER_USER;
            req.username = payload.username;
            req.role = userRole;
            req.isActive = dbUser ? dbUser.is_active === 1 : (payload.isActive ?? true);
            req.userId = payload.userId;
            req.isRootAdmin = dbUser ? authService.isRootAdmin(payload.username) : (userRole === UserRole.ROOT_ADMIN);
            req.artistId = dbUser ? dbUser.artist_id : payload.artistId;
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

            let context = VisibilityGuardian.deriveContext(payload);
            let userRole = context.role;

            const dbUser = payload.username ? authService.getUserByUsername(payload.username) : undefined;
            if (dbUser) {
                userRole = dbUser.role;
                context = VisibilityGuardian.deriveContext({
                    ...payload,
                    role: dbUser.role
                });
            }

            req.isAdmin = VisibilityGuardian.isAdminRole(userRole);
            req.isSuperUser = userRole === UserRole.SUPER_USER;
            req.username = payload.username;
            req.role = userRole;
            req.isActive = dbUser ? dbUser.is_active === 1 : (payload.isActive ?? true);
            req.userId = payload.userId;
            req.isRootAdmin = dbUser ? authService.isRootAdmin(payload.username) : (userRole === UserRole.ROOT_ADMIN);
            req.artistId = dbUser ? dbUser.artist_id : payload.artistId;
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
                let context = VisibilityGuardian.deriveContext(payload);
                let userRole = context.role;
                
                const dbUser = payload.username ? authService.getUserByUsername(payload.username) : undefined;
                if (dbUser) {
                    userRole = dbUser.role;
                    context = VisibilityGuardian.deriveContext({
                        ...payload,
                        role: dbUser.role
                    });
                }

                req.isAdmin = VisibilityGuardian.isAdminRole(userRole);
                req.isSuperUser = userRole === UserRole.SUPER_USER;
                req.username = payload.username;
                req.role = userRole;
                req.isActive = dbUser ? dbUser.is_active === 1 : (payload.isActive ?? true);
                req.userId = payload.userId;
                req.isRootAdmin = dbUser ? authService.isRootAdmin(payload.username) : (userRole === UserRole.ROOT_ADMIN);
                req.artistId = dbUser ? dbUser.artist_id : payload.artistId;
                req.context = context;
            } else {
                req.isAdmin = false;
                req.isSuperUser = false;
                req.isActive = false;
                req.isRootAdmin = false;
                req.role = UserRole.GUEST;
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

            // If user has a linked artist profile, they can publish content (e.g. self-publishing artist)
            if (req.context && VisibilityGuardian.canPublishContent(req.context)) {
                next();
                return;
            }

            // Listeners are consumers: publishing requires a Curator account
            // with an artist link, so no upload — even with a stale artist_id.
            if (req.role === UserRole.NORMAL_USER) {
                 return res.status(403).json({ error: "Access denied: Write access required" });
            }

            next();
        },

        /**
         * Middleware that requires manager or root admin access (excludes super_user)
         */
        async requireManager(
            req: AuthenticatedRequest,
            res: Response,
            next: NextFunction
        ) {
            const payload = await extractPayload(req);
            
            if (!payload) {
                return res.status(403).json({ error: "Access denied: Manager only" });
            }

            const context = VisibilityGuardian.deriveContext(payload);

            if (!VisibilityGuardian.isAdminRole(context.role)) {
                return res.status(403).json({ error: "Access denied: Manager only" });
            }

            req.isAdmin = true;
            req.isRootAdmin = context.role === UserRole.ROOT_ADMIN;
            req.username = payload.username;
            req.artistId = payload.artistId;
            req.role = context.role;
            req.isActive = payload.isActive;
            req.userId = payload.userId;
            req.context = context;
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

        /**
         * Middleware that requires valid FID authentication (zen_pub key)
         * Used for MCP server to authenticate via FID identity
         */
        async requireFidAuth(
            req: AuthenticatedRequest,
            res: Response,
            next: NextFunction
        ) {
            // Check for FID auth header: "FID <zen_pub_key>"
            const fidHeader = req.headers.authorization;
            if (!fidHeader || !fidHeader.startsWith("FID ")) {
                return res.status(401).json({ error: "FID authentication required" });
            }

            const zenPubKey = fidHeader.substring(4).trim();
            if (!zenPubKey) {
                return res.status(401).json({ error: "Invalid FID header" });
            }

            // Look up user by zen_pub key
            const user = authService.getUserByZenPubKey?.(zenPubKey);
            if (!user) {
                return res.status(401).json({ error: "FID identity not found" });
            }

            if (!user.is_active) {
                return res.status(403).json({ error: "Account is inactive" });
            }

            const context = VisibilityGuardian.deriveContext({
                userId: user.id,
                username: user.username,
                role: user.role,
                artistId: user.artist_id,
                isActive: user.is_active === 1
            });

            req.isAdmin = context.role === 'admin' || context.role === 'super_user' || context.role === 'root_admin';
            req.isRootAdmin = context.role === 'root_admin';
            req.username = user.username;
            req.artistId = user.artist_id;
            req.role = context.role;
            req.isActive = user.is_active === 1;
            req.userId = user.id;
            req.context = context;
            req.zenPubKey = zenPubKey;

            next();
        },
    };
}
