import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { usePlayerStore } from "../stores/usePlayerStore";
import { queryKeys } from "../hooks/queries";
import { formatDuration } from "../utils/format";
import type { Track, Album, Artist, Release, Playlist, UserPlaylist } from "../types";
import { ReleaseCard } from "../components/ui/ReleaseCard";
import { PageHeader } from "../components/ui/PageHeader";
import { CreateUserPlaylistModal } from "../components/modals/CreateUserPlaylistModal";
import clsx from "clsx";
import {
  Library as LibraryIcon,
  Heart,
  Music,
  Disc,
  User,
  Play,
  Clock,
  ArrowRight,
  ListMusic,
  Globe,
  Lock,
  LayoutGrid,
  List,
  AlignJustify,
  Plus
} from "lucide-react";

// --- Helpers from Playlists.tsx ---
const isGenreMix = (p: Playlist) =>
  p.username === "system" || String(p.id).startsWith("genre:");

const renderPlaylistCover = (p: Playlist, iconSize: number) => {
  const trackCovers = p.trackCovers || [];
  if (p.coverPath) return <img src={p.coverPath} className="w-full h-full object-cover" alt="" />;
  if (trackCovers.length >= 4) {
    return (
      <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
        {trackCovers.map((url, i) => (
          <img key={i} src={url} className="w-full h-full object-cover" alt="" />
        ))}
      </div>
    );
  }
  if (trackCovers.length > 0) return <img src={trackCovers[0]} className="w-full h-full object-cover" alt="" />;
  return <Music size={iconSize} className="text-secondary" />;
};

// --- Components from Favorites.tsx ---
const EmptyState = ({ icon: Icon, message }: { icon: any; message: string }) => (
  <div className="py-24 text-center opacity-40 bg-base-200/20 rounded-[3rem] border border-dashed border-base-content/10 flex flex-col items-center gap-4">
    <div className="p-6 bg-base-content/5 rounded-full">
       <Icon size={48} />
    </div>
    <p className="text-xl font-medium">{message}</p>
    <Link to="/" className="btn btn-ghost btn-sm gap-2 mt-4 hover:bg-primary/10 hover:text-primary">
       Discover Music <ArrowRight size={16} />
    </Link>
  </div>
);

const ArtistCard = ({ artist, onRemove }: { artist: Artist; onRemove: () => void }) => (
  <div className="group relative text-center space-y-4">
    <Link to={`/artists/${artist.slug || artist.id}`} className="block">
      <div className="aspect-square rounded-full overflow-hidden bg-neutral ring-4 ring-transparent group-hover:ring-primary/20 transition-all duration-500 shadow-level-1 relative">
        {artist.coverImage ? (
          <img
            src={API.getArtistCoverUrl(artist.id)}
            alt={artist.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl font-black opacity-30">
            {artist.name[0]}
          </div>
        )}
        <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
    <button 
      onClick={onRemove}
      className="absolute top-0 right-0 p-2 bg-base-100/80 backdrop-blur-md rounded-full text-error opacity-0 group-hover:opacity-100 transition-opacity shadow-level-1 hover:bg-error hover:text-white z-10"
      title="Unfollow artist"
    >
      <Heart size={14} fill="currentColor" />
    </button>
    <div className="space-y-1">
      <Link to={`/artists/${artist.slug || artist.id}`}>
        <h3 className="font-bold truncate px-2 group-hover:text-primary transition-colors text-lg tracking-tight">
          {artist.name}
        </h3>
      </Link>
      <p className="text-xs font-black tracking-normal opacity-40">Artist</p>
    </div>
  </div>
);

const TrackList = ({
  tracks,
  onPlay,
  onRemove,
}: {
  tracks: Track[];
  onPlay: (t: Track) => void;
  onRemove: (id: string | number) => void;
}) => (
  <div className="overflow-visible bg-base-200/30 rounded-[2.5rem] border border-base-content/5 backdrop-blur-sm shadow-inner">
    <table className="table w-full">
      <thead>
        <tr className="border-b border-base-content/5 opacity-40 text-xs font-black tracking-[0.2em]">
          <th className="w-16 text-center">#</th>
          <th>Title</th>
          <th className="hidden md:table-cell">Album</th>
          <th className="text-right w-24">
            <Clock size={14} className="ml-auto" />
          </th>
          <th className="w-12"></th>
        </tr>
      </thead>
      <tbody>
        {tracks.map((track, i) => (
          <tr key={track.id} className="hover:bg-primary/5 group border-b border-base-content/5 last:border-0 transition-all duration-200">
            <td className="text-center font-mono w-16 relative">
              <span className="opacity-40 group-hover:opacity-0 transition-opacity text-xs">
                {(i + 1).toString().padStart(2, '0')}
              </span>
              <button
                onClick={() => onPlay(track)}
                className="opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 flex items-center justify-center text-primary"
              >
                <Play size={18} fill="currentColor" />
              </button>
            </td>
            <td>
              <div className="flex flex-col">
                <span className="font-bold text-base tracking-tight group-hover:text-primary transition-colors cursor-pointer" onClick={() => onPlay(track)}>
                  {track.title}
                </span>
                <span className="text-xs opacity-50 font-bold tracking-normal mt-0.5">
                  {track.artistName}
                </span>
              </div>
            </td>
            <td className="hidden md:table-cell">
               <span className="opacity-60 text-sm font-medium">{track.albumName}</span>
            </td>
            <td className="text-right opacity-40 font-mono text-xs tabular-nums">
              {formatDuration(track.duration)}
            </td>
            <td className="text-center">
              <button 
                onClick={() => onRemove(track.id)}
                className="btn btn-ghost btn-xs btn-circle text-error opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove from favorites"
              >
                <Heart size={14} fill="currentColor" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);


// --- Main Library Component ---
const Library = () => {
  const { isAuthenticated, isInitializing, user } = useAuthStore();
  const { playTrack } = usePlayerStore();
  const queryClient = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "playlists";
  const setTab = (t: string) => setSearchParams({ tab: t }, { replace: true });

  // Playlists State
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [playlistViewMode, setPlaylistViewMode] = useState<'grid' | 'list' | 'minimal'>('minimal');
  const [playlistSubTab, setPlaylistSubTab] = useState<'mine' | 'public'>('mine');

  // Favorites Data
  const tracksQuery = useQuery({ queryKey: queryKeys.tracks(false), queryFn: () => API.getTracks({ mine: false }), enabled: isAuthenticated });
  const albumsQuery = useQuery({ queryKey: queryKeys.albums, queryFn: () => API.getAlbums(), enabled: isAuthenticated });
  const releasesQuery = useQuery({ queryKey: queryKeys.releases, queryFn: () => API.getReleases(), enabled: isAuthenticated });
  const artistsQuery = useQuery({ queryKey: queryKeys.artists, queryFn: () => API.getArtists(), enabled: isAuthenticated });

  const loadingFavorites = isAuthenticated && (tracksQuery.isLoading || albumsQuery.isLoading || releasesQuery.isLoading || artistsQuery.isLoading);

  const favTracks = useMemo(() => (tracksQuery.data ?? []).filter((t) => t.starred), [tracksQuery.data]);
  const favAlbums = useMemo(() => {
    const merged = [...(albumsQuery.data ?? []), ...(releasesQuery.data ?? [])];
    const unique = Array.from(new Map(merged.map(a => [String(a.id), a])).values());
    return unique.filter((a) => a.starred) as (Album | Release)[];
  }, [albumsQuery.data, releasesQuery.data]);
  const favArtists = useMemo(() => (artistsQuery.data ?? []).filter((a) => a.starred), [artistsQuery.data]);

  // Load Playlists
  useEffect(() => {
    if (!isAuthenticated) {
      setPlaylistsLoading(false);
      return;
    }
    const loadPlaylists = async () => {
      setPlaylistsLoading(true);
      try {
        const data = await API.getPlaylists();
        setPlaylists(data);
      } catch (e) {
        console.error(e);
      } finally {
        setPlaylistsLoading(false);
      }
    };
    loadPlaylists();
    window.addEventListener("refresh-playlists", loadPlaylists);
    return () => window.removeEventListener("refresh-playlists", loadPlaylists);
  }, [isAuthenticated]);

  const handlePlaylistCreated = (newPlaylist: Playlist | UserPlaylist) => {
    setPlaylists((prev) => {
      if (prev.some((p) => p.id === newPlaylist.id)) return prev;
      return [newPlaylist as Playlist, ...prev];
    });
  };

  const handleUnstar = async (type: 'track' | 'album' | 'artist', id: string | number) => {
    try {
      const clearStar = <T extends { id: string | number; starred?: boolean }>(key: readonly unknown[]) =>
        queryClient.setQueryData<T[]>(key, prev => (prev ?? []).map(it => it.id === id ? { ...it, starred: false } : it));
      if (type === 'track') {
        await API.unstarTrack(id);
        clearStar<Track>(queryKeys.tracks(false));
      } else if (type === 'album') {
        await API.unstarAlbum(id);
        clearStar<Album>(queryKeys.albums);
        clearStar<Release>(queryKeys.releases);
      } else if (type === 'artist') {
        await API.unstarArtist(id);
        clearStar<Artist>(queryKeys.artists);
      }
    } catch (err) {
      console.error("Failed to unstar:", err);
    }
  };

  if (isInitializing) {
    return <div className="p-12 text-center opacity-50 text-xl font-bold animate-pulse">Initializing...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="p-20 text-center animate-fade-in max-w-lg mx-auto bg-base-200/50 rounded-[3rem] border border-base-content/5 mt-10">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-8">
           <LibraryIcon size={40} className="text-primary" />
        </div>
        <h2 className="text-3xl font-black mb-4 tracking-tighter">Your Library</h2>
        <p className="opacity-60 mb-8 leading-relaxed">
          Sign in to your account to see your collection of playlists, tracks, albums, and artists.
        </p>
        <button
          className="btn btn-primary btn-lg px-12 rounded-2xl shadow-level-1 shadow-primary/20"
          onClick={() => document.dispatchEvent(new CustomEvent("open-auth-modal"))}
        >
          Login Now
        </button>
      </div>
    );
  }

  const minePlaylists = playlists.filter((p) => !isGenreMix(p) && p.username === user?.username);
  const publicPlaylists = playlists.filter((p) => p.isPublic);
  const visiblePlaylists = playlistSubTab === "mine" ? minePlaylists : publicPlaylists;

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      <PageHeader 
        title="Your Library" 
        subtitle="Playlists, likes and the artists you follow"
        icon={LibraryIcon}
        iconColor="text-primary"
      >
        {tab === "playlists" && (
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="join bg-base-200 w-full sm:w-auto justify-center">
              <button
                className={clsx("btn btn-sm join-item flex-1 sm:flex-initial", playlistViewMode === 'grid' && "btn-active")}
                onClick={() => setPlaylistViewMode('grid')}
                title="Grid View"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                className={clsx("btn btn-sm join-item flex-1 sm:flex-initial", playlistViewMode === 'list' && "btn-active")}
                onClick={() => setPlaylistViewMode('list')}
                title="List View"
              >
                <List size={16} />
              </button>
              <button
                className={clsx("btn btn-sm join-item flex-1 sm:flex-initial", playlistViewMode === 'minimal' && "btn-active")}
                onClick={() => setPlaylistViewMode('minimal')}
                title="Minimal View"
              >
                <AlignJustify size={16} />
              </button>
            </div>
            {playlistSubTab === "mine" && (
              <button
                className="btn btn-primary btn-sm h-10 w-full sm:w-auto gap-2"
                onClick={() => document.dispatchEvent(new CustomEvent("open-create-user-playlist-modal"))}
              >
                <Plus size={20} /> New Playlist
              </button>
            )}
          </div>
        )}
      </PageHeader>

      {/* Tabs */}
      <div className="tabs tabs-boxed bg-base-300/50 p-1 rounded-2xl w-fit flex-nowrap overflow-x-auto shrink-0">
        <button
          className={clsx("tab tab-lg px-6 gap-2 font-bold shrink-0", tab === "playlists" && "tab-active")}
          onClick={() => setTab("playlists")}
        >
          <ListMusic size={18} /> Playlists
          <span className="badge badge-sm opacity-50 ml-1">{playlists.length}</span>
        </button>
        <button
          className={clsx("tab tab-lg px-6 gap-2 font-bold shrink-0", tab === "tracks" && "tab-active")}
          onClick={() => setTab("tracks")}
        >
          <Music size={18} /> Tracks
          <span className="badge badge-sm opacity-50 ml-1">{favTracks.length}</span>
        </button>
        <button
          className={clsx("tab tab-lg px-6 gap-2 font-bold shrink-0", tab === "albums" && "tab-active")}
          onClick={() => setTab("albums")}
        >
          <Disc size={18} /> Albums
          <span className="badge badge-sm opacity-50 ml-1">{favAlbums.length}</span>
        </button>
        <button
          className={clsx("tab tab-lg px-6 gap-2 font-bold shrink-0", tab === "artists" && "tab-active")}
          onClick={() => setTab("artists")}
        >
          <User size={18} /> Artists
          <span className="badge badge-sm opacity-50 ml-1">{favArtists.length}</span>
        </button>
      </div>

      <main className="min-h-[400px]">
        {/* Playlists Tab Content */}
        {tab === "playlists" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            <div role="tablist" className="tabs tabs-boxed bg-base-200 w-fit">
              <button
                role="tab"
                className={clsx("tab gap-2", playlistSubTab === "mine" && "tab-active")}
                onClick={() => setPlaylistSubTab("mine")}
              >
                <Heart size={14} /> My Playlists
              </button>
              <button
                role="tab"
                className={clsx("tab gap-2", playlistSubTab === "public" && "tab-active")}
                onClick={() => setPlaylistSubTab("public")}
              >
                <Globe size={14} /> Public
              </button>
            </div>

            {playlistsLoading ? (
              <div className="text-center opacity-50 py-12">Loading playlists...</div>
            ) : visiblePlaylists.length === 0 ? (
              <div className="text-center opacity-50 py-16 border-2 border-dashed border-base-content/5 rounded-2xl">
                <ListMusic size={48} className="mx-auto mb-4 opacity-50" />
                {playlistSubTab === "mine" ? (
                  <>
                    <p className="text-lg font-bold">No playlists yet</p>
                    <p className="text-sm mt-2 opacity-70">
                      Create your first playlist to start collecting your favorite tracks!
                    </p>
                    <button
                      className="btn btn-primary btn-sm gap-2 mt-6"
                      onClick={() => document.dispatchEvent(new CustomEvent("open-create-user-playlist-modal"))}
                    >
                      <Plus size={16} /> Create Playlist
                    </button>
                  </>
                ) : (
                  <p className="text-lg">No public playlists found.</p>
                )}
              </div>
            ) : (
              <div className={clsx(
                "grid gap-6",
                playlistViewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" :
                playlistViewMode === 'list' ? "grid-cols-1 md:grid-cols-2" :
                "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"
              )}>
                {visiblePlaylists.map((p) => (
                  <Link
                    to={`/playlists/${p.id}`}
                    key={p.id}
                    className={clsx(
                      "group transition-all duration-300 shadow-level-1 border border-base-content/5 overflow-hidden",
                      playlistViewMode === 'grid' && "card bg-base-200 hover:bg-base-300 hover:-translate-y-1",
                      playlistViewMode === 'list' && "flex items-center gap-4 bg-base-200 p-4 rounded-xl hover:bg-base-300",
                      playlistViewMode === 'minimal' && "flex items-center gap-3 bg-base-200/40 p-2 px-3 rounded-lg hover:bg-base-200"
                    )}
                  >
                    {playlistViewMode === 'grid' ? (
                      <div className="card-body">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center overflow-hidden shrink-0">
                            {renderPlaylistCover(p, 20)}
                          </div>
                          <h2 className="card-title text-xl group-hover:text-primary transition-colors truncate">
                            {p.name}
                          </h2>
                        </div>
                        {p.description && (
                          <p className="opacity-70 line-clamp-2 text-sm">
                            {p.description}
                          </p>
                        )}
                        <div className="card-actions justify-end mt-4 items-center gap-3">
                          <div className="badge badge-ghost gap-1">
                            {p.isPublic ? <Globe size={12} /> : <Lock size={12} />}
                            {p.isPublic ? "Public" : "Private"}
                          </div>
                          <span className="text-xs opacity-50">
                            {p.trackCount} tracks
                          </span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={clsx(
                          "rounded-lg bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center overflow-hidden shrink-0",
                          playlistViewMode === 'list' ? "w-12 h-12" : "w-8 h-8"
                        )}>
                          {renderPlaylistCover(p, playlistViewMode === 'list' ? 20 : 14)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h2 className={clsx(
                            "font-bold group-hover:text-primary transition-colors truncate",
                            playlistViewMode === 'list' ? "text-lg" : "text-sm"
                          )}>
                            {p.name}
                          </h2>
                          {playlistViewMode === 'list' && p.description && (
                            <p className="opacity-60 text-xs truncate">{p.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs opacity-40 tabular-nums">
                            {p.trackCount} tracks
                          </span>
                          {playlistViewMode === 'list' && (
                             <div className="badge badge-ghost badge-sm gap-1 opacity-50">
                              {p.isPublic ? <Globe size={10} /> : <Lock size={10} />}
                              {p.isPublic ? "Public" : "Private"}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </Link>
                ))}
              </div>
            )}
            <CreateUserPlaylistModal onCreated={handlePlaylistCreated} />
          </div>
        )}

        {/* Tracks Tab Content */}
        {tab === "tracks" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             {loadingFavorites ? <div className="text-center opacity-50 py-12">Loading tracks...</div> : (
                favTracks.length === 0 ? (
                  <EmptyState icon={Music} message="You haven't liked any tracks yet." />
                ) : (
                  <TrackList 
                    tracks={favTracks} 
                    onPlay={(t) => playTrack(t, favTracks)} 
                    onRemove={(id) => handleUnstar('track', id)}
                  />
                )
             )}
          </div>
        )}

        {/* Albums Tab Content */}
        {tab === "albums" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {loadingFavorites ? <div className="text-center opacity-50 py-12">Loading albums...</div> : (
              favAlbums.length === 0 ? (
                <EmptyState icon={Disc} message="You haven't liked any albums yet." />
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {favAlbums.map((album) => (
                    <div key={album.id} className="relative group/album">
                      <ReleaseCard item={album} viewMode="grid" type="library" />
                      <button 
                        onClick={() => handleUnstar('album', album.id)}
                        className="absolute top-2 right-2 p-2 bg-base-100/80 backdrop-blur-md rounded-xl text-error opacity-0 group-hover/album:opacity-100 transition-opacity shadow-level-1 hover:bg-error hover:text-white"
                        title="Remove from favorites"
                      >
                        <Heart size={16} fill="currentColor" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {/* Artists Tab Content */}
        {tab === "artists" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {loadingFavorites ? <div className="text-center opacity-50 py-12">Loading artists...</div> : (
              favArtists.length === 0 ? (
                <EmptyState icon={User} message="You haven't followed any artists yet." />
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {favArtists.map((artist) => (
                    <ArtistCard 
                      key={artist.id} 
                      artist={artist} 
                      onRemove={() => handleUnstar('artist', artist.id)}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Library;
