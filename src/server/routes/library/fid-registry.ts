import { Router, json } from "express";
import type { ServiceContainer } from "../../core/container.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";

export function createFidRegistryRoutes(container: ServiceContainer): Router {
    const router = Router();
    const { database } = container;
    router.use(json());

    /**
     * GET /api/fid-registry
     * Get all FID registry entries for the current user
     */
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            const userId = req.userId!;
            const entries = database.getFidRegistry(userId);
            res.json({ success: true, entries });
        } catch (error: any) {
            console.error("[FID Registry] Error fetching entries:", error);
            res.status(500).json({ error: "Failed to fetch FID registry entries" });
        }
    });

    /**
     * GET /api/fid-registry/:instanceDomain
     * Get FID registry entry for a specific instance
     */
    router.get("/:instanceDomain", (req: AuthenticatedRequest, res) => {
        try {
            const userId = req.userId!;
            const { instanceDomain } = req.params;
            const entry = database.getFidRegistryByInstance(userId, instanceDomain);
            if (!entry) {
                return res.status(404).json({ error: "No FID registry entry found for this instance" });
            }
            res.json({ success: true, entry });
        } catch (error: any) {
            console.error("[FID Registry] Error fetching entry:", error);
            res.status(500).json({ error: "Failed to fetch FID registry entry" });
        }
    });

    /**
     * POST /api/fid-registry
     * Add a new FID registry entry (link an artist on another instance)
     * Body: { instanceDomain, artistId?, artistName?, artistSlug?, publicKey?, passportSignature? }
     */
    router.post("/", (req: AuthenticatedRequest, res) => {
        try {
            const userId = req.userId!;
            const { instanceDomain, artistId, artistName, artistSlug, publicKey, passportSignature } = req.body;

            if (!instanceDomain) {
                return res.status(400).json({ error: "instanceDomain is required" });
            }

            // Check if entry already exists
            const existing = database.getFidRegistryByInstance(userId, instanceDomain);
            if (existing) {
                return res.status(409).json({ error: "FID registry entry for this instance already exists" });
            }

            const id = database.addFidRegistryEntry({
                userId,
                instanceDomain,
                artistId: artistId || null,
                artistName: artistName || null,
                artistSlug: artistSlug || null,
                publicKey: publicKey || null,
                passportSignature: passportSignature || null,
            });

            const entry = database.getFidRegistryByInstance(userId, instanceDomain);
            res.status(201).json({ success: true, entry });
        } catch (error: any) {
            console.error("[FID Registry] Error creating entry:", error);
            res.status(500).json({ error: "Failed to create FID registry entry" });
        }
    });

    /**
     * PATCH /api/fid-registry/:id
     * Update an FID registry entry
     * Body: { artistId?, artistName?, artistSlug?, publicKey?, passportSignature?, verified? }
     */
    router.patch("/:id", (req: AuthenticatedRequest, res) => {
        try {
            const { id } = req.params;
            const { artistId, artistName, artistSlug, publicKey, passportSignature, verified } = req.body;

            const owned = database.getFidRegistry(req.userId!).some(e => e.id === Number(id));
            if (!owned) {
                return res.status(404).json({ error: "No FID registry entry found for this instance" });
            }

            database.updateFidRegistryEntry(Number(id), {
                artistId: artistId ?? undefined,
                artistName: artistName ?? undefined,
                artistSlug: artistSlug ?? undefined,
                publicKey: publicKey ?? undefined,
                passportSignature: passportSignature ?? undefined,
                verified: verified ?? undefined,
            });

            const entry = database.getFidRegistry(req.userId!).find(e => e.id === Number(id));
            res.json({ success: true, entry });
        } catch (error: any) {
            console.error("[FID Registry] Error updating entry:", error);
            res.status(500).json({ error: "Failed to update FID registry entry" });
        }
    });

    /**
     * POST /api/fid-registry/:id/verify
     * Mark an FID registry entry as verified
     */
    router.post("/:id/verify", (req: AuthenticatedRequest, res) => {
        try {
            const { id } = req.params;

            const owned = database.getFidRegistry(req.userId!).some(e => e.id === Number(id));
            if (!owned) {
                return res.status(404).json({ error: "No FID registry entry found for this instance" });
            }

            database.verifyFidRegistryEntry(Number(id));
            const entry = database.getFidRegistry(req.userId!).find(e => e.id === Number(id));
            res.json({ success: true, entry });
        } catch (error: any) {
            console.error("[FID Registry] Error verifying entry:", error);
            res.status(500).json({ error: "Failed to verify FID registry entry" });
        }
    });

    /**
     * DELETE /api/fid-registry/:id
     * Delete an FID registry entry
     */
    router.delete("/:id", (req: AuthenticatedRequest, res) => {
        try {
            const { id } = req.params;

            const owned = database.getFidRegistry(req.userId!).some(e => e.id === Number(id));
            if (!owned) {
                return res.status(404).json({ error: "No FID registry entry found for this instance" });
            }

            database.deleteFidRegistryEntry(Number(id));
            res.json({ success: true });
        } catch (error: any) {
            console.error("[FID Registry] Error deleting entry:", error);
            res.status(500).json({ error: "Failed to delete FID registry entry" });
        }
    });

    return router;
}