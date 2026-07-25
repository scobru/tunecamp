import { api, handleResponse } from './client';
import type {
    NetworkSite, NetworkTrack, NetworkStatus
} from '../../types';



export const networkApi = {
    // --- Network ---
    getNetworkSites: () => handleResponse(api.get<NetworkSite[]>('stats/network/sites')),
    getNetworkTracks: () => handleResponse(api.get<NetworkTrack[]>('stats/network/tracks')),
    getNetworkStatus: () => handleResponse(api.get<NetworkStatus>('stats/network/status')),
    getFollowedPeers: () => handleResponse(api.get<any[]>('admin/network/ap/peers')),
    followRemoteActor: (url: string) => handleResponse(api.post('admin/network/ap/follow', { url })),
    followTuneCampInstance: (url: string) => handleResponse(api.post<{ message: string }>('admin/network/tunecamp/follow', { url })),
    unfollowRemoteActor: (url: string) => handleResponse(api.post('admin/network/ap/unfollow', { url })),
    syncPeer: (url?: string) => handleResponse(api.post('admin/network/ap/sync', { url })),
    followRssFeed: (url: string) => handleResponse(api.post<{ message: string; name: string; items: number }>('admin/network/rss/follow', { url })),
    unfollowRssFeed: (url: string) => handleResponse(api.post('admin/network/rss/unfollow', { url })),
    syncRssFeed: (url?: string) => handleResponse(api.post('admin/network/rss/sync', { url })),
    refreshNetworkCatalogs: (url?: string) => handleResponse(api.post<{ message: string; removed: number }>('admin/network/catalog/refresh', { url })),

    // --- Torrents ---
    getTorrents: () => handleResponse(api.get<any[]>('admin/torrents')),
    addTorrent: (magnetUri: string) => handleResponse(api.post('admin/torrents/add', { magnet: magnetUri })),
    seedTorrent: (filePaths: string[], name: string, artist?: string) => handleResponse(api.post<{ success: boolean, magnetUri: string }>('admin/torrents/seed', { filePaths, name, artist })),
    deleteTorrent: (infoHash: string, deleteFiles = false) => handleResponse(api.delete(`admin/torrents/${infoHash}${deleteFiles ? '?deleteFiles=true' : ''}`)),
    purgeStuckTorrents: (timeoutMs?: number) => handleResponse(api.post<{ success: boolean, removed: string[], count: number }>('admin/torrents/purge', timeoutMs !== undefined ? { timeoutMs } : {})),
    searchTorrents: (q: string, page = 0, size = 20) => handleResponse(api.get<any>(`admin/torrents/search?q=${encodeURIComponent(q)}&page=${page}&size=${size}`)),

};
