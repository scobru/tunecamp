import { useState, useEffect } from 'react';
import { RefreshCw, Trash2, ExternalLink, MessageSquare, Disc, AlertTriangle, Globe } from 'lucide-react';
import API from '../../services/api';
import type { Artist } from '../../types';

interface ApNote {
    id: number;
    artist_id: number;
    note_id: string; 
    note_type: 'post' | 'release';
    content_id: number;
    content_slug: string;
    content_title: string;
    published_at: string;
    deleted_at: string | null;
}

export const ActivityPubPanel = () => {
    const [artists, setArtists] = useState<Artist[]>([]);
    const [selectedArtistId, setSelectedArtistId] = useState<string>('');
    const [notes, setNotes] = useState<ApNote[]>([]);
    const [peers, setPeers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [processingId, setProcessingId] = useState<number | null>(null);
    const [peerUrl, setPeerUrl] = useState('');
    const [peerLoading, setPeerLoading] = useState(false);
    const [peersLoading, setPeersLoading] = useState(false);
    const [followersCount, setFollowersCount] = useState<number | null>(null);

    useEffect(() => {
        loadArtists();
        loadPeers();
    }, []);

    useEffect(() => {
        if (selectedArtistId) {
            loadNotes(selectedArtistId);
            loadFollowersCount(selectedArtistId);
        } else {
            setNotes([]);
            setFollowersCount(null);
        }
    }, [selectedArtistId]);

    const loadFollowersCount = async (artistId: string) => {
        setFollowersCount(null);
        try {
            const data = await API.getArtistFollowers(artistId);
            setFollowersCount(Array.isArray(data) ? data.length : 0);
        } catch (e) {
            console.error("Failed to load followers count", e);
            setFollowersCount(null);
        }
    };

    const loadArtists = async () => {
        try {
            const data = await API.getArtists();
            setArtists(data);
            if (data.length > 0 && !selectedArtistId) {
                setSelectedArtistId(data[0].id.toString());
            }
        } catch (e) {
            console.error("Failed to load artists", e);
        }
    };

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
            alert(`Follow request sent to ${peerUrl}. If it's a TuneCamp instance, discovery will start automatically.`);
            setPeerUrl('');
            loadPeers();
        } catch (e: any) {
            console.error(e);
            alert(`Failed to follow peer: ${e.message}`);
        } finally {
            setPeerLoading(false);
        }
    };

    const handleUnfollowPeer = async (url: string) => {
        if (!confirm(`Are you sure you want to unfollow ${url}? This will send an Undo(Follow) activity.`)) return;
        
        try {
            await API.unfollowRemoteActor(url);
            setPeers(prev => prev.filter(p => p.uri !== url));
        } catch (e: any) {
            console.error(e);
            alert(`Failed to unfollow: ${e.message}`);
        }
    };

    const handleSyncPeer = async (url?: string) => {
        try {
            await API.syncPeer(url);
            alert(url ? `Sync triggered for ${url}` : 'Global sync triggered');
        } catch (e: any) {
            console.error(e);
            alert(`Failed to sync: ${e.message}`);
        }
    };

    const loadNotes = async (artistId: string) => {
        setLoading(true);
        try {
            const data = await API.getPublishedContent(artistId);
            setNotes(data);
        } catch (e) {
            console.error("Failed to load notes", e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (note: ApNote) => {
        if (!confirm(`Are you sure you want to delete this ${note.note_type} from ActivityPub? This will send a Delete activity to all followers.`)) return;

        setProcessingId(note.id);
        try {
            await API.deletePublishedContent(note.note_id);
            // Refresh list (or optimistic update)
            setNotes(prev => prev.filter(n => n.id !== note.id));
        } catch (e) {
            console.error("Failed to delete note", e);
            alert("Failed to delete note");
        } finally {
            setProcessingId(null);
        }
    };

    const handleSync = async () => {
        if (!confirm('This will re-broadcast all public releases and posts to the Fediverse (Mastodon, etc) to ensure they are in sync. This might take a while. Continue?')) return;
        
        setLoading(true);
        try {
            await API.syncActivityPub();
            alert('Synchronization started in background. Please wait a few moments and refresh.');
            if (selectedArtistId) loadNotes(selectedArtistId);
        } catch (e) {
            console.error(e);
            alert('Failed to start synchronization');
        } finally {
            setLoading(false);
        }
    };

    const selectedArtist = artists.find(a => a.id.toString() === selectedArtistId);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
                <div>
                     <h2 className="text-2xl font-bold flex items-center gap-2">ActivityPub Status</h2>
                     <p className="opacity-70 text-sm font-medium">Manage content published to the Fediverse (Mastodon, etc)</p>
                </div>
                
                <div className="flex gap-2 w-full md:w-auto">
                    <select 
                        className="select select-bordered w-full md:w-64 bg-base-200/50 focus:border-primary"
                        value={selectedArtistId}
                        onChange={(e) => setSelectedArtistId(e.target.value)}
                    >
                        {artists.map(artist => (
                            <option key={artist.id} value={artist.id}>{artist.name}</option>
                        ))}
                    </select>
                    <button 
                        className="btn btn-primary btn-outline gap-2 shadow-sm"
                        onClick={handleSync}
                        disabled={loading}
                        title="Synchronize with Fediverse"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''}/> Sync
                    </button>
                    <button 
                        className="btn btn-square btn-ghost hover:bg-base-300"
                        onClick={() => selectedArtistId && loadNotes(selectedArtistId)}
                        disabled={loading}
                        title="Refresh list"
                    >
                        <RefreshCw size={20} className={loading && !processingId ? 'animate-spin' : ''}/>
                    </button>
                </div>
            </div>

            {selectedArtist && (
                <div className="stats shadow-m3-1 w-full bg-base-200/50 border border-base-content/5 overflow-hidden rounded-box">
                    <div className="stat">
                        <div className="stat-figure text-primary">
                            <div className="avatar placeholder">
                                <div className="w-12 rounded-full bg-primary/10 text-primary shadow-inner">
                                    <span className="font-bold">{selectedArtist.name[0]}</span>
                                </div>
                            </div>
                        </div>
                        <div className="stat-title opacity-60 text-xs font-bold tracking-normal">Followers</div>
                        <div className="stat-value text-primary">{followersCount === null ? <span className="loading loading-spinner loading-sm opacity-50" /> : followersCount}</div>
                        <div className="stat-desc font-mono text-xs mt-1 opacity-50">on @{selectedArtist.slug}@{window.location.hostname}</div>
                    </div>
                </div>
            )}

            <div className="card card-m3 bg-base-200/30">
                <div className="card-body p-6">
                    <h3 className="font-bold mb-2 flex items-center gap-2">
                        <Globe size={18} className="text-accent" /> Federation & Peers
                    </h3>
                    <p className="text-sm opacity-70 mb-4 font-medium">Connect to other TuneCamp instances or ActivityPub Relays to discover music in your Community tab.</p>
                    <form onSubmit={handleFollowPeer} className="flex gap-2 mb-6">
                        <input 
                            type="url" 
                            className="input input-bordered flex-1 bg-base-100/50 focus:border-primary transition-all" 
                            placeholder="https://another-instance.com/users/site"
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

                    {peers.length > 0 && (
                        <div className="space-y-3 mt-4">
                            <h4 className="text-xs font-bold opacity-40 tracking-normal mb-2">Followed Peers</h4>
                            <div className="grid gap-2">
                                {peers.map(peer => (
                                    <div key={peer.uri} className="flex items-center justify-between p-3 bg-base-100/40 rounded-lg border border-base-content/5 group hover:bg-base-100/60 transition-colors">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="avatar placeholder">
                                                <div className="w-8 h-8 rounded-full bg-neutral text-neutral-content shadow-sm">
                                                    <span className="text-xs font-bold">{peer.username?.[0] || peer.uri.split('/').pop()?.[0] || 'P'}</span>
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-sm truncate">{peer.name || peer.username}</div>
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
                                                className="btn btn-ghost btn-xs btn-square"
                                                onClick={() => handleSyncPeer(peer.uri)}
                                                title="Sync Peer"
                                            >
                                                <RefreshCw size={14}/>
                                            </button>
                                            <button 
                                                className="btn btn-ghost btn-xs btn-square text-error/70 hover:text-error"
                                                onClick={() => handleUnfollowPeer(peer.uri)}
                                                title="Unfollow Peer"
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

            {notes.length === 0 && !loading ? (
                <div className="text-center py-12 opacity-50 border-2 border-dashed border-base-300 rounded-box bg-base-200/20">
                    <AlertTriangle className="mx-auto mb-2 opacity-50"/>
                    <p className="font-medium">No published content found for this artist.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {notes.map(note => (
                        <div key={note.id} className="card card-m3 bg-base-100 hover:bg-base-200/50 transition-all">
                            <div className="card-body p-4 sm:p-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex gap-4">
                                        <div className={`p-3 rounded-full h-fit shadow-inner ${note.note_type === 'release' ? 'bg-secondary/10 text-secondary' : 'bg-accent/10 text-accent'}`}>
                                            {note.note_type === 'release' ? <Disc size={24}/> : <MessageSquare size={24}/>}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg">{note.content_title || 'Untitled'}</h3>
                                            <div className="text-xs opacity-40 font-mono mb-2 break-all">{note.note_id}</div>
                                            <div className="badge badge-outline badge-sm gap-2 opacity-70">
                                                {note.note_type === 'release' ? 'Release' : 'Post'}
                                            </div>
                                            <span className="text-xs opacity-50 ml-2 font-medium">
                                                {new Date(note.published_at).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col gap-2">
                                        <a
                                            href={note.note_type === 'release'
                                                ? `/releases/${note.content_slug}`
                                                : `/artists/${selectedArtist?.slug}?post=${note.content_slug}`
                                            }
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="btn btn-ghost btn-sm btn-square hover:text-primary transition-colors"
                                        >                                            <ExternalLink size={18}/>
                                        </a>
                                        <button 
                                            className="btn btn-error btn-outline btn-sm"
                                            onClick={() => handleDelete(note)}
                                            disabled={!!processingId}
                                        >
                                            {processingId === note.id ? <span className="loading loading-spinner loading-xs"/> : <Trash2 size={18}/>}
                                            <span className="hidden sm:inline ml-1">Delete</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

