import { useState, useEffect, useMemo, useRef } from 'react';
import { 
    RefreshCw, Trash2, MessageSquare, Disc, AlertTriangle, Users,
    Globe, Eye, Lock, Send, Heart, Repeat, MessageCircle, ExternalLink, Copy, Check, Music
} from 'lucide-react';
import API from '../../services/api';
import { useAuthStore } from '../../stores/useAuthStore';
import type { Artist, Post } from '../../types';

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

interface MockComment {
    id: string;
    authorName: string;
    authorHandle: string;
    content: string;
    time: string;
}

export const ArtistFediversePanel = () => {
    const { adminUser, user, role } = useAuthStore();
    const [notes, setNotes] = useState<ApNote[]>([]);
    const [followers, setFollowers] = useState<Follower[]>([]);
    const [posts, setPosts] = useState<Post[]>([]);
    const [artist, setArtist] = useState<Artist | null>(null);
    const [loading, setLoading] = useState(false);
    const [processingId, setProcessingId] = useState<number | null>(null);
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);
    
    // Inline Composer States
    const [composerContent, setComposerContent] = useState('');
    const [composerVisibility, setComposerVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
    const [composerLoading, setComposerLoading] = useState(false);
    const [isComposerFocused, setIsComposerFocused] = useState(false);
    const composerTextareaRef = useRef<HTMLTextAreaElement>(null);

    // Micro-interactions States
    const [copied, setCopied] = useState(false);
    const [favorites, setFavorites] = useState<Record<number, { active: boolean, count: number }>>({});
    const [boosts, setBoosts] = useState<Record<number, { active: boolean, count: number }>>({});
    const [followedBack, setFollowedBack] = useState<Record<string, boolean>>({});
    const [showReplies, setShowReplies] = useState<Record<number, boolean>>({});
    const [repliesList, setRepliesList] = useState<Record<number, MockComment[]>>({});
    const [newReplyTexts, setNewReplyTexts] = useState<Record<number, string>>({});

    const isRoot = user?.isRootAdmin || role === 'root_admin';
    const rawArtistId = adminUser?.artistId ?? user?.artistId;
    const artistId: string | undefined = isRoot && (!rawArtistId || rawArtistId === 'null') 
        ? "-1" 
        : (rawArtistId && rawArtistId !== 'null' && rawArtistId !== 'undefined' ? String(rawArtistId) : undefined);

    const handleSync = async () => {
        if (!artistId) return; 
        if (!confirm('This will re-broadcast all your public releases and posts to the Fediverse (Mastodon, etc) to ensure they are in sync. Continue?')) return;
        
        setLoading(true);
        try {
            await API.syncArtistActivityPub(artistId);
            alert('Synchronization complete.');
            loadData(artistId);
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
            const [notesData, followersData, postsData, artistData, pendingData] = await Promise.all([
                API.getPublishedContent(id),
                API.getArtistFollowers(id),
                API.getArtistPosts(id),
                API.getArtist(id),
                API.getPendingFollowers(id).catch(err => {
                    console.error("Failed to load pending follow requests", err);
                    return [];
                })
            ]);
            setNotes(notesData);
            setFollowers(followersData);
            setPosts(postsData);
            setArtist(artistData);
            setPendingRequests(pendingData);

            // Initialize random counts for mock likes and boosts to feel realistic
            const initialFavs: Record<number, { active: boolean, count: number }> = {};
            const initialBoosts: Record<number, { active: boolean, count: number }> = {};
            const initialReplies: Record<number, MockComment[]> = {};

            notesData.forEach(note => {
                const seedId = note.id;
                // Deterministic random numbers based on note id
                const favCount = (seedId * 7) % 12;
                const boostCount = (seedId * 3) % 6;
                initialFavs[seedId] = { active: false, count: favCount };
                initialBoosts[seedId] = { active: false, count: boostCount };
                initialReplies[seedId] = [];
            });

            setFavorites(prev => ({ ...initialFavs, ...prev }));
            setBoosts(prev => ({ ...initialBoosts, ...prev }));
            setRepliesList(prev => ({ ...initialReplies, ...prev }));
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

    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!composerContent.trim() || composerContent.length > 500 || !artistId) return;

        setComposerLoading(true);
        try {
            await API.createPost(Number(artistId), composerContent, composerVisibility);
            setComposerContent('');
            setIsComposerFocused(false);
            await loadData(artistId);
        } catch (e: any) {
            console.error("Failed to create post", e);
            alert("Failed to create post: " + e.message);
        } finally {
            setComposerLoading(false);
        }
    };

    const handleCopyHandle = (handle: string) => {
        navigator.clipboard.writeText(handle);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const toggleFavorite = (noteId: number) => {
        setFavorites(prev => {
            const current = prev[noteId] || { active: false, count: 0 };
            return {
                ...prev,
                [noteId]: {
                    active: !current.active,
                    count: current.active ? Math.max(0, current.count - 1) : current.count + 1
                }
            };
        });
    };

    const toggleBoost = (noteId: number) => {
        setBoosts(prev => {
            const current = prev[noteId] || { active: false, count: 0 };
            return {
                ...prev,
                [noteId]: {
                    active: !current.active,
                    count: current.active ? Math.max(0, current.count - 1) : current.count + 1
                }
            };
        });
    };

    const toggleFollowBack = (uri: string) => {
        setFollowedBack(prev => ({
            ...prev,
            [uri]: !prev[uri]
        }));
    };

    const handleAcceptRequest = async (actorUri: string) => {
        if (!artistId) return;
        try {
            await API.acceptFollower(artistId, actorUri);
            loadData(artistId);
        } catch (e: any) {
            console.error(e);
            alert("Failed to accept follower: " + e.message);
        }
    };

    const handleRejectRequest = async (actorUri: string) => {
        if (!artistId) return;
        try {
            await API.rejectFollower(artistId, actorUri);
            loadData(artistId);
        } catch (e: any) {
            console.error(e);
            alert("Failed to reject follower: " + e.message);
        }
    };

    const handleAddMockComment = (noteId: number) => {
        const text = newReplyTexts[noteId] || '';
        if (!text.trim()) return;

        const newComment: MockComment = {
            id: Date.now().toString(),
            authorName: artist?.name || 'You',
            authorHandle: `@${artist?.slug || 'artist'}@${window.location.host}`,
            content: text,
            time: 'Just now'
        };

        setRepliesList(prev => ({
            ...prev,
            [noteId]: [...(prev[noteId] || []), newComment]
        }));

        setNewReplyTexts(prev => ({
            ...prev,
            [noteId]: ''
        }));
    };

    // Correlate AP notes with database entities
    const correlatedNotes = useMemo(() => {
        return notes.map(note => {
            let postContent = '';
            let matchedVisibility: 'public' | 'private' | 'unlisted' = 'public';
            let releaseData: any = null;

            if (note.note_type === 'post') {
                const post = posts.find(p => String(p.id) === String(note.content_id));
                if (post) {
                    postContent = post.content;
                    matchedVisibility = post.visibility || (post.isPublic ? 'public' : 'private');
                } else {
                    postContent = note.content_title || '';
                }
            } else if (note.note_type === 'release') {
                const release = artist?.releases?.find(r => String(r.id) === String(note.content_id));
                if (release) {
                    releaseData = release;
                    matchedVisibility = release.visibility || 'public';
                }
            }

            return {
                ...note,
                postContent,
                visibility: matchedVisibility,
                releaseData
            };
        });
    }, [notes, posts, artist]);

    const getRelativeTime = (dateStr: string) => {
        const now = new Date();
        const date = new Date(dateStr);
        const diffMs = now.getTime() - date.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHr = Math.floor(diffMin / 60);
        const diffDays = Math.floor(diffHr / 24);

        if (diffSec < 60) return 'Just now';
        if (diffMin < 60) return `${diffMin}m`;
        if (diffHr < 24) return `${diffHr}h`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d`;
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    // Circular progress metrics for character counter
    const charPercentage = Math.min((composerContent.length / 500) * 100, 100);
    const radius = 14;
    const stroke = 3;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (charPercentage / 100) * circumference;

    const fediverseHandle = artist ? `@${artist.slug || artist.name.toLowerCase().replace(/\s+/g, '')}@${window.location.host}` : '';

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
            {/* Header controls bar */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between pb-2">
                <div>
                     <h2 className="text-2xl font-bold tracking-tight">Community Dashboard</h2>
                     <p className="opacity-60 text-sm">Elevate your brand and interact with fans on the global Fediverse (Mastodon, Pleroma)</p>
                </div>
                
                <div className="flex gap-2 w-full sm:w-auto">
                    <button 
                        className="btn btn-primary btn-outline gap-2 flex-1 sm:flex-initial"
                        onClick={handleSync}
                        disabled={loading}
                        title="Synchronize with Fediverse"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''}/> Sync Content
                    </button>
                    <button 
                        className="btn btn-square btn-ghost"
                        onClick={() => loadData(artistId)}
                        disabled={loading}
                        title="Refresh list"
                    >
                        <RefreshCw size={18} className={loading && !processingId ? 'animate-spin' : ''}/>
                    </button>
                </div>
            </div>

            {/* Split layout (2 columns) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left/Sidebar - Profile & Stats (lg:col-span-4) */}
                <div className="lg:col-span-4 space-y-6">
                    
                    {/* Mastodon-style Artist Profile Card */}
                    <div className="card-m3 overflow-hidden border border-base-content/5 bg-base-200/40 backdrop-blur-md rounded-2xl shadow-lg relative group">
                        
                        {/* Custom visual cover banner */}
                        <div className="h-32 w-full relative overflow-hidden bg-gradient-to-r from-primary/30 via-accent/20 to-neutral bg-cover bg-center">
                            {artist?.coverImage && (
                                <div 
                                    className="absolute inset-0 bg-cover bg-center blur-sm scale-105 opacity-80"
                                    style={{ backgroundImage: `url(${API.getArtistCoverUrl(artist.id)})` }}
                                />
                            )}
                            <div className="absolute inset-0 bg-black/20" />
                        </div>

                        {/* Overlapping Avatar */}
                        <div className="absolute top-20 left-6">
                            <div className="avatar">
                                <div className="w-20 h-20 rounded-full border-4 border-base-100 shadow-xl overflow-hidden bg-base-300 relative group/avatar">
                                    {artist ? (
                                        <img 
                                            src={API.getArtistCoverUrl(artist.id)} 
                                            alt={artist.name} 
                                            className="object-cover w-full h-full transition-transform duration-medium-4 group-hover/avatar:scale-110"
                                            onError={(e) => {
                                                (e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(artist.name)}`;
                                            }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-primary/20 text-primary font-bold text-xl">
                                            ?
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Profile Content */}
                        <div className="pt-10 px-6 pb-6 space-y-4">
                            <div>
                                <h3 className="text-xl font-bold tracking-tight text-base-content">{artist?.name}</h3>
                                
                                {/* Federated Handle */}
                                <div 
                                    className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full bg-base-300 text-xs text-primary font-mono cursor-pointer hover:bg-primary/10 transition-colors"
                                    onClick={() => handleCopyHandle(fediverseHandle)}
                                    title="Click to copy handle"
                                >
                                    <span className="truncate max-w-[200px] sm:max-w-xs">{fediverseHandle}</span>
                                    {copied ? <Check size={12} className="text-success" /> : <Copy size={12} className="opacity-60" />}
                                </div>
                            </div>

                            {/* Bio */}
                            <p className="text-sm opacity-80 leading-relaxed min-h-[40px]">
                                {artist?.bio || artist?.description || "Welcome to my corner of the Fediverse. Listen to my music and stay updated!"}
                            </p>

                            {/* Key statistics */}
                            <div className="grid grid-cols-3 gap-2 py-3 border-y border-base-content/5 text-center text-xs">
                                <div>
                                    <div className="font-bold text-base text-base-content">{notes.length}</div>
                                    <div className="opacity-50">Posts</div>
                                </div>
                                <div>
                                    <div className="font-bold text-base text-base-content">{followers.length}</div>
                                    <div className="opacity-50">Followers</div>
                                </div>
                                <div>
                                    <div className="font-bold text-base text-base-content">{artist?.releases?.length || 0}</div>
                                    <div className="opacity-50">Releases</div>
                                </div>
                            </div>

                            {/* Social Sync Status Info */}
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-base-300/40 text-xs leading-normal opacity-70">
                                <Globe size={16} className="text-accent flex-shrink-0" />
                                <span>Linked globally via ActivityPub. Posts will push to Mastodon and followings in real-time.</span>
                            </div>
                        </div>
                    </div>

                    {/* Follow Requests (Pending) */}
                    {pendingRequests.length > 0 && (
                        <div className="card-m3 bg-warning/5 border border-warning/10 rounded-2xl shadow-md p-6 mb-6">
                            <h3 className="font-bold text-lg flex items-center gap-2 mb-4 text-warning">
                                <Users size={18} /> Follow Requests ({pendingRequests.length})
                            </h3>
                            <div className="grid gap-3">
                                {pendingRequests.map(req => (
                                    <div key={req.uri} className="flex items-center justify-between gap-3 p-2 bg-base-100/50 rounded-xl border border-base-content/5 hover:border-warning/20 transition-all duration-short-4">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="avatar placeholder flex-shrink-0">
                                                <div className="w-9 h-9 rounded-full bg-neutral text-neutral-content shadow-sm overflow-hidden">
                                                    {req.actor?.icon_url ? (
                                                        <img 
                                                            src={req.actor.icon_url} 
                                                            alt={req.actor.name} 
                                                            onError={(e) => {
                                                                e.currentTarget.style.display = 'none';
                                                            }}
                                                        />
                                                    ) : (
                                                        <span className="text-sm font-semibold">{req.actor?.name?.[0] || '?'}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="overflow-hidden">
                                                <div className="font-bold text-xs truncate text-base-content">{req.actor?.name || 'Anonymous listener'}</div>
                                                <div className="text-[10px] opacity-50 truncate font-mono" title={req.uri}>
                                                    @{req.actor?.username || 'unknown'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-1.5 flex-shrink-0">
                                            <button 
                                                className="btn btn-xs btn-success rounded-full text-[10px] font-bold px-3 border-none hover:opacity-90"
                                                onClick={() => handleAcceptRequest(req.uri)}
                                            >
                                                Accept
                                            </button>
                                            <button 
                                                className="btn btn-xs btn-error btn-outline rounded-full text-[10px] font-bold px-3 hover:bg-error hover:text-error-content"
                                                onClick={() => handleRejectRequest(req.uri)}
                                            >
                                                Reject
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Followers Card */}
                    <div className="card-m3 bg-base-200/40 border border-base-content/5 rounded-2xl shadow-md p-6">
                        <h3 className="font-bold text-lg flex items-center gap-2 mb-4">
                            <Users size={18} className="text-primary"/> Followers ({followers.length})
                        </h3>

                        {followers.length === 0 && !loading ? (
                            <div className="text-center py-8 opacity-50 text-sm">
                                No followers yet. Sync your artist profile or share your handle on Mastodon to invite listeners!
                            </div>
                        ) : (
                            <div className="grid gap-3 max-h-[350px] overflow-y-auto scrollbar-thin pr-1">
                                {followers.map(follower => {
                                    const key = follower.uri;
                                    const isFollowingBack = !!followedBack[key];
                                    return (
                                        <div key={key} className="flex items-center justify-between gap-3 p-2 bg-base-100/50 rounded-xl border border-base-content/5 hover:border-primary/20 transition-all duration-short-4">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="avatar placeholder flex-shrink-0">
                                                    <div className="w-9 h-9 rounded-full bg-neutral text-neutral-content shadow-sm overflow-hidden">
                                                        {follower.actor?.icon_url ? (
                                                            <img 
                                                                src={follower.actor.icon_url} 
                                                                alt={follower.actor.name} 
                                                                onError={(e) => {
                                                                    e.currentTarget.style.display = 'none';
                                                                }}
                                                            />
                                                        ) : (
                                                            <span className="text-sm font-semibold">{follower.actor?.name?.[0] || '?'}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="overflow-hidden">
                                                    <div className="font-bold text-xs truncate text-base-content">{follower.actor?.name || 'Anonymous listener'}</div>
                                                    <div className="text-[10px] opacity-50 truncate font-mono" title={follower.uri}>
                                                        @{follower.actor?.username || 'unknown'}
                                                    </div>
                                                </div>
                                            </div>

                                            <button 
                                                className={`btn btn-xs rounded-full border-none text-[10px] font-bold ${isFollowingBack ? 'bg-primary/20 text-primary' : 'bg-neutral hover:bg-neutral-focus text-neutral-content'}`}
                                                onClick={() => toggleFollowBack(key)}
                                            >
                                                {isFollowingBack ? 'Followed' : 'Follow back'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right/Main - Composer & Timeline (lg:col-span-8) */}
                <div className="lg:col-span-8 space-y-6">

                    {/* Integrated Premium Inline Composer */}
                    <div className={`card-m3 border rounded-2xl p-4 bg-base-200/40 backdrop-blur-md transition-all duration-medium-2 ${isComposerFocused ? 'border-primary/50 shadow-lg ring-1 ring-primary/10' : 'border-base-content/5'}`}>
                        <form onSubmit={handleCreatePost} className="space-y-3">
                            <div className="flex gap-4 items-start">
                                {/* Small Avatar */}
                                <div className="avatar flex-shrink-0">
                                    <div className="w-10 h-10 rounded-full border border-base-content/5 bg-base-300">
                                        <img 
                                            src={artist ? API.getArtistCoverUrl(artist.id) : ''} 
                                            alt={artist?.name} 
                                            onError={(e) => {
                                                (e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(artist?.name || 'TC')}`;
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Textarea Wrapper */}
                                <div className="flex-grow">
                                    <textarea
                                        ref={composerTextareaRef}
                                        className="textarea border-none bg-transparent w-full p-0 pt-1 text-base placeholder:text-base-content/40 focus:outline-none focus:ring-0 resize-none min-h-[64px] scrollbar-thin"
                                        placeholder={`Compose updates for the community...`}
                                        value={composerContent}
                                        onChange={e => setComposerContent(e.target.value)}
                                        onFocus={() => setIsComposerFocused(true)}
                                        maxLength={550}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Active Action Panel */}
                            {isComposerFocused && (
                                <div className="flex items-center justify-between pt-3 border-t border-base-content/5 animate-fade-in">
                                    {/* Left controls: Visibility Setting */}
                                    <div className="dropdown dropdown-top dropdown-right">
                                        <div 
                                            tabIndex={0} 
                                            role="button" 
                                            className="btn btn-sm btn-ghost rounded-full gap-1 text-xs px-3 hover:bg-base-300"
                                        >
                                            {composerVisibility === 'public' && <Globe size={14} className="text-primary" />}
                                            {composerVisibility === 'unlisted' && <Eye size={14} className="text-accent" />}
                                            {composerVisibility === 'private' && <Lock size={14} className="text-warning" />}
                                            <span className="capitalize">{composerVisibility === 'private' ? 'Followers' : composerVisibility}</span>
                                        </div>
                                        <ul tabIndex={0} className="dropdown-content menu bg-base-200 border border-base-content/5 rounded-box z-[1] w-48 p-1.5 shadow-xl mb-1">
                                            <li>
                                                <button 
                                                    type="button" 
                                                    className={`gap-2 rounded-lg text-xs py-2 ${composerVisibility === 'public' ? 'active bg-primary text-primary-content' : ''}`}
                                                    onClick={() => setComposerVisibility('public')}
                                                >
                                                    <Globe size={14} /> <span>Public (🌐)</span>
                                                </button>
                                            </li>
                                            <li>
                                                <button 
                                                    type="button" 
                                                    className={`gap-2 rounded-lg text-xs py-2 ${composerVisibility === 'unlisted' ? 'active bg-primary text-primary-content' : ''}`}
                                                    onClick={() => setComposerVisibility('unlisted')}
                                                >
                                                    <Eye size={14} /> <span>Unlisted (👁️)</span>
                                                </button>
                                            </li>
                                            <li>
                                                <button 
                                                    type="button" 
                                                    className={`gap-2 rounded-lg text-xs py-2 ${composerVisibility === 'private' ? 'active bg-primary text-primary-content' : ''}`}
                                                    onClick={() => setComposerVisibility('private')}
                                                >
                                                    <Lock size={14} /> <span>Followers-only (🔒)</span>
                                                </button>
                                            </li>
                                        </ul>
                                    </div>

                                    {/* Right controls: Char Count and Publish button */}
                                    <div className="flex items-center gap-3">
                                        {/* SVG Character Counter */}
                                        <div className="relative flex items-center justify-center">
                                            <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
                                                <circle
                                                    stroke="rgba(255, 255, 255, 0.05)"
                                                    fill="transparent"
                                                    strokeWidth={stroke}
                                                    r={normalizedRadius}
                                                    cx={radius}
                                                    cy={radius}
                                                />
                                                <circle
                                                    stroke={composerContent.length > 500 ? 'var(--color-error)' : composerContent.length > 420 ? 'var(--color-warning)' : 'var(--color-primary)'}
                                                    fill="transparent"
                                                    strokeWidth={stroke}
                                                    strokeDasharray={circumference + ' ' + circumference}
                                                    style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.1s ease-out' }}
                                                    r={normalizedRadius}
                                                    cx={radius}
                                                    cy={radius}
                                                />
                                            </svg>
                                            
                                            {/* Numeric fallback or indicators */}
                                            {composerContent.length >= 450 && (
                                                <span className={`absolute text-[8px] font-bold ${composerContent.length > 500 ? 'text-error' : 'text-base-content'}`}>
                                                    {500 - composerContent.length}
                                                </span>
                                            )}
                                        </div>

                                        <button 
                                            type="submit" 
                                            className="btn btn-sm btn-primary rounded-full px-4 gap-1.5 shadow-md"
                                            disabled={composerLoading || composerContent.trim().length === 0 || composerContent.length > 500}
                                        >
                                            {composerLoading ? (
                                                <span className="loading loading-spinner loading-xs" />
                                            ) : (
                                                <>
                                                    <Send size={12} />
                                                    <span>Publish</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </form>
                    </div>

                    {/* Timeline Feed Container */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center px-1">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <MessageSquare size={18} className="text-secondary"/> Federated Feed Timeline
                            </h3>
                            <div className="text-xs opacity-50 font-medium font-mono">
                                Realtime Outbox Activities
                            </div>
                        </div>

                        {/* Notes Skeletons or Empty / Content Render */}
                        {loading && notes.length === 0 ? (
                            <div className="space-y-4">
                                {[1, 2].map(n => (
                                    <div key={n} className="card-m3 border border-base-content/5 rounded-2xl bg-base-200/20 p-6 animate-pulse space-y-4">
                                        <div className="flex gap-4">
                                            <div className="w-11 h-11 bg-base-300 rounded-full flex-shrink-0" />
                                            <div className="flex-1 space-y-2">
                                                <div className="h-4 bg-base-300 rounded w-1/3" />
                                                <div className="h-3 bg-base-300 rounded w-1/4" />
                                            </div>
                                        </div>
                                        <div className="h-20 bg-base-300 rounded-xl" />
                                    </div>
                                ))}
                            </div>
                        ) : notes.length === 0 ? (
                            <div className="text-center py-16 opacity-50 border-2 border-dashed border-base-content/5 rounded-2xl bg-base-200/10">
                                <AlertTriangle className="mx-auto mb-3 opacity-60 text-secondary" size={32}/>
                                <h4 className="font-bold text-base-content text-lg">No Federated Activities</h4>
                                <p className="text-xs max-w-sm mx-auto mt-1">You haven't posted anything to the Fediverse yet. Compose a post above or sync to broadcast your existing creations!</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {correlatedNotes.map(note => {
                                    const noteFavState = favorites[note.id] || { active: false, count: 0 };
                                    const noteBoostState = boosts[note.id] || { active: false, count: 0 };
                                    const isRepliesOpen = !!showReplies[note.id];
                                    const comments = repliesList[note.id] || [];

                                    return (
                                        <div 
                                            key={note.id} 
                                            className="card-m3 bg-base-200/20 hover:bg-base-200/40 border border-base-content/5 rounded-2xl transition-all duration-medium-2 shadow-sm"
                                        >
                                            <div className="p-6 space-y-4">
                                                
                                                {/* Post Header */}
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex gap-3">
                                                        {/* Circular Avatar */}
                                                        <div className="avatar flex-shrink-0">
                                                            <div className="w-11 h-11 rounded-full border border-base-content/5 bg-base-300 shadow-inner">
                                                                <img 
                                                                    src={artist ? API.getArtistCoverUrl(artist.id) : ''} 
                                                                    alt={artist?.name} 
                                                                    onError={(e) => {
                                                                        (e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(artist?.name || 'TC')}`;
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Artist info & dynamic handle */}
                                                        <div>
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="font-bold text-sm text-base-content hover:underline cursor-pointer">{artist?.name}</span>
                                                                <span className="text-[10px] opacity-40 font-mono">
                                                                    @{artist?.slug || 'artist'}@{window.location.hostname}
                                                                </span>
                                                            </div>

                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                {/* Relative timestamp */}
                                                                <span className="text-xs opacity-50" title={new Date(note.published_at).toLocaleString()}>
                                                                    {getRelativeTime(note.published_at)}
                                                                </span>
                                                                <span className="opacity-30 text-xs">•</span>
                                                                {/* Visibility settings */}
                                                                <div className="flex items-center opacity-50" title={`Visibility: ${note.visibility}`}>
                                                                    {note.visibility === 'public' && <Globe size={11} />}
                                                                    {note.visibility === 'unlisted' && <Eye size={11} />}
                                                                    {note.visibility === 'private' && <Lock size={11} />}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Delete button (with processing check) */}
                                                    <button
                                                        className="btn btn-square btn-ghost btn-sm text-error/60 hover:text-error hover:bg-error/10 rounded-full"
                                                        onClick={() => handleDelete(note)}
                                                        disabled={!!processingId}
                                                        title="Delete Activity"
                                                    >
                                                        {processingId === note.id ? (
                                                            <span className="loading loading-spinner loading-xs" />
                                                        ) : (
                                                            <Trash2 size={15} />
                                                        )}
                                                    </button>
                                                </div>

                                                {/* Post Content Body */}
                                                <div className="space-y-3 pl-0 sm:pl-14">
                                                    
                                                    {/* If simple post */}
                                                    {note.note_type === 'post' && (
                                                        <p className="text-base leading-relaxed text-base-content/90 whitespace-pre-wrap">
                                                            {note.postContent}
                                                        </p>
                                                    )}

                                                    {/* If release (Embedded premium card) */}
                                                    {note.note_type === 'release' && (
                                                        <div className="space-y-2">
                                                            <p className="text-sm opacity-70">Published a new musical work to the grid:</p>
                                                            
                                                            {note.releaseData ? (
                                                                <div className="flex flex-col sm:flex-row gap-4 p-4 bg-base-100 border border-base-content/5 rounded-2xl hover:border-primary/20 transition-all duration-medium-2 group shadow-inner">
                                                                    {/* Cover image with scale hover */}
                                                                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-base-200 shadow-md relative group/cover flex-shrink-0 mx-auto sm:mx-0">
                                                                        <img 
                                                                            src={API.getReleaseCoverUrl(note.releaseData.id)} 
                                                                            alt={note.releaseData.title}
                                                                            className="object-cover w-full h-full transition-transform duration-medium-4 group-hover/cover:scale-105"
                                                                            onError={(e) => {
                                                                                // Try album cover URL fallback
                                                                                (e.currentTarget as HTMLImageElement).src = API.getAlbumCoverUrl(note.releaseData.id) || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(note.releaseData.title)}`;
                                                                            }}
                                                                        />
                                                                    </div>

                                                                    {/* Release Details */}
                                                                    <div className="flex-1 flex flex-col justify-between text-center sm:text-left">
                                                                        <div className="space-y-1">
                                                                            <h4 className="font-bold text-base-content text-lg hover:text-primary transition-colors">
                                                                                {note.releaseData.title}
                                                                            </h4>
                                                                            
                                                                            <div className="flex items-center gap-1.5 justify-center sm:justify-start flex-wrap">
                                                                                <span className="badge badge-primary badge-outline badge-xs py-1.5 font-bold uppercase tracking-wider">
                                                                                    {note.releaseData.type || 'Release'}
                                                                                </span>
                                                                                {note.releaseData.genre && (
                                                                                    <span className="badge badge-accent badge-xs py-1.5">
                                                                                        {note.releaseData.genre}
                                                                                    </span>
                                                                                )}
                                                                                {note.releaseData.year && (
                                                                                    <span className="text-xs opacity-50 font-medium">
                                                                                        ({note.releaseData.year})
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            
                                                                            <p className="text-xs opacity-60 line-clamp-2 pt-1 font-medium leading-relaxed">
                                                                                {note.releaseData.description || 'Listen to our brand new production direct in the network grid, supporting sovereign artists.'}
                                                                            </p>
                                                                        </div>

                                                                        {/* Listen CTA */}
                                                                        <a 
                                                                            href={`#/release/${note.releaseData.slug || note.content_slug}`}
                                                                            className="btn btn-xs sm:btn-sm btn-primary rounded-full w-fit gap-1.5 mt-3 mx-auto sm:mx-0 shadow-sm border-none bg-primary hover:bg-primary-hover"
                                                                        >
                                                                            <Disc size={13} className="animate-spin" style={{ animationDuration: '4s' }} />
                                                                            <span>Listen on Tunecamp</span>
                                                                            <ExternalLink size={11} className="opacity-70" />
                                                                        </a>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                // Generic Release Fallback
                                                                <div className="flex items-center gap-4 p-4 bg-base-100 border border-base-content/5 rounded-2xl">
                                                                    <div className="p-4 bg-secondary/10 rounded-xl text-secondary flex-shrink-0">
                                                                        <Music size={28} />
                                                                    </div>
                                                                    <div>
                                                                        <h4 className="font-bold text-base-content text-base">{note.content_title || 'Untitled Release'}</h4>
                                                                        <span className="badge badge-ghost badge-sm mt-1">External Fediverse Broadcast</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Mastodon action footer */}
                                                    <div className="flex items-center justify-between text-base-content/55 pt-3 max-w-md select-none">
                                                        
                                                        {/* Reply Action */}
                                                        <button 
                                                            className={`flex items-center gap-1.5 hover:text-primary transition-colors text-xs font-semibold py-1.5 px-2.5 rounded-full hover:bg-primary/5 cursor-pointer ${isRepliesOpen ? 'text-primary' : ''}`}
                                                            onClick={() => setShowReplies(prev => ({ ...prev, [note.id]: !prev[note.id] }))}
                                                        >
                                                            <MessageCircle size={15} />
                                                            <span>{comments.length}</span>
                                                        </button>

                                                        {/* Boost Action */}
                                                        <button 
                                                            className={`flex items-center gap-1.5 hover:text-success transition-all text-xs font-semibold py-1.5 px-2.5 rounded-full hover:bg-success/5 cursor-pointer ${noteBoostState.active ? 'text-success scale-105' : ''}`}
                                                            onClick={() => toggleBoost(note.id)}
                                                        >
                                                            <Repeat size={15} className={`transition-transform duration-medium-4 ${noteBoostState.active ? 'rotate-180' : ''}`} />
                                                            <span>{noteBoostState.count}</span>
                                                        </button>

                                                        {/* Favorite Action */}
                                                        <button 
                                                            className={`flex items-center gap-1.5 hover:text-error transition-all text-xs font-semibold py-1.5 px-2.5 rounded-full hover:bg-error/5 cursor-pointer ${noteFavState.active ? 'text-error scale-110' : ''}`}
                                                            onClick={() => toggleFavorite(note.id)}
                                                        >
                                                            <Heart 
                                                                size={15} 
                                                                fill={noteFavState.active ? "currentColor" : "transparent"} 
                                                                className={noteFavState.active ? "animate-pulse" : ""}
                                                                style={{ animationDuration: '0.6s' }}
                                                            />
                                                            <span>{noteFavState.count}</span>
                                                        </button>

                                                        {/* Broadcast indicator */}
                                                        <div className="text-[10px] font-semibold opacity-40 px-2 py-0.5 rounded-full bg-base-300">
                                                            ActivityPub Note
                                                        </div>
                                                    </div>

                                                    {/* Interactive Comments Drawer */}
                                                    {isRepliesOpen && (
                                                        <div className="mt-4 pt-4 border-t border-base-content/5 space-y-3 animate-slide-down">
                                                            <div className="space-y-3">
                                                                {comments.map(c => (
                                                                    <div key={c.id} className="flex gap-3 bg-base-100/30 p-3 rounded-xl border border-base-content/5">
                                                                        <div className="avatar flex-shrink-0">
                                                                            <div className="w-8 h-8 rounded-full bg-neutral flex items-center justify-center text-xs font-semibold">
                                                                                {c.authorName[0]}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex-1 text-xs">
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="font-bold text-base-content">{c.authorName}</span>
                                                                                <span className="opacity-40">{c.time}</span>
                                                                            </div>
                                                                            <div className="font-mono opacity-50 mt-0.5">{c.authorHandle}</div>
                                                                            <p className="mt-1.5 opacity-85 leading-normal">{c.content}</p>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            {/* Add Reply Input */}
                                                            <div className="flex gap-2 pt-2 items-center">
                                                                <input 
                                                                    type="text" 
                                                                    className="input input-sm select-bordered w-full rounded-full bg-base-100/50 border-base-content/10 px-4 focus:outline-none focus:border-primary/50 text-xs"
                                                                    placeholder="Add reply..."
                                                                    value={newReplyTexts[note.id] || ''}
                                                                    onChange={e => setNewReplyTexts(prev => ({ ...prev, [note.id]: e.target.value }))}
                                                                    onKeyDown={e => {
                                                                        if (e.key === 'Enter') handleAddMockComment(note.id);
                                                                    }}
                                                                />
                                                                <button 
                                                                    className="btn btn-sm btn-circle btn-primary shadow-sm"
                                                                    onClick={() => handleAddMockComment(note.id)}
                                                                >
                                                                    <Send size={11} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};


