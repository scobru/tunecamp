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
            const { pubKey, username, password, signature } = req.body;

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

            // Check if registration is enabled
            const allowRegistration = identity.getSetting("allowRegistration");
            if (allowRegistration === "false") {
                return res.status(403).json({ error: "Registration is currently disabled" });
            }

            // Check if username is already taken (in database)
            const existingDb = authService.getUserByUsername(username);
            if (existingDb) {
                return res.status(409).json({ error: "Username already taken" });
            }

            // 1. Verify ZEN signature if provided (ZEN-first proof)
            if (pubKey && signature) {
                console.log(`🔐 [AUTH] Verifying registration signature for ${username}...`);
                const isValid = await authService.verifyZenSignature(username, pubKey, signature);
                if (isValid) {
                    console.log(`✅ [AUTH] ZEN signature verified for registration of ${username}`);
                    // Also ensure ZEN metadata is populated
                    const existingUser = await zendbService.getUser(pubKey);
                    if (!existingUser || !existingUser.username) {
                        await zendbService.registerUser(pubKey, username);
                    }
                } else {
                    console.warn(`⚠️ [AUTH] ZEN signature invalid for registration of ${username}. Proceeding with password-only auth.`);
                }
            }

            // 2. Create DB user without artist link (null) + storage quota (1GB) + GunDB pubKey
            // Users are now standard listeners by default. Admin must promote them to artists.
            const DEFAULT_QUOTA = 1024 * 1024 * 1024; // 1GB
            const { id: userId } = await authService.createUser(username, password, null, DEFAULT_QUOTA, pubKey);

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

            console.log(`🆕 New user registered: ${username} (user: ${userId}, pubKey: ${pubKey ? 'linked' : 'none'})`);

            res.json({
                success: true,
                token,
                expiresIn: "7d",
                username,
                artistId: null,
                role: UserRole.NORMAL_USER,
                isActive: true,
                storageQuota: DEFAULT_QUOTA,
                pubKey: pubKey || null
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
     * Get user profile by public key
     */
    router.get("/:pubKey", async (req, res) => {
        try {
            const { pubKey } = req.params;
            const user = await zendbService.getUser(pubKey);

            if (!user) {
                return res.status(404).json({ error: "User not found" });
            }

            res.json(user);
        } catch (error) {
            console.error("Get user error:", error);
            res.status(500).json({ error: "Failed to get user" });
        }
    });

    /**
     * POST /api/users/sync
     * Sync Zen user data (pub, epub, alias, avatar) to local SQLite
     */
    router.post("/sync", async (req, res) => {
        try {
            if (!req.body || typeof req.body !== "object") {
                return res.status(400).json({ error: "Request body is required" });
            }
            const { pub, epub, alias, avatar } = req.body;

            if (!pub || !epub) {
                return res.status(400).json({ error: "pub and epub are required" });
            }

            const finalAlias = alias || "Anonymous";
            identity.syncZenUser(pub, epub, finalAlias, avatar);
            res.json({ success: true });
        } catch (error) {
            console.error("User sync error:", error);
            res.status(500).json({ error: "Sync failed" });
        }
    });

    /**
     * POST /api/users/sync-pair
     * Sync full GunDB pair (SEA) to server for persistence
     */
    router.post("/sync-pair", authMiddleware.requireUser, async (req: AuthenticatedRequest, res) => {
        try {
            if (!req.isAdmin && !req.isActive) {
                return res.status(403).json({ error: "Account not active" });
            }
            const { pair } = req.body;
            if (!pair || !pair.pub || !pair.priv || !pair.epub || !pair.epriv) {
                return res.status(400).json({ error: "Complete ZEN pair required" });
            }

            if (!req.username) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            authService.updateZenPair(req.username, pair);
            res.json({ success: true });
        } catch (error) {
            console.error("User pair sync error:", error);
            res.status(500).json({ error: "Pair sync failed" });
        }
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

