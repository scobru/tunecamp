import { Router, json } from "express";
import path from "path";
import { createAuthMiddleware, type AuthenticatedRequest } from "../../middleware/auth.js";
import type { ServiceContainer } from "../../core/container.js";
import { UserRole, VisibilityGuardian } from "../../common/visibility.js";

export function createPeersRoutes(container: ServiceContainer): Router {
    const authService = container.authService;
    const peerService = container.peerService;
    const database = container.database;
    const identity = container.identity;
    const scannerService = container.scannerService;
    const authMiddleware = container.authMiddleware || createAuthMiddleware(authService);
    
    const router = Router();
    router.use(json());

    // Public status check
    router.get("/status", (req, res) => {
        const peerEnabled = identity.getSetting("peerEnabled") === "true";
        res.json({
            enabled: peerEnabled,
            allowDownloads: identity.getSetting("peerAllowDownloads") !== "false"
        });
    });

    // All other routes require user authentication
    router.use(authMiddleware.requireUser);

    // List active sessions
    router.get("/", (req: AuthenticatedRequest, res) => {
        try {
            const sessions = peerService.getSessions();
            res.json(sessions);
        } catch (error) {
            console.error("[PeersRoute] Failed to get active peer sessions:", error);
            res.status(500).json({ error: "Failed to get active peer sessions" });
        }
    });

    // Search peer tracks
    router.get("/search", (req: AuthenticatedRequest, res) => {
        try {
            const query = req.query.q;
            if (typeof query !== "string" || !query.trim()) {
                return res.status(400).json({ error: "Query parameter 'q' is required" });
            }
            const results = peerService.searchTracks(query.trim());
            res.json(results);
        } catch (error) {
            console.error("[PeersRoute] Failed to search peer tracks:", error);
            res.status(500).json({ error: "Failed to search peer tracks" });
        }
    });

    // List tracks of a session
    router.get("/:sessionId/tracks", (req: AuthenticatedRequest, res) => {
        const { sessionId } = req.params;
        try {
            const tracks = peerService.getTracksBySession(sessionId);
            res.json(tracks);
        } catch (error) {
            console.error(`[PeersRoute] Failed to get tracks for session ${sessionId}:`, error);
            res.status(500).json({ error: "Failed to get tracks for session" });
        }
    });

    // Stream a peer track via tunnel
    router.get("/:sessionId/tracks/:trackId/stream", async (req: AuthenticatedRequest, res) => {
        const { sessionId, trackId } = req.params;
        try {
            await peerService.requestStream(sessionId, trackId, res);
        } catch (error) {
            console.error(`[PeersRoute] Failed to stream track ${trackId} from session ${sessionId}:`, error);
            if (!res.headersSent) {
                res.status(500).json({ error: "Failed to initiate stream" });
            }
        }
    });

    // Download a peer track via tunnel
    router.get("/:sessionId/tracks/:trackId/download", async (req: AuthenticatedRequest, res) => {
        const { sessionId, trackId } = req.params;
        try {
            await peerService.requestDownload(sessionId, trackId, res);
        } catch (error) {
            console.error(`[PeersRoute] Failed to download track ${trackId} from session ${sessionId}:`, error);
            if (!res.headersSent) {
                res.status(500).json({ error: "Failed to initiate download" });
            }
        }
    });

    // Import a peer track into the local library (Root Admin / Manager only).
    // Pulls the full file over the tunnel, writes it to the music directory,
    // and indexes it via the scanner so it becomes a permanent local release.
    router.post("/:sessionId/tracks/:trackId/import", async (req: AuthenticatedRequest, res) => {
        const isManagerOrAbove = req.isAdmin || (req.role && VisibilityGuardian.isAdminRole(req.role));
        if (!isManagerOrAbove) {
            return res.status(403).json({ error: "Access denied: importing peer tracks is restricted to Root Admin or Manager" });
        }

        const { sessionId, trackId } = req.params;
        try {
            const destDir = path.join(container.musicDir, "peer-imports");
            const { filePath, track } = await peerService.requestImport(sessionId, trackId, destDir);

            const result = await scannerService.processAudioFile(filePath, container.musicDir, undefined, req.userId);
            console.log(`📥 [PeersRoute] Imported peer track "${track.title}" (${trackId}) into library by ${req.username}`);
            res.json({ success: true, track, result });
        } catch (error: any) {
            console.error(`[PeersRoute] Failed to import track ${trackId} from session ${sessionId}:`, error);
            res.status(500).json({ error: "Failed to import peer track", details: error?.message });
        }
    });

    // Admin toggle can_peer permission (requires root admin or manager)
    router.put("/users/:id/can-peer", async (req: AuthenticatedRequest, res) => {
        try {
            const role = req.role;
            if (role !== UserRole.ROOT_ADMIN && role !== UserRole.ADMIN && role !== UserRole.SUPER_USER) {
                return res.status(403).json({ error: "Access denied: User permission management is restricted to administrators" });
            }

            const targetUserId = parseInt(req.params.id, 10);
            const { canPeer } = req.body;
            if (typeof canPeer !== "boolean") {
                return res.status(400).json({ error: "Boolean parameter 'canPeer' is required" });
            }

            // Cannot modify root admin
            if (targetUserId === 1) {
                return res.status(400).json({ error: "Cannot modify root admin permissions" });
            }

            database.db.prepare("UPDATE admin SET can_peer = ? WHERE id = ?").run(canPeer ? 1 : 0, targetUserId);
            
            // Revoke tokens to force re-auth
            authService.revokeTokens(targetUserId);

            console.log(`[PeersRoute] Updated can_peer to ${canPeer} for user ID ${targetUserId} by admin ${req.username}`);
            res.json({ success: true, canPeer });
        } catch (error) {
            console.error("[PeersRoute] Failed to update user can_peer:", error);
            res.status(500).json({ error: "Failed to update user peer permission" });
        }
    });

    // DELETE session / kick (admin only)
    router.delete("/:sessionId", async (req: AuthenticatedRequest, res) => {
        const { sessionId } = req.params;
        try {
            const role = req.role;
            if (role !== UserRole.ROOT_ADMIN && role !== UserRole.ADMIN && role !== UserRole.SUPER_USER) {
                return res.status(403).json({ error: "Access denied: Session termination is restricted to administrators" });
            }

            peerService.unregisterSession(sessionId);
            res.json({ success: true });
        } catch (error) {
            console.error(`[PeersRoute] Failed to disconnect session ${sessionId}:`, error);
            res.status(500).json({ error: "Failed to terminate session" });
        }
    });

    return router;
}
