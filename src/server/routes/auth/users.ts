import { Router, json } from "express";
import crypto from "crypto";
import { validateUsername } from "../../../utils/audioUtils.js";
import type { DatabaseService } from "../../core/database.js";
import type { AuthService } from "../../modules/auth/auth.service.js";
import type { ActivityPubService } from "../../modules/activitypub/activitypub.service.js";
import { validatePassword } from "../../common/validators.js";
import { UserRole, VisibilityGuardian } from "../../common/visibility.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { createAuthMiddleware, type AuthenticatedRequest } from "../../middleware/auth.js";

import type { ServiceContainer } from "../../core/container.js";

export function createUsersRoutes(container: ServiceContainer): Router {
    const authService: ServiceContainer['authService'] = (container as any).authService || (container as any);
    const apService: ServiceContainer['apService'] = (container as any).apService || (container as any);
    const database: ServiceContainer['database'] = (container as any).database || (container as any);
    const identity: ServiceContainer['identity'] = (container as any).identity || (database as any).identity || database;
    const library: ServiceContainer['library'] = (container as any).library || (container as any);
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

            // When self-publish is enabled, auto-approve immediately instead of queuing
            if (identity?.getSetting("listenerSelfPublish") === "true") {
                const user = authService.getAdminById(req.userId!);
                if (!user) return res.status(404).json({ error: "User not found" });

                const existingArtist = library.getArtistByName(user.username);
                const artistId = existingArtist 
                    ? existingArtist.id 
                    : library.createArtist(user.username, undefined, undefined, undefined, undefined, undefined, 'public');
                library.setArtistCanSell(artistId, false);
                // Keep the listener's role unchanged — the artist profile link grants
                // publishing rights; curator/manager elevation requires root admin.
                const newRole = user.role as UserRole;
                // Grant the admin-configured default storage quota for physical uploads.
                // Stored in MB (default 1024 = 1GB); 0 means unlimited. Admins can still
                // tweak a single user's quota from the Users panel afterwards.
                const quotaMb = Number(identity?.getSetting("listenerSelfPublishQuota"));
                const quotaBytes = (Number.isFinite(quotaMb) && quotaMb >= 0 ? quotaMb : 1024) * 1024 * 1024;
                authService.updateAdmin(req.userId!, artistId, newRole, quotaBytes);
                authService.setArtistRequest(req.userId!, false);

                // Issue a fresh token so the caller can update their session immediately
                const token = authService.generateToken({
                    userId: req.userId!,
                    isAdmin: VisibilityGuardian.isAdminRole(newRole),
                    username: user.username,
                    artistId,
                    role: newRole,
                    isActive: true,
                    tokenVersion: (user as any).token_version ?? 0,
                });

                console.log(`[Self-Publish] Auto-approved artist request for ${user.username} (artistId=${artistId})`);
                return res.json({ success: true, autoApproved: true, token, artistId, message: "Artist profile created!" });
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

    /**
     * GET /api/users/me/api-tokens
     * Get API tokens for current user (Curator, Manager, Admin only)
     */
    router.get("/me/api-tokens", authMiddleware.requireUser, (req: AuthenticatedRequest, res) => {
        try {
            const role = req.role;
            if (role !== UserRole.ROOT_ADMIN && role !== UserRole.ADMIN && role !== UserRole.SUPER_USER) {
                return res.status(403).json({ error: "Access denied: API tokens are only available for Curators, Managers, and Admins" });
            }

            const tokens = database.db.prepare("SELECT id, name, token, created_at, expires_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC").all(req.userId!) as any[];
            
            // Mask the tokens in the response so they are not fully exposed in subsequent listings
            const maskedTokens = tokens.map(t => {
                const tokenStr = t.token;
                const masked = tokenStr.length > 10
                    ? `${tokenStr.substring(0, 7)}...${tokenStr.substring(tokenStr.length - 4)}`
                    : tokenStr;
                return {
                    id: t.id,
                    name: t.name,
                    token: masked,
                    created_at: t.created_at,
                    expires_at: t.expires_at
                };
            });

            res.json(maskedTokens);
        } catch (error) {
            console.error("Failed to get API tokens:", error);
            res.status(500).json({ error: "Failed to get API tokens" });
        }
    });

    /**
     * POST /api/users/me/api-tokens
     * Create a new API token for the current user (Curator, Manager, Admin only)
     */
    router.post("/me/api-tokens", authMiddleware.requireUser, (req: AuthenticatedRequest, res) => {
        try {
            const role = req.role;
            if (role !== UserRole.ROOT_ADMIN && role !== UserRole.ADMIN && role !== UserRole.SUPER_USER) {
                return res.status(403).json({ error: "Access denied: API tokens are only available for Curators, Managers, and Admins" });
            }

            const { name } = req.body;
            if (!name || typeof name !== 'string' || !name.trim()) {
                return res.status(400).json({ error: "Token name is required" });
            }

            // Generate a secure random token prefixed with tc_
            const randomBytes = crypto.randomBytes(32).toString("hex");
            const token = `tc_${randomBytes}`;

            database.db.prepare("INSERT INTO api_tokens (user_id, token, name) VALUES (?, ?, ?)").run(req.userId!, token, name.trim());

            res.json({ token, name: name.trim() });
        } catch (error) {
            console.error("Failed to create API token:", error);
            res.status(500).json({ error: "Failed to create API token" });
        }
    });

    /**
     * DELETE /api/users/me/api-tokens/:id
     * Delete/revoke an API token (Curator, Manager, Admin only)
     */
    router.delete("/me/api-tokens/:id", authMiddleware.requireUser, (req: AuthenticatedRequest, res) => {
        try {
            const role = req.role;
            if (role !== UserRole.ROOT_ADMIN && role !== UserRole.ADMIN && role !== UserRole.SUPER_USER) {
                return res.status(403).json({ error: "Access denied: API tokens are only available for Curators, Managers, and Admins" });
            }

            const tokenId = req.params.id;
            const result = database.db.prepare("DELETE FROM api_tokens WHERE id = ? AND user_id = ?").run(tokenId, req.userId!);
            
            if (result.changes === 0) {
                return res.status(404).json({ error: "API token not found or not owned by you" });
            }

            res.json({ success: true });
        } catch (error) {
            console.error("Failed to delete API token:", error);
            res.status(500).json({ error: "Failed to delete API token" });
        }
    });

    return router;
}

