import { api, handleResponse } from './client';

export interface LobbyMessage {
    username: string;
    message: string;
    created_at: number;
}

export const chatApi = {
    getChatHistory: (limit?: number) =>
        handleResponse<{ messages: LobbyMessage[] }>(api.get(`chat/history${limit ? `?limit=${limit}` : ''}`)),

    /**
     * The peer chat socket. The token rides in the query string because the
     * browser WebSocket API cannot set an Authorization header; the server
     * accepts anonymous connections only when guest chat is enabled.
     */
    getChatWsUrl: () => {
        const token = localStorage.getItem('tunecamp_token');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const base = `${protocol}//${window.location.host}/ws/chat`;
        return token ? `${base}?token=${encodeURIComponent(token)}` : base;
    },
};
