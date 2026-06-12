import { Router, json } from "express";
import type { AuthService } from "../../modules/auth/auth.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { validatePassword } from "../../common/validators.js";
import { UserRole } from "../../common/visibility.js";
import { rateLimit } from "../../middleware/rateLimit.js";

import type { ServiceContainer } from "../../core/container.js";

export function createAuthRoutes(container: ServiceContainer): Router {
    const authService: ServiceContainer['authService'] = (container as any).authService || (container as any);
    const authMiddleware: ServiceContainer['authMiddleware'] = (container as any).authMiddleware || (container as any);
    const apService: ServiceContainer['apService'] = (container as any).apService || null;
    const router = Router();
    router.use(json({ limit: "10mb" }));

    /**
     * POST /api/auth/login
     * Login with admin password, returns JWT token
     */
    router.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
        try {
            const { username, password } = req.body;

            if (!password) {
                return res.status(400).json({ error: "Password required" });
            }

            // Check if first run
            if (authService.isFirstRun()) {
                return res.status(400).json({
                    error: "No admin account set up",
                    firstRun: true,
                });
            }

            // Default to 'admin' if no username provided (legacy/default support)
            const userToAuth = username || 'admin';

            const result = await authService.authenticateUser(userToAuth, password);
            if (!result || !result.success) {
                return res.status(401).json({ error: "Invalid username or password" });
            }

            // Phase 4: lazily generate AP keys for this user (fire-and-forget)
            apService?.ensureUserKeys(result.id).catch((e: any) =>
                console.error('[AP] User key gen failed:', e)
            );

            const token = authService.generateToken({
                isAdmin: result.isAdmin || false,
                username: userToAuth,
                artistId: result.artistId || null,
                role: result.role || UserRole.NORMAL_USER,
                isActive: result.isActive ?? true,
                userId: result.id,
                tokenVersion: result.tokenVersion || 0
            });

            res.json({
                token,
                expiresIn: "7d",
                username: userToAuth,
                isRootAdmin: authService.isRootAdmin(userToAuth),
                artistId: result.artistId || null,
                userId: result.id,
                role: result.role || UserRole.NORMAL_USER,
                mustChangePassword: await authService.isDefaultPassword(userToAuth)
            });
        } catch (error) {
            console.error("Login error:", error);
            res.status(500).json({ error: "Login failed" });
        }
    });

    /**
     * POST /api/auth/setup
     * Set initial admin password (first run only)
     */
    router.post("/setup", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
        try {
            if (!authService.isFirstRun()) {
                return res.status(400).json({ error: "Admin account already set up" });
            }

            const { username, password } = req.body;

            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                return res.status(400).json({ error: passwordValidation.error });
            }

            const userToCreate = username || 'admin';

            const result = await authService.createAdmin(userToCreate, password);
            // New root admin has no artist link
            const token = authService.generateToken({
                isAdmin: true,
                username: userToCreate,
                artistId: null,
                role: UserRole.ROOT_ADMIN,
                isActive: true,
                userId: result.id,
                tokenVersion: 0
            });

            res.json({
                message: "Admin account created successfully",
                token,
                expiresIn: "7d",
                username: userToCreate,
                userId: result.id,
                isRootAdmin: true
            });
        } catch (error) {
            console.error("Setup error:", error);
            res.status(500).json({ error: "Setup failed" });
        }
    });

    /**
     * POST /api/auth/password
     * Change own password (any authenticated user)
     */
    router.post("/password", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), authMiddleware.requireUser, async (req: AuthenticatedRequest, res) => {
        try {
            const { currentPassword, newPassword } = req.body;
            // Get username from the token (injected by middleware)
            const username = req.username;
            // We should also preserve the artistId in the new token
            const artistId = req.artistId || null;

            if (!username) {
                return res.status(401).json({ error: "User context not found" });
            }

            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    error: "Current and new password required",
                });
            }

            const passwordValidation = validatePassword(newPassword);
            if (!passwordValidation.valid) {
                return res.status(400).json({ error: passwordValidation.error });
            }

            const valid = await authService.authenticateUser(username, currentPassword);
            if (!valid || !valid.success) {
                return res.status(401).json({ error: "Current password is incorrect" });
            }

            await authService.changePassword(username, newPassword);

            const authResult = await authService.authenticateUser(username, newPassword);
            const tokenVersion = (authResult && authResult.success) ? authResult.tokenVersion : 0;

            const token = authService.generateToken({
                isAdmin: req.isAdmin ?? false,
                username,
                artistId,
                role: req.role || UserRole.NORMAL_USER,
                isActive: req.isActive ?? true,
                userId: req.userId || 0,
                tokenVersion: tokenVersion
            });

            res.json({
                message: "Password changed successfully",
                token,
                expiresIn: "7d",
                pair: authService.getUserPair(username) // Return the newly generated or existing pair
            });
        } catch (error) {
            console.error("Password change error:", error);
            res.status(500).json({ error: "Password change failed" });
        }
    });

    /**
     * GET /api/auth/status
     * Check authentication status
     */
    router.get("/status", async (req: AuthenticatedRequest, res) => {
        const username = req.username || "";
        const dbUser = username ? authService.getUserByUsername(username) : null;
        const profile = username ? authService.getUserProfile(username) : null;
        res.json({
            authenticated: req.role !== UserRole.GUEST,
            username: username,
            isRootAdmin: username ? authService.isRootAdmin(username) : false,
            artistId: dbUser ? dbUser.artist_id : (req.artistId || null),
            userId: dbUser ? dbUser.id : (req.userId || null),
            role: dbUser ? dbUser.role : (req.role || null),
            isActive: dbUser ? dbUser.is_active === 1 : (req.isActive !== false),
            pair: username ? authService.getUserPair(username) : null,
            alias: profile?.alias || null,
            avatar: profile?.avatar || (username ? authService.getZenAvatar(username) : null),
            firstRun: authService.isFirstRun(),
            mustChangePassword: username ? await authService.isDefaultPassword(username) : false
        });
    });

    /**
     * PATCH /api/auth/profile
     * Update alias and/or avatar for the authenticated user.
     */
    router.patch("/profile", authMiddleware.requireUser, async (req: AuthenticatedRequest, res) => {
        try {
            const { alias, avatar } = req.body;
            if (alias === undefined && avatar === undefined) {
                return res.status(400).json({ error: "alias or avatar required" });
            }
            authService.updateUserProfile(req.username!, { alias, avatar });
            res.json({ success: true });
        } catch (err) {
            console.error("Profile update error:", err);
            res.status(500).json({ error: "Failed to update profile" });
        }
    });

    return router;
}

