import { Link } from 'react-router-dom';
import { Disc, Download } from 'lucide-react';
import clsx from 'clsx';
import API from '../../services/api';
import { useConfigStore } from '../../stores/useConfigStore';

interface ReleaseCardProps {
    item: any;
    viewMode?: 'grid' | 'list' | 'minimal';
    type?: 'release' | 'library';
}

export const ReleaseCard = ({ item, viewMode = 'grid', type = 'release' }: ReleaseCardProps) => {
    const { cacheBuster } = useConfigStore();
    if (!item) return null;

    const isRelease = type === 'release';
    const linkTo = isRelease 
        ? `/releases/${item.slug || item.id}` 
        : `/albums/${item.slug || item.id}`;
    
    const coverUrl = isRelease 
        ? API.getReleaseCoverUrl(item.id, cacheBuster) 
        : API.getAlbumCoverUrl(item.id, cacheBuster);

    return (
        <Link to={linkTo} className={clsx(
            "group transition-all duration-300 shadow-xl border border-base-content/5 overflow-hidden",
            viewMode === 'grid' && "card bg-base-200 hover:bg-base-300 hover:-translate-y-1 rounded-3xl",
            viewMode === 'list' && "flex items-center gap-4 bg-base-200 p-4 rounded-xl hover:bg-base-300",
            viewMode === 'minimal' && "flex items-center gap-3 bg-base-200/40 p-2 px-3 rounded-lg hover:bg-base-200"
        )}>
            <figure className={clsx(
                "relative overflow-hidden transition-all duration-500 shrink-0",
                viewMode === 'grid' && "aspect-square rounded-t-3xl",
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
                    {item.artistName || item.artist_name}
                </p>
                {viewMode === 'grid' && (
                    <div className="flex justify-between items-center mt-2 opacity-40 text-xs font-mono">
                        <span>{item.year}</span>
                        {item.type && <span className="uppercase border border-white/20 px-1 rounded text-[10px]">{item.type}</span>}
                    </div>
                )}
            </div>
        </Link>
    );
};
