import { Router } from "express";
import type { AuthService } from "../auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export function createAuthRoutes(authService: AuthService) {
    const router = Router();

    /**
     * POST /api/auth/login
     * Login with admin password, returns JWT token
     */
    router.post("/login", async (req, res) => {
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

            const token = authService.generateToken({
                isAdmin: true,
                username: userToAuth,
                artistId: result.artistId
            });

            res.json({
                token,
                expiresIn: "7d",
                username: userToAuth,
                isRootAdmin: authService.isRootAdmin(userToAuth),
                artistId: result.artistId
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
    router.post("/setup", async (req, res) => {
        try {
            if (!authService.isFirstRun()) {
                return res.status(400).json({ error: "Admin account already set up" });
            }

            const { username, password } = req.body;

            if (!password || password.length < 6) {
                return res.status(400).json({
                    error: "Password must be at least 6 characters",
                });
            }

            const userToCreate = username || 'admin';

            await authService.createAdmin(userToCreate, password);
            // New root admin has no artist link
            const token = authService.generateToken({
                isAdmin: true,
                username: userToCreate,
                artistId: null
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
    router.post("/password", async (req: AuthenticatedRequest, res) => {
        try {
            // This route should be protected by requireAdmin middleware
            const { currentPassword, newPassword } = req.body;
            // Get username from the token (injected by middleware)
            const username = (req as any).username;
            // We should also preserve the artistId in the new token
            const artistId = (req as any).artistId || null;

            if (!username) {
                return res.status(401).json({ error: "User context not found" });
            }

            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    error: "Current and new password required",
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    error: "New password must be at least 6 characters",
                });
            }

            const valid = await authService.authenticateUser(username, currentPassword);
            if (!valid) {
                return res.status(401).json({ error: "Current password is incorrect" });
            }

            await authService.changePassword(username, newPassword);
            const token = authService.generateToken({
                isAdmin: true,
                username,
                artistId
            });

            res.json({
                message: "Password changed successfully",
                token,
                expiresIn: "7d",
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
    router.get("/status", (req: AuthenticatedRequest, res) => {
        const username = req.username || "";
        res.json({
            authenticated: req.isAdmin === true,
            username: username,
            isRootAdmin: username ? authService.isRootAdmin(username) : false,
            artistId: req.artistId || null,
            firstRun: authService.isFirstRun(),
        });
    });

    return router;
}
