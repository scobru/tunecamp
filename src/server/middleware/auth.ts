import type { Request, Response, NextFunction } from "express";
import type { AuthService, TokenPayload } from "../modules/auth/auth.service.js";
import { VisibilityGuardian, Capability, UserRole, ViewerContext } from "../common/visibility.js";
import { deriveIdentity, deriveIdentityFromAccount, applyIdentity, GUEST_IDENTITY } from "./identity.js";

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

    /**
     * Resolve the caller from a verified token. The account is fetched by id —
     * the same row verifyToken already checked — rather than by username:
     * getUserByUsername matches `username COLLATE NOCASE OR alias COLLATE
     * NOCASE`, so a username lookup can land on a different account than the
     * one the token was issued for.
     */
    function identityFor(payload: TokenPayload) {
        return deriveIdentity(payload, authService.getAdminById?.(payload.userId as number));
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

            const identity = identityFor(payload);
            // Check if user has administrative view capabilities
            if (!VisibilityGuardian.can(identity.context, Capability.VIEW_PRIVATE_LIBRARY)) {
                return res.status(403).json({ error: "Access denied: Admin only" });
            }

            applyIdentity(req, identity);
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

            const identity = identityFor(payload);
            applyIdentity(req, identity);
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
                const identity = identityFor(payload);
                applyIdentity(req, identity);
            } else {
                applyIdentity(req, GUEST_IDENTITY);
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

            const identity = identityFor(payload);

            if (!VisibilityGuardian.isAdminRole(identity.role)) {
                return res.status(403).json({ error: "Access denied: Manager only" });
            }

            applyIdentity(req, identity);
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

            const identity = identityFor(payload);

            if (!VisibilityGuardian.can(identity.context, Capability.MANAGE_SYSTEM)) {
                return res.status(403).json({ error: "Access denied: Root Admin only" });
            }

            applyIdentity(req, identity);
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

            applyIdentity(req, deriveIdentityFromAccount(user as any, zenPubKey));

            next();
        },
    };
}
