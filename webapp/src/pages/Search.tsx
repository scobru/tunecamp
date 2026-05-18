import { useState, useEffect } from 'react';
import API from '../services/api';
import { useSearchParams, Link } from 'react-router-dom';
import { Search as SearchIcon, Music, Disc, User, Globe, Play, Heart, Plus } from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useAuthStore } from '../stores/useAuthStore';
import { formatDuration } from '../utils/format';
import clsx from 'clsx';
import type { Track, Album, Artist, Playlist } from '../types';

const Search = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const [inputValue, setInputValue] = useState(query);
    const [results, setResults] = useState<{ tracks: Track[], albums: Album[], artists: Artist[], external?: any[], streaming?: any[] } | null>(null);
    const [loading, setLoading] = useState(false);
    const { playTrack } = usePlayerStore();
    const { user } = useAuthStore();
    const [starredTracks, setStarredTracks] = useState<Set<string>>(new Set());
    const [starredAlbums, setStarredAlbums] = useState<Set<string>>(new Set());
    const [starredArtists, setStarredArtists] = useState<Set<string>>(new Set());
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [activePlaylistMenu, setActivePlaylistMenu] = useState<string | null>(null);

    const loadData = async () => {
        if (!user) return;
        try {
            const [pData, sTracks, sAlbums, sArtists] = await Promise.all([
                API.getPlaylists(),
                API.getStarredTracks(),
                API.getStarredAlbums(),
                API.getStarredArtists()
            ]);
            setPlaylists(pData);
            setStarredTracks(new Set(sTracks.map((t: any) => String(t.id || t))));
            setStarredAlbums(new Set(sAlbums.map(String)));
            setStarredArtists(new Set(sArtists.map(String)));
        } catch (e) {
            console.error("Error loading search page data:", e);
        }
    };

    useEffect(() => {
        loadData();
    }, [user]);

    const handleSearch = async (q: string) => {
        if (!q.trim()) return;
        setLoading(true);
        try {
            const data = await API.globalSearch(q);
            setResults({
                tracks: data.local.tracks || [],
                albums: data.local.albums || [],
                artists: data.local.artists || [],
                external: data.external || [],
                streaming: data.streaming || []
            } as any);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (query) {
            setInputValue(query);
            handleSearch(query);
        }
    }, [query]);

    const onSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputValue.trim()) {
            setSearchParams({ q: inputValue });
        }
    };

    const clearSearch = () => {
        setInputValue('');
        setSearchParams({});
        setResults(null);
    };

    const handleToggleStar = async (item: any) => {
        if (!user) return;
        const trackId = item.id.startsWith?.('ext:') ? item.id : String(item.id);
        const isStarred = starredTracks.has(trackId);

        try {
            if (isStarred) {
                await API.unstarTrack(trackId);
                const next = new Set(starredTracks);
                next.delete(trackId);
                setStarredTracks(next);
            } else {
                const metadata = item.isExternal ? {
                    title: item.title,
                    artist: item.artist,
                    coverUrl: item.coverUrl || item.thumbnail,
                    duration: item.duration,
                    url: item.url // Pass the source URL for localization
                } : {};
                
                await API.starTrack(trackId, metadata);
                const next = new Set(starredTracks);
                next.add(trackId);
                setStarredTracks(next);
            }
        } catch (e) {
            console.error("Error toggling track star:", e);
        }
    };

    const handleToggleStarAlbum = async (item: any) => {
        if (!user) return;
        const id = String(item.id);
        const isStarred = starredAlbums.has(id);

        try {
            if (isStarred) {
                await API.unstarAlbum(id);
                const next = new Set(starredAlbums);
                next.delete(id);
                setStarredAlbums(next);
            } else {
                const metadata = item.isExternal ? {
                    title: item.title || item.albumTitle,
                    artist: item.artist || item.artistName,
                    coverUrl: item.coverUrl || item.thumbnail,
                    type: item.type,
                    year: item.year
                } : {};
                
                await API.starAlbum(id, metadata);
                const next = new Set(starredAlbums);
                next.add(id);
                setStarredAlbums(next);
            }
        } catch (e) {
            console.error("Error toggling album star:", e);
        }
    };

    const handleToggleStarArtist = async (item: any) => {
        if (!user) return;
        const id = String(item.id);
        const isStarred = starredArtists.has(id);

        try {
            if (isStarred) {
                await API.unstarArtist(id);
                const next = new Set(starredArtists);
                next.delete(id);
                setStarredArtists(next);
            } else {
                const metadata = item.isExternal ? {
                    name: item.name || item.artist,
                    bio: item.bio,
                    coverUrl: item.coverUrl || item.thumbnail
                } : {};
                
                await API.starArtist(id, metadata);
                const next = new Set(starredArtists);
                next.add(id);
                setStarredArtists(next);
            }
        } catch (e) {
            console.error("Error toggling artist star:", e);
        }
    };

    const handleAddToPlaylist = async (item: any, playlistId: string) => {
        try {
            let trackId = item.id;
            
            if (String(trackId).startsWith('ext:')) {
                const metadata = {
                    title: item.title,
                    artist: item.artist,
                    coverUrl: item.coverUrl || item.thumbnail,
                    duration: item.duration
                };
                const res = await API.starTrack(trackId, metadata);
                trackId = res.trackId;
                
                const next = new Set(starredTracks);
                next.add(item.id);
                setStarredTracks(next);
            }

            await API.addTrackToPlaylist(playlistId, String(trackId));
            setActivePlaylistMenu(null);
        } catch (e) {
            console.error("Error adding to playlist:", e);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Search Header */}
            <div className="flex flex-col gap-4">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <SearchIcon size={32} className="text-primary"/> 
                    Search
                </h1>
                <form onSubmit={onSearchSubmit} className="flex gap-2">
                    <div className="relative flex-full w-full">
                        <input 
                            type="text" 
                            placeholder="Search for songs, artists, albums..." 
                            aria-label="Search"
                            className="input input-bordered w-full text-lg pr-12"
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            autoFocus
                        />
                        {inputValue && (
                            <button 
                                type="button"
                                onClick={clearSearch}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                            >
                                <Plus size={20} className="rotate-45" />
                            </button>
                        )}
                    </div>
                    <button type="submit" className="btn btn-primary px-8">
                        Search
                    </button>
                </form>
            </div>

            {loading ? (
                <div className="text-center opacity-50 py-12 flex flex-col items-center gap-4">
                    <div className="loading loading-spinner loading-lg text-primary"></div>
                    <p className="text-lg">Searching local and external providers...</p>
                </div>
            ) : results ? (
                <div className="space-y-8">
                    {/* Artists */}
                    {results.artists?.length > 0 && (
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><User size={20}/> Artists</h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {results.artists.map(artist => (
                                     <div key={artist.id} className="group card bg-base-200 hover:bg-base-300 transition-colors overflow-hidden">
                                         <Link to={`/artists/${artist.slug || artist.id}`} className="flex-1">
                                             <figure className="aspect-square relative">
                                                 {artist.coverImage ? (
                                                     <img src={API.getArtistCoverUrl(artist.id)} alt={artist.name} className="object-cover w-full h-full group-hover:scale-105 transition-transform" />
                                                 ) : (
                                                     <div className="w-full h-full bg-neutral flex items-center justify-center text-4xl font-bold opacity-30">
                                                         {artist.name ? artist.name[0] : '?'}
                                                     </div>
                                                 )}
                                                 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                     <button 
                                                         className={clsx(
                                                             "btn btn-circle btn-ghost btn-sm",
                                                             starredArtists.has(String(artist.id)) ? "text-primary opacity-100" : "text-white"
                                                         )}
                                                         onClick={(e) => {
                                                             e.preventDefault();
                                                             e.stopPropagation();
                                                             handleToggleStarArtist(artist);
                                                         }}
                                                     >
                                                         <Heart size={20} fill={starredArtists.has(String(artist.id)) ? "currentColor" : "none"} />
                                                     </button>
                                                 </div>
                                             </figure>
                                             <div className="card-body p-3">
                                                 <h3 className="font-bold truncate">{artist.name}</h3>
                                             </div>
                                         </Link>
                                     </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Albums */}
                    {results.albums?.length > 0 && (
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Disc size={20}/> Albums</h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {results.albums.map(album => {
                                    const isRelease = album.is_release || (album as any).is_formal_release;
                                    const linkTo = isRelease ? `/releases/${album.slug || album.id}` : `/albums/${album.slug || album.id}`;
                                    const coverUrl = album.coverImage || (isRelease ? API.getReleaseCoverUrl(album.id) : API.getAlbumCoverUrl(album.id));
                                    return (
                                            <div key={album.id} className="group card bg-base-200 hover:bg-base-300 transition-colors overflow-hidden">
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
                                                                className="btn btn-circle btn-primary btn-sm scale-90 group-hover:scale-100 transition-transform"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    playTrack({ ...album, albumId: album.id, albumName: album.title } as any);
                                                                }}
                                                            >
                                                                <Play size={16} fill="currentColor" />
                                                            </button>
                                                            <button 
                                                                className={clsx(
                                                                    "btn btn-circle btn-ghost btn-sm",
                                                                    starredAlbums.has(String(album.id)) ? "text-primary opacity-100" : "text-white"
                                                                )}
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    handleToggleStarAlbum(album);
                                                                }}
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
                                })}
                            </div>
                        </section>
                    )}

                    {/* Local Tracks */}
                    {results.tracks?.length > 0 && (
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-primary">
                                <Music size={20}/> Your Library
                            </h2>
                            <div className="flex flex-col gap-1">
                                {results.tracks.map((track) => (
                                    <div key={track.id} className="flex items-center gap-4 p-2 hover:bg-base-content/5 rounded-lg group">
                                        <button
                                            onClick={() => playTrack(track, results.tracks)}
                                            className="relative w-10 h-10 shrink-0"
                                            aria-label={`Play ${track.title} by ${track.artistName || 'Unknown Artist'}`}
                                        >
                                             <img
                                                src={track.coverImage || API.getAlbumCoverUrl(track.albumId)}
                                                alt={track.albumName ? `${track.albumName} cover` : "Album cover"}
                                                className="w-full h-full rounded object-cover opacity-70 group-hover:opacity-100"
                                             />
                                             <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                                                 <Play size={16} fill="currentColor" />
                                             </div>
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold truncate">{track.title}</div>
                                            <div className="text-xs opacity-60 truncate">{track.artistName}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-xs font-mono opacity-50 mr-2">
                                                {formatDuration(track.duration)}
                                            </div>
                                            
                                            <button 
                                                className={clsx(
                                                    "btn btn-ghost btn-xs transition-colors",
                                                    starredTracks.has(String(track.id)) ? "text-primary opacity-100" : "opacity-0 group-hover:opacity-100"
                                                )}
                                                onClick={() => handleToggleStar(track)}
                                                title="Add to Favourites"
                                            >
                                                <Heart size={14} fill={starredTracks.has(String(track.id)) ? "currentColor" : "none"} />
                                            </button>

                                            <div className="dropdown dropdown-end">
                                                <button 
                                                    className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100"
                                                    onClick={() => setActivePlaylistMenu(String(track.id))}
                                                >
                                                    <Plus size={14}/>
                                                </button>
                                                {activePlaylistMenu === String(track.id) && (
                                                    <ul className="dropdown-content z-[50] menu p-2 shadow bg-base-200 rounded-box w-52 mt-1 border border-base-300 animate-in fade-in zoom-in duration-100">
                                                        <li className="menu-title text-xs uppercase opacity-50">Your Playlists</li>
                                                        {playlists.length === 0 ? (
                                                            <li className="disabled text-xs p-2">No playlists found</li>
                                                        ) : (
                                                            playlists.map(p => (
                                                                <li key={p.id}>
                                                                    <button 
                                                                        className="flex justify-between items-center text-sm"
                                                                        onClick={() => handleAddToPlaylist(track, String(p.id))}
                                                                    >
                                                                        {p.name}
                                                                        <Plus size={12} className="opacity-50"/>
                                                                    </button>
                                                                </li>
                                                            ))
                                                        )}
                                                    </ul>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* External & Streaming Results */}
                    {((results as any).external?.length > 0 || (results as any).streaming?.length > 0) && (
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-secondary">
                                <Globe size={20}/> Discover (External & Streaming)
                            </h2>
                            <div className="flex flex-col gap-1">
                                {[
                                    ...((results as any).streaming || []),
                                    ...((results as any).external || [])
                                ].map((rawItem: any) => {
                                    const isStreaming = !!rawItem.isStreaming;
                                    const trackId = isStreaming ? `ext:${rawItem.source}:${rawItem.id}` : `ext:search:${rawItem.artist} - ${rawItem.title}`;
                                    const item = { ...rawItem, id: trackId, originalId: rawItem.id };
                                    
                                    return (
                                        <div key={`${item.source}:${item.originalId}`} className="flex items-center gap-4 p-2 hover:bg-base-content/5 rounded-lg group">
                                        <button
                                            onClick={() => {
                                                 const virtualTrack: any = {
                                                     id: trackId,
                                                     streamUrl: `/api/tracks/${trackId}/stream`,
                                                    title: item.title,
                                                    artistName: item.artist,
                                                    albumName: item.albumTitle || 'External Release',
                                                    duration: item.duration || 0, 
                                                    coverImage: item.coverUrl || item.thumbnail,
                                                    isExternal: true,
                                                    source: item.source
                                                };
                                                playTrack(virtualTrack, []);
                                            }}
                                            className="relative w-10 h-10 shrink-0"
                                        >
                                             {(item.coverUrl || item.thumbnail) ? (
                                                 <img 
                                                    src={item.coverUrl || item.thumbnail} 
                                                    alt="" 
                                                    className="w-full h-full rounded object-cover" 
                                                    onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik05IDE4VjVsMTItMi43VjE0Ij48L3BhdGg+PGNpcmNsZSBjeD0iNiIgY3k9IjE4IiByPSIzIj48L2NpcmNsZT48Y2lyY2xlIGN4PSIxOCIgY3k9IjE2IiByPSIzIj48L2NpcmNsZT48L3N2Zz4='; // Music icon placeholder
                                                        target.className = "w-full h-full rounded object-cover opacity-30 p-2 bg-neutral";
                                                    }}
                                                 />
                                             ) : (
                                                 <div className="w-full h-full bg-neutral rounded flex items-center justify-center">
                                                     <Music size={16} />
                                                 </div>
                                             )}
                                             <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                                                 <Play size={16} fill="currentColor" />
                                             </div>
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold truncate">{item.title}</div>
                                            <div className="text-xs opacity-60 truncate">
                                                {item.artist} • <span className={clsx(
                                                    "uppercase font-bold",
                                                    item.source === 'spotify' ? 'text-[#1DB954]' :
                                                    item.source === 'soundcloud' ? 'text-[#FF3300]' :
                                                    item.source === 'deezer' ? 'text-[#EF5466]' :
                                                    item.source === 'bandcamp' ? 'text-[#629aa9]' :
                                                    item.source === 'youtube' ? 'text-[#FF0000]' :
                                                    'text-primary opacity-50'
                                                )}>{item.source}</span>
                                                {item.isStreaming && <span className="ml-2 badge badge-ghost badge-xs">Streaming</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {item.url && (
                                                <a 
                                                    href={item.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 flex items-center gap-1"
                                                    title="Open source link"
                                                >
                                                    <Globe size={12}/> Link
                                                </a>
                                            )}

                                            <button 
                                                className={clsx(
                                                    "btn btn-ghost btn-xs transition-colors",
                                                    starredTracks.has(item.id) ? "text-primary opacity-100" : "opacity-0 group-hover:opacity-100"
                                                )}
                                                onClick={() => handleToggleStar({...item, isExternal: true})}
                                                title="Add to Favourites"
                                            >
                                                <Heart size={14} fill={starredTracks.has(item.id) ? "currentColor" : "none"} />
                                            </button>

                                            <div className="dropdown dropdown-end">
                                                <button 
                                                    className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100"
                                                    onClick={() => setActivePlaylistMenu(item.id)}
                                                >
                                                    <Plus size={14}/> Add
                                                </button>
                                                {activePlaylistMenu === item.id && (
                                                    <ul className="dropdown-content z-[50] menu p-2 shadow bg-base-200 rounded-box w-52 mt-1 border border-base-300 animate-in fade-in zoom-in duration-100">
                                                        <li className="menu-title text-xs uppercase opacity-50">Your Playlists</li>
                                                        {playlists.length === 0 ? (
                                                            <li className="disabled text-xs p-2">No playlists found</li>
                                                        ) : (
                                                            playlists.map(p => (
                                                                <li key={p.id}>
                                                                    <button 
                                                                        className="flex justify-between items-center text-sm"
                                                                        onClick={() => handleAddToPlaylist(item, String(p.id))}
                                                                    >
                                                                        {p.name}
                                                                        <Plus size={12} className="opacity-50"/>
                                                                    </button>
                                                                </li>
                                                            ))
                                                        )}
                                                        <div className="divider my-1"></div>
                                                        <li>
                                                            <Link to="/library?tab=playlists" className="text-xs opacity-50 justify-center">Manage Playlists</Link>
                                                        </li>
                                                    </ul>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            </div>
                        </section>
                    )}
                    
                    {!results.artists?.length && !results.albums?.length && !results.tracks?.length && !(results as any).external?.length && (
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

