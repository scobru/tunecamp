import { useState, useEffect, useCallback } from 'react';
import API from '../services/api';

export interface ChatMessage {
    id: number;
    username: string;
    role: string;
    message: string;
    source: 'webapp' | 'telegram';
    telegram_message_id: number | null;
    created_at: string;
    deleted?: boolean;
}

export function useChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch initial chat logs
    const loadHistory = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const history = await API.getChatHistory();
            setMessages(history);
        } catch (err: any) {
            console.error('Failed to load chat history:', err);
            setError(err.message || 'Failed to load chat history');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Set up SSE listener for live updates
    useEffect(() => {
        loadHistory();

        const streamUrl = API.getChatStreamUrl();
        const eventSource = new EventSource(streamUrl);

        eventSource.onmessage = (event) => {
            try {
                const newMsg = JSON.parse(event.data) as ChatMessage;
                if (newMsg.deleted) {
                    setMessages((prev) => prev.filter((m) => m.id !== newMsg.id));
                } else {
                    setMessages((prev) => {
                        // Prevent duplicate messages if any (e.g. from network or retry)
                        if (prev.some((m) => m.id === newMsg.id)) {
                            return prev;
                        }
                        return [...prev, newMsg];
                    });
                }
            } catch (err) {
                console.error('Failed to parse chat stream event:', err);
            }
        };

        eventSource.onerror = (err) => {
            console.error('Chat stream connection error:', err);
            // Don't show critical UI error since EventSource automatically reconnects,
            // but log it in case of troubleshooting.
        };

        return () => {
            eventSource.close();
        };
    }, [loadHistory]);

    // Send a message
    const sendMessage = useCallback(async (messageText: string) => {
        try {
            await API.sendChatMessage(messageText);
            return true;
        } catch (err: any) {
            console.error('Failed to send message:', err);
            throw err;
        }
    }, []);

    // Delete a message
    const deleteMessage = useCallback(async (id: number) => {
        try {
            await API.deleteChatMessage(id);
            setMessages((prev) => prev.filter((m) => m.id !== id));
            return true;
        } catch (err: any) {
            console.error('Failed to delete message:', err);
            throw err;
        }
    }, []);

    return {
        messages,
        isLoading,
        error,
        sendMessage,
        deleteMessage,
        refresh: loadHistory
    };
}
