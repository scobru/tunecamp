import { WebSocketServer } from "ws";
import type * as http from "http";
import type { ServiceContainer } from "../../core/container.js";

export function createPeerWsHandler(server: http.Server, container: ServiceContainer) {
    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", async (request, socket, head) => {
        try {
            const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
            if (url.pathname === "/ws/peer") {
                const token = url.searchParams.get("token");
                if (!token) {
                    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                    socket.destroy();
                    return;
                }

                // Verify token using authService
                const payload = await container.authService.verifyToken(token);
                if (!payload) {
                    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                    socket.destroy();
                    return;
                }

                // Check can_peer permission in database
                const user = container.authService.getUserByUsername(payload.username);
                if (!user || !user.can_peer) {
                    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
                    socket.destroy();
                    return;
                }

                // Check if peer sharing is enabled globally
                const peerEnabled = container.identity.getSetting("peerEnabled") === "true";
                if (!peerEnabled) {
                    socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
                    socket.destroy();
                    return;
                }

                // Upgrade the connection to WebSocket
                wss.handleUpgrade(request, socket, head, (ws) => {
                    const allowDownloads = url.searchParams.get("allowDownloads") !== "false";
                    
                    // Retrieve IP Address from header or socket
                    const rawIp = request.headers["x-forwarded-for"] as string || request.socket.remoteAddress || null;
                    const ipAddress = rawIp ? rawIp.split(",")[0].trim() : null;
                    
                    // Register session
                    const sessionId = container.peerService.registerSession(ws, payload.userId, payload.username, ipAddress, allowDownloads);

                    // Send auth_ok
                    ws.send(JSON.stringify({ type: "auth_ok", sessionId }));

                    // Handle messages
                    ws.on("message", (data, isBinary) => {
                        if (isBinary) {
                            return; // Binary frames are ignored in this control protocol
                        }
                        try {
                            const message = JSON.parse(data.toString());
                            switch (message.type) {
                                case "manifest":
                                    container.peerService.handleManifest(sessionId, message.tracks);
                                    break;
                                case "chunk":
                                    container.peerService.handleChunk(sessionId, message.requestId, message.seq, message.data);
                                    break;
                                case "chunk_end":
                                    container.peerService.handleChunkEnd(sessionId, message.requestId);
                                    break;
                                case "chunk_error":
                                    container.peerService.handleChunkError(sessionId, message.requestId, message.message);
                                    break;
                                case "pong":
                                    // Heartbeat pong received, session is active
                                    break;
                                default:
                                    console.warn(`[PeerWS] Unknown message type: ${message.type}`);
                            }
                        } catch (err) {
                            console.error(`[PeerWS] Failed to parse message for session ${sessionId}:`, err);
                        }
                    });

                    ws.on("close", () => {
                        container.peerService.unregisterSession(sessionId);
                    });

                    ws.on("error", (err) => {
                        console.error(`[PeerWS] WebSocket error in session ${sessionId}:`, err);
                        container.peerService.unregisterSession(sessionId);
                    });
                });
            }
        } catch (err) {
            console.error("[PeerWS] Upgrade failed:", err);
            try {
                socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
                socket.destroy();
            } catch {}
        }
    });
}
