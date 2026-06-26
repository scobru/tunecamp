import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
    RefreshCw, Trash2, MessageSquare, Disc, AlertTriangle, Users,
    Globe, Eye, Lock, Send, Heart, Repeat, MessageCircle, ExternalLink, Copy, Check, Music,
    Edit, Image as ImageIcon
} from 'lucide-react';
import API from '../../services/api';
import { useAuthStore } from '../../stores/useAuthStore';
import type { Artist, Post } from '../../types';
import { renderMarkdown } from '../../utils/markdown';
import { notify } from '../../utils/notify';
import { CreatePostModal } from '../modals/CreatePostModal';

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
    likes_count?: number;
    announces_count?: number;
    replies_count?: number;
}

interface ApActorRef {
    name: string;
    username: string;
    icon_url: string | null;
    uri: string;
}

interface Follower {
    uri: string;
    created_at: string;
    is_following_back?: boolean;
    actor: ApActorRef | null;
}

interface ApReplyItem {
    id: number;
    reply_uri: string;
    actor_uri: string;
    content: string;
    published_at: string;
    actor: ApActorRef | null;
}

interface ApInteractionItem {
    actor_uri: string;
    type: 'like' | 'announce';
    created_at: string;
    actor: ApActorRef | null;
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
    const [composerTitle, setComposerTitle] = useState('');
    const [composerSummary, setComposerSummary] = useState('');
    const [composerVisibility, setComposerVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
    const [composerLoading, setComposerLoading] = useState(false);
    const [isComposerFocused, setIsComposerFocused] = useState(false);
    const [composerTab, setComposerTab] = useState<'write' | 'preview'>('write');
    const [composerImageUploading, setComposerImageUploading] = useState(false);
    const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
    const composerFileInputRef = useRef<HTMLInputElement>(null);



    // Micro-interactions States
    const [copied, setCopied] = useState(false);

    // Replies (federated) — keyed by note_id (string URI)
    const [showReplies, setShowReplies] = useState<Record<string, boolean>>({});
    const [repliesByNote, setRepliesByNote] = useState<Record<string, ApReplyItem[]>>({});
    const [repliesLoading, setRepliesLoading] = useState<Record<string, boolean>>({});
    const [newReplyTexts, setNewReplyTexts] = useState<Record<string, string>>({});
    const [replySending, setReplySending] = useState<Record<string, boolean>>({});
    const [deletingReply, setDeletingReply] = useState<Record<string, boolean>>({});
    // Interactions popover (who liked / boosted) — read-only social proof
    const [interactionsModal, setInteractionsModal] = useState<{ noteId: string; type: 'like' | 'announce' } | null>(null);
    const [interactionsList, setInteractionsList] = useState<ApInteractionItem[]>([]);
    const [interactionsLoading, setInteractionsLoading] = useState(false);

    const isRoot = !!(user?.isRootAdmin || role === 'root_admin');
    const rawArtistId = adminUser?.artistId ?? user?.artistId;
    const validRaw = rawArtistId && rawArtistId !== 'null' && rawArtistId !== 'undefined' && rawArtistId !== '0';
    // Root admin without an artist always posts as the SITE instance actor (id = -1)
    const artistId: string | undefined = isRoot
        ? (validRaw ? String(rawArtistId) : "-1")
        : (validRaw ? String(rawArtistId) : undefined);
    // Safe resolved id — guarantees root admin always has a value even if artistId is somehow unset
    const effectiveArtistId: string = artistId || (isRoot ? "-1" : "");

    const handleSync = async () => {
        if (!effectiveArtistId) return;
        if (!confirm('This will re-broadcast all your public releases and posts to the Fediverse (Mastodon, etc) to ensure they are in sync. Continue?')) return;
        
        setLoading(true);
        try {
            await API.syncArtistActivityPub(effectiveArtistId);
            notify.success('Synchronization complete.');
            loadData(effectiveArtistId);
        } catch (e: any) {
            console.error(e);
            notify.error(e, 'Failed to synchronize');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (effectiveArtistId) {
            loadData(effectiveArtistId);
        }

        const handleRefresh = () => {
            if (effectiveArtistId) loadData(effectiveArtistId);
        };

        window.addEventListener('refresh-social-content', handleRefresh);
        return () => window.removeEventListener('refresh-social-content', handleRefresh);
    }, [effectiveArtistId]);

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
            notify.error(e, "Failed to delete note");
        } finally {
            setProcessingId(null);
        }
    };

    const handleEditPost = (note: any) => {
        const postToEdit = {
            id: note.content_id,
            content: note.postContent,
            title: note.postTitle,
            summary: note.postSummary,
            visibility: note.visibility,
            artistId: note.artist_id
        };
        const event = new CustomEvent('open-create-post-modal', { detail: postToEdit });
        document.dispatchEvent(event);
    };

    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!composerContent.trim() || composerContent.length > 5000 || !effectiveArtistId) return;

        setComposerLoading(true);
        try {
            await API.createPost(Number(effectiveArtistId), composerContent, composerVisibility, composerTitle || undefined, composerSummary || undefined);
            setComposerContent('');
            setComposerTitle('');
            setComposerSummary('');
            setComposerTab('write');
            setIsComposerFocused(false);
            await loadData(effectiveArtistId);
        } catch (e: any) {
            console.error("Failed to create post", e);
            notify.error(e, "Failed to create post");
        } finally {
            setComposerLoading(false);
        }
    };

    // Upload an image and insert its Markdown at the cursor — same flow as CreatePostModal.
    const handleComposerImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setComposerImageUploading(true);
        try {
            const res = await API.uploadPostMedia(file);
            if (res?.url) {
                const snippet = `![Image Description](${res.url})`;
                const ta = composerTextareaRef.current;
                if (ta) {
                    const start = ta.selectionStart, end = ta.selectionEnd;
                    setComposerContent(prev => prev.slice(0, start) + snippet + prev.slice(end));
                } else {
                    setComposerContent(prev => prev + snippet);
                }
                setIsComposerFocused(true);
            } else {
                notify.error(null, 'Failed to upload image');
            }
        } catch (err: any) {
            notify.error(err, 'Failed to upload image');
        } finally {
            setComposerImageUploading(false);
            if (composerFileInputRef.current) composerFileInputRef.current.value = '';
        }
    };

    const handleCopyHandle = (handle: string) => {
        navigator.clipboard.writeText(handle);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Open the read-only "who liked / boosted" list for a note (lazy load)
    const openInteractions = async (noteId: string, type: 'like' | 'announce') => {
        setInteractionsModal({ noteId, type });
        setInteractionsLoading(true);
        setInteractionsList([]);
        try {
            const data = await API.getNoteInteractions(noteId);
            setInteractionsList((data as ApInteractionItem[]).filter(i => i.type === type));
        } catch (e) {
            console.error("Failed to load interactions", e);
        } finally {
            setInteractionsLoading(false);
        }
    };



    const handleAcceptRequest = async (actorUri: string) => {
        if (!effectiveArtistId) return;
        try {
            await API.acceptFollower(effectiveArtistId, actorUri);
            loadData(effectiveArtistId);
        } catch (e: any) {
            console.error(e);
            notify.error(e, "Failed to accept follower");
        }
    };

    const handleRejectRequest = async (actorUri: string) => {
        if (!effectiveArtistId) return;
        try {
            await API.rejectFollower(effectiveArtistId, actorUri);
            loadData(effectiveArtistId);
        } catch (e: any) {
            console.error(e);
            notify.error(e, "Failed to reject follower");
        }
    };

    // Lazy-load the federated replies for a note
    const loadReplies = async (noteId: string) => {
        setRepliesLoading(prev => ({ ...prev, [noteId]: true }));
        try {
            const data = await API.getNoteReplies(noteId);
            setRepliesByNote(prev => ({ ...prev, [noteId]: data as ApReplyItem[] }));
        } catch (e) {
            console.error("Failed to load replies", e);
        } finally {
            setRepliesLoading(prev => ({ ...prev, [noteId]: false }));
        }
    };

    const toggleReplies = (noteId: string) => {
        const willOpen = !showReplies[noteId];
        setShowReplies(prev => ({ ...prev, [noteId]: willOpen }));
        if (willOpen && repliesByNote[noteId] === undefined) {
            loadReplies(noteId);
        }
    };

    // Post a real federated reply (Create(Note) with inReplyTo)
    const handlePostReply = async (noteId: string) => {
        const text = (newReplyTexts[noteId] || '').trim();
        if (!text || replySending[noteId]) return;
        setReplySending(prev => ({ ...prev, [noteId]: true }));
        try {
            await API.postNoteReply(noteId, text);
            setNewReplyTexts(prev => ({ ...prev, [noteId]: '' }));
            await loadReplies(noteId);
            // Reflect the new reply count locally without a full reload
            setNotes(prev => prev.map(n => n.note_id === noteId
                ? { ...n, replies_count: (n.replies_count ?? 0) + 1 }
                : n));
        } catch (e: any) {
            console.error("Failed to post reply", e);
            notify.error(e, "Failed to send reply");
        } finally {
            setReplySending(prev => ({ ...prev, [noteId]: false }));
        }
    };

    // Delete one of your own replies (sends a federated Delete(Note))
    const handleDeleteReply = async (noteId: string, replyUri: string) => {
        if (deletingReply[replyUri]) return;
        if (!confirm("Delete this reply? This sends a Delete to anyone who received it.")) return;
        setDeletingReply(prev => ({ ...prev, [replyUri]: true }));
        try {
            await API.deleteNoteReply(replyUri);
            setRepliesByNote(prev => ({
                ...prev,
                [noteId]: (prev[noteId] || []).filter(r => r.reply_uri !== replyUri),
            }));
            setNotes(prev => prev.map(n => n.note_id === noteId
                ? { ...n, replies_count: Math.max(0, (n.replies_count ?? 1) - 1) }
                : n));
        } catch (e: any) {
            console.error("Failed to delete reply", e);
            notify.error(e, "Failed to delete reply");
        } finally {
            setDeletingReply(prev => ({ ...prev, [replyUri]: false }));
        }
    };



    const stripHtml = (html: string) => (html || '').replace(/<[^>]*>/g, '').trim();

    // Correlate AP notes with database entities
    const correlatedNotes = useMemo(() => {
        return notes.map(note => {
            let postContent = '';
            let matchedVisibility: 'public' | 'private' | 'unlisted' = 'public';
            let releaseData: any = null;
            let postTitle = '';
            let postSummary = '';

            if (note.note_type === 'post') {
                const post = posts.find(p => String(p.id) === String(note.content_id));
                if (post) {
                    postContent = post.content;
                    matchedVisibility = post.visibility || (post.isPublic ? 'public' : 'private');
                    postTitle = post.title || '';
                    postSummary = post.summary || '';
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
                postTitle,
                postSummary,
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
    const charPercentage = Math.min((composerContent.length / 5000) * 100, 100);
    const radius = 14;
    const stroke = 3;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (charPercentage / 100) * circumference;

    const fediverseHandle = artist ? `@${artist.slug || artist.name.toLowerCase().replace(/\s+/g, '')}@${window.location.host}` : '';

    // Block only non-root users without an artist; root admin always posts as site actor
    if (!effectiveArtistId && !isRoot) {
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
                        className="btn btn-primary btn-outline gap-2 flex-1 sm:flex-initial tooltip tooltip-bottom"
                        onClick={handleSync}
                        disabled={loading}
                        data-tip="Synchronize with Fediverse"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''}/> Sync Content
                    </button>
                    <button 
                        className="btn btn-square btn-ghost tooltip tooltip-bottom"
                        onClick={() => loadData(effectiveArtistId)}
                        disabled={loading}
                        data-tip="Refresh list"
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
                    <div className="card-m3 overflow-hidden border border-base-content/5 bg-base-200/40 backdrop-blur-md rounded-2xl shadow-level-1 relative group">
                        
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
                                <div className="w-20 h-20 rounded-full border-4 border-base-100 shadow-level-1 overflow-hidden bg-base-300 relative group/avatar">
                                    {artist ? (
                                        <img
                                            src={(artist as any).photo_path
                                                ? API.getArtistCoverUrl(artist.id)
                                                : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(artist.name)}`}
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
                                    className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full bg-base-300 text-xs text-primary font-mono cursor-pointer hover:bg-primary/10 transition-colors tooltip tooltip-bottom"
                                    onClick={() => handleCopyHandle(fediverseHandle)}
                                    data-tip="Click to copy handle"
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

                            {/* Federation status — two distinct things that are easy to conflate:
                                native ActivityPub (always on for a published profile) vs. the
                                optional Mastodon cross-posting bridge configured under Automation. */}
                            <div className="space-y-2">
                                {/* 1. Native ActivityPub federation — always active */}
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-base-300/40 text-xs leading-normal">
                                    <Globe size={16} className="text-success flex-shrink-0" />
                                    <span className="opacity-80">
                                        <span className="font-semibold">Federated via ActivityPub.</span>{' '}
                                        Followable from Mastodon/Pleroma{fediverseHandle ? <> at <span className="font-mono">{fediverseHandle}</span></> : null}; posts reach your followers in real-time.
                                    </span>
                                </div>

                                {/* 2. Mastodon cross-posting — separate, optional bridge to an external account */}
                                {artist?.postParams?.instance ? (
                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-base-300/40 text-xs leading-normal">
                                        <Repeat size={16} className="text-success flex-shrink-0" />
                                        <span className="opacity-80">
                                            <span className="font-semibold">Mastodon cross-posting active.</span>{' '}
                                            Mirroring to <span className="font-mono">{artist.postParams.instance}</span>.
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-base-300/40 text-xs leading-normal">
                                        <Repeat size={16} className="text-base-content/40 flex-shrink-0" />
                                        <span className="opacity-60">
                                            <span className="font-semibold">Mastodon cross-posting not configured.</span>{' '}
                                            Optional — connect an external Mastodon account under the Automation tab to also mirror posts there.
                                        </span>
                                    </div>
                                )}
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
                                                <div className="text-xs opacity-50 truncate font-mono" title={req.uri}>
                                                    @{req.actor?.username || 'unknown'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-1.5 flex-shrink-0">
                                            <button 
                                                className="btn btn-xs btn-success rounded-full text-xs font-bold px-3 border-none hover:opacity-90"
                                                onClick={() => handleAcceptRequest(req.uri)}
                                            >
                                                Accept
                                            </button>
                                            <button 
                                                className="btn btn-xs btn-error btn-outline rounded-full text-xs font-bold px-3 hover:bg-error hover:text-error-content"
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
                                                    <div className="text-xs opacity-50 truncate font-mono" title={follower.uri}>
                                                        @{follower.actor?.username || 'unknown'}
                                                    </div>
                                                </div>
                                            </div>


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
                    <div className={`card-m3 border rounded-2xl p-4 bg-base-200/40 backdrop-blur-md transition-all duration-medium-2 ${isComposerFocused ? 'border-primary/50 shadow-level-1 ring-1 ring-primary/10' : 'border-base-content/5'}`}>
                        <form onSubmit={handleCreatePost} className="space-y-3">
                            <div className="flex gap-4 items-start">
                                {/* Small Avatar */}
                                <div className="avatar flex-shrink-0">
                                    <div className="w-10 h-10 rounded-full border border-base-content/5 bg-base-300">
                                        <img
                                            src={artist
                                                ? ((artist as any).photo_path
                                                    ? API.getArtistCoverUrl(artist.id)
                                                    : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(artist.name || 'TC')}`)
                                                : `https://api.dicebear.com/7.x/initials/svg?seed=TC`}
                                            alt={artist?.name}
                                            onError={(e) => {
                                                (e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(artist?.name || 'TC')}`;
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Textarea Wrapper */}
                                <div className="flex-grow space-y-2">
                                    {isComposerFocused && (
                                        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pb-1">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full sm:flex-grow">
                                                <input 
                                                    type="text"
                                                    className="input input-sm input-bordered w-full rounded-xl bg-base-200/50 border-base-content/10 focus:outline-none focus:border-primary px-3 py-1.5 text-xs font-semibold"
                                                    placeholder="Article Title (Optional)"
                                                    value={composerTitle}
                                                    onChange={e => setComposerTitle(e.target.value)}
                                                />
                                                <input 
                                                    type="text"
                                                    className="input input-sm input-bordered w-full rounded-xl bg-base-200/50 border-base-content/10 focus:outline-none focus:border-primary px-3 py-1.5 text-xs font-semibold"
                                                    placeholder="Article Summary (Optional)"
                                                    value={composerSummary}
                                                    onChange={e => setComposerSummary(e.target.value)}
                                                />
                                            </div>
                                            <div className="flex bg-base-300/60 p-0.5 rounded-lg text-xs self-end sm:self-center shrink-0">
                                                <button
                                                    type="button"
                                                    className={`px-3 py-1 rounded-md font-bold transition-all ${composerTab === 'write' ? 'bg-primary text-primary-content shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                                                    onClick={() => setComposerTab('write')}
                                                >
                                                    Write
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`px-3 py-1 rounded-md font-bold transition-all ${composerTab === 'preview' ? 'bg-primary text-primary-content shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                                                    onClick={() => setComposerTab('preview')}
                                                >
                                                    Preview
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {composerTab === 'write' ? (
                                        <textarea
                                            ref={composerTextareaRef}
                                            className={`textarea border-none bg-transparent w-full p-0 pt-1 text-base placeholder:text-base-content/40 focus:outline-none focus:ring-0 resize-y scrollbar-thin ${isComposerFocused ? 'min-h-[180px]' : 'min-h-[64px]'}`}
                                            placeholder={`Compose updates for the community... (Markdown supported)`}
                                            value={composerContent}
                                            onChange={e => setComposerContent(e.target.value)}
                                            onFocus={() => setIsComposerFocused(true)}
                                            maxLength={5500}
                                            required
                                        />
                                    ) : (
                                        <div 
                                            className="prose prose-sm prose-invert max-w-none p-3 rounded-xl bg-base-300/20 border border-base-content/10 min-h-[180px] max-h-[400px] overflow-y-auto scrollbar-thin select-text"
                                            dangerouslySetInnerHTML={{ __html: renderMarkdown(composerContent) || '<p class="opacity-40 italic">Nothing to preview yet...</p>' }}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Active Action Panel */}
                            {isComposerFocused && (
                                <div className="flex items-center justify-between pt-3 border-t border-base-content/5 animate-fade-in">
                                    {/* Left controls: Image upload + Visibility */}
                                    <div className="flex items-center gap-1">
                                    <input ref={composerFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleComposerImageUpload} />
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-ghost btn-circle text-base-content/60 hover:text-primary tooltip tooltip-top"
                                        data-tip="Add image"
                                        disabled={composerImageUploading}
                                        onClick={() => composerFileInputRef.current?.click()}
                                    >
                                        {composerImageUploading ? <span className="loading loading-spinner loading-xs" /> : <ImageIcon size={16} />}
                                    </button>
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
                                        <ul tabIndex={0} className="dropdown-content menu bg-base-200 border border-base-content/5 rounded-box z-[1] w-48 p-1.5 shadow-level-1 mb-1">
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
                                                    stroke={composerContent.length > 5000 ? 'var(--color-error)' : composerContent.length > 4200 ? 'var(--color-warning)' : 'var(--color-primary)'}
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
                                            {composerContent.length >= 4500 && (
                                                <span className={`absolute text-[8px] font-bold ${composerContent.length > 5000 ? 'text-error' : 'text-base-content'}`}>
                                                    {5000 - composerContent.length}
                                                </span>
                                            )}
                                        </div>

                                        <button
                                            type="submit"
                                            className="btn btn-sm btn-primary rounded-full px-4 gap-1.5 shadow-md"
                                            disabled={composerLoading || composerContent.trim().length === 0 || composerContent.length > 5000}
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
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-1">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <MessageSquare size={18} className="text-secondary"/> Timeline
                            </h3>
                            <div className="flex bg-base-300/60 p-0.5 rounded-xl text-xs">
                                <button
                                    type="button"
                                    className="px-3 py-1.5 rounded-lg font-bold capitalize transition-all bg-primary text-primary-content shadow-sm"
                                >
                                    My Posts
                                </button>
                            </div>
                        </div>

                        {/* My Posts Skeletons or Empty / Content Render */}
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
                                    const likesCount = note.likes_count ?? 0;
                                    const announcesCount = note.announces_count ?? 0;
                                    const repliesCount = note.replies_count ?? 0;
                                    const isRepliesOpen = !!showReplies[note.note_id];
                                    const comments = repliesByNote[note.note_id] || [];
                                    const isRepliesLoading = !!repliesLoading[note.note_id];

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
                                                                    src={artist
                                                                        ? ((artist as any).photo_path
                                                                            ? API.getArtistCoverUrl(artist.id)
                                                                            : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(artist.name || 'TC')}`)
                                                                        : `https://api.dicebear.com/7.x/initials/svg?seed=TC`}
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
                                                                <span className="text-xs opacity-40 font-mono">
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

                                                    <div className="flex gap-1">
                                                        {/* Edit button (only for posts, not releases) */}
                                                        {note.note_type === 'post' && (
                                                            <button
                                                                type="button"
                                                                className="btn btn-square btn-ghost btn-sm text-base-content/60 hover:text-primary hover:bg-primary/10 rounded-full"
                                                                onClick={() => handleEditPost(note)}
                                                                disabled={!!processingId}
                                                                title="Edit Activity"
                                                            >
                                                                <Edit size={15} />
                                                            </button>
                                                        )}

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
                                                </div>

                                                {/* Post Content Body */}
                                                <div className="space-y-3 pl-0 sm:pl-14">
                                                    {/* If simple post or premium Article */}
                                                    {note.note_type === 'post' && (
                                                        note.postTitle ? (
                                                            <div className="p-5 rounded-2xl bg-gradient-to-br from-base-300/40 to-base-200/10 border border-primary/10 space-y-3 shadow-inner hover:border-primary/20 transition-all duration-300">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="badge badge-primary badge-xs py-1.5 px-2.5 font-bold tracking-normal text-[11px] rounded-full">
                                                                        Article
                                                                    </span>
                                                                </div>
                                                                <h4 className="text-xl font-serif font-black text-prominent hover:text-primary transition-colors leading-snug">
                                                                    <Link to={`/post/${note.content_slug}`} className="hover:underline">
                                                                        {note.postTitle}
                                                                    </Link>
                                                                </h4>
                                                                {note.postSummary && (
                                                                    <p className="text-sm italic opacity-75 border-l-2 border-primary/40 pl-3 font-serif py-0.5 leading-relaxed">
                                                                        {note.postSummary}
                                                                    </p>
                                                                )}
                                                                <div 
                                                                    className="text-sm opacity-90 line-clamp-3 leading-relaxed font-serif pt-1 prose prose-sm prose-invert max-w-none"
                                                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(note.postContent) }}
                                                                />
                                                                <div className="pt-2">
                                                                    <Link 
                                                                        to={`/post/${note.content_slug}`}
                                                                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary-hover font-bold hover:underline"
                                                                    >
                                                                        <span>Read Full Article</span>
                                                                        <ExternalLink size={12} />
                                                                    </Link>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div 
                                                                className="text-base leading-relaxed text-base-content/90 prose prose-sm prose-invert max-w-none select-text"
                                                                dangerouslySetInnerHTML={{ __html: renderMarkdown(note.postContent) }}
                                                            />
                                                        )
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
                                                                                <span className="badge badge-primary badge-outline badge-xs py-1.5 font-bold tracking-normal">
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

                                                    {/* Mastodon action footer (counts are real federated data) */}
                                                    <div className="flex items-center justify-between text-base-content/55 pt-3 max-w-md select-none">

                                                        {/* Reply: opens the federated thread */}
                                                        <button
                                                            className={`flex items-center gap-1.5 hover:text-primary transition-colors text-xs font-semibold py-1.5 px-2.5 rounded-full hover:bg-primary/5 cursor-pointer ${isRepliesOpen ? 'text-primary' : ''}`}
                                                            onClick={() => toggleReplies(note.note_id)}
                                                            title="View and write replies"
                                                        >
                                                            <MessageCircle size={15} />
                                                            <span>{repliesCount}</span>
                                                        </button>

                                                        {/* Boosts received (read-only) — click to see who boosted */}
                                                        <button
                                                            className="flex items-center gap-1.5 hover:text-success transition-all text-xs font-semibold py-1.5 px-2.5 rounded-full hover:bg-success/5 cursor-pointer"
                                                            onClick={() => openInteractions(note.note_id, 'announce')}
                                                            title={announcesCount > 0 ? 'See who boosted' : 'No boosts yet'}
                                                        >
                                                            <Repeat size={15} />
                                                            <span>{announcesCount}</span>
                                                        </button>

                                                        {/* Likes received (read-only) — click to see who liked */}
                                                        <button
                                                            className="flex items-center gap-1.5 hover:text-error transition-all text-xs font-semibold py-1.5 px-2.5 rounded-full hover:bg-error/5 cursor-pointer"
                                                            onClick={() => openInteractions(note.note_id, 'like')}
                                                            title={likesCount > 0 ? 'See who liked' : 'No likes yet'}
                                                        >
                                                            <Heart size={15} fill={likesCount > 0 ? 'currentColor' : 'transparent'} />
                                                            <span>{likesCount}</span>
                                                        </button>

                                                        {/* Share to Mastodon (only for releases when cross-posting is configured) */}
                                                        {note.note_type === 'release' && artist?.postParams?.instance ? (
                                                            <button
                                                                className="btn btn-xs btn-outline btn-primary rounded-full gap-1 font-semibold"
                                                                onClick={async () => {
                                                                    try {
                                                                        await API.shareReleaseToMastodon(note.content_id);
                                                                        notify.success('Shared to Mastodon!');
                                                                    } catch (e: any) {
                                                                        notify.error(e, 'Failed to share');
                                                                    }
                                                                }}
                                                                title="Share this release to your connected Mastodon account"
                                                            >
                                                                <Repeat size={11} /> Share
                                                            </button>
                                                        ) : (
                                                            <div className="text-xs font-semibold opacity-40 px-2 py-0.5 rounded-full bg-base-300">
                                                                ActivityPub Note
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Federated replies thread */}
                                                    {isRepliesOpen && (
                                                        <div className="mt-4 pt-4 border-t border-base-content/5 space-y-3 animate-slide-down">
                                                            {isRepliesLoading && comments.length === 0 ? (
                                                                <div className="flex justify-center py-4">
                                                                    <span className="loading loading-spinner loading-sm opacity-40" />
                                                                </div>
                                                            ) : comments.length === 0 ? (
                                                                <div className="text-center text-xs opacity-40 py-2">
                                                                    No replies yet. Start the conversation below.
                                                                </div>
                                                            ) : (
                                                                <div className="space-y-3">
                                                                    {comments.map(c => {
                                                                        const isOwn = c.actor_uri?.includes(`/users/${artist?.slug}`);
                                                                        const displayName = c.actor?.name || (isOwn ? (artist?.name || 'You') : 'Fediverse user');
                                                                        const handle = c.actor?.username
                                                                            ? `@${c.actor.username}`
                                                                            : (isOwn ? `@${artist?.slug}@${window.location.hostname}` : c.actor_uri);
                                                                        return (
                                                                            <div key={c.reply_uri} className="flex gap-3 bg-base-100/30 p-3 rounded-xl border border-base-content/5">
                                                                                <div className="avatar flex-shrink-0">
                                                                                    <div className="w-8 h-8 rounded-full bg-neutral flex items-center justify-center text-xs font-semibold overflow-hidden">
                                                                                        {c.actor?.icon_url ? (
                                                                                            <img src={c.actor.icon_url} alt={displayName} onError={e => { e.currentTarget.style.display = 'none'; }} />
                                                                                        ) : (
                                                                                            <span>{displayName[0]?.toUpperCase()}</span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="flex-1 text-xs min-w-0">
                                                                                    <div className="flex items-center justify-between gap-2">
                                                                                        <span className="font-bold text-base-content truncate">{displayName}</span>
                                                                                        <div className="flex items-center gap-1 flex-shrink-0">
                                                                                            <span className="opacity-40">{getRelativeTime(c.published_at)}</span>
                                                                                            {isOwn && (
                                                                                                <button
                                                                                                    type="button"
                                                                                                    className="btn btn-ghost btn-xs btn-circle text-error/50 hover:text-error hover:bg-error/10"
                                                                                                    onClick={() => handleDeleteReply(note.note_id, c.reply_uri)}
                                                                                                    disabled={!!deletingReply[c.reply_uri]}
                                                                                                    title="Delete your reply"
                                                                                                >
                                                                                                    {deletingReply[c.reply_uri]
                                                                                                        ? <span className="loading loading-spinner loading-xs" />
                                                                                                        : <Trash2 size={12} />}
                                                                                                </button>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="font-mono opacity-50 mt-0.5 truncate" title={c.actor_uri}>{handle}</div>
                                                                                    <p className="mt-1.5 opacity-85 leading-normal break-words">{stripHtml(c.content)}</p>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}

                                                            {/* Add Reply Input (federated) */}
                                                            <div className="flex gap-2 pt-2 items-center">
                                                                <input
                                                                    type="text"
                                                                    className="input input-sm select-bordered w-full rounded-full bg-base-100/50 border-base-content/10 px-4 focus:outline-none focus:border-primary/50 text-xs"
                                                                    placeholder="Write a reply to your followers..."
                                                                    value={newReplyTexts[note.note_id] || ''}
                                                                    disabled={!!replySending[note.note_id]}
                                                                    onChange={e => setNewReplyTexts(prev => ({ ...prev, [note.note_id]: e.target.value }))}
                                                                    onKeyDown={e => {
                                                                        if (e.key === 'Enter') handlePostReply(note.note_id);
                                                                    }}
                                                                />
                                                                <button
                                                                    className="btn btn-sm btn-circle btn-primary shadow-sm"
                                                                    onClick={() => handlePostReply(note.note_id)}
                                                                    disabled={!!replySending[note.note_id] || !(newReplyTexts[note.note_id] || '').trim()}
                                                                    title="Send federated reply"
                                                                >
                                                                    {replySending[note.note_id] ? <span className="loading loading-spinner loading-xs" /> : <Send size={11} />}
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
            {/* Interactions modal: who liked / boosted (read-only social proof) */}
            {interactionsModal && (
                <div className="modal modal-open" onClick={() => setInteractionsModal(null)}>
                    <div className="modal-box max-w-sm bg-base-200" onClick={e => e.stopPropagation()}>
                        <h3 className="font-bold text-lg flex items-center gap-2 mb-4">
                            {interactionsModal.type === 'like'
                                ? <><Heart size={18} className="text-error" /> Liked by</>
                                : <><Repeat size={18} className="text-success" /> Boosted by</>}
                        </h3>
                        {interactionsLoading ? (
                            <div className="flex justify-center py-8"><span className="loading loading-spinner loading-md opacity-40" /></div>
                        ) : interactionsList.length === 0 ? (
                            <div className="text-center py-8 opacity-50 text-sm">
                                No {interactionsModal.type === 'like' ? 'likes' : 'boosts'} from the Fediverse yet.
                            </div>
                        ) : (
                            <div className="grid gap-2 max-h-[400px] overflow-y-auto scrollbar-thin">
                                {interactionsList.map(i => {
                                    const name = i.actor?.name || 'Fediverse user';
                                    const handle = i.actor?.username ? `@${i.actor.username}` : i.actor_uri;
                                    return (
                                        <a key={i.actor_uri} href={i.actor_uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 bg-base-100/50 rounded-xl border border-base-content/5 hover:border-primary/20 transition-colors">
                                            <div className="avatar placeholder flex-shrink-0">
                                                <div className="w-9 h-9 rounded-full bg-neutral text-neutral-content overflow-hidden">
                                                    {i.actor?.icon_url
                                                        ? <img src={i.actor.icon_url} alt={name} onError={e => { e.currentTarget.style.display = 'none'; }} />
                                                        : <span className="text-sm font-semibold">{name[0]?.toUpperCase()}</span>}
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-sm truncate">{name}</div>
                                                <div className="text-xs opacity-50 font-mono truncate" title={i.actor_uri}>{handle}</div>
                                            </div>
                                            <ExternalLink size={12} className="ml-auto opacity-40 flex-shrink-0" />
                                        </a>
                                    );
                                })}
                            </div>
                        )}
                        <div className="modal-action">
                            <button className="btn btn-sm" onClick={() => setInteractionsModal(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            <CreatePostModal onPostCreated={() => {
                if (effectiveArtistId) loadData(effectiveArtistId);
            }} />
        </div>
    );
};


