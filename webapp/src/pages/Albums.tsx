import { useState, useEffect } from 'react';
import API from '../services/api';
import { Link } from 'react-router-dom';
import { Disc } from 'lucide-react';
import type { Album } from '../types';

export const Albums = () => {
    const [albums, setAlbums] = useState<Album[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        API.getAlbums()
            .then(setAlbums)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="p-12 text-center opacity-50">Loading library...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <Disc size={32} className="text-primary"/> Albums
                </h1>
                <span className="opacity-50 font-mono text-sm">{albums.length} items</span>
             </div>

             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {albums.map(album => {
                    if (!album) return null;
                    return (
                        <Link to={`/albums/${album.id}`} key={album.id} className="group card bg-base-200 hover:bg-base-300 transition-all hover:-translate-y-1 duration-300 shadow-xl border border-white/5">
                            <figure className="aspect-square relative overflow-hidden">
                                {album.coverImage ? (
                                    <img 
                                        src={API.getAlbumCoverUrl(album.id)} 
                                        alt={album.title} 
                                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" 
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-neutral flex items-center justify-center opacity-30"><Disc size={48}/></div>
                                )}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="btn btn-circle btn-primary btn-sm scale-0 group-hover:scale-100 transition-transform delay-75">
                                        <Disc size={16}/>
                                    </span>
                                </div>
                            </figure>
                            <div className="card-body p-4">
                                <h3 className="font-bold truncate text-lg" title={album.title}>{album.title}</h3>
                                <p className="text-sm opacity-60 truncate">{album.artistName}</p>
                                <div className="flex justify-between items-center mt-2 opacity-40 text-xs font-mono">
                                    <span>{album.year}</span>
                                    <span className="uppercase border border-white/20 px-1 rounded text-[10px]">{album.type}</span>
                                </div>
                            </div>
                        </Link>
                    );
                })}
             </div>
             
             {albums.length === 0 && (
                <div className="text-center py-20 opacity-30 flex flex-col items-center gap-4">
                    <Disc size={64}/>
                    <p className="text-xl">Your library is empty.</p>
                </div>
             )}
        </div>
    );
};
