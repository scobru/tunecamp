import { confirm } from '@/utils/confirm';
import { useState, useEffect } from 'react';
import { RefreshCw, Trash2, ExternalLink, Globe, Rss, Server, WifiOff } from 'lucide-react';
import API from '../../services/api';
import { notify } from '../../utils/notify';

/**
 * Instance-level federation configuration (root-admin only):
 * which external sources this instance (@site) follows — other TuneCamp/Funkwhale
 * instances, ActivityPub relays, and plain RSS/Atom feeds. This is administration,
 * not per-artist social content, so it lives under Admin → Federation.
 */
export const AdminFederationPanel = () => {
    const [peers, setPeers] = useState<any[]>([]);
    const [peersLoading, setPeersLoading] = useState(false);
    const [peerUrl, setPeerUrl] = useState('');
    const [peerLoading, setPeerLoading] = useState(false);
    const [feedUrl, setFeedUrl] = useState('');
    const [feedLoading, setFeedLoading] = useState(false);
    const [instanceUrl, setInstanceUrl] = useState('');
    const [instanceLoading, setInstanceLoading] = useState(false);
    const [siteHandle, setSiteHandle] = useState('site');
    const [refreshingCatalogs, setRefreshingCatalogs] = useState(false);

    useEffect(() => {
        loadPeers();
        API.getSiteSettings()
            .then((s) => { if (s?.siteHandle) setSiteHandle(s.siteHandle); })
            .catch(() => {});
    }, []);

    const loadPeers = async () => {
        setPeersLoading(true);
        try {
            const data = await API.getFollowedPeers();
            setPeers(data);
        } catch (e) {
            console.error("Failed to load peers", e);
        } finally {
            setPeersLoading(false);
        }
    };

    const handleFollowPeer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!peerUrl) return;

        setPeerLoading(true);
        try {
            await API.followRemoteActor(peerUrl);
            notify.success(`Follow request sent to ${peerUrl}. If it's a TuneCamp instance, discovery will start automatically.`);
            setPeerUrl('');
            loadPeers();
        } catch (e: any) {
            console.error(e);
            notify.error(e, `Failed to follow peer`);
        } finally {
            setPeerLoading(false);
        }
    };

    const handleFollowInstance = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!instanceUrl) return;

        setInstanceLoading(true);
        try {
            const res = await API.followTuneCampInstance(instanceUrl);
            notify.success(res?.message || `Following ${instanceUrl}`);
            setInstanceUrl('');
            loadPeers();
        } catch (e: any) {
            console.error(e);
            notify.error(e, `Failed to follow instance`);
        } finally {
            setInstanceLoading(false);
        }
    };

    const handleUnfollowPeer = async (url: string) => {
        if (!await confirm(`Are you sure you want to unfollow ${url}? This will send an Undo(Follow) activity.`)) return;

        try {
            await API.unfollowRemoteActor(url);
            setPeers(prev => prev.filter(p => p.uri !== url));
        } catch (e: any) {
            console.error(e);
            notify.error(e, `Failed to unfollow`);
        }
    };

    const handleSyncPeer = async (url?: string) => {
        try {
            await API.syncPeer(url);
            notify.success(url ? `Sync triggered for ${url}` : 'Global sync triggered');
        } catch (e: any) {
            console.error(e);
            notify.error(e, `Failed to sync`);
        }
    };

    const handleRefreshCatalogs = async () => {
        setRefreshingCatalogs(true);
        try {
            const res = await API.refreshNetworkCatalogs();
            notify.success(res?.message || 'Network catalogs will refetch on next load');
        } catch (e: any) {
            console.error(e);
            notify.error(e, 'Failed to refresh catalogs');
        } finally {
            setRefreshingCatalogs(false);
        }
    };

    const handleFollowFeed = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!feedUrl) return;

        setFeedLoading(true);
        try {
            const res = await API.followRssFeed(feedUrl);
            notify.success(res?.message || `Now following ${feedUrl}`);
            setFeedUrl('');
            loadPeers();
        } catch (e: any) {
            console.error(e);
            notify.error(e, `Failed to follow feed`);
        } finally {
            setFeedLoading(false);
        }
    };

    const handleUnfollowFeed = async (url: string) => {
        if (!await confirm(`Stop following ${url}?`)) return;
        try {
            await API.unfollowRssFeed(url);
            setPeers(prev => prev.filter(p => p.uri !== url));
        } catch (e: any) {
            console.error(e);
            notify.error(e, `Failed to unfollow feed`);
        }
    };

    const handleSyncFeed = async (url?: string) => {
        try {
            await API.syncRssFeed(url);
            notify.success(url ? `Refresh triggered for ${url}` : 'RSS refresh triggered');
        } catch (e: any) {
            console.error(e);
            notify.error(e, `Failed to refresh feed`);
        }
    };

    const apPeers = peers.filter(p => p.type !== 'rss');
    const rssFeeds = peers.filter(p => p.type === 'rss');

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Globe size={24} className="text-accent" /> Federation
                </h2>
                <p className="opacity-70 text-sm mt-1 font-medium">
                    Choose which external sources this instance follows. Discovered content appears in the Network page for everyone on this server. These follows are sent by the <b>instance actor</b> (@{siteHandle}@{window.location.hostname}).
                </p>
            </div>

            <div className="card card-m3 bg-base-200/30">
                <div className="card-body p-6">
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <h3 className="font-bold flex items-center gap-2">
                            <Server size={18} className="text-primary" /> TuneCamp Instances
                        </h3>
                        <button
                            type="button"
                            className="btn btn-ghost btn-xs gap-1 normal-case"
                            onClick={handleRefreshCatalogs}
                            disabled={refreshingCatalogs}
                            data-tip="Clear cached catalogs and refetch"
                        >
                            {refreshingCatalogs
                                ? <span className="loading loading-spinner loading-xs"/>
                                : <RefreshCw size={14}/>}
                            Refresh catalogs
                        </button>
                    </div>
                    <p className="text-sm opacity-70 mb-4 font-medium">
                        Connect to another TuneCamp instance — just paste its website address. We verify it's a TuneCamp server, follow it, and start pulling its catalog into your Network automatically. Catalogs are cached for up to an hour; use <b>Refresh catalogs</b> to pull the latest immediately (e.g. after a release was deleted on another instance).
                    </p>
                    <form onSubmit={handleFollowInstance} className="flex gap-2">
                        <input
                            type="url"
                            className="input input-bordered flex-1 bg-base-100/50 focus:border-primary transition-all"
                            placeholder="https://tunecamp.example.com"
                            value={instanceUrl}
                            onChange={(e) => setInstanceUrl(e.target.value)}
                        />
                        <button
                            type="submit"
                            className="btn btn-primary shadow-level-1"
                            disabled={instanceLoading || !instanceUrl}
                        >
                            {instanceLoading ? <span className="loading loading-spinner loading-xs"/> : 'Follow Instance'}
                        </button>
                    </form>
                </div>
            </div>

            <div className="card card-m3 bg-base-200/30">
                <div className="card-body p-6">
                    <h3 className="font-bold mb-2 flex items-center gap-2">
                        <Globe size={18} className="text-accent" /> Instances & Peers
                        <span className="badge badge-outline badge-sm font-mono opacity-70">@{siteHandle}@{window.location.hostname}</span>
                    </h3>
                    <p className="text-sm opacity-70 mb-4 font-medium">
                        Follow any ActivityPub actor by URL or handle — Funkwhale channels, ActivityPub Relays, or a specific actor on another instance. For a whole TuneCamp server, use the box above instead.
                    </p>
                    <form onSubmit={handleFollowPeer} className="flex gap-2 mb-6">
                        <input
                            type="url"
                            className="input input-bordered flex-1 bg-base-100/50 focus:border-primary transition-all"
                            placeholder="https://another-instance.com/users/site or https://funkwhale.it/@channel"
                            value={peerUrl}
                            onChange={(e) => setPeerUrl(e.target.value)}
                        />
                        <button
                            type="submit"
                            className="btn btn-primary shadow-level-1"
                            disabled={peerLoading || !peerUrl}
                        >
                            {peerLoading ? <span className="loading loading-spinner loading-xs"/> : 'Follow Peer'}
                        </button>
                    </form>

                    {apPeers.length > 0 && (
                        <div className="space-y-3 mt-4">
                            <h4 className="text-xs font-bold opacity-40 tracking-normal mb-2">Peers followed by this instance</h4>
                            <div className="grid gap-2">
                                {apPeers.map(peer => (
                                    <div key={peer.uri} className="flex items-center justify-between p-3 bg-base-100/40 rounded-lg border border-base-content/5 group hover:bg-base-100/60 transition-colors">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="avatar placeholder">
                                                <div className="w-8 h-8 rounded-full bg-neutral text-neutral-content shadow-sm">
                                                    <span className="text-xs font-bold">{peer.username?.[0] || peer.uri.split('/').pop()?.[0] || 'P'}</span>
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-sm truncate flex items-center gap-1.5">
                                                    {peer.name || peer.username}
                                                    {peer.offline && (
                                                        <span
                                                            className="badge badge-error badge-outline badge-sm gap-1 tooltip tooltip-top normal-case"
                                                            data-tip={`Unreachable since ${peer.offlineSince ? new Date(peer.offlineSince).toLocaleString() : 'unknown'} — consider unfollowing`}
                                                        >
                                                            <WifiOff size={10}/> Offline
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs opacity-40 truncate flex items-center gap-1 font-mono">
                                                    <span className="truncate">{peer.uri}</span>
                                                    <a href={peer.uri} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity">
                                                        <ExternalLink size={10}/>
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                className="btn btn-ghost btn-xs btn-square tooltip tooltip-top"
                                                onClick={() => handleSyncPeer(peer.uri)}
                                                data-tip="Sync Peer"
                                            >
                                                <RefreshCw size={14}/>
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-xs btn-square text-error/70 hover:text-error tooltip tooltip-top"
                                                onClick={() => handleUnfollowPeer(peer.uri)}
                                                data-tip="Unfollow Peer"
                                            >
                                                <Trash2 size={14}/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {peersLoading && peers.length === 0 && (
                        <div className="flex justify-center py-4">
                            <span className="loading loading-spinner loading-md opacity-30"/>
                        </div>
                    )}
                </div>
            </div>

            <div className="card card-m3 bg-base-200/30">
                <div className="card-body p-6">
                    <h3 className="font-bold mb-2 flex items-center gap-2">
                        <Rss size={18} className="text-warning" /> RSS &amp; Podcast Feeds
                    </h3>
                    <p className="text-sm opacity-70 mb-4 font-medium">
                        Follow plain RSS/Atom sources that aren't on the Fediverse — podcasts (Castopod, etc.), Owncast streams or blogs. Paste the feed URL or just the page URL (the feed is auto-detected). Episodes with audio become playable tracks; everything else appears as posts in the Network page. Feeds refresh automatically.
                    </p>
                    <form onSubmit={handleFollowFeed} className="flex gap-2 mb-6">
                        <input
                            type="url"
                            className="input input-bordered flex-1 bg-base-100/50 focus:border-warning transition-all"
                            placeholder="https://example.com/feed.xml"
                            value={feedUrl}
                            onChange={(e) => setFeedUrl(e.target.value)}
                        />
                        <button
                            type="submit"
                            className="btn btn-warning shadow-level-1"
                            disabled={feedLoading || !feedUrl}
                        >
                            {feedLoading ? <span className="loading loading-spinner loading-xs"/> : 'Follow Feed'}
                        </button>
                    </form>

                    {rssFeeds.length > 0 && (
                        <div className="space-y-3 mt-4">
                            <h4 className="text-xs font-bold opacity-40 tracking-normal mb-2">Followed feeds</h4>
                            <div className="grid gap-2">
                                {rssFeeds.map(feed => (
                                    <div key={feed.uri} className="flex items-center justify-between p-3 bg-base-100/40 rounded-lg border border-base-content/5 group hover:bg-base-100/60 transition-colors">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="avatar placeholder">
                                                <div className="w-8 h-8 rounded-full bg-warning/20 text-warning shadow-sm overflow-hidden flex items-center justify-center">
                                                    {feed.icon_url
                                                        ? <img src={feed.icon_url} alt="" className="w-full h-full object-cover" />
                                                        : <Rss size={14}/>}
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-sm truncate">{feed.name || feed.uri}</div>
                                                <div className="text-xs opacity-40 truncate flex items-center gap-1 font-mono">
                                                    <span className="truncate">{feed.uri}</span>
                                                    <a href={feed.uri} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 hover:text-warning transition-opacity">
                                                        <ExternalLink size={10}/>
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                className="btn btn-ghost btn-xs btn-square tooltip tooltip-top"
                                                onClick={() => handleSyncFeed(feed.uri)}
                                                data-tip="Refresh Feed"
                                            >
                                                <RefreshCw size={14}/>
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-xs btn-square text-error/70 hover:text-error tooltip tooltip-top"
                                                onClick={() => handleUnfollowFeed(feed.uri)}
                                                data-tip="Unfollow Feed"
                                            >
                                                <Trash2 size={14}/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
