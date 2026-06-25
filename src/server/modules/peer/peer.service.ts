import type { WebSocket } from "ws";
import type { Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
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

interface PendingImport {
    sessionId: string;
    stream: fs.WriteStream;
    filePath: string;
    resolve: (filePath: string) => void;
    reject: (err: Error) => void;
    timeout: NodeJS.Timeout;
    settled: boolean;
}

export class PeerService {
    private activeSessions = new Map<string, ActivePeerSession>();
    // Server-initiated imports: chunks are written to disk instead of an HTTP response.
    private pendingImports = new Map<string, PendingImport>();
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

            // Abort any in-flight imports tied to this session.
            for (const [requestId, pending] of this.pendingImports.entries()) {
                if (pending.sessionId === sessionId) {
                    this.failImport(requestId, "Peer disconnected");
                }
            }

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

    /**
     * Pulls a peer track over the tunnel and writes it to `destDir` on disk,
     * resolving with the saved file path. Unlike requestStream/requestDownload
     * (which pipe bytes straight to an HTTP response), this buffers the file
     * server-side so it can be indexed into the local library. Used by the
     * manager/root-admin "import" action.
     */
    async requestImport(sessionId: string, trackId: string, destDir: string): Promise<{ filePath: string; track: PeerTrack }> {
        const session = this.activeSessions.get(sessionId);
        if (!session) throw new Error("Peer session not found");

        const track = this.database.peer.getPeerTrack(sessionId, trackId);
        if (!track) throw new Error("Track not found");

        // Import requires the same permission as a download (it pulls the full file).
        const globalAllowDownloads = this.database.identity.getSetting("peerAllowDownloads") !== "false";
        if (!globalAllowDownloads || !session.allowDownloads || !track.allow_download) {
            throw new Error("Downloads are disabled for this peer/track");
        }

        await fs.promises.mkdir(destDir, { recursive: true });
        const ext = track.mime_type === "audio/flac" ? "flac"
            : track.mime_type === "audio/wav" ? "wav"
            : track.mime_type === "audio/ogg" ? "ogg"
            : "mp3";
        const base = `${track.artist || "Unknown Artist"} - ${track.title || "Track"}`.replace(/[<>:"/\\|?*]/g, "_");
        const filePath = path.join(destDir, `${base}-${String(track.id).slice(0, 8)}.${ext}`);

        const requestId = crypto.randomUUID();

        const savedPath = await new Promise<string>((resolve, reject) => {
            const stream = fs.createWriteStream(filePath);
            const pending: PendingImport = {
                sessionId,
                stream,
                filePath,
                resolve,
                reject,
                settled: false,
                timeout: setTimeout(() => this.failImport(requestId, "Import timed out"), 5 * 60 * 1000)
            };
            this.pendingImports.set(requestId, pending);

            stream.on("error", () => this.failImport(requestId, "Failed to write file to disk"));

            try {
                session.ws.send(JSON.stringify({ type: "download_request", requestId, trackId }));
            } catch (e) {
                this.failImport(requestId, "Failed to communicate with peer");
            }
        });

        return { filePath: savedPath, track };
    }

    private failImport(requestId: string, message: string) {
        const pending = this.pendingImports.get(requestId);
        if (!pending) return;
        this.pendingImports.delete(requestId);
        clearTimeout(pending.timeout);
        try { pending.stream.destroy(); } catch {}
        fs.promises.unlink(pending.filePath).catch(() => {});
        if (!pending.settled) {
            pending.settled = true;
            pending.reject(new Error(message));
        }
    }

    handleChunk(sessionId: string, requestId: string, seq: number, base64Data: string) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        const importReq = this.pendingImports.get(requestId);
        if (importReq) {
            try {
                importReq.stream.write(Buffer.from(base64Data, "base64"));
            } catch (e) {
                this.failImport(requestId, "Failed to write buffer");
            }
            return;
        }

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

        const importReq = this.pendingImports.get(requestId);
        if (importReq) {
            this.pendingImports.delete(requestId);
            clearTimeout(importReq.timeout);
            importReq.stream.end(() => {
                if (!importReq.settled) {
                    importReq.settled = true;
                    importReq.resolve(importReq.filePath);
                }
            });
            console.log(`🔌 [PeerService] Import request ${requestId} finished successfully`);
            return;
        }

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

        if (this.pendingImports.has(requestId)) {
            console.error(`🔌 [PeerService] Import chunk error for request ${requestId}: ${message}`);
            this.failImport(requestId, message);
            return;
        }

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
