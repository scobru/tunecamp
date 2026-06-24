import { useState, useEffect } from 'react';
import API from '../services/api';
import { useSearchParams, Link } from 'react-router-dom';
import { Search as SearchIcon, Music, Disc, User, Play, Pause, Heart, Plus, Users } from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useAuthStore } from '../stores/useAuthStore';
import { PageHeader } from '../components/ui/PageHeader';
import { formatDuration } from '../utils/format';
import { notify } from '../utils/notify';
import clsx from 'clsx';
import type { Track, Album, Artist, Playlist } from '../types';

const Search = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const [inputValue, setInputValue] = useState(query);
    const [results, setResults] = useState<{ tracks: Track[], albums: Album[], artists: Artist[], peers?: any[] } | null>(null);
    const [loading, setLoading] = useState(false);
    const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayerStore();
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
                peers: data.peers || [],
            });
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
                notify.success("Removed from favorites");
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
                notify.success("Added to favorites");
            }
        } catch (e) {
            console.error("Error toggling track star:", e);
            notify.error(e, "Error toggling favorites");
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
                notify.success("Album removed from favorites");
            } else {
                // RESTRICTION: Only local albums can be starred.
                // Streaming/External albums must be localized/matched first.
                if (item.isExternal || id.startsWith('ext:')) {
                    notify.warning("You can only favorite albums in your library. Please localize or match this content first.");
                    return;
                }
                
                await API.starAlbum(id, {});
                const next = new Set(starredAlbums);
                next.add(id);
                setStarredAlbums(next);
                notify.success("Album added to favorites");
            }
        } catch (e) {
            console.error("Error toggling album star:", e);
            notify.error(e, "Error toggling album favorites");
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
                notify.success("Artist removed from favorites");
            } else {
                // RESTRICTION: Only local artists can be starred.
                if (item.isExternal || id.startsWith('ext:')) {
                    notify.warning("You can only favorite artists in your library. Please localize or match this content first.");
                    return;
                }
                
                await API.starArtist(id, {});
                const next = new Set(starredArtists);
                next.add(id);
                setStarredArtists(next);
                notify.success("Artist added to favorites");
            }
        } catch (e) {
            console.error("Error toggling artist star:", e);
            notify.error(e, "Error toggling artist favorites");
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
            notify.success("Track added to playlist");
        } catch (e) {
            console.error("Error adding to playlist:", e);
            notify.error(e, "Failed to add track to playlist");
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Standardized Header */}
            <PageHeader 
                title="Search" 
                subtitle="Search tracks, albums and artists in TuneCamp"
                icon={SearchIcon}
                iconColor="text-primary"
            />
            
            <form onSubmit={onSearchSubmit} className="flex gap-2 mb-8">
                <div className="relative flex-full w-full">
                    <input 
                        type="text" 
                        placeholder="Search for songs, artists, albums..." 
                        aria-label="Search"
                        className="input input-bordered w-full text-lg pr-12 rounded-full shadow-level-1 focus:shadow-level-2 transition-all duration-medium-2"
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
                <button type="submit" className="btn btn-primary px-8 rounded-full shadow-level-1">
                    Search
                </button>
            </form>

            {loading ? (
                <div className="text-center opacity-50 py-12 flex flex-col items-center gap-4">
                    <div className="loading loading-spinner loading-lg text-primary"></div>
                    <p className="text-lg">Searching TuneCamp library...</p>
                </div>
            ) : results ? (
                <div className="space-y-8">
                    {/* Artists */}
                    {results.artists?.length > 0 && (
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><User size={20}/> Artists</h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {results.artists.map(artist => (
                                     <div key={artist.id} className="group card-m3 overflow-hidden">
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
                                                             "btn btn-circle btn-ghost btn-sm tooltip tooltip-top",
                                                             starredArtists.has(String(artist.id)) ? "text-primary opacity-100" : "text-white"
                                                         )}
                                                         onClick={(e) => {
                                                             e.preventDefault();
                                                             e.stopPropagation();
                                                             handleToggleStarArtist(artist);
                                                         }}
                                                         data-tip={starredArtists.has(String(artist.id)) ? "Remove from Favorites" : "Add to Favorites"}
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
                                            <div key={album.id} className="group card-m3 overflow-hidden">
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
                                                    "btn btn-ghost btn-xs transition-colors tooltip tooltip-left",
                                                    starredTracks.has(String(track.id)) ? "text-primary opacity-100" : "opacity-0 group-hover:opacity-100"
                                                )}
                                                onClick={() => handleToggleStar(track)}
                                                data-tip={starredTracks.has(String(track.id)) ? "Remove from Favorites" : "Add to Favorites"}
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
                                                        <li className="menu-title text-xs opacity-50">Your Playlists</li>
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

                    {/* Peer Tracks */}
                    {results.peers && results.peers.length > 0 && (
                        <section>
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-accent">
                                <Users size={20}/> Connected Peer Channels
                            </h2>
                            <div className="flex flex-col gap-2 bg-base-200/20 p-4 rounded-2xl border border-base-content/5">
                                {results.peers.map((track) => {
                                    const peerTrackId = `peer:${track.session_id}:${track.id}`;
                                    const isCurrent = currentTrack?.id === peerTrackId;
                                    const isCurrentlyPlaying = isCurrent && isPlaying;
                                    const playerTrack = {
                                        id: peerTrackId,
                                        title: track.title,
                                        artistName: track.artist || track.username || "Unknown Artist",
                                        albumTitle: track.album || "Peer Share",
                                        streamUrl: `/api/peers/${track.session_id}/tracks/${track.id}/stream?token=${API.getToken()}`,
                                        coverUrl: "",
                                        coverImage: "",
                                        duration: track.duration || 0,
                                        service: "peer",
                                    };

                                    const handlePlayClick = () => {
                                        if (isCurrent) {
                                            togglePlay();
                                        } else {
                                            const playerQueue = results.peers!.map((t) => ({
                                                id: `peer:${t.session_id}:${t.id}`,
                                                title: t.title,
                                                artistName: t.artist || t.username || "Unknown Artist",
                                                albumTitle: t.album || "Peer Share",
                                                streamUrl: `/api/peers/${t.session_id}/tracks/${t.id}/stream?token=${API.getToken()}`,
                                                coverUrl: "",
                                                coverImage: "",
                                                duration: t.duration || 0,
                                                service: "peer",
                                            }));
                                            playTrack(playerTrack as any, playerQueue as any);
                                        }
                                    };

                                    return (
                                        <div key={peerTrackId} className={`flex items-center gap-4 p-2 hover:bg-base-content/5 rounded-lg group ${isCurrent ? "bg-primary/5" : ""}`}>
                                            <button
                                                onClick={handlePlayClick}
                                                className="relative w-10 h-10 shrink-0 bg-base-300 rounded flex items-center justify-center"
                                                aria-label={`Play ${track.title}`}
                                            >
                                                {isCurrentlyPlaying ? (
                                                    <Pause size={16} fill="currentColor" />
                                                ) : (
                                                    <Play size={16} fill="currentColor" className="ml-0.5" />
                                                )}
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <div className={`font-bold truncate ${isCurrent ? "text-primary" : ""}`}>{track.title}</div>
                                                <div className="text-xs opacity-60 truncate flex items-center gap-1.5 mt-0.5">
                                                    <span>{track.artist || track.username || "Unknown Artist"}</span>
                                                    {track.album && (
                                                        <>
                                                            <span className="opacity-45">•</span>
                                                            <span className="italic">{track.album}</span>
                                                        </>
                                                    )}
                                                    <span className="opacity-45">•</span>
                                                    <span className="badge badge-xs badge-ghost text-[10px] px-1.5 py-0.5 font-bold">
                                                        Shared by {track.username || "Unknown"}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="text-xs font-mono opacity-50 mr-2">
                                                    {formatDuration(track.duration || 0)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {!results.artists?.length && !results.albums?.length && !results.tracks?.length && !results.peers?.length && (
                        <div className="text-center opacity-50">No results found for "{query}"</div>
                    )}
                </div>
            ) : (
                <div className="text-center opacity-30 py-12 flex flex-col items-center gap-4">
                    <Music size={64}/>
                    <p className="text-xl">Search TuneCamp</p>
                </div>
            )}
        </div>
    );
};

export default Search;

