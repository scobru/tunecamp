import { useState, useEffect } from 'react';
import { RefreshCw, Trash2, ExternalLink, MessageSquare, Disc, AlertTriangle } from 'lucide-react';
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
    const [loading, setLoading] = useState(false);
    const [processingId, setProcessingId] = useState<number | null>(null);

    useEffect(() => {
        loadArtists();
    }, []);

    useEffect(() => {
        if (selectedArtistId) {
            loadNotes(selectedArtistId);
        } else {
            setNotes([]);
        }
    }, [selectedArtistId]);

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

    const selectedArtist = artists.find(a => a.id.toString() === selectedArtistId);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
                <div>
                     <h2 className="text-2xl font-bold flex items-center gap-2">ActivityPub Status</h2>
                     <p className="opacity-70 text-sm">Manage content published to the Fediverse (Mastodon, etc)</p>
                </div>
                
                <div className="flex gap-2 w-full md:w-auto">
                    <select 
                        className="select select-bordered w-full md:w-64"
                        value={selectedArtistId}
                        onChange={(e) => setSelectedArtistId(e.target.value)}
                    >
                        {artists.map(artist => (
                            <option key={artist.id} value={artist.id}>{artist.name}</option>
                        ))}
                    </select>
                    <button 
                        className="btn btn-square btn-ghost"
                        onClick={() => selectedArtistId && loadNotes(selectedArtistId)}
                        disabled={loading}
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''}/>
                    </button>
                </div>
            </div>

            {selectedArtist && (
                <div className="stats shadow w-full bg-base-200 border border-white/5">
                    <div className="stat">
                        <div className="stat-figure text-primary">
                            <div className="avatar placeholder">
                                <div className="w-12 rounded-full bg-neutral-focus text-neutral-content">
                                    <span>{selectedArtist.name[0]}</span>
                                </div>
                            </div>
                        </div>
                        <div className="stat-title">Followers</div>
                        {/* We don't have follower count readily available here without another API call, possibly add later or fetch stats */}
                        <div className="stat-value text-primary">--</div> 
                        <div className="stat-desc">on @{selectedArtist.slug}@{window.location.hostname}</div>
                    </div>
                </div>
            )}

            {notes.length === 0 && !loading ? (
                <div className="text-center py-12 opacity-50 border-2 border-dashed border-base-300 rounded-box">
                    <AlertTriangle className="mx-auto mb-2 opacity-50"/>
                    <p>No published content found for this artist.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {notes.map(note => (
                        <div key={note.id} className="card bg-base-100 shadow-xl border border-white/5">
                            <div className="card-body p-4 sm:p-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex gap-4">
                                        <div className={`p-3 rounded-full h-fit ${note.note_type === 'release' ? 'bg-secondary/10 text-secondary' : 'bg-accent/10 text-accent'}`}>
                                            {note.note_type === 'release' ? <Disc size={24}/> : <MessageSquare size={24}/>}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg">{note.content_title || 'Untitled'}</h3>
                                            <div className="text-xs opacity-50 font-mono mb-2 break-all">{note.note_id}</div>
                                            <div className="badge badge-outline gap-2">
                                                {note.note_type === 'release' ? 'Release' : 'Post'}
                                            </div>
                                            <span className="text-xs opacity-50 ml-2">
                                                {new Date(note.published_at).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col gap-2">
                                        <a href={note.note_id} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm btn-square">
                                            <ExternalLink size={18}/>
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
