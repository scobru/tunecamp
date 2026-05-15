import { useState, useEffect } from 'react';
import API from '../services/api';
import { Link } from 'react-router-dom';
import { User, Trash2, Edit, LayoutGrid, List, AlignJustify, Heart } from 'lucide-react';
import type { Artist, User as AppUser } from '../types';
import clsx from 'clsx';

export const Artists = () => {
    const [artists, setArtists] = useState<Artist[]>([]);
    const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'minimal'>('minimal');

    useEffect(() => {
        API.getCurrentUser()
            .then(setCurrentUser)
            .catch(console.error);

        API.getArtists()
            .then(setArtists)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const handleEdit = (e: React.MouseEvent, artist: Artist) => {
        e.preventDefault();
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('open-admin-artist-modal', { detail: artist }));
    };

    const handleDelete = async (e: React.MouseEvent, artist: Artist) => {
        e.preventDefault();
        e.stopPropagation();
        if (!window.confirm(`Are you sure you want to delete ${artist.name}? This action cannot be undone.`)) return;
        
        try {
            await API.deleteArtist(artist.id.toString());
            setArtists(prev => prev.filter(a => a.id !== artist.id));
        } catch (error: any) {
            alert(error.message || 'Failed to delete artist. They might still have releases, albums, or tracks attached.');
        }
    };

    const handleToggleStar = async (e: React.MouseEvent, artist: Artist) => {
        e.preventDefault();
        e.stopPropagation();
        
        try {
            const newStatus = !artist.starred;
            if (newStatus) {
                await API.starArtist(artist.id);
            } else {
                await API.unstarArtist(artist.id);
            }
            setArtists(prev => prev.map(a => 
                a.id === artist.id ? { ...a, starred: newStatus } : a
            ));
        } catch (error) {
            console.error('Failed to toggle star:', error);
        }
    };

    if (loading) return <div className="p-12 text-center opacity-50">Loading artists...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <User size={32} className="text-primary"/> Artists
                </h1>

                <div className="flex items-center gap-4">
                    {currentUser?.isRootAdmin && (
                        <button 
                            className="btn btn-sm btn-primary"
                            onClick={() => document.dispatchEvent(new CustomEvent('open-admin-artist-modal'))}
                        >
                            New Artist
                        </button>
                    )}
                    <span className="opacity-50 font-mono text-sm">{artists.length} items</span>
                    <div className="join bg-base-200">
                        <button
                            className={clsx("btn btn-sm join-item", viewMode === 'grid' && "btn-active")}
                            onClick={() => setViewMode('grid')}
                            title="Grid View"
                        >
                            <LayoutGrid size={16} />
                        </button>
                        <button
                            className={clsx("btn btn-sm join-item", viewMode === 'list' && "btn-active")}
                            onClick={() => setViewMode('list')}
                            title="List View"
                        >
                            <List size={16} />
                        </button>
                        <button
                            className={clsx("btn btn-sm join-item", viewMode === 'minimal' && "btn-active")}
                            onClick={() => setViewMode('minimal')}
                            title="Minimal View"
                        >
                            <AlignJustify size={16} />
                        </button>
                    </div>
                </div>
             </div>

             <div className={clsx(
                "grid gap-4",
                viewMode === 'grid'
                    ? "grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6"
                    : viewMode === 'list' 
                        ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"
             )}>
                {artists.map(artist => (
                    <div key={artist.id} className={clsx(
                        "group relative transition-all duration-200",
                        viewMode === 'grid' && "text-center block",
                        viewMode === 'list' && "flex items-center gap-4 bg-base-200 p-4 rounded-xl hover:bg-base-300 transition-colors shadow-sm border border-base-content/5",
                        viewMode === 'minimal' && "flex items-center gap-3 bg-base-200/40 p-2 px-3 rounded-lg hover:bg-base-200 transition-colors border border-base-content/5"
                    )}>
                        {currentUser?.isAdmin && (
                            <div className={clsx(
                                "absolute z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200",
                                viewMode === 'grid' ? "top-2 right-2" : viewMode === 'list' ? "right-4 top-1/2 -translate-y-1/2" : "right-2 top-1/2 -translate-y-1/2 scale-75 group-hover:scale-100"
                            )}>
                                {currentUser?.isRootAdmin && (
                                    <button
                                        onClick={(e) => handleEdit(e, artist)}
                                        className="p-2 bg-base-300 hover:bg-primary hover:text-white rounded-full shadow-lg"
                                        title="Edit Artist"
                                    >
                                        <Edit size={16} />
                                    </button>
                                )}
                                <button
                                    onClick={(e) => handleToggleStar(e, artist)}
                                    className={clsx(
                                        "p-2 bg-base-300 rounded-full shadow-lg transition-colors",
                                        artist.starred ? "text-error" : "hover:text-error"
                                    )}
                                    title={artist.starred ? "Remove from Favorites" : "Add to Favorites"}
                                >
                                    <Heart size={16} fill={artist.starred ? "currentColor" : "none"} />
                                </button>
                                {(artist.id.toString() !== currentUser.artistId?.toString()) && (
                                    <button
                                        onClick={(e) => handleDelete(e, artist)}
                                        className="p-2 bg-base-300 hover:bg-error hover:text-white rounded-full shadow-lg"
                                        title="Delete Artist"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        )}
                        <Link to={`/artists/${artist.slug || artist.id}`} className={clsx("block w-full", viewMode !== 'grid' && "flex items-center gap-4")}>
                            <figure className={clsx(
                                "relative overflow-hidden transition-all duration-500 shrink-0",
                                viewMode === 'grid' && "aspect-square rounded-xl shadow-xl mb-4 border-4 border-transparent group-hover:border-primary/20 mx-auto w-full max-w-[200px]",
                                viewMode === 'list' && "w-12 h-12 rounded-lg shadow-lg",
                                viewMode === 'minimal' && "w-0 h-0 opacity-0 absolute pointer-events-none"
                            )}>
                                {artist.coverImage ? (
                                    <img
                                        src={API.getArtistCoverUrl(artist.id)}
                                        alt={artist.name}
                                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = 'none';
                                            if (target.nextElementSibling) {
                                                (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                            }
                                        }}
                                    />
                                ) : null}
                                <div className={clsx(
                                    "w-full h-full bg-neutral flex items-center justify-center opacity-30 font-bold", 
                                    artist.coverImage && "hidden",
                                    viewMode === 'grid' ? "text-5xl" : "text-base"
                                )}>
                                    {artist.name[0]}
                                </div>
                            </figure>

                            <div className={clsx(viewMode !== 'grid' && "flex-1 min-w-0", viewMode === 'list' && "pr-20", viewMode === 'minimal' && "pr-10")}>
                                <h3 className={clsx(
                                    "font-bold truncate group-hover:text-primary transition-colors",
                                    viewMode === 'grid' ? "text-lg" : viewMode === 'list' ? "text-base" : "text-sm font-semibold"
                                )}>
                                    {artist.name}
                                </h3>
                                {viewMode !== 'minimal' && <p className="text-sm opacity-50 truncate">Artist</p>}
                            </div>
                        </Link>
                    </div>
                ))}
             </div>
        </div>
    );
};

