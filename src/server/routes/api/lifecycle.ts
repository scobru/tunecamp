
import { Router, json } from "express";
import type { LifecycleService } from "../../modules/catalog/lifecycle.service.js";

import { wrapAsync } from "../../middleware/error-handling.js";

export function createLifecycleRoutes(lifecycleService: LifecycleService): Router {
    const router = Router();
    router.use(json());

    /**
     * POST /api/lifecycle/promote/:id
     * Artist requests promotion of an album.
     */
    router.post("/promote/:id", wrapAsync(async (req: any, res: any) => {
        const albumId = parseInt(req.params.id);
        await lifecycleService.requestPromotion(albumId, {
            userId: req.userId,
            artistId: req.artistId,
            role: req.role
        });
        res.json({ success: true, message: "Promotion requested. Awaiting Admin approval." });
    }));

    /**
     * POST /api/lifecycle/approve/:id
     * Admin approves a promotion request.
     */
    router.post("/approve/:id", wrapAsync(async (req: any, res: any) => {
        const albumId = parseInt(req.params.id);
        await lifecycleService.approvePromotion(albumId, {
            userId: req.userId,
            role: req.role
        });
        res.json({ success: true, message: "Album approved." });
    }));

    /**
     * POST /api/lifecycle/finalize/:id
     * Artist finalizes the release (after gas payment).
     */
    router.post("/finalize/:id", wrapAsync(async (req: any, res: any) => {
        const albumId = parseInt(req.params.id);
        await lifecycleService.finalizeRelease(albumId, {
            userId: req.userId,
            artistId: req.artistId,
            role: req.role
        });
        res.json({ success: true, message: "Release finalized and federated." });
    }));

    /**
     * POST /api/lifecycle/reject/:id
     * Admin rejects a promotion request.
     */
    router.post("/reject/:id", wrapAsync(async (req: any, res: any) => {
        const albumId = parseInt(req.params.id);
        const { reason } = req.body;
        await lifecycleService.rejectPromotion(albumId, reason || "No reason provided", {
            userId: req.userId,
            role: req.role
        });
        res.json({ success: true, message: "Promotion rejected." });
    }));

    return router;
}

