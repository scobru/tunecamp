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
}

export type ChatStatus = "offline" | "connecting" | "online";

const MAX_MESSAGES = 200;
const RECONNECT_MS = 5000;

// Sidecamp-style: show connected peers in the lobby.
export function usePeerChat(enabled: boolean) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [status, setStatus] = useState<ChatStatus>("offline");
	const [username, setUsername] = useState<string>("");
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
						});
					}
				}
			};

			ws.onclose = () => {
				setStatus("offline");
				peerKeysRef.current.clear();
				setPeers((prev) => prev.filter((p) => p.username !== username));
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
	}, [enabled, append, refreshPeers, username]);

	useEffect(() => {
		if (!enabled) return;
		const id = setInterval(refreshPeers, 5000);
		// Defer initial fetch so it's not a synchronous setState in effect body.
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
			if (ws?.readyState !== WebSocket.OPEN || !keyPair || !text.trim())
				return false;

			let payload = text;
			let e2e = false;
			if (to) {
				const pubkey = peerKeysRef.current.get(to);
				if (pubkey) {
					payload = encryptFor(text, pubkey, keyPair.secretKey);
					e2e = true;
				}
			}
			ws.send(JSON.stringify({ type: "chat", to, text: payload }));
			append({
				from: to ? `→ ${to}` : "→ Lobby",
				text,
				ts: Date.now(),
				self: true,
				lobby: !to,
				e2e,
			});
			return true;
		},
		[append],
	);

	return { messages, status, username, peers, sendMessage };
}
