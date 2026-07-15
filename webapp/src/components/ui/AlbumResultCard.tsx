import { Link } from 'react-router-dom';
import { Disc, Play, Heart } from 'lucide-react';
import clsx from 'clsx';
import API from '../../services/api';


interface AlbumResultCardProps {
    album: any; // using any since it is mapped from results
    starredAlbums: Set<string>;
    handleToggleStarAlbum: (album: any) => void;
    playTrack: (track: any) => void;
}

export const AlbumResultCard = ({
    album,
    starredAlbums,
    handleToggleStarAlbum,
    playTrack
}: AlbumResultCardProps) => {
    const isRelease = album.is_release || (album as any).is_formal_release;
    const linkTo = isRelease ? `/releases/${album.slug || album.id}` : `/albums/${album.slug || album.id}`;
    const coverUrl = album.coverImage || (isRelease ? API.getReleaseCoverUrl(album.id) : API.getAlbumCoverUrl(album.id));

    return (
        <div className="group card-m3 overflow-hidden">
            <Link to={linkTo} className="flex-1">
                <figure className="aspect-square relative">
                    <img
                        src={coverUrl}
                        alt={album.title}
                        className="absolute inset-0 object-cover w-full h-full group-hover:scale-105 transition-transform"
                        onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            if (target.nextElementSibling) {
                            (target.nextElementSibling as HTMLElement).style.display = 'flex';
                            }
                        }}
                    />
                    <div className="hidden absolute inset-0 bg-neutral w-full h-full items-center justify-center opacity-30">
                        <Disc size={40} />
                    </div>
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                            className="btn btn-circle btn-primary btn-sm scale-90 group-hover:scale-100 transition-transform tooltip tooltip-top"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                playTrack({ ...album, albumId: album.id, albumName: album.title } as any);
                            }}
                            data-tip="Play Album"
                        >
                            <Play size={16} fill="currentColor" />
                        </button>
                        <button
                            className={clsx(
                                "btn btn-circle btn-ghost btn-sm tooltip tooltip-top",
                                starredAlbums.has(String(album.id)) ? "text-primary opacity-100" : "text-white"
                            )}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleToggleStarAlbum(album);
                            }}
                            data-tip={starredAlbums.has(String(album.id)) ? "Remove from Favorites" : "Add to Favorites"}
                        >
                            <Heart size={16} fill={starredAlbums.has(String(album.id)) ? "currentColor" : "none"} />
                        </button>
                    </div>
                </figure>
                <div className="card-body p-3">
                    <h3 className="font-bold truncate">{album.title}</h3>
                    <p className="text-xs opacity-60 truncate">{album.artistName || album.artist_name}</p>
                </div>
            </Link>
        </div>
    );
};
