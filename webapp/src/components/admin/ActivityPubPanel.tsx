import { confirm } from '@/utils/confirm';
import { useState, useEffect } from 'react';
import { RefreshCw, Trash2, ExternalLink, MessageSquare, Disc, AlertTriangle, DatabaseZap } from 'lucide-react';
import API from '../../services/api';
import type { Artist } from '../../types';
import { notify } from '../../utils/notify';

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
    const [loading, setLoading] = useState(false);
    const [processingId, setProcessingId] = useState<number | null>(null);
    const [followersCount, setFollowersCount] = useState<number | null>(null);

    useEffect(() => {
        loadArtists();
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
        if (!await confirm(`Are you sure you want to delete this ${note.note_type} from ActivityPub? This will send a Delete activity to all followers.`)) return;

        setProcessingId(note.id);
        try {
            await API.deletePublishedContent(note.note_id);
            // Refresh list (or optimistic update)
            setNotes(prev => prev.filter(n => n.id !== note.id));
        } catch (e) {
            console.error("Failed to delete note", e);
            notify.error(e, "Failed to delete note");
        } finally {
            setProcessingId(null);
        }
    };

    const handleSync = async () => {
        if (!await confirm('This will re-broadcast all public releases and posts to the Fediverse (Mastodon, etc) to ensure they are in sync. This might take a while. Continue?')) return;

        setLoading(true);
        try {
            await API.syncActivityPub();
            notify.success('Synchronization started in background. Please wait a few moments and refresh.');
            if (selectedArtistId) loadNotes(selectedArtistId);
        } catch (e) {
            console.error(e);
            notify.error(e, 'Failed to start synchronization');
        } finally {
            setLoading(false);
        }
    };

    const handlePurgeLocalCache = async () => {
        if (!await confirm(
            'This will remove stale posts from this instance that were cached in the federated remote-content store (e.g. after key regeneration). Local posts will still appear normally. Continue?'
        )) return;

        setLoading(true);
        try {
            const result = await API.purgeLocalFederationCache() as any;
            notify.success(result?.message || `Removed ${result?.deleted ?? 0} stale local post(s) from the federated cache.`);
        } catch (e) {
            console.error(e);
            notify.error(e, 'Failed to purge local federation cache');
        } finally {
            setLoading(false);
        }
    };

    const selectedArtist = artists.find(a => a.id.toString() === selectedArtistId);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
                <div>
                     <h2 className="text-2xl font-bold flex items-center gap-2">Artist Publishing</h2>
                     <p className="opacity-70 text-sm font-medium">Followers and content published to the Fediverse by the selected artist.</p>
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
                        className="btn btn-primary btn-outline gap-2 shadow-sm tooltip tooltip-bottom"
                        onClick={handleSync}
                        disabled={loading}
                        data-tip="Re-broadcast all public content to the Fediverse"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''}/> Sync
                    </button>
                    <button
                        className="btn btn-warning btn-outline gap-2 shadow-sm tooltip tooltip-bottom"
                        onClick={handlePurgeLocalCache}
                        disabled={loading}
                        data-tip="Remove stale local posts from the federated cache (e.g. after key regeneration)"
                    >
                        <DatabaseZap size={20} /> Purge Cache
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

