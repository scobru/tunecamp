import { useState, useEffect } from 'react';
import API from '../services/api';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import type { Artist } from '../types';

export const Artists = () => {
    const [artists, setArtists] = useState<Artist[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        API.getArtists()
            .then(setArtists)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="p-12 text-center opacity-50">Loading artists...</div>;

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <User size={32} className="text-primary"/> Artists
                </h1>
                <span className="opacity-50 font-mono text-sm">{artists.length} items</span>
             </div>

             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {artists.map(artist => (
                    <Link to={`/artists/${artist.id}`} key={artist.id} className="group text-center">
                        <figure className="aspect-square relative overflow-hidden rounded-full shadow-xl mb-4 border-4 border-transparent group-hover:border-primary/20 transition-all mx-auto w-full max-w-[200px]">
                            {artist.coverImage ? (
                                <img 
                                    src={API.getArtistCoverUrl(artist.id)} 
                                    alt={artist.name} 
                                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" 
                                    loading="lazy"
                                />
                            ) : (
                                <div className="w-full h-full bg-neutral flex items-center justify-center opacity-30 text-5xl font-bold">{artist.name[0]}</div>
                            )}
                        </figure>
                        <h3 className="font-bold truncate text-lg group-hover:text-primary transition-colors">{artist.name}</h3>
                        <p className="text-sm opacity-50">Artist</p>
                    </Link>
                ))}
             </div>
        </div>
    );
};
