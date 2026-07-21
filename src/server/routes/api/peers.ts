import { Router, json } from "express";
import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { createAuthMiddleware, type AuthenticatedRequest } from "../../middleware/auth.js";
import type { ServiceContainer } from "../../core/container.js";
import { UserRole, VisibilityGuardian } from "../../common/visibility.js";
import { fetchSafe, fetchJsonSafe, drainResponse } from "../../common/network.js";

const MAX_FEDERATED_IMPORT_BYTES = 200 * 1024 * 1024; // 200MB safety cap

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

    // Public, cross-instance streaming of a shared peer track. Unlike the
    // authenticated /stream below, this is reachable by other federated TuneCamp
    // instances (and their visitors) without a local account — but ONLY when the
    // admin has opted into peer federation. Streaming only; no download tunnel is
    // exposed here, so full files never leave via this path.
    router.get("/:sessionId/tracks/:trackId/federated-stream", async (req, res) => {
        const peerEnabled = identity.getSetting("peerEnabled") === "true";
        const peerFederation = identity.getSetting("peerFederation") === "true";
        if (!peerEnabled || !peerFederation) {
            return res.status(403).json({ error: "Peer federation is disabled on this instance" });
        }

        const { sessionId, trackId } = req.params;
        try {
            await peerService.requestStream(sessionId, trackId, res);
        } catch (error) {
            console.error(`[PeersRoute] Failed federated-stream of track ${trackId} from session ${sessionId}:`, error);
            if (!res.headersSent) {
                res.status(500).json({ error: "Failed to initiate stream" });
            }
        }
    });

    // Public, cross-instance download of a shared peer track. Like
    // federated-stream but transfers the full file, so it additionally requires
    // peer downloads to be allowed globally. Used by remote instances to import.
    router.get("/:sessionId/tracks/:trackId/federated-download", async (req, res) => {
        const peerEnabled = identity.getSetting("peerEnabled") === "true";
        const peerFederation = identity.getSetting("peerFederation") === "true";
        const allowDownloads = identity.getSetting("peerAllowDownloads") !== "false";
        if (!peerEnabled || !peerFederation || !allowDownloads) {
            return res.status(403).json({ error: "Federated peer downloads are disabled on this instance" });
        }

        const { sessionId, trackId } = req.params;
        try {
            // requestDownload re-checks per-session and per-track download flags.
            await peerService.requestDownload(sessionId, trackId, res);
        } catch (error) {
            console.error(`[PeersRoute] Failed federated-download of track ${trackId} from session ${sessionId}:`, error);
            if (!res.headersSent) {
                res.status(500).json({ error: "Failed to initiate download" });
            }
        }
    });

    // Public, cross-instance peer-track search. Lets a remote federated instance
    // discover what THIS instance's connected pir daemons are sharing, so its
    // users can stream them via /federated-stream. Same gate as the other
    // federated-* routes (peerEnabled + peerFederation opt-in). No download
    // tunnel is exposed here — search + stream only.
    router.get("/federated-search", (req, res) => {
        const peerEnabled = identity.getSetting("peerEnabled") === "true";
        const peerFederation = identity.getSetting("peerFederation") === "true";
        if (!peerEnabled || !peerFederation) {
            return res.status(403).json({ error: "Peer federation is disabled on this instance" });
        }
        const query = req.query.q;
        if (typeof query !== "string" || !query.trim()) {
            return res.status(400).json({ error: "Query parameter 'q' is required" });
        }
        try {
            // Cap to keep a single federated fan-out cheap for the caller.
            res.json(peerService.searchTracks(query.trim()).slice(0, 50));
        } catch (error) {
            console.error("[PeersRoute] Federated peer search failed:", error);
            res.status(500).json({ error: "Failed to search peer tracks" });
        }
    });

    // Public, cross-instance session listing. Lets a remote federated instance
    // enumerate THIS instance's connected peer daemons so its users can browse
    // into them. Scrubbed to {id, username, trackCount} only — never leak
    // ip_address or other session internals to remote/anonymous callers.
    router.get("/federated-sessions", (req, res) => {
        const peerEnabled = identity.getSetting("peerEnabled") === "true";
        const peerFederation = identity.getSetting("peerFederation") === "true";
        if (!peerEnabled || !peerFederation) {
            return res.status(403).json({ error: "Peer federation is disabled on this instance" });
        }
        try {
            const sessions = peerService.getSessions().map((s: any) => ({
                id: s.id, username: s.username, trackCount: s.trackCount
            }));
            res.json(sessions);
        } catch (error) {
            console.error("[PeersRoute] Failed federated session listing:", error);
            res.status(500).json({ error: "Failed to list peer sessions" });
        }
    });

    // Public, cross-instance track listing for a single session. Same gate as
    // the other federated-* routes.
    router.get("/:sessionId/tracks/federated-list", (req, res) => {
        const peerEnabled = identity.getSetting("peerEnabled") === "true";
        const peerFederation = identity.getSetting("peerFederation") === "true";
        if (!peerEnabled || !peerFederation) {
            return res.status(403).json({ error: "Peer federation is disabled on this instance" });
        }
        try {
            res.json(peerService.getTracksBySession(req.params.sessionId));
        } catch (error) {
            console.error(`[PeersRoute] Failed federated track listing for session ${req.params.sessionId}:`, error);
            res.status(500).json({ error: "Failed to list session tracks" });
        }
    });

    // All other routes require user authentication
    router.use(authMiddleware.requireUser);

    // Import a peer track shared by ANOTHER federated instance into this library
    // (Root Admin / Manager only). Pulls the file over HTTP from the remote
    // instance's federated-download endpoint, then indexes it locally.
    router.post("/federated-import", async (req: AuthenticatedRequest, res) => {
        const isManagerOrAbove = req.isAdmin || (req.role && VisibilityGuardian.isAdminRole(req.role));
        if (!isManagerOrAbove) {
            return res.status(403).json({ error: "Access denied: importing federated tracks is restricted to Root Admin or Manager" });
        }

        const { downloadUrl, title, artist, album } = req.body || {};
        if (!downloadUrl || typeof downloadUrl !== "string") {
            return res.status(400).json({ error: "A 'downloadUrl' is required" });
        }

        let remote: Response | null = null;
        try {
            remote = await fetchSafe(downloadUrl, { headers: { "User-Agent": "TuneCamp-Federation/2.0" } });
            if (!remote.ok || !remote.body) {
                await drainResponse(remote);
                return res.status(502).json({ error: "Failed to fetch track from remote instance" });
            }

            const declaredSize = Number(remote.headers.get("content-length") || 0);
            if (declaredSize > MAX_FEDERATED_IMPORT_BYTES) {
                await drainResponse(remote);
                return res.status(413).json({ error: "Remote track exceeds the import size limit" });
            }

            const destDir = path.join(container.musicDir, "peer-imports");
            await fs.promises.mkdir(destDir, { recursive: true });

            const ct = remote.headers.get("content-type") || "";
            const ext = ct.includes("flac") ? "flac" : ct.includes("wav") ? "wav" : ct.includes("ogg") ? "ogg" : "mp3";
            let base = `${artist || "Unknown Artist"} - ${title || "Track"}`.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
            if (base === '.' || base === '..') base = '_';
            const filePath = path.join(destDir, `${base}-${Date.now().toString(36)}.${ext}`);

            if (!path.resolve(filePath).startsWith(path.resolve(destDir) + path.sep)) {
                await drainResponse(remote);
                return res.status(400).json({ error: "Invalid path traversal detected in track metadata" });
            }

            await pipeline(Readable.fromWeb(remote.body as any), fs.createWriteStream(filePath));

            const result = await scannerService.processAudioFile(filePath, container.musicDir, undefined, req.userId);
            res.json({ success: true, result });
        } catch (error: any) {
            if (remote) await drainResponse(remote).catch(() => {});
            console.error(`[PeersRoute] Failed to import federated track from ${downloadUrl}:`, error);
            res.status(500).json({ error: "Failed to import federated track", details: error?.message });
        }
    });

    // List active sessions, fanned out to federated instances when opted in.
    router.get("/", async (req: AuthenticatedRequest, res) => {
        try {
            const sessions: any[] = peerService.getSessions();
            const peerFederation = identity.getSetting("peerFederation") === "true";
            if (peerFederation && container.federatedDiscoveryService) {
                const origins = container.federatedDiscoveryService.getCommunitySites()
                    .map(s => s.url).filter(Boolean).slice(0, 10);
                const remote = await Promise.allSettled(origins.map(async (origin) => {
                    const list = await fetchJsonSafe<any[]>(`${origin.replace(/\/$/, "")}/api/peers/federated-sessions`, {
                        signal: AbortSignal.timeout(3000),
                        headers: { "User-Agent": "TuneCamp-Federation/2.0" },
                    });
                    return Array.isArray(list) ? list.map(s => ({ ...s, origin })) : [];
                }));
                for (const r of remote) {
                    if (r.status === "fulfilled") sessions.push(...r.value);
                }
            }
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

    // List tracks of a session. Pass ?origin=<federated instance URL> to proxy
    // into a remote federated instance's session instead of a local one.
    // Origin is validated against known federated sites (never an open proxy).
    router.get("/:sessionId/tracks", async (req: AuthenticatedRequest, res) => {
        const { sessionId } = req.params;
        const origin = typeof req.query.origin === "string" ? req.query.origin : null;
        try {
            if (origin) {
                const known = container.federatedDiscoveryService?.getCommunitySites().some(s => s.url === origin);
                if (!known) {
                    return res.status(400).json({ error: "Unknown federated origin" });
                }
                const tracks = await fetchJsonSafe<any[]>(`${origin.replace(/\/$/, "")}/api/peers/${sessionId}/tracks/federated-list`, {
                    signal: AbortSignal.timeout(5000),
                    headers: { "User-Agent": "TuneCamp-Federation/2.0" },
                });
                return res.json(tracks || []);
            }
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
