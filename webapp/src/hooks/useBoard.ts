import { useState, useEffect, useCallback } from 'react';
import API from '../services/api';

export interface BoardMessage {
    id: number;
    username: string;
    role: string;
    message: string;
    source: 'webapp' | 'telegram';
    telegram_message_id: number | null;
    avatar: string | null;
    created_at: string;
    deleted?: boolean;
}

export function useBoard() {
    const [messages, setMessages] = useState<BoardMessage[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch initial board logs
    const loadHistory = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const history = await API.getBoardHistory();
            setMessages(history);
        } catch (err: any) {
            console.error('Failed to load board history:', err);
            setError(err.message || 'Failed to load board history');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Set up SSE listener for live updates
    useEffect(() => {
        loadHistory();

        const streamUrl = API.getBoardStreamUrl();
        const eventSource = new EventSource(streamUrl);

        eventSource.onmessage = (event) => {
            try {
                const newMsg = JSON.parse(event.data) as BoardMessage;
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
                console.error('Failed to parse board stream event:', err);
            }
        };

        eventSource.onerror = (err) => {
            console.error('Board stream connection error:', err);
            // Don't show critical UI error since EventSource automatically reconnects,
            // but log it in case of troubleshooting.
        };

        return () => {
            eventSource.close();
        };
    }, [loadHistory]);

    // Send a message
    const sendMessage = useCallback(async (messageText: string, trackMetadata?: { artist?: string; title?: string; album?: string; url?: string }) => {
        try {
            await API.sendBoardMessage(messageText, trackMetadata);
            return true;
        } catch (err: any) {
            console.error('Failed to send message:', err);
            throw err;
        }
    }, []);

    // Delete a message
    const deleteMessage = useCallback(async (id: number) => {
        try {
            await API.deleteBoardMessage(id);
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
    };
}
