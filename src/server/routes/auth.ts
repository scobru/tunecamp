import { Router } from "express";
import type { AuthService } from "../auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { validatePassword } from "../validators.js";
import { UserRole } from "../common/visibility.js";
import { rateLimit } from "../middleware/rateLimit.js";

export function createAuthRoutes(authService: AuthService, authMiddleware: any): Router {
    const router = Router();

    /**
     * POST /api/auth/login
     * Login with admin password, returns JWT token
     */
    router.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }), async (req, res) => {
        try {
            const { username, password, pubKey, proof } = req.body;

            if (!password && !(pubKey && proof)) {
                return res.status(400).json({ error: "Password or GunDB proof required" });
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

            const result = await authService.authenticateUser(userToAuth, password, pubKey, proof);
            if (!result || !result.success) {
                return res.status(401).json({ error: "Invalid username or password" });
            }

            const token = authService.generateToken({
                isAdmin: result.isAdmin || false,
                username: userToAuth,
                artistId: result.artistId || null,
                role: result.role || UserRole.NORMAL_USER,
                isActive: result.isActive ?? true,
                userId: result.id
            });

            res.json({
                token,
                expiresIn: "7d",
                username: userToAuth,
                isRootAdmin: authService.isRootAdmin(userToAuth),
                artistId: result.artistId || null,
                role: result.role || UserRole.NORMAL_USER,
                pair: result.pair || null, // Return GunDB identity pair
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
    router.post("/setup", rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }), async (req, res) => {
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
                userId: result.id
            });

            res.json({
                message: "Admin account created successfully",
                token,
                expiresIn: "7d",
                username: userToCreate,
                isRootAdmin: true
            });
        } catch (error) {
            console.error("Setup error:", error);
            res.status(500).json({ error: "Setup failed" });
        }
    });

    /**
     * POST /api/auth/password
     * Change admin password (requires auth)
     */
    router.post("/password", rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }), authMiddleware.requireAdmin, async (req: AuthenticatedRequest, res) => {
        try {
            // This route should be protected by requireAdmin middleware
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
            if (!valid) {
                return res.status(401).json({ error: "Current password is incorrect" });
            }

            await authService.changePassword(username, newPassword);
            const token = authService.generateToken({
                isAdmin: true,
                username,
                artistId,
                role: req.role || UserRole.ADMIN,
                isActive: req.isActive ?? true,
                userId: req.userId || 0
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
        res.json({
            authenticated: req.isAdmin === true || req.role === UserRole.NORMAL_USER,
            username: username,
            isRootAdmin: username ? authService.isRootAdmin(username) : false,
            artistId: req.artistId || null,
            role: req.role || null,
            pair: username ? authService.getUserPair(username) : null,
            firstRun: authService.isFirstRun(),
            mustChangePassword: username ? await authService.isDefaultPassword(username) : false
        });
    });

    return router;
}
