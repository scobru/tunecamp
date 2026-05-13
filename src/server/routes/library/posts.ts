
import { Router } from "express";
import type { DatabaseService } from "../../core/database.js";

export function createPostsRoutes(database: DatabaseService): Router {
    const router = Router();

    /**
     * GET /api/posts/:slug
     * Get a single post by slug (Public)
     */
    router.get("/:slug", (req, res) => {
        try {
            const slug = req.params.slug;
            const post = database.getPostBySlug(slug);

            if (!post) {
                return res.status(404).json({ error: "Post not found" });
            }

            // Map snake_case to camelCase for frontend
            res.json({
                id: post.id,
                slug: post.slug,
                content: post.content,
                artistId: post.artist_id,
                artistName: post.artist_name,
                artistSlug: post.artist_slug,
                artistAvatar: post.artist_photo,
                createdAt: post.created_at,
                isPublic: true
            });

        } catch (error) {
            console.error("Error getting post:", error);
            res.status(500).json({ error: "Failed to get post" });
        }
    });

    return router;
}

