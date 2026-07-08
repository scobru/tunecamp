
const DEEZER_API_BASE = 'https://api.deezer.com';

class DeezerClient {
    private async request<T>(path: string): Promise<T> {
        const url = `${DEEZER_API_BASE}${path}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Deezer API error: ${res.status}`);
        return res.json() as Promise<T>;
    }

    async getPlaylist(id: string): Promise<any> {
        return this.request(`/playlist/${id}`);
    }

    async searchTracks(query: string, limit = 20): Promise<any> {
        return this.request(`/search/track?q=${encodeURIComponent(query)}&limit=${limit}`);
    }
}

export const deezerClient = new DeezerClient();

export const isDeezerPlaylistUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        return (
            (parsed.hostname === 'www.deezer.com' || parsed.hostname === 'deezer.com') &&
            /^\/([\w-]+\/)?playlist\/\d+/.test(parsed.pathname)
        );
    } catch {
        return false;
    }
};

export const extractDeezerPlaylistId = (url: string): string => {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const playlistIndex = segments.indexOf('playlist');

    if (playlistIndex === -1 || playlistIndex === segments.length - 1) {
        throw new Error('Playlist ID not found in URL');
    }

    return segments[playlistIndex + 1];
};
