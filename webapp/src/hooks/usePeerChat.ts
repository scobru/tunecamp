import { useState, useEffect, useRef, useCallback } from 'react';
import API from '../services/api';
import { generateKeyPair, encryptFor, decryptFrom, type KeyPair } from '../services/e2eCrypto';

export interface ChatMessage {
    from: string;
    text: string;
    ts: number;
    self?: boolean;
    lobby?: boolean;
    e2e?: boolean;
}

export type ChatStatus = 'offline' | 'connecting' | 'online';

// Matches Sidecamp: the chat identity is per-session, not per-account. It buys
// forward secrecy across reloads at the cost of not being able to read direct
// messages sent while you were away — which is the right trade for a lobby.
const MAX_MESSAGES = 200;
const RECONNECT_MS = 5000;

export function usePeerChat(enabled: boolean) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [status, setStatus] = useState<ChatStatus>('offline');
    const [username, setUsername] = useState<string>('');

    const wsRef = useRef<WebSocket | null>(null);
    const keyPairRef = useRef<KeyPair | null>(null);
    const peerKeysRef = useRef<Map<string, string>>(new Map());
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Survives reconnects: the effect must not tear down a socket it just opened.
    const closedByUsRef = useRef(false);

    const append = useCallback((msg: ChatMessage) => {
        setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES));
    }, []);

    useEffect(() => {
        if (!enabled) return;

        closedByUsRef.current = false;
        keyPairRef.current = generateKeyPair();

        API.getChatHistory()
            .then(({ messages: history }) => {
                setMessages(history.map((m) => ({ from: m.username, text: m.message, ts: m.created_at, lobby: true })));
            })
            .catch((err) => {
                // Guests have no backlog (the endpoint requires a session); the
                // live stream still works, so this is not worth surfacing.
                console.debug('No chat history available:', err?.message);
            });

        const connect = () => {
            if (closedByUsRef.current) return;
            setStatus('connecting');
            const ws = new WebSocket(API.getChatWsUrl());
            wsRef.current = ws;

            ws.onmessage = (event) => {
                let msg: any;
                try {
                    msg = JSON.parse(event.data);
                } catch {
                    return;
                }

                if (msg.type === 'auth_ok') {
                    setStatus('online');
                    setUsername(msg.username ?? '');
                    ws.send(JSON.stringify({ type: 'pubkey', pubkey: keyPairRef.current!.publicKey }));
                } else if (msg.type === 'pubkey') {
                    peerKeysRef.current.set(msg.from, msg.pubkey);
                } else if (msg.type === 'chat') {
                    if (msg.lobby) {
                        append({ from: msg.from, text: msg.text, ts: msg.ts, lobby: true });
                    } else {
                        const senderKey = peerKeysRef.current.get(msg.from);
                        const plain = senderKey
                            ? decryptFrom(msg.text, senderKey, keyPairRef.current!.secretKey)
                            : null;
                        append({
                            from: msg.from,
                            text: plain ?? '[Encrypted message — key exchange pending]',
                            ts: msg.ts,
                            e2e: true,
                        });
                    }
                }
            };

            ws.onclose = () => {
                setStatus('offline');
                peerKeysRef.current.clear();
                if (!closedByUsRef.current) {
                    reconnectRef.current = setTimeout(connect, RECONNECT_MS);
                }
            };

            // 'error' is always followed by 'close', which owns the retry.
            ws.onerror = () => ws.close();
        };

        connect();

        return () => {
            closedByUsRef.current = true;
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            wsRef.current?.close();
            wsRef.current = null;
            setStatus('offline');
        };
    }, [enabled, append]);

    /**
     * Send to the lobby (empty `to`) or a direct message to one peer.
     * Direct messages are encrypted for the recipient when their key is known.
     */
    const sendMessage = useCallback((to: string, text: string): boolean => {
        const ws = wsRef.current;
        const keyPair = keyPairRef.current;
        if (ws?.readyState !== WebSocket.OPEN || !keyPair || !text.trim()) return false;

        let payload = text;
        let e2e = false;
        if (to) {
            const pubkey = peerKeysRef.current.get(to);
            if (pubkey) {
                payload = encryptFor(text, pubkey, keyPair.secretKey);
                e2e = true;
            }
            // No key yet: the peer has not announced one (older client, or the
            // exchange is still in flight). Sidecamp sends plaintext here too.
        }
        ws.send(JSON.stringify({ type: 'chat', to, text: payload }));
        append({ from: to ? `→ ${to}` : '→ Lobby', text, ts: Date.now(), self: true, lobby: !to, e2e });
        return true;
    }, [append]);

    return { messages, status, username, sendMessage };
}
