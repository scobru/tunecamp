import { Router, json } from "express";
import { validateUsername } from "../../../utils/audioUtils.js";
import type { ZenDBService } from "../../modules/network/zendb.service.js";
import type { DatabaseService } from "../../core/database.js";
import type { AuthService } from "../../modules/auth/auth.service.js";
import type { ActivityPubService } from "../../modules/activitypub/activitypub.service.js";
import { validatePassword } from "../../common/validators.js";
import { UserRole } from "../../common/visibility.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { createAuthMiddleware, type AuthenticatedRequest } from "../../middleware/auth.js";

import type { ServiceContainer } from "../../core/container.js";

export function createUsersRoutes(container: ServiceContainer): Router {
    const zendbService: ServiceContainer['zendbService'] = (container as any).zendbService || (container as any);
    const authService: ServiceContainer['authService'] = (container as any).authService || (container as any);
    const apService: ServiceContainer['apService'] = (container as any).apService || (container as any);
    const database: ServiceContainer['database'] = (container as any).database || (container as any);
    const identity: ServiceContainer['identity'] = (container as any).identity || (database as any).identity || database;
    const router = Router();
    router.use(json());
    const authMiddleware = createAuthMiddleware(authService);

    /**
     * POST /api/users/register
     * Full registration: Zen user + DB user + Artist profile + AP actor
     */
    router.post("/register", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({ error: "Username and password required" });
            }

            // Validate username format
            const validation = validateUsername(username);
            if (!validation.valid) {
                return res.status(400).json({
                    error: validation.error || "Invalid username format"
                });
            }

            // Validate password
            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                return res.status(400).json({ error: passwordValidation.error });
            }

            // Check if registration is enabled. The admin UI toggle writes
            // "allowPublicRegistration"; "allowRegistration" is the legacy key.
            const allowRegistration = identity.getSetting("allowPublicRegistration") ?? identity.getSetting("allowRegistration");
            if (allowRegistration === "false") {
                return res.status(403).json({ error: "Registration is currently disabled" });
            }

            // Check if username is already taken (in database)
            const existingDb = authService.getUserByUsername(username);
            if (existingDb) {
                return res.status(409).json({ error: "Username already taken" });
            }

            const DEFAULT_QUOTA = 1024 * 1024 * 1024; // 1GB

            // New users are standard listeners (consumers). Publishing requires
            // a Curator account with an artist link: either an admin promotes
            // them manually, or they ask via POST /api/users/me/artist-request
            // and approval promotes them to Curator.
            const { id: userId } = await authService.createUser(username, password, null, DEFAULT_QUOTA);

            // 3. Generate JWT token for auto-login
            const token = authService.generateToken({
                userId,
                isAdmin: false,
                username,
                artistId: null,
                role: UserRole.NORMAL_USER,
                isActive: true,
                tokenVersion: 0
            });

            console.log(`🆕 New user registered: ${username} (userId: ${userId})`);

            res.json({
                success: true,
                token,
                expiresIn: "7d",
                username,
                artistId: null,
                role: UserRole.NORMAL_USER,
                isActive: true,
                storageQuota: DEFAULT_QUOTA,
            });
        } catch (error: any) {
            console.error("User registration error:", error);
            if (error?.code === "SQLITE_CONSTRAINT_UNIQUE") {
                return res.status(409).json({ error: "Username already taken" });
            }
            res.status(500).json({ error: "Registration failed" });
        }
    });

    /**
     * GET /api/users/me/artist-request
     * Returns the current user's pending artist-profile request, if any.
     */
    router.get("/me/artist-request", authMiddleware.requireUser, (req: AuthenticatedRequest, res) => {
        try {
            const requestedAt = authService.getArtistRequest(req.userId!);
            res.json({ requestedAt, hasArtist: !!req.artistId });
        } catch (error) {
            console.error("Artist request status error:", error);
            res.status(500).json({ error: "Failed to get artist request status" });
        }
    });

    /**
     * POST /api/users/me/artist-request
     * A listener asks the admin for an artist profile. The admin approves it
     * with one click from the Users panel.
     */
    router.post("/me/artist-request", authMiddleware.requireUser, (req: AuthenticatedRequest, res) => {
        try {
            if (req.artistId) {
                return res.status(400).json({ error: "You already have an artist profile" });
            }
            authService.setArtistRequest(req.userId!, true);
            res.json({ success: true, message: "Request sent. An admin will review it." });
        } catch (error) {
            console.error("Artist request error:", error);
            res.status(500).json({ error: "Failed to submit artist request" });
        }
    });

    /**
     * GET /api/users/check/:username
     * Check if a username is available
     */
    router.get("/check/:username", async (req, res) => {
        try {
            const { username } = req.params;
            const existingDb = authService.getUserByUsername(username);
            res.json({ available: !existingDb });
        } catch (error) {
            console.error("Username check error:", error);
            res.status(500).json({ error: "Check failed" });
        }
    });

    /**
     * GET /api/users/:pubKey
     * @deprecated Zen user profiles removed (Phase 0). Endpoint kept for compatibility.
     */
    router.get("/:pubKey", (_req, res) => {
        res.status(404).json({ error: "User not found" });
    });

    /**
     * POST /api/users/sync
     * @deprecated Zen user sync removed (Phase 0). No-op for backward compatibility.
     */
    router.post("/sync", (_req, res) => {
        res.json({ success: true });
    });

    /**
     * POST /api/users/sync-pair
     * @deprecated ZenAuth removed (Phase 1). No-op for backward compatibility.
     */
    router.post("/sync-pair", (_req, res) => {
        res.json({ success: true });
    });

    /**
     * GET /api/users/me/storage
     * Get current user's storage usage (requires auth)
     */
    router.get("/me/storage", authMiddleware.requireUser, (req: AuthenticatedRequest, res) => {
        try {
            const user = authService.getUserByUsername(req.username!);
            if (!user) {
                return res.status(404).json({ error: "User not found" });
            }

            res.json({
                storage_quota: user.storage_quota,
                storage_used: authService.getStorageInfo(user.id)?.storage_used || 0,
                role: user.role
            });
        } catch (error) {
            console.error("Storage info error:", error);
            res.status(500).json({ error: "Failed to get storage info" });
        }
    });

    return router;
}

