import { WebSocketServer } from "ws";
import type * as http from "http";
import type { ServiceContainer } from "../../core/container.js";
import { type UserRole, VisibilityGuardian } from "../../common/visibility.js";

// Admins (Manager/Root Admin) can always connect a peer daemon; other users
// need the per-user can_peer grant. Root admin (id 1) has no other way in:
// the can-peer endpoint refuses to modify user 1.
export function canUsePeer(
	user: { can_peer: number; is_root: boolean; role: UserRole } | undefined,
): boolean {
	if (!user) return false;
	return (
		!!user.can_peer || user.is_root || VisibilityGuardian.isAdminRole(user.role)
	);
}

export function createPeerWsHandler(
	server: http.Server,
	container: ServiceContainer,
) {
	const wss = new WebSocketServer({ noServer: true });

	server.on("upgrade", async (request, socket, head) => {
		try {
			const url = new URL(
				request.url || "",
				`http://${request.headers.host || "localhost"}`,
			);
			if (url.pathname === "/ws/peer") {
				const peerEnabled =
					container.identity.getSetting("peerEnabled") === "true";
				if (!peerEnabled) {
					socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
					socket.destroy();
					return;
				}

				const token = url.searchParams.get("token");
				const guestNameParam = url.searchParams.get("guestName");
				let userId: number;
				let username: string;

				if (!token) {
					const peerGuestEnabled =
						container.identity.getSetting("peerGuestEnabled") === "true";
					if (!peerGuestEnabled) {
						socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
						socket.destroy();
						return;
					}
					const rawGuest = guestNameParam
						? guestNameParam.trim().substring(0, 20)
						: "";
					const safeGuest =
						rawGuest.replace(/[^a-zA-Z0-9_-]/g, "") ||
						require("crypto").randomBytes(3).toString("hex");
					username = `(Guest) ${safeGuest}`;
					// Virtual guest userId. Use negative numbers or a large offset.
					userId = -Math.floor(Math.random() * 1000000);
				} else {
					// Verify token using authService
					const payload = await container.authService.verifyToken(token);
					if (!payload) {
						socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
						socket.destroy();
						return;
					}

					// Check peer permission (admins implicitly allowed)
					const user = container.authService.getUserByUsername(
						payload.username,
					);
					if (!canUsePeer(user)) {
						socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
						socket.destroy();
						return;
					}
					userId = payload.userId;
					username = payload.username;
				}

				// Upgrade the connection to WebSocket
				wss.handleUpgrade(request, socket, head, (ws) => {
					const allowDownloads =
						url.searchParams.get("allowDownloads") !== "false";

					// Retrieve IP Address from header or socket
					const rawIp =
						(request.headers["x-forwarded-for"] as string) ||
						request.socket.remoteAddress ||
						null;
					const ipAddress = rawIp ? rawIp.split(",")[0].trim() : null;

					// Register session
					const sessionId = container.peerService.registerSession(
						ws,
						userId,
						username,
						ipAddress,
						allowDownloads,
					);

					// Join the shared chat registry so daemons and browser
					// clients (/ws/chat) share one lobby.
					container.chatService.register(
						sessionId,
						username,
						ws,
						false,
						userId,
					);

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
									container.peerService.handleManifest(
										sessionId,
										message.tracks,
									);
									break;
								case "chunk":
									container.peerService.handleChunk(
										sessionId,
										message.requestId,
										message.seq,
										message.data,
									);
									break;
								case "chunk_end":
									container.peerService.handleChunkEnd(
										sessionId,
										message.requestId,
									);
									break;
								case "chunk_error":
									container.peerService.handleChunkError(
										sessionId,
										message.requestId,
										message.message,
									);
									break;
								case "pong":
									container.peerService.handlePong(sessionId);
									break;
								case "chat":
									container.chatService.relayChat(
										sessionId,
										message.to,
										message.text,
									);
									break;
								case "pubkey": {
									const roster = container.chatService.setPubkey(
										sessionId,
										message.pubkey,
									);
									for (const r of roster) {
										ws.send(
											JSON.stringify({
												type: "pubkey",
												from: r.username,
												pubkey: r.pubkey,
											}),
										);
									}
									break;
								}
								case "rtc_signal":
									container.chatService.relayRtcSignal(
										sessionId,
										message.to || message.toSessionId,
										message.signal,
									);
									break;
								default:
									console.warn(
										`[PeerWS] Unknown message type: ${message.type}`,
									);
							}
						} catch (err) {
							console.error(
								`[PeerWS] Failed to parse message for session ${sessionId}:`,
								err,
							);
						}
					});

					ws.on("close", () => {
						container.chatService.unregister(sessionId);
						container.peerService.unregisterSession(sessionId);
					});

					ws.on("error", (err) => {
						console.error(
							`[PeerWS] WebSocket error in session ${sessionId}:`,
							err,
						);
						container.chatService.unregister(sessionId);
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
