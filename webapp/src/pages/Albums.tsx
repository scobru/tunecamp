import { useState, useEffect, useMemo } from 'react';
import API from '../services/api';
import { Link } from 'react-router-dom';
import { Disc, Library, Download, LayoutGrid, List, AlignJustify } from 'lucide-react';
import type { Album } from '../types';
import { useAuthStore } from '../stores/useAuthStore';
import clsx from 'clsx';

export const Albums = () => {
    const { isAuthenticated, role, user } = useAuthStore();
    const isAdmin = role === 'admin' || role === 'super_user' || user?.isRootAdmin;
    const isArtist = !!user?.artistId;
    const [activeTab, setActiveTab] = useState<'releases' | 'library'>('releases');
    const [releases, setReleases] = useState<any[]>([]);
    const [library, setLibrary] = useState<Album[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'minimal'>('minimal');

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // Always load public releases (no auth needed)
                const releasesData = await API.getReleases().catch(err => {
                    console.error("Failed to load releases:", err);
                    return [];
                });
                setReleases(releasesData);

                // Only try to load library if authenticated AND has appropriate role
                // This prevents 403/401 errors for normal users
                if (isAuthenticated && (isAdmin || isArtist)) {
                    const token = API.getToken();
                    if (token) {
                        const libraryData = await API.getAlbums().catch(async (err) => {
                            // If it's a 401/403, just return empty library instead of failing page load
                            if (err.status === 401 || err.status === 403) {
                                return [];
                            }
                            return [];
                        });
                        setLibrary(libraryData);
                    }
                }
            } catch (e) {
                console.error("Error loading catalog data:", e);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [isAuthenticated]);

    const currentItems = useMemo(() => {
        return activeTab === 'releases' ? releases : library;
    }, [activeTab, releases, library]);

    if (loading) return <div className="p-12 text-center opacity-50">Loading...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <Disc size={32} className="text-primary"/> Catalog
                </h1>
                
                <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div role="tablist" className="tabs tabs-boxed bg-base-200/50 p-1 border border-base-content/5 w-full sm:w-auto">
                        <button
                            role="tab"
                            className={clsx("tab tab-sm md:tab-md transition-all gap-2", activeTab === 'releases' && "tab-active !bg-primary !text-primary-content")}
                            onClick={() => setActiveTab('releases')}
                        >
                            <Disc size={16}/> Formal Releases
                            <div className={clsx("badge badge-xs", activeTab === 'releases' ? "badge-ghost" : "badge-outline opacity-50")}>
                                {releases.length}
                            </div>
                        </button>
                        <button
                            role="tab"
                            className={clsx("tab tab-sm md:tab-md transition-all gap-2", activeTab === 'library' && "tab-active !bg-primary !text-primary-content")}
                            onClick={() => setActiveTab('library')}
                        >
                            <Library size={16}/> File Library
                            <div className={clsx("badge badge-xs", activeTab === 'library' ? "badge-ghost" : "badge-outline opacity-50")}>
                                {library.length}
                            </div>
                        </button>
                    </div>

                    <div className="join bg-base-200 self-end sm:self-auto hidden md:flex">
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
                "grid gap-6",
                viewMode === 'grid'
                    ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"
                    : viewMode === 'list'
                        ? "grid-cols-1 md:grid-cols-2 gap-4"
                        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2"
             )}>
                {currentItems.map(item => {
                    if (!item) return null;
                    const isReleaseTab = activeTab === 'releases';
                    const linkTo = isReleaseTab ? `/releases/${item.slug || item.id}` : `/albums/${item.slug || item.id}`;
                    const coverUrl = isReleaseTab ? API.getReleaseCoverUrl(item.id) : API.getAlbumCoverUrl(item.id);

                    return (
                        <Link to={linkTo} key={item.id} className={clsx(
                            "group transition-all duration-300 shadow-xl border border-base-content/5 overflow-hidden",
                            viewMode === 'grid' && "card bg-base-200 hover:bg-base-300 hover:-translate-y-1",
                            viewMode === 'list' && "flex items-center gap-4 bg-base-200 p-4 rounded-xl hover:bg-base-300",
                            viewMode === 'minimal' && "flex items-center gap-3 bg-base-200/40 p-2 px-3 rounded-lg hover:bg-base-200"
                        )}>
                            <figure className={clsx(
                                "relative overflow-hidden transition-all duration-500 shrink-0",
                                viewMode === 'grid' && "aspect-square rounded-t-2xl",
                                viewMode === 'list' && "w-12 h-12 rounded-lg shadow-lg",
                                viewMode === 'minimal' && "w-0 h-0 opacity-0 absolute pointer-events-none"
                            )}>
                                <img
                                    src={coverUrl}
                                    alt={item.title}
                                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        if (target.nextElementSibling) {
                                            (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                        }
                                    }}
                                />
                                <div className="hidden absolute inset-0 bg-neutral items-center justify-center opacity-30">
                                    <Disc size={viewMode === 'grid' ? 48 : 20}/>
                                </div>
                                {viewMode === 'grid' && item.download === 'free' && (
                                    <div className="absolute top-2 right-2 z-10">
                                        <div className="badge badge-accent shadow-lg border-none font-bold text-[10px] py-3 px-2 flex gap-1 items-center animate-pulse">
                                            <Download size={10} /> FREE
                                        </div>
                                    </div>
                                )}
                                {viewMode === 'grid' && (
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <span className="btn btn-circle btn-primary btn-sm scale-0 group-hover:scale-100 transition-transform delay-75">
                                            <Disc size={16}/>
                                        </span>
                                    </div>
                                )}
                            </figure>

                            <div className={clsx(
                                viewMode === 'grid' ? "card-body p-4" : "flex-1 min-w-0"
                            )}>
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className={clsx(
                                        "font-bold truncate group-hover:text-primary transition-colors",
                                        viewMode === 'grid' ? "text-lg" : viewMode === 'list' ? "text-base" : "text-sm"
                                    )} title={item.title}>
                                        {item.title}
                                    </h3>
                                    {(viewMode === 'list' || viewMode === 'minimal') && item.download === 'free' && (
                                        <div className={clsx("badge badge-accent font-bold flex gap-1 shrink-0", viewMode === 'minimal' ? "badge-xs py-1.5" : "badge-sm")}>
                                            <Download size={8} /> FREE
                                        </div>
                                    )}
                                </div>
                                <p className={clsx("opacity-60 truncate", viewMode === 'minimal' ? "text-[10px] -mt-0.5" : "text-sm")}>
                                    {item.artistName || (item as any).artist_name}
                                </p>
                                {viewMode !== 'minimal' && (
                                    <div className="flex justify-between items-center mt-2 opacity-40 text-xs font-mono">
                                        <span>{item.year}</span>
                                        <span className="uppercase border border-white/20 px-1 rounded text-[10px]">{item.type}</span>
                                    </div>
                                )}
                            </div>
                        </Link>
                    );
                })}
             </div>
             
             {currentItems.length === 0 && (
                <div className="text-center py-20 opacity-30 flex flex-col items-center gap-4">
                    <Disc size={64}/>
                    <p className="text-xl">
                        {activeTab === 'releases' ? "No formal releases published yet." : "Library is empty."}
                    </p>
                </div>
             )}
        </div>
    );
};

