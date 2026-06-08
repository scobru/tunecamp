import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import API from "../services/api";
import { Play, Music, Disc, User, ArrowLeft, Heart, Share2 } from "lucide-react";
import { usePlayerStore } from "../stores/usePlayerStore";
import { useAuthStore } from "../stores/useAuthStore";
import type { Track, Album } from "../types";
import clsx from "clsx";

const SharePage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { playTrack } = usePlayerStore();
    const { isAuthenticated, isAdminAuthenticated: isAdmin } = useAuthStore();
    
    const [item, setItem] = useState<Track | Album | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isLiked, setIsLiked] = useState(false);

    useEffect(() => {
        if (!id) return;

        const fetchData = async () => {
            try {
                if (id.startsWith('tr_')) {
                    const trackId = parseInt(id.substring(3));
                    if (isNaN(trackId)) throw new Error("Invalid track ID");
                    const data = await API.getTrack(trackId);
                    setItem(data);
                    setIsLiked(!!data.starred);
                } else if (id.startsWith('al_')) {
                    const albumId = parseInt(id.substring(3));
                    if (isNaN(albumId)) throw new Error("Invalid album ID");
                    const data = await API.getAlbum(albumId);
                    setItem(data);
                    setIsLiked(!!data.starred);
                } else {
                    throw new Error("Invalid share ID format");
                }
            } catch (err: any) {
                console.error("Failed to fetch shared item:", err);
                setError(err.message || "Failed to load shared item");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [id]);

    const handlePlay = () => {
        if (!item) return;
        if ('tracks' in item && item.tracks) {
            // It's an album
            playTrack(item.tracks[0], item.tracks);
        } else {
            // It's a track
            playTrack(item as Track, [item as Track]);
        }
    };

    const handleLike = async () => {
        if (!item || (!isAuthenticated && !isAdmin)) {
            document.dispatchEvent(new CustomEvent("open-auth-modal"));
            return;
        }

        try {
            if (id?.startsWith('tr_')) {
                if (isLiked) await API.unstarTrack(item.id);
                else await API.starTrack(item.id);
            } else if (id?.startsWith('al_')) {
                if (isLiked) await API.unstarAlbum(item.id);
                else await API.starAlbum(item.id);
            }
            setIsLiked(!isLiked);
        } catch (err) {
            console.error("Failed to toggle like:", err);
        }
    };

    const handleShare = () => {
        if (navigator.share) {
            navigator.share({
                title: item ? (item as any).title : "TuneCamp Share",
                url: window.location.href
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(window.location.href);
            alert("Link copied to clipboard!");
        }
    };

    if (loading) return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4 opacity-50">
            <Music className="w-12 h-12 animate-pulse" />
            <p className="text-sm font-black tracking-normal">Loading shared content...</p>
        </div>
    );

    if (error || !item) return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-6">
            <div className="bg-error/10 text-error p-6 rounded-3xl border border-error/20 max-w-md text-center">
                <p className="font-bold text-lg mb-2">Oops!</p>
                <p className="opacity-80">{error || "Item not found"}</p>
            </div>
            <button onClick={() => navigate('/')} className="btn btn-ghost gap-2">
                <ArrowLeft size={18} /> Back to Library
            </button>
        </div>
    );

    const isTrack = 'duration' in item;
    const title = (item as any).title;
    const artistName = (item as any).artistName || (item as any).artist_name;
    const albumName = isTrack ? (item as any).albumName : null;
    let coverUrl = (item as any).coverImage ||
                   (item as any).coverUrl ||
                   (item as any).coverPath ||
                   (item as any).cover_path;

    if (!coverUrl && isTrack && (item as any).albumId) {
        coverUrl = API.getAlbumCoverUrl((item as any).albumId);
    }

    if (!coverUrl) {
        coverUrl = isTrack ? API.getTrackCoverUrl(item.id) : API.getAlbumCoverUrl(item.id);
    }

    if (!coverUrl && (item as any).artistId) {
        coverUrl = API.getArtistCoverUrl((item as any).artistId);
    }

    // Fix relative paths that might be missing the root / or /api
    if (coverUrl && !coverUrl.startsWith('http') && !coverUrl.startsWith('/') && !coverUrl.startsWith('data:') && !coverUrl.startsWith('blob:')) {
        // If it looks like a local asset path, prepend /api/
        if (coverUrl.startsWith('assets/')) {
            coverUrl = `/api/${coverUrl}`;
        } else {
            coverUrl = `/${coverUrl}`;
        }
    }

    return (
        <div className="max-w-4xl mx-auto space-y-12 py-8 animate-fade-in">
            <div className="flex items-center gap-4 px-4">
                <button onClick={() => navigate(-1)} className="btn btn-ghost btn-circle">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-sm font-black tracking-normal opacity-60">Shared Content</h1>
            </div>

            <div className="relative group rounded-[3rem] overflow-hidden border border-base-content/5 bg-base-200/40 p-8 lg:p-12 shadow-level-1">
                {/* Background Blur */}
                <div className="absolute inset-0 z-0">
                    <img src={coverUrl} className="w-full h-full object-cover opacity-10 blur-[100px] scale-150" alt="" />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row gap-8 lg:gap-12 items-center">
                    <div className="relative group/cover shrink-0">
                        <img 
                            src={coverUrl} 
                            alt={title}
                            className="w-64 h-64 md:w-80 md:h-80 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] object-cover ring-1 ring-base-content/10"
                            onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/500x500?text=No+Cover"; }}
                        />
                    </div>

                    <div className="flex-1 space-y-8 text-center md:text-left">
                        <div className="space-y-4">
                            <div className="flex items-center justify-center md:justify-start gap-3">
                                <span className="text-xs font-black tracking-[0.3em] bg-primary text-primary-content px-2 py-0.5 rounded-md">
                                    {isTrack ? 'Track' : 'Album'}
                                </span>
                                {isTrack && (item as any).losslessPath && (
                                    <span className="text-xs font-black tracking-[0.3em] border border-white/20 px-2 py-0.5 rounded-md opacity-40">
                                        Hi-Res
                                    </span>
                                )}
                            </div>
                            
                            <h2 className="text-4xl lg:text-7xl font-black tracking-tighter text-prominent leading-tight">
                                {title}
                            </h2>

                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-center md:justify-start gap-2 text-xl md:text-2xl font-bold opacity-80">
                                    <User size={20} className="opacity-40" />
                                    <span>{artistName}</span>
                                </div>
                                {albumName && (
                                    <div className="flex items-center justify-center md:justify-start gap-2 text-lg font-medium opacity-60">
                                        <Disc size={18} className="opacity-40" />
                                        <span>{albumName}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                            <button 
                                onClick={handlePlay}
                                className="btn btn-primary btn-lg rounded-2xl px-12 shadow-level-1 shadow-primary/20 hover:scale-105 transition-all"
                            >
                                <Play fill="currentColor" size={24} /> Listen Now
                            </button>

                            <button 
                                onClick={handleLike}
                                className={clsx("btn btn-lg btn-square rounded-2xl border border-base-content/5 hover:bg-base-content/5", isLiked && "text-primary")}
                            >
                                <Heart size={24} fill={isLiked ? "currentColor" : "none"} />
                            </button>

                            <button 
                                onClick={handleShare}
                                className="btn btn-lg btn-square rounded-2xl border border-base-content/5 hover:bg-base-content/5"
                            >
                                <Share2 size={24} />
                            </button>
                        </div>

                        {!isTrack && (item as Album).tracks && (
                            <div className="pt-4">
                                <Link 
                                    to={`/albums/${(item as Album).slug || item.id}`}
                                    className="text-xs font-black tracking-normal opacity-40 hover:opacity-100 transition-opacity flex items-center justify-center md:justify-start gap-2"
                                >
                                    View Full Album Details <ArrowLeft size={14} className="rotate-180" />
                                </Link>
                            </div>
                        )}
                        {isTrack && (item as Track).albumId && (
                             <div className="pt-4">
                                <Link 
                                    to={`/albums/${(item as any).albumSlug || (item as any).albumId}`}
                                    className="text-xs font-black tracking-normal opacity-40 hover:opacity-100 transition-opacity flex items-center justify-center md:justify-start gap-2"
                                >
                                    Go to Album <Disc size={14} />
                                </Link>
                             </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Extra context or suggestions could go here */}
            <div className="px-4 text-center">
                <p className="text-xs font-bold opacity-40 tracking-[0.3em]">
                    Powered by TuneCamp • Decentralized Music Federation
                </p>
            </div>
        </div>
    );
};

export default SharePage;
