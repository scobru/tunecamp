import { WebSocketServer, type WebSocket } from "ws";
import crypto from "crypto";
import type * as http from "http";
import type { ServiceContainer } from "../../core/container.js";
import { CHAT_PROTOCOL_VERSION } from "./chat.protocol.js";

// Browser transport for the chat lobby. Deliberately separate from /ws/peer:
//
//  - PeerService.registerSession() evicts any existing session for the same
//    userId, so a webapp tab sharing that socket would kick the user's Sidecamp
//    daemon offline, which reconnects, which kicks the tab — a loop.
//  - Chatting is not sharing your local folders. /ws/peer is gated by the
//    `can_peer` grant; this one only needs a valid session.
//
// Both register into the same ChatService, so daemons and browsers share one
// lobby. The wire protocol is identical, so clients can be written once.

// Proxies drop idle WebSockets (nginx defaults to 60s). Protocol-level pings
// keep the connection warm and detect half-open sockets; browsers answer them
// automatically, so no client code is involved.
const HEARTBEAT_MS = 30_000;

export function createChatWsHandler(
	server: http.Server,
	container: ServiceContainer,
) {
	const wss = new WebSocketServer({ noServer: true });
	const alive = new WeakMap<WebSocket, boolean>();

	const heartbeat = setInterval(() => {
		for (const ws of wss.clients) {
			if (alive.get(ws) === false) {
				ws.terminate();
				continue;
			}
			alive.set(ws, false);
			try {
				ws.ping();
			} catch {
				/* terminated below on the next sweep */
			}
		}
	}, HEARTBEAT_MS);
	heartbeat.unref?.();
	wss.on("close", () => clearInterval(heartbeat));

	server.on("upgrade", async (request, socket, head) => {
		try {
			const url = new URL(
				request.url || "",
				`http://${request.headers.host || "localhost"}`,
			);
			if (url.pathname !== "/ws/chat") return;

			// In single-artist mode the chat subsystem is entirely disabled.
			if (container.identity.getSetting("mode") === "single_artist") {
				socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
				socket.destroy();
				return;
			}

			if (container.identity.getSetting("peerChatEnabled") !== "true") {
				socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
				socket.destroy();
				return;
			}

			const token = url.searchParams.get("token");
			let username: string;
			let isAdmin = false;
			let payload: {
				userId?: number | string;
				username: string;
				role?: string;
				isRootAdmin?: boolean;
			} | null = null;

			if (!token) {
				if (container.identity.getSetting("peerChatGuestEnabled") !== "true") {
					socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
					socket.destroy();
					return;
				}
				const rawGuest = (url.searchParams.get("guestName") || "")
					.trim()
					.substring(0, 20);
				const safeGuest =
					rawGuest.replace(/[^a-zA-Z0-9_-]/g, "") ||
					crypto.randomBytes(3).toString("hex");
				username = `(Guest) ${safeGuest}`;
			} else {
				payload = await container.authService.verifyToken(token);
				if (!payload) {
					socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
					socket.destroy();
					return;
				}
				username = payload.username;
				const roleStr = String(payload.role || "");
				isAdmin =
					roleStr === "admin" ||
					roleStr === "root_admin" ||
					roleStr === "super_user" ||
					roleStr === "manager" ||
					!!payload.isRootAdmin;
			}

			if (container.chatService.isBanned(username)) {
				socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
				socket.destroy();
				return;
			}

			const localInstanceName = String(
				request.headers.host || "localhost",
			).split(":")[0];

			wss.handleUpgrade(request, socket, head, (ws) => {
				const clientId = crypto.randomUUID();
				alive.set(ws, true);
				ws.on("pong", () => alive.set(ws, true));

				const assignedUsername = container.chatService.register(
					clientId,
					username,
					ws,
					isAdmin,
					payload?.userId,
				);
				ws.send(
					JSON.stringify({
						type: "auth_ok",
						protocol: CHAT_PROTOCOL_VERSION,
						sessionId: clientId,
						username: assignedUsername,
						isAdmin,
					}),
				);

				ws.on("message", (data, isBinary) => {
					if (isBinary) return;
					try {
						const message = JSON.parse(data.toString());
						switch (message.type) {
							case "chat": {
								const to = String(message.to || "");
								const federation = container.chatFederationService;
								if (to.includes("@")) {
									const [toUsername, toInstance] = to.split("@");
									const peerOrigin =
										toInstance &&
										container.federatedDiscoveryService.resolvePeerByInstance(
											toInstance,
										);
									if (federation && peerOrigin) {
										federation.fanout(
											{
												username: username,
												instance: localInstanceName,
												text: message.text,
												ts: Date.now(),
												lobby: false,
												toUsername: toUsername,
											},
											peerOrigin,
										);
									}
								} else {
									container.chatService.relayChat(
										clientId,
										to,
										message.text,
										message.ref,
									);
									if (!to && federation) {
										federation.setPeers(
											container.federatedDiscoveryService.getPeers(),
										);
										federation.fanout({
											username: username,
											instance: localInstanceName,
											text: message.text,
											ts: Date.now(),
											lobby: true,
										});
									}
								}
								break;
							}
							case "pubkey": {
								const roster = container.chatService.setPubkey(
									clientId,
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
									clientId,
									message.to || message.toSessionId,
									message.signal,
								);
								break;
							case "room_join": {
								const roomId = Number(message.roomId);
								if (roomId) container.chatService.joinRoom(clientId, roomId);
								break;
							}
							case "room_leave": {
								const roomId = Number(message.roomId);
								if (roomId) container.chatService.leaveRoom(clientId, roomId);
								break;
							}
							case "room_chat": {
								const roomId = Number(message.roomId);
								if (roomId && message.text) {
									container.chatService.relayRoomMessage(
										roomId,
										clientId,
										message.text,
										message.ref,
									);
									const federation = container.chatFederationService;
									const room = container.chatService.getRoom(roomId);
									// Private rooms stay local: membership is not federated
									// yet, so a peer could not enforce who may read them.
									if (federation && room && !room.is_private) {
										federation.setPeers(
											container.federatedDiscoveryService.getPeers(),
										);
										federation.fanout({
											username,
											instance: localInstanceName,
											text: message.text,
											ts: Date.now(),
											lobby: false,
											roomGlobalId: room.global_id,
											roomName: room.name,
										});
									}
								}
								break;
							}
							case "admin_action": {
								const { action, target, reason, duration, roomId } = message;
								const targetRoomId = roomId ? Number(roomId) : undefined;

								// Room-scoped moderation (kick/ban/unban from a specific room)
								if (targetRoomId && (action === "kick" || action === "ban" || action === "unban")) {
									const room = container.chatService.getRoom(targetRoomId);
									const isRoomOwner = Boolean(
										room?.created_by &&
											username &&
											room.created_by.toLowerCase() === username.toLowerCase(),
									);
									if (!isAdmin && !isRoomOwner) {
										ws.send(
											JSON.stringify({
												type: "system",
												roomId: targetRoomId,
												text: "Error: Room owner or admin permissions required.",
											}),
										);
										break;
									}

									if (action === "kick" && target) {
										container.chatService.kickUserFromRoom(username, target, targetRoomId, reason, isAdmin);
									} else if (action === "ban" && target) {
										container.chatService.banUserFromRoom(username, target, targetRoomId, reason, isAdmin);
									} else if (action === "unban" && target) {
										container.chatService.unbanUserFromRoom(username, target, targetRoomId, isAdmin);
									}
									break;
								}

								// Global instance moderation (requires instance admin)
								if (!isAdmin) {
									ws.send(
										JSON.stringify({
											type: "system",
											text: "Error: Admin permissions required for global moderation.",
										}),
									);
									break;
								}

								if ((action === "zkick" || action === "zenkick" || action === "kick") && target) {
									container.chatService.kickUser(username, target, reason);
								} else if ((action === "zban" || action === "zenban" || action === "ban") && target) {
									container.chatService.banUser(username, target, reason);
								} else if ((action === "zunban" || action === "zenunban" || action === "unban") && target) {
									container.chatService.unbanUser(username, target);
								} else if ((action === "zmute" || action === "zenmute" || action === "mute") && target) {
									container.chatService.muteUser(
										username,
										target,
										duration ? Number(duration) : 15,
										reason,
									);
								} else if ((action === "zunmute" || action === "zenunmute" || action === "unmute") && target) {
									container.chatService.unmuteUser(username, target);
								} else if (action === "clear") {
									container.chatService.clearLobbyHistory(username);
								}
								break;
							}
							case "auth":
								// Client sends this on ws.onopen out of habit; auth already
								// happened during the HTTP upgrade (token/guest check above).
								break;
							default:
								console.warn(`[ChatWS] Unknown message type: ${message.type}`);
						}
					} catch (err) {
						console.error(
							`[ChatWS] Failed to parse message for client ${clientId}:`,
							err,
						);
					}
				});

				ws.on("close", () => container.chatService.unregister(clientId));
				ws.on("error", (err) => {
					console.error(
						`[ChatWS] WebSocket error for client ${clientId}:`,
						err,
					);
					container.chatService.unregister(clientId);
				});
			});
		} catch (err) {
			console.error("[ChatWS] Upgrade failed:", err);
			try {
				socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
				socket.destroy();
			} catch {
				/* socket already gone */
			}
		}
	});
}
