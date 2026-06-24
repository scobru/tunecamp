import type { WebSocket } from "ws";
import type { Response } from "express";
import crypto from "crypto";
import type { DatabaseService, PeerSession, PeerTrack } from "../../core/database.types.js";
import type { PeerTrackManifest, ServerMessage } from "./peer.protocol.js";
import type { ActivityPubService } from "../activitypub/activitypub.service.js";

export interface ActivePeerSession {
    id: string;
    userId: number;
    username: string;
    ws: WebSocket;
    connectedAt: number;
    allowDownloads: boolean;
    pendingRequests: Map<string, Response>;
}

export class PeerService {
    private activeSessions = new Map<string, ActivePeerSession>();
    private pingInterval: NodeJS.Timeout | null = null;

    constructor(private database: DatabaseService, private apService?: ActivityPubService) {
        this.startHeartbeat();
    }

    startHeartbeat() {
        this.pingInterval = setInterval(() => {
            const now = Date.now();
            for (const [sessionId, session] of this.activeSessions.entries()) {
                // If peer has not replied or connection state is closed, clean up
                if (session.ws.readyState !== 1) { // 1 = OPEN
                    console.log(`🔌 [PeerService] Session ${sessionId} closed or broken. Cleaning up.`);
                    this.unregisterSession(sessionId);
                    continue;
                }

                try {
                    session.ws.send(JSON.stringify({ type: "ping" }));
                    this.database.peer.updatePeerSessionHeartbeat(sessionId);
                } catch (e) {
                    console.error(`🔌 [PeerService] Heartbeat failed for session ${sessionId}:`, e);
                    this.unregisterSession(sessionId);
                }
            }
        }, 30000); // Check every 30 seconds
    }

    stopHeartbeat() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    registerSession(ws: WebSocket, userId: number, username: string, ipAddress: string | null, allowDownloads: boolean): string {
        // Clean up any existing sessions for this user to prevent duplicates
        // when the same peer reconnects (e.g., after a network drop or restart).
        for (const [existingId, existingSession] of this.activeSessions.entries()) {
            if (existingSession.userId === userId) {
                console.log(`🔌 [PeerService] Cleaning up stale session ${existingId} for user ${username} before re-register`);
                try {
                    if (existingSession.ws.readyState === 1) {
                        existingSession.ws.close();
                    }
                } catch {}
                // Cleanup pending requests
                for (const [, res] of existingSession.pendingRequests.entries()) {
                    try { res.status(503).json({ error: "Peer reconnected" }); } catch { try { res.end(); } catch {} }
                }
                existingSession.pendingRequests.clear();
                this.activeSessions.delete(existingId);
                this.database.peer.deletePeerSession(existingId);
            }
        }
        // Also clean up any orphaned DB sessions for this user (e.g., from a server restart)
        this.database.peer.deleteStaleSessionsForUser(userId);

        const sessionId = crypto.randomUUID();
        const session: ActivePeerSession = {
            id: sessionId,
            userId,
            username,
            ws,
            connectedAt: Date.now(),
            allowDownloads,
            pendingRequests: new Map()
        };

        this.activeSessions.set(sessionId, session);
        this.database.peer.createPeerSession(sessionId, userId, ipAddress, allowDownloads);
        
        console.log(`🔌 [PeerService] Session ${sessionId} registered for user ${username}`);
        return sessionId;
    }

    unregisterSession(sessionId: string) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            // Close socket if open
            try {
                if (session.ws.readyState === 1) {
                    session.ws.close();
                }
            } catch {}

            // Cleanup pending requests
            for (const [requestId, res] of session.pendingRequests.entries()) {
                try {
                    res.status(503).json({ error: "Peer disconnected" });
                } catch {
                    try { res.end(); } catch {}
                }
            }
            session.pendingRequests.clear();

            this.activeSessions.delete(sessionId);
            this.database.peer.deletePeerSession(sessionId);
            console.log(`🔌 [PeerService] Session ${sessionId} unregistered`);
        }
    }

    handleManifest(sessionId: string, manifests: PeerTrackManifest[]) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        const peerTracks: Omit<PeerTrack, 'session_id' | 'created_at'>[] = manifests.map(m => ({
            id: m.id,
            title: m.title,
            artist: m.artist || null,
            album: m.album || null,
            duration: m.duration || null,
            file_size: m.fileSizeBytes || null,
            mime_type: m.mimeType || null,
            allow_download: m.allowDownload !== false
        }));

        this.database.peer.replacePeerTracks(sessionId, peerTracks);
        console.log(`🔌 [PeerService] Session ${sessionId} uploaded manifest with ${manifests.length} tracks`);

        // Phase 10: AP Presence
        if (this.apService) {
            try {
                const row = this.database.db.prepare("SELECT artist_id FROM admin WHERE id = ?").get(session.userId) as { artist_id: number | null } | undefined;
                const artistId = row?.artist_id;
                if (artistId) {
                    this.apService.broadcastBoardMessage(
                        artistId,
                        `Operator is now online sharing ${manifests.length} tracks on TuneCamp!`
                    ).catch((err: any) => console.error("Failed to broadcast AP presence:", err));
                }
            } catch (err) {
                console.error("Failed to fetch artist for AP presence:", err);
            }
        }
    }

    async requestStream(sessionId: string, trackId: string, res: Response) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ error: "Peer session not found" });
        }

        const track = this.database.peer.getPeerTrack(sessionId, trackId);
        if (!track) {
            return res.status(404).json({ error: "Track not found" });
        }

        const requestId = crypto.randomUUID();
        session.pendingRequests.set(requestId, res);

        res.setHeader("Content-Type", track.mime_type || "audio/mpeg");
        if (track.file_size) {
            res.setHeader("Content-Length", track.file_size);
        }
        res.setHeader("Accept-Ranges", "none");

        res.on("close", () => {
            if (session.pendingRequests.has(requestId)) {
                session.pendingRequests.delete(requestId);
                // Optionally notify peer to cancel reading
                try {
                    if (session.ws.readyState === 1) {
                        session.ws.send(JSON.stringify({ type: "cancel_request", requestId }));
                    }
                } catch {}
            }
        });

        try {
            session.ws.send(JSON.stringify({
                type: "stream_request",
                requestId,
                trackId
            }));
        } catch (e) {
            console.error(`🔌 [PeerService] Failed to send stream request to session ${sessionId}:`, e);
            session.pendingRequests.delete(requestId);
            res.status(500).json({ error: "Failed to communicate with peer" });
        }
    }

    async requestDownload(sessionId: string, trackId: string, res: Response) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ error: "Peer session not found" });
        }

        const track = this.database.peer.getPeerTrack(sessionId, trackId);
        if (!track) {
            return res.status(404).json({ error: "Track not found" });
        }

        // Verify download is allowed
        const globalAllowDownloads = this.database.identity.getSetting("peerAllowDownloads") !== "false";
        if (!globalAllowDownloads || !session.allowDownloads || !track.allow_download) {
            return res.status(403).json({ error: "Downloads are disabled for this peer/track" });
        }

        const requestId = crypto.randomUUID();
        session.pendingRequests.set(requestId, res);

        res.setHeader("Content-Type", track.mime_type || "application/octet-stream");
        if (track.file_size) {
            res.setHeader("Content-Length", track.file_size);
        }
        // Force file download with Content-Disposition
        const safeFilename = `${track.artist || "Unknown Artist"} - ${track.title || "Track"}.${track.mime_type === "audio/flac" ? "flac" : "mp3"}`.replace(/[<>:"/\\|?*]/g, "_");
        res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);

        res.on("close", () => {
            if (session.pendingRequests.has(requestId)) {
                session.pendingRequests.delete(requestId);
                try {
                    if (session.ws.readyState === 1) {
                        session.ws.send(JSON.stringify({ type: "cancel_request", requestId }));
                    }
                } catch {}
            }
        });

        try {
            session.ws.send(JSON.stringify({
                type: "download_request",
                requestId,
                trackId
            }));
        } catch (e) {
            console.error(`🔌 [PeerService] Failed to send download request to session ${sessionId}:`, e);
            session.pendingRequests.delete(requestId);
            res.status(500).json({ error: "Failed to communicate with peer" });
        }
    }

    handleChunk(sessionId: string, requestId: string, seq: number, base64Data: string) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        const res = session.pendingRequests.get(requestId);
        if (!res) return;

        try {
            const buffer = Buffer.from(base64Data, "base64");
            res.write(buffer);
        } catch (e) {
            console.error(`🔌 [PeerService] Failed to write chunk for request ${requestId}:`, e);
            this.handleChunkError(sessionId, requestId, "Failed to write buffer");
        }
    }

    handleChunkEnd(sessionId: string, requestId: string) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        const res = session.pendingRequests.get(requestId);
        if (!res) return;

        try {
            res.end();
        } catch {}
        session.pendingRequests.delete(requestId);
        console.log(`🔌 [PeerService] Request ${requestId} streaming finished successfully`);
    }

    handleChunkError(sessionId: string, requestId: string, message: string) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        const res = session.pendingRequests.get(requestId);
        if (!res) return;

        console.error(`🔌 [PeerService] Chunk error from peer for request ${requestId}: ${message}`);
        try {
            if (!res.headersSent) {
                res.status(500).json({ error: `Peer read error: ${message}` });
            } else {
                res.end();
            }
        } catch {}
        session.pendingRequests.delete(requestId);
    }

    searchTracks(query: string): PeerTrack[] {
        return this.database.peer.searchPeerTracks(query);
    }

    getTracksBySession(sessionId: string): PeerTrack[] {
        return this.database.peer.getTracksByPeerSession(sessionId);
    }

    getSessions(): PeerSession[] {
        return this.database.peer.getActivePeerSessions();
    }
}
export function createPeerService(database: DatabaseService, apService?: ActivityPubService): PeerService {
    return new PeerService(database, apService);
}
