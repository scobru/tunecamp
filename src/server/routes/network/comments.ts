import { Router, json } from "express";
import type { ServiceContainer } from "../../core/container.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { wrapAsync } from "../../middleware/error-handling.js";

export function createCommentsRoutes(container: ServiceContainer): Router {
    const social: ServiceContainer['social'] = (container as any).social || (container as any);
    const authMiddleware: ServiceContainer['authMiddleware'] = (container as any).authMiddleware || (container as any);
    const router = Router();
    router.use(json());

    /**
     * GET /api/comments/track/:trackId
     */
    router.get("/track/:trackId", wrapAsync(async (req, res) => {
        const trackId = parseInt(req.params.trackId as string, 10);
        if (isNaN(trackId)) return res.status(400).json({ error: "Invalid track ID" });
        const comments = social.getComments(trackId);
        res.json(comments);
    }));

    /**
     * POST /api/comments/track/:trackId
     * Requires authentication (JWT).
     */
    router.post("/track/:trackId", authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res) => {
        const trackId = parseInt(req.params.trackId as string, 10);
        if (isNaN(trackId)) return res.status(400).json({ error: "Invalid track ID" });

        const { text } = req.body;
        if (!text || typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({ error: "text required" });
        }
        if (text.length > 500) {
            return res.status(400).json({ error: "Comment too long (max 500 chars)" });
        }

        const comment = social.addComment(trackId, req.username!, text.trim());
        res.json(comment);
    }));

    /**
     * DELETE /api/comments/:commentId
     * Requires authentication. Owner or admin only.
     */
    router.delete("/:commentId", authMiddleware.requireUser, wrapAsync(async (req: AuthenticatedRequest, res) => {
        const commentId = parseInt(req.params.commentId as string, 10);
        if (isNaN(commentId)) return res.status(400).json({ error: "Invalid comment ID" });

        const isAdmin = !!(req.isAdmin || req.isSuperUser || req.isRootAdmin);
        const success = social.deleteComment(commentId, req.username!, isAdmin);
        if (!success) return res.status(403).json({ error: "Cannot delete this comment" });
        res.json({ success: true });
    }));

    return router;
}
