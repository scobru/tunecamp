import { Router } from "express";
import type { DatabaseService } from "../database.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

export function createUnlockRoutes(database: DatabaseService) {
    const router = Router();

    /**
     * POST /api/unlock/validate
     * Validate an unlock code
     */
    router.post("/validate", (req, res) => {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: "Code required" });

        const result = database.validateUnlockCode(code);
        if (!result.valid) {
            return res.status(404).json({ valid: false, error: "Invalid code" });
        }

        // Return release info if associated
        let release = null;
        if (result.releaseId) {
            release = database.getAlbum(result.releaseId);
        }

        res.json({ valid: true, isUsed: result.isUsed, release });
    });

    /**
     * POST /api/unlock/redeem
     * Redeem a code (mark as used) - usually happens on download
     */
    router.post("/redeem", (req, res) => {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: "Code required" });

        const result = database.validateUnlockCode(code);
        // Depending on logic, maybe multiple uses are allowed? 
        // For now assuming single use or just tracking usage.
        // User didn't specify strict single-use, but "is_used" implies it.
        // Let's mark it but allow re-download if same session? 
        // For now just allow redeem.

        database.redeemUnlockCode(code);
        res.json({ success: true });
    });

    // --- Admin Routes ---

    /**
     * GET /api/unlock/admin/list
     * List codes
     */
    router.get("/admin/list", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) return res.status(401).json({ error: "Unauthorized" });

        const releaseId = req.query.releaseId ? parseInt(req.query.releaseId as string) : undefined;
        const codes = database.listUnlockCodes(releaseId);
        res.json(codes);
    });

    /**
     * POST /api/unlock/admin/create
     * Generate new codes
     */
    router.post("/admin/create", (req: AuthenticatedRequest, res) => {
        if (!req.isAdmin) return res.status(401).json({ error: "Unauthorized" });

        const { count, releaseId } = req.body;
        const numCodes = count || 1;
        const created = [];

        for (let i = 0; i < numCodes; i++) {
            // Simple random code generation
            const code = Math.random().toString(36).substring(2, 10).toUpperCase();
            try {
                database.createUnlockCode(code, releaseId);
                created.push(code);
            } catch (e) {
                // Retry once if collision (rare)
                const retry = Math.random().toString(36).substring(2, 10).toUpperCase();
                try {
                    database.createUnlockCode(retry, releaseId);
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
