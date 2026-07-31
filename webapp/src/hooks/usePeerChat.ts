import { useState, useEffect, useRef, useCallback } from "react";
import API from "../services/api";
import { chatApi } from "../services/api/chat";
import {
	generateKeyPair,
	encryptFor,
	decryptFrom,
	type KeyPair,
} from "../services/e2eCrypto";
import type { PeerInfo } from "../services/api/chat";

export interface ChatMessage {
	from: string;
	text: string;
	ts: number;
	self?: boolean;
	lobby?: boolean;
	e2e?: boolean;
	to?: string;
	system?: boolean;
}

export type ChatStatus = "offline" | "connecting" | "online";

const MAX_MESSAGES = 200;
const RECONNECT_MS = 5000;

// Sidecamp-style: show connected peers in the lobby.
export function usePeerChat(enabled: boolean, activePeer: string) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [status, setStatus] = useState<ChatStatus>("offline");
	const [username, setUsername] = useState<string>("");
	const [isAdmin, setIsAdmin] = useState<boolean>(false);
	const [peers, setPeers] = useState<PeerInfo[]>([]);

	const wsRef = useRef<WebSocket | null>(null);
	const keyPairRef = useRef<KeyPair | null>(null);
	const peerKeysRef = useRef<Map<string, string>>(new Map());
	const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const closedByUsRef = useRef(false);

	const append = useCallback((msg: ChatMessage) => {
		setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES));
	}, []);

	const refreshPeers = useCallback(async () => {
		try {
			const { clients } = await chatApi.getPeers();
			setPeers(clients);
		} catch {
			// Non-blocking: the lobby still works without a peer list.
		}
	}, []);

	const sendAdminAction = useCallback(
		(action: string, target?: string, reason?: string, duration?: number) => {
			const ws = wsRef.current;
			if (ws?.readyState === WebSocket.OPEN) {
				ws.send(
					JSON.stringify({
						type: "admin_action",
						action,
						target,
						reason,
						duration,
					}),
				);
			}
		},
		[],
	);

	useEffect(() => {
		if (!enabled) return;

		closedByUsRef.current = false;
		keyPairRef.current = generateKeyPair();

		API.getChatHistory()
			.then(({ messages: history }) => {
				setMessages(
					history.map((m) => ({
						from: m.username,
						text: m.message,
						ts: m.created_at,
						lobby: true,
					})),
				);
			})
			.catch(() => {
				console.debug("No chat history available");
			});

		const connect = () => {
			if (closedByUsRef.current) return;
			setStatus("connecting");
			const ws = new WebSocket(API.getChatWsUrl());
			wsRef.current = ws;

			ws.onmessage = (event) => {
				let msg: any;
				try {
					msg = JSON.parse(event.data);
				} catch {
					return;
				}

				if (msg.type === "auth_ok") {
					setStatus("online");
					setUsername(msg.username ?? "");
					setIsAdmin(!!msg.isAdmin);
					ws.send(
						JSON.stringify({
							type: "pubkey",
							pubkey: keyPairRef.current!.publicKey,
						}),
					);
				} else if (msg.type === "pubkey") {
					peerKeysRef.current.set(msg.from, msg.pubkey);
					setPeers((prev) => {
						if (prev.some((p) => p.username === msg.from)) return prev;
						return [...prev, { username: msg.from, pubkey: true }];
					});
				} else if (msg.type === "system") {
					append({
						from: "System",
						text: msg.text,
						ts: msg.ts || Date.now(),
						lobby: true,
						system: true,
					});
				} else if (msg.type === "clear_history") {
					setMessages([]);
				} else if (msg.type === "kicked") {
					append({
						from: "System",
						text: `You were kicked from chat: ${msg.reason || "Kicked by admin"}`,
						ts: Date.now(),
						lobby: true,
						system: true,
					});
				} else if (msg.type === "chat") {
					if (msg.lobby) {
						append({ from: msg.from, text: msg.text, ts: msg.ts, lobby: true });
					} else {
						const senderKey = peerKeysRef.current.get(msg.from);
						const plain = senderKey
							? decryptFrom(msg.text, senderKey, keyPairRef.current!.secretKey)
							: null;
						append({
							from: msg.from,
							text: plain ?? "[Encrypted message — key exchange pending]",
							ts: msg.ts,
							e2e: true,
							to: msg.from,
						});
					}
				}
			};

			ws.onclose = () => {
				setStatus("offline");
				peerKeysRef.current.clear();
				setPeers([]);
				if (!closedByUsRef.current) {
					reconnectRef.current = setTimeout(connect, RECONNECT_MS);
				}
			};

			ws.onerror = () => ws.close();
		};

		connect();

		return () => {
			closedByUsRef.current = true;
			if (reconnectRef.current) clearTimeout(reconnectRef.current);
			wsRef.current?.close();
			wsRef.current = null;
			setStatus("offline");
			setPeers([]);
		};
	}, [enabled, append]);

	useEffect(() => {
		if (!enabled) return;
		const id = setInterval(refreshPeers, 5000);
		const timeoutId = setTimeout(() => refreshPeers(), 0);
		return () => {
			clearInterval(id);
			clearTimeout(timeoutId);
		};
	}, [enabled, refreshPeers]);

	const sendMessage = useCallback(
		(to: string, text: string): boolean => {
			const ws = wsRef.current;
			const keyPair = keyPairRef.current;
			const cleanText = text.trim();
			if (ws?.readyState !== WebSocket.OPEN || !keyPair || !cleanText)
				return false;

			// IRC Slash Commands handling for admins and general commands (/help)
			if (cleanText.startsWith("/")) {
				const parts = cleanText.slice(1).split(/\s+/);
				const cmd = parts[0]?.toLowerCase();
				const target = parts[1];
				const extra = parts.slice(2).join(" ");

				if (cmd === "help") {
					append({
						from: "System",
						text: "Available commands: /kick <user> [reason], /ban <user> [reason], /unban <user>, /mute <user> [minutes], /unmute <user>, /clear, /help",
						ts: Date.now(),
						lobby: true,
						system: true,
					});
					return true;
				}

				if (["kick", "ban", "unban", "mute", "unmute", "clear"].includes(cmd)) {
					if (!isAdmin) {
						append({
							from: "System",
							text: "Error: Moderation commands are restricted to instance admins.",
							ts: Date.now(),
							lobby: true,
							system: true,
						});
						return true;
					}

					if (cmd === "clear") {
						sendAdminAction("clear");
					} else if (!target) {
						append({
							from: "System",
							text: `Usage: /${cmd} <username> [reason/minutes]`,
							ts: Date.now(),
							lobby: true,
							system: true,
						});
					} else if (cmd === "kick") {
						sendAdminAction("kick", target, extra || undefined);
					} else if (cmd === "ban") {
						sendAdminAction("ban", target, extra || undefined);
					} else if (cmd === "unban") {
						sendAdminAction("unban", target);
					} else if (cmd === "mute") {
						const minutes = parseInt(parts[2], 10) || 15;
						const reason = parts.slice(3).join(" ") || undefined;
						sendAdminAction("mute", target, reason, minutes);
					} else if (cmd === "unmute") {
						sendAdminAction("unmute", target);
					}
					return true;
				}
			}

			let payload = cleanText;
			let e2e = false;
			if (to) {
				const pubkey = peerKeysRef.current.get(to);
				if (pubkey) {
					payload = encryptFor(cleanText, pubkey, keyPair.secretKey);
					e2e = true;
				}
			}
			ws.send(JSON.stringify({ type: "chat", to, text: payload }));
			append({
				from: to ? `→ ${to}` : "→ Lobby",
				text: cleanText,
				ts: Date.now(),
				self: true,
				lobby: !to,
				e2e,
				to,
			});
			return true;
		},
		[append, isAdmin, sendAdminAction],
	);

	const visibleMessages = activePeer
		? messages.filter(
				(m) =>
					m.lobby !== true &&
					(m.from === activePeer || (m.self && m.to === activePeer)),
			)
		: messages.filter((m) => m.lobby !== false);

	return {
		messages: visibleMessages,
		status,
		username,
		isAdmin,
		peers,
		sendMessage,
		sendAdminAction,
	};
}
