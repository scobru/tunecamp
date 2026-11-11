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
};
