import express, { Router } from "express";
import { wrapAsync } from "../../middleware/error-handling.js";
import type { ServiceContainer } from "../../core/container.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";

export function createChatRoutes(container: ServiceContainer): Router {
	const router = Router();
	router.use(express.json());

	/**
	 * GET /api/chat/history
	 * Lobby backlog for a client that just connected. Direct messages are never
	 * stored (the server only ever holds their ciphertext), so this is lobby-only.
	 */
	router.get(
		"/history",
		wrapAsync(async (req: any, res: any) => {
			const limit = Math.min(parseInt(req.query.limit) || 100, 500);
			res.json({ messages: container.chatService.getHistory(limit) });
		}),
	);

	router.get(
		"/peers",
		wrapAsync(async (_req: any, res: any) => {
			const clients = container.chatService.getClients();
			res.json({ clients });
		}),
	);

	// --- Contacts & Blocks ---

	router.get(
		"/contacts",
		wrapAsync(async (req: AuthenticatedRequest, res: any) => {
			if (!req.username) {
				return res.status(401).json({ error: "Authentication required" });
			}
			const contactsData = container.chatService.getContactsAndRequests(req.username);
			res.json(contactsData);
		}),
	);

	router.post(
		"/contacts/request",
		wrapAsync(async (req: AuthenticatedRequest, res: any) => {
			if (!req.username) {
				return res.status(401).json({ error: "Authentication required" });
			}
			const { to } = req.body || {};
			if (!to) return res.status(400).json({ error: "Target username required" });
			
			const ok = container.chatService.sendContactRequest(req.username, to);
			if (!ok) return res.status(500).json({ error: "Failed to send request" });
			res.json({ ok: true });
		}),
	);

	router.post(
		"/contacts/accept",
		wrapAsync(async (req: AuthenticatedRequest, res: any) => {
			if (!req.username) {
				return res.status(401).json({ error: "Authentication required" });
			}
			const { from } = req.body || {};
			if (!from) return res.status(400).json({ error: "Sender username required" });
			
			const ok = container.chatService.acceptContactRequest(req.username, from);
			if (!ok) return res.status(404).json({ error: "Request not found" });
			res.json({ ok: true });
		}),
	);

	router.post(
		"/contacts/reject",
		wrapAsync(async (req: AuthenticatedRequest, res: any) => {
			if (!req.username) {
				return res.status(401).json({ error: "Authentication required" });
			}
			const { from } = req.body || {};
			if (!from) return res.status(400).json({ error: "Sender username required" });
			
			const ok = container.chatService.rejectContactRequest(req.username, from);
			if (!ok) return res.status(404).json({ error: "Request not found" });
			res.json({ ok: true });
		}),
	);

	router.get(
		"/blocks",
		wrapAsync(async (req: AuthenticatedRequest, res: any) => {
			if (!req.username) {
				return res.status(401).json({ error: "Authentication required" });
			}
			const blocks = container.chatService.getBlocklist(req.username);
			res.json({ blocks });
		}),
	);

	router.post(
		"/blocks",
		wrapAsync(async (req: AuthenticatedRequest, res: any) => {
			if (!req.username) {
				return res.status(401).json({ error: "Authentication required" });
			}
			const { username } = req.body || {};
			if (!username) return res.status(400).json({ error: "Username to block required" });
			
			const ok = container.chatService.blockUser(req.username, username);
			if (!ok) return res.status(500).json({ error: "Failed to block user" });
			res.json({ ok: true });
		}),
	);

	router.post(
		"/blocks/remove",
		wrapAsync(async (req: AuthenticatedRequest, res: any) => {
			if (!req.username) {
				return res.status(401).json({ error: "Authentication required" });
			}
			const { username } = req.body || {};
			if (!username) return res.status(400).json({ error: "Username to unblock required" });
			
			const ok = container.chatService.unblockUser(req.username, username);
			if (!ok) return res.status(500).json({ error: "Failed to unblock user" });
			res.json({ ok: true });
		}),
	);

	/**
	 * GET /api/chat/pubkey/:username
	 *
	 * Answers with the account's Zen identity key (`admin.zen_pub`) whenever it
	 * has one. That key is the same on every instance and the user can check it
	 * against their FID portal, so it is an identity claim a lying server can be
	 * caught making — unlike the live session key below, which is whatever the
	 * socket announced and is trust-on-first-use.
	 *
	 * `source` tells the caller which one it got:
	 *   - `identity` — from the account's Zen identity, works while offline.
	 *   - `session`  — legacy fallback for accounts with no Zen identity yet.
	 *     Unauthenticated: treat the DM as opportunistically encrypted only.
	 */
	router.get(
		"/pubkey/:username",
		wrapAsync(async (req: any, res: any) => {
			const username = String(req.params.username || "");
			const instance = String(req.query.instance || "");

			const identityPub = container.chatService.getIdentityPubkey(username);
			if (identityPub) {
				return res.json({ username, pubkey: identityPub, source: "identity" });
			}

			const local = container.chatService.getPubkey(username);
			if (local) {
				return res.json({ username, pubkey: local, source: "session" });
			}

			if (!instance) {
				return res.status(404).json({ error: "Pubkey not found" });
			}

			const peerOrigin =
				container.federatedDiscoveryService.resolvePeerByInstance(instance);
			if (!peerOrigin) {
				return res.status(404).json({ error: "Instance not found" });
			}

			try {
				const remoteRes = await fetch(
					`${peerOrigin}/api/chat/pubkey/${encodeURIComponent(username)}`,
				);
				if (!remoteRes.ok) {
					return res.status(404).json({ error: "Remote pubkey not found" });
				}
				const data = await remoteRes.json();
				return res.json(data);
			} catch {
				return res.status(502).json({ error: "Failed to fetch remote pubkey" });
			}
		}),
	);

	/**
	 * Rooms
	 *
	 * `/api/chat` is mounted behind `authMiddleware.requireUser`, so the actor is
	 * always `req.username`. Never take it from the query string: that would let
	 * any member act as any other.
	 */
	router.post(
		"/rooms",
		wrapAsync(async (req: AuthenticatedRequest, res: any) => {
			const { name, description, is_private } = req.body || {};
			const username = req.username;
			if (!username) {
				return res.status(401).json({ error: "Authentication required" });
			}
			if (!name || !name.trim()) {
				return res.status(400).json({ error: "Room name is required" });
			}
			const room = container.chatService.createRoom(
				name,
				description,
				!!is_private,
				username,
			);
			res.status(201).json(room);
		}),
	);

	router.delete(
		"/rooms/:id",
		wrapAsync(async (req: AuthenticatedRequest, res: any) => {
			const roomId = parseInt(req.params.id);
			const username = req.username;
			if (!username) {
				return res.status(401).json({ error: "Authentication required" });
			}
			if (!roomId) {
				return res.status(400).json({ error: "Room id required" });
			}
			const isAdmin = Boolean(
				req.isAdmin ||
					req.isRootAdmin ||
					req.role === "admin" ||
					req.role === "root_admin",
			);
			const ok = container.chatService.deleteRoom(roomId, username, isAdmin);
			if (!ok) return res.status(404).json({ error: "Room not found or unauthorized" });
			res.json({ ok: true });
		}),
	);

	router.post(
		"/rooms/:id/join",
		wrapAsync(async (req: AuthenticatedRequest, res: any) => {
			const roomId = parseInt(req.params.id);
			const username = req.username;
			if (!username) {
				return res.status(401).json({ error: "Authentication required" });
			}
			if (!roomId) {
				return res.status(400).json({ error: "Room id required" });
			}
			const ok = container.chatService.joinRoomByUser(username, roomId);
			if (!ok) return res.status(404).json({ error: "Room not found" });
			res.json({ ok: true });
		}),
	);

	router.post(
		"/rooms/:id/leave",
		wrapAsync(async (req: AuthenticatedRequest, res: any) => {
			const roomId = parseInt(req.params.id);
			const username = req.username;
			if (!username) {
				return res.status(401).json({ error: "Authentication required" });
			}
			if (!roomId) {
				return res.status(400).json({ error: "Room id required" });
			}
			// leaveRoom() takes a socket id; over REST there is no socket.
			container.chatService.leaveRoomByUser(username, roomId);
			res.json({ ok: true });
		}),
	);

	router.get(
		"/rooms",
		wrapAsync(async (_req: any, res: any) => {
			res.json({ rooms: container.chatService.listRooms() });
		}),
	);

	router.get(
		"/rooms/:id/messages",
		wrapAsync(async (req: any, res: any) => {
			const roomId = parseInt(req.params.id);
			const limit = Math.min(parseInt(req.query.limit) || 100, 500);
			if (!roomId) return res.status(400).json({ error: "room id required" });
			res.json({
				messages: container.chatService.getRoomHistory(roomId, limit),
			});
		}),
	);

	router.get(
		"/rooms/:id/members",
		wrapAsync(async (req: any, res: any) => {
			const roomId = parseInt(req.params.id);
			if (!roomId) return res.status(400).json({ error: "room id required" });
			res.json({ members: container.chatService.getMembers(roomId) });
		}),
	);

	return router;
}
