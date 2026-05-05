import { useState, useEffect } from 'react';
import { RefreshCw, Trash2, MessageSquare, Disc, AlertTriangle, Users, PenTool } from 'lucide-react';
import API from '../../services/api';
import { useAuthStore } from '../../stores/useAuthStore';

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

interface Follower {
    uri: string;
    created_at: string;
    actor: {
        name: string;
        username: string;
        icon_url: string | null;
        uri: string;
    } | null;
}

export const ArtistFediversePanel = () => {
    const { adminUser, user } = useAuthStore();
    const [notes, setNotes] = useState<ApNote[]>([]);
    const [followers, setFollowers] = useState<Follower[]>([]);
    const [loading, setLoading] = useState(false);
    const [processingId, setProcessingId] = useState<number | null>(null);
    const rawArtistId = adminUser?.artistId ?? user?.artistId;
    const artistId: string | undefined = rawArtistId && rawArtistId !== 'null' && rawArtistId !== 'undefined' ? String(rawArtistId) : undefined;

    const handleSync = async () => {
        if (!artistId) return; 
        if (!confirm('This will re-broadcast all your public releases and posts to the Fediverse (Mastodon, etc) to ensure they are in sync. Continue?')) return;
        
        setLoading(true);
        try {
            await API.syncArtistActivityPub(artistId);
            alert('Synchronization complete.');
            loadData(artistId); // Changed from loadNotes to loadData
        } catch (e: any) {
            console.error(e);
            alert('Failed to synchronize: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (artistId) {
            loadData(artistId);
        }

        const handleRefresh = () => {
            if (artistId) loadData(artistId);
        };

        window.addEventListener('refresh-social-content', handleRefresh);
        return () => window.removeEventListener('refresh-social-content', handleRefresh);
    }, [artistId]);

    const loadData = async (id: string) => {
        setLoading(true);
        try {
            const [notesData, followersData] = await Promise.all([
                API.getPublishedContent(id),
                API.getArtistFollowers(id)
            ]);
            setNotes(notesData);
            setFollowers(followersData);
        } catch (e) {
            console.error("Failed to load Fediverse data", e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (note: ApNote) => {
        if (!confirm(`Are you sure you want to delete this ${note.note_type} from ActivityPub? This will send a Delete activity to all followers.`)) return;

        setProcessingId(note.id);
        try {
            await API.deletePublishedContent(note.note_id);
            setNotes(prev => prev.filter(n => n.id !== note.id));
        } catch (e) {
            console.error("Failed to delete note", e);
            alert("Failed to delete note");
        } finally {
            setProcessingId(null);
        }
    };

    if (!artistId || artistId === 'null') {
        return (
            <div className="text-center py-12 opacity-50">
                <AlertTriangle className="mx-auto mb-2 opacity-50"/>
                <p>No artist profile associated with this account.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
                <div>
                     <h2 className="text-2xl font-bold flex items-center gap-2">Community Status</h2>
                     <p className="opacity-70 text-sm">Manage your content on the Fediverse (Mastodon, etc)</p>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        className="btn btn-primary btn-outline gap-2"
                        onClick={handleSync}
                        disabled={loading}
                        title="Synchronize with Fediverse"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''}/> Sync
                    </button>
                    <button 
                        className="btn btn-square btn-ghost"
                        onClick={() => loadData(artistId)}
                        disabled={loading}
                        title="Refresh list"
                    >
                        <RefreshCw size={20} className={loading && !processingId ? 'animate-spin' : ''}/>
                    </button>
                </div>
            </div>

            {/* Followers Section */}
            <div className="card card-m3 bg-base-200/50">
                <div className="card-body p-6">
                    <h3 className="font-bold flex items-center gap-2 mb-4">
                        <Users size={20} className="text-primary"/> Followers ({followers.length})
                    </h3>

                    {followers.length === 0 && !loading ? (
                        <div className="text-center py-8 opacity-50">
                            No followers yet.
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {followers.map(follower => (
                                <div key={follower.uri} className="flex items-center gap-3 p-3 bg-base-100/50 rounded-box border border-base-content/5 hover:border-primary/30 transition-colors">
                                    <div className="avatar placeholder">
                                        <div className="w-10 rounded-full bg-neutral text-neutral-content shadow-sm">
                                            {follower.actor?.icon_url ? (
                                                <img src={follower.actor.icon_url} alt={follower.actor.name} />
                                            ) : (
                                                <span>{follower.actor?.name?.[0] || '?'}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <div className="font-bold text-sm truncate">{follower.actor?.name || 'Unknown User'}</div>
                                        <div className="text-xs opacity-50 truncate font-mono" title={follower.uri}>
                                            @{follower.actor?.username || 'unknown'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Posts Section */}
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold flex items-center gap-2">
                        <MessageSquare size={20} className="text-secondary"/> Published Content
                    </h3>
                    <button
                        className="btn btn-sm btn-secondary gap-2 shadow-md"
                        onClick={() => document.dispatchEvent(new CustomEvent('open-create-post-modal'))}
                    >
                        <PenTool size={16}/> Create Post
                    </button>
                </div>

                {notes.length === 0 && !loading ? (
                    <div className="text-center py-12 opacity-50 border-2 border-dashed border-base-300 rounded-box bg-base-200/30">
                        <AlertTriangle className="mx-auto mb-2 opacity-50"/>
                        <p>No content published to the Fediverse yet.</p>
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
                                                <div className="badge badge-outline badge-sm gap-2 mt-1 opacity-70">
                                                    {note.note_type === 'release' ? 'Release' : 'Post'}
                                                </div>
                                                <div className="text-xs opacity-50 mt-2 font-medium">
                                                    {new Date(note.published_at).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2">
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
        </div>
    );
};

