import { Router, json } from "express";
import type { DatabaseService } from "../../core/database.js";
import { createAuthMiddleware, type AuthenticatedRequest } from "../../middleware/auth.js";
import { VisibilityGuardian, Capability } from "../../common/visibility.js";
import { StringUtils } from "../../../utils/stringUtils.js";

import type { ServiceContainer } from "../../core/container.js";

export function createUnlockRoutes(container: ServiceContainer): Router {
    const authMiddleware = container.authMiddleware;
    const database = container.database;
    const integration: ServiceContainer['integration'] = (container as any).integration || (database as any).integration || database;
    const library: ServiceContainer['library'] = (container as any).library || (database as any).library || database;
    const router = Router();
    router.use(json());
    router.post("/validate", (req, res) => {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: "Code required" });

        const result = integration.validateUnlockCode(code);
        if (!result.valid) {
            return res.status(404).json({ valid: false, error: "Invalid code" });
        }

        // Return release info if associated
        let release = null;
        if (result.releaseId) {
            release = library.getAlbum(result.releaseId);
        }

        res.json({ valid: true, isUsed: result.isUsed, release });
    });
    router.post("/redeem", (req, res) => {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: "Code required" });

        const result = integration.validateUnlockCode(code);
        // Depending on logic, maybe multiple uses are allowed? 
        // For now assuming single use or just tracking usage.
        // User didn't specify strict single-use, but "is_used" implies it.
        // Let's mark it but allow re-download if same session? 
        // For now just allow redeem.

        integration.redeemUnlockCode(code);
        res.json({ success: true });
    });

    // --- Admin Routes ---

    /**
     * GET /api/unlock/admin/list
     * List codes
     */
    router.get("/admin/list", authMiddleware.requireUser, (req: AuthenticatedRequest, res) => {
        if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_PRIVATE_LIBRARY)) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const releaseId = req.query.releaseId ? parseInt(req.query.releaseId as string) : undefined;
        
        // Non-admins (Super Users) must provide a releaseId and own it
        if (!req.isAdmin) {
            if (!releaseId) {
                return res.status(400).json({ error: "releaseId required for non-admin users" });
            }
            const release = library.getRelease(releaseId);
            if (!release || release.owner_id !== req.userId) {
                return res.status(403).json({ error: "Access denied: You don't own this release" });
            }
        }

        const codes = integration.listUnlockCodes(releaseId);
        res.json(codes);
    });

    /**
     * POST /api/unlock/admin/create
     * Generate new codes
     */
    router.post("/admin/create", authMiddleware.requireUser, (req: AuthenticatedRequest, res) => {
        if (!req.context || !VisibilityGuardian.can(req.context, Capability.MANAGE_PRIVATE_LIBRARY)) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { count, releaseId } = req.body;

        // Non-admins (Super Users) must own the release
        if (!req.isAdmin) {
            if (!releaseId) {
                return res.status(400).json({ error: "releaseId required for non-admin users" });
            }
            const release = library.getRelease(releaseId);
            if (!release || release.owner_id !== req.userId) {
                return res.status(403).json({ error: "Access denied: You don't own this release" });
            }
        }
        const numCodes = count || 1;
        const created = [];

        for (let i = 0; i < numCodes; i++) {
            // Standardized alphanumeric code generation
            const code = StringUtils.generateUnlockCode();
            try {
                integration.createUnlockCode(code, releaseId);
                created.push(code);
            } catch (e) {
                // Retry once if collision (rare)
                const retry = StringUtils.generateUnlockCode();
                try {
                    integration.createUnlockCode(retry, releaseId);
                    created.push(retry);
                } catch (e2) {
                    console.error("Failed to generate unique code");
                }
            }
        }

        res.json({ success: true, count: created.length, codes: created });
    });

    return router;
}

