export interface TorrentSearchResult {
    title: string;
    time?: string;
    size: string;
    seeds: number;
    peers: number;
    magnet?: string;
    /** Torrent page URL — required by torrent-search-api to resolve the magnet on download. */
    link?: string;
    desc?: string;
    provider: string;
    searchProviderId?: string;
}

export interface TorrentSearchProvider {
    readonly id: string;
    readonly name: string;
    search(query: string, category?: string): Promise<TorrentSearchResult[]>;
    getMagnet(torrent: TorrentSearchResult): Promise<string | null>;
}
