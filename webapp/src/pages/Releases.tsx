import { useState, useEffect } from 'react';
import API from '../services/api';
import { Link } from 'react-router-dom';
import { Disc, Download, LayoutGrid, List, AlignJustify } from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';
import clsx from 'clsx';

export const Releases = () => {
    const { isAuthenticated } = useAuthStore();
    const [releases, setReleases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'minimal'>('grid');

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const data = await API.getReleases().catch(err => {
                    console.error("Failed to load releases:", err);
                    return [];
                });
                setReleases(data);
            } catch (e) {
                console.error("Error loading releases:", e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [isAuthenticated]);

    if (loading) return <div className="p-12 text-center opacity-50">Loading releases...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <Disc size={32} className="text-primary"/> Formal Releases
                </h1>
                
                <div className="flex items-center gap-4">
                    <div className="join bg-base-200 hidden md:flex">
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
                {releases.map(item => {
                    if (!item) return null;
                    const linkTo = `/releases/${item.slug || item.id}`;
                    const coverUrl = API.getReleaseCoverUrl(item.id);

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
                            </div>
                        </Link>
                    );
                })}
             </div>
             
             {releases.length === 0 && (
                <div className="text-center py-20 opacity-30 flex flex-col items-center gap-4">
                    <Disc size={64}/>
                    <p className="text-xl">No formal releases published yet.</p>
                </div>
             )}
        </div>
    );
};
