import { useState, useEffect } from 'react';
import API from '../services/api';
import { useSearchParams, Link } from 'react-router-dom';
import { Search as SearchIcon, Music, Disc, User, Globe } from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import type { Track, Album, Artist } from '../types';

export const Search = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const [results, setResults] = useState<{ tracks: Track[], albums: Album[], artists: Artist[] } | null>(null);
    const [loading, setLoading] = useState(false);
    const { playTrack } = usePlayerStore();
    const [externalMode, setExternalMode] = useState(false);

    const handleSearch = async (q: string) => {
        if (!q.trim()) return;
        setLoading(true);
        try {
            // Check if we should use metadata search (external) or local catalog
            const data = externalMode 
                ? await API.searchMetadata(q) 
                : await API.search(q);
            setResults(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (query) handleSearch(query);
    }, [query, externalMode]);

    const updateQuery = (q: string) => {
        setSearchParams({ q });
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Search Header */}
            <div className="flex flex-col gap-4">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <SearchIcon size={32} className="text-primary"/> 
                    Search
                </h1>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder="Search for songs, artists, albums..." 
                        className="input input-bordered w-full max-w-xl text-lg" 
                        value={query}
                        onChange={e => updateQuery(e.target.value)}
                        autoFocus
                    />
                    <div className="join">
                        <button 
                            className={`btn join-item ${!externalMode ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setExternalMode(false)}
                        >Internal</button>
                        <button 
                            className={`btn join-item ${externalMode ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setExternalMode(true)}
                        >External (Metadata)</button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="text-center opacity-50 py-12">Searching...</div>
            ) : results ? (
                <div className="space-y-8">
                    {/* Artists */}
                    {results.artists?.length > 0 && (
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><User size={20}/> Artists</h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {results.artists.map(artist => (
                                    <Link to={`/artists/${artist.id}`} key={artist.id} className="group card bg-base-200 hover:bg-base-300 transition-colors">
                                        <figure className="aspect-square relative overflow-hidden">
                                            {artist.coverImage ? (
                                                <img src={API.getArtistCoverUrl(artist.id)} alt={artist.name} className="object-cover w-full h-full group-hover:scale-105 transition-transform" />
                                            ) : (
                                                <div className="w-full h-full bg-neutral flex items-center justify-center text-4xl font-bold opacity-30">
                                                    {artist.name[0]}
                                                </div>
                                            )}
                                        </figure>
                                        <div className="card-body p-3">
                                            <h3 className="font-bold truncate">{artist.name}</h3>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Albums */}
                    {results.albums?.length > 0 && (
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Disc size={20}/> Albums</h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {results.albums.map(album => (
                                    <Link to={`/albums/${album.id}`} key={album.id} className="group card bg-base-200 hover:bg-base-300 transition-colors">
                                        <figure className="aspect-square relative overflow-hidden">
                                            {album.coverImage ? (
                                                <img src={API.getAlbumCoverUrl(album.id)} alt={album.title} className="object-cover w-full h-full group-hover:scale-105 transition-transform" />
                                            ) : (
                                                <div className="w-full h-full bg-neutral flex items-center justify-center opacity-30"><Disc size={40}/></div>
                                            )}
                                        </figure>
                                        <div className="card-body p-3">
                                            <h3 className="font-bold truncate">{album.title}</h3>
                                            <p className="text-xs opacity-60 truncate">{album.artistName}</p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Tracks */}
                    {results.tracks?.length > 0 && (
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Music size={20}/> Tracks</h2>
                            <div className="flex flex-col gap-1">
                                {results.tracks.map((track, i) => (
                                    <div key={track.id} className="flex items-center gap-4 p-2 hover:bg-white/5 rounded-lg group">
                                        <button onClick={() => playTrack(track, results.tracks)} className="relative w-10 h-10 shrink-0">
                                             <img src={API.getAlbumCoverUrl(track.albumId)} className="w-full h-full rounded object-cover opacity-70 group-hover:opacity-100" />
                                             <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                                                 <Music size={16} />
                                             </div>
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold truncate">{track.title}</div>
                                            <div className="text-xs opacity-60 truncate">{track.artistName}</div>
                                        </div>
                                        <div className="text-xs font-mono opacity-50">
                                            {new Date(track.duration * 1000).toISOString().substr(14, 5)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                    
                    {!results.artists?.length && !results.albums?.length && !results.tracks?.length && (
                        <div className="text-center opacity-50">No results found for "{query}"</div>
                    )}
                </div>
            ) : (
                <div className="text-center opacity-30 py-12 flex flex-col items-center gap-4">
                    <Globe size={64}/>
                    <p className="text-xl">Search the TuneCamp Universe</p>
                </div>
            )}
        </div>
    );
};

export default Search;
