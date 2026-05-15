import { useState, useEffect } from "react";
import { useAuthStore } from "../stores/useAuthStore";
import { usePlayerStore } from "../stores/usePlayerStore";
import API from "../services/api";
import {
  Heart,
  Music,
  Disc,
  User,
  Play,
  Clock,
  ArrowRight
} from "lucide-react";
import { formatDuration } from "../utils/format";
import type { Track, Album, Artist, Release } from "../types";
import { ReleaseCard } from "../components/ui/ReleaseCard";
import { Link } from "react-router-dom";
import clsx from "clsx";

export const Favorites = () => {
  const { isAuthenticated, isInitializing } = useAuthStore();
  const { playTrack } = usePlayerStore();

  const [activeTab, setActiveTab] = useState<"tracks" | "albums" | "artists">(
    "tracks"
  );
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<(Album | Release)[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshData();
  }, [isAuthenticated]);

  const refreshData = () => {
    if (isAuthenticated) {
      setLoading(true);
      Promise.all([
        API.getTracks().catch(() => []),
        API.getAlbums().catch(() => []),
        API.getReleases().catch(() => []),
        API.getArtists().catch(() => []),
      ])
        .then(([allTracks, allAlbums, allReleases, allArtists]) => {
          setTracks(allTracks.filter((t) => t.starred));
          // Merge regular albums and formal releases
          const mergedAlbums = [...allAlbums, ...allReleases];
          const uniqueAlbums = Array.from(new Map(mergedAlbums.map(a => [String(a.id), a])).values());
          setAlbums(uniqueAlbums.filter((a) => a.starred));
          setArtists(allArtists.filter((a) => a.starred));
        })
        .finally(() => setLoading(false));
    }
  };

  const handleUnstar = async (type: 'track' | 'album' | 'artist', id: string | number) => {
    try {
      if (type === 'track') {
        await API.unstarTrack(id);
        setTracks(prev => prev.filter(t => t.id !== id));
      } else if (type === 'album') {
        await API.unstarAlbum(id);
        setAlbums(prev => prev.filter(a => a.id !== id));
      } else if (type === 'artist') {
        await API.unstarArtist(id);
        setArtists(prev => prev.filter(a => a.id !== id));
      }
    } catch (err) {
      console.error("Failed to unstar:", err);
    }
  };

  if (isInitializing) {
    return (
      <div className="p-12 text-center opacity-50 text-xl font-bold animate-pulse">
        Initializing...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="p-20 text-center animate-fade-in max-w-lg mx-auto bg-base-200/50 rounded-[3rem] border border-base-content/5 mt-10">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-8">
           <Heart size={40} className="text-primary" />
        </div>
        <h2 className="text-3xl font-black mb-4 tracking-tighter">Login Required</h2>
        <p className="opacity-60 mb-8 leading-relaxed">
          Sign in to your account to see your collection of favorite tracks, albums, and artists.
        </p>
        <button
          className="btn btn-primary btn-lg px-12 rounded-2xl shadow-xl shadow-primary/20"
          onClick={() =>
            document.dispatchEvent(new CustomEvent("open-auth-modal"))
          }
        >
          Login Now
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      <header className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-2xl text-primary">
             <Heart size={32} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase italic">
              Favorites
            </h1>
            <p className="text-xs opacity-50 font-bold tracking-widest uppercase mt-1">
              Your curated collection of sounds
            </p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="tabs tabs-boxed bg-base-300/50 p-1 rounded-2xl w-fit">
        <button
          className={clsx(
            "tab tab-lg px-8 gap-2 font-bold",
            activeTab === "tracks" && "tab-active"
          )}
          onClick={() => setActiveTab("tracks")}
        >
          <Music size={18} /> Tracks
          <span className="badge badge-sm opacity-50 ml-1">{tracks.length}</span>
        </button>
        <button
          className={clsx(
            "tab tab-lg px-8 gap-2 font-bold",
            activeTab === "albums" && "tab-active"
          )}
          onClick={() => setActiveTab("albums")}
        >
          <Disc size={18} /> Albums
          <span className="badge badge-sm opacity-50 ml-1">{albums.length}</span>
        </button>
        <button
          className={clsx(
            "tab tab-lg px-8 gap-2 font-bold",
            activeTab === "artists" && "tab-active"
          )}
          onClick={() => setActiveTab("artists")}
        >
          <User size={18} /> Artists
          <span className="badge badge-sm opacity-50 ml-1">{artists.length}</span>
        </button>
      </div>

      <main className="min-h-[400px]">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-square bg-base-300 rounded-3xl" />
            ))}
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {activeTab === "tracks" && (
              tracks.length === 0 ? (
                <EmptyState icon={Music} message="You haven't liked any tracks yet." />
              ) : (
                <TrackList 
                  tracks={tracks} 
                  onPlay={(t) => playTrack(t, tracks)} 
                  onRemove={(id) => handleUnstar('track', id)}
                />
              )
            )}

            {activeTab === "albums" && (
              albums.length === 0 ? (
                <EmptyState icon={Disc} message="You haven't liked any albums yet." />
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {albums.map((album) => (
                    <div key={album.id} className="relative group/album">
                      <ReleaseCard item={album} viewMode="grid" type="library" />
                      <button 
                        onClick={() => handleUnstar('album', album.id)}
                        className="absolute top-2 right-2 p-2 bg-base-100/80 backdrop-blur-md rounded-xl text-error opacity-0 group-hover/album:opacity-100 transition-opacity shadow-lg hover:bg-error hover:text-white"
                        title="Remove from favorites"
                      >
                        <Heart size={16} fill="currentColor" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}

            {activeTab === "artists" && (
              artists.length === 0 ? (
                <EmptyState icon={User} message="You haven't followed any artists yet." />
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {artists.map((artist) => (
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
    <Link
      to={`/artists/${artist.slug || artist.id}`}
      className="block"
    >
      <div className="aspect-square rounded-full overflow-hidden bg-neutral ring-4 ring-transparent group-hover:ring-primary/20 transition-all duration-500 shadow-2xl relative">
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
      className="absolute top-0 right-0 p-2 bg-base-100/80 backdrop-blur-md rounded-full text-error opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-error hover:text-white z-10"
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
      <p className="text-[10px] uppercase font-black tracking-widest opacity-40">Artist</p>
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
        <tr className="border-b border-base-content/5 opacity-40 text-[10px] uppercase font-black tracking-[0.2em]">
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
          <tr
            key={track.id}
            className="hover:bg-primary/5 group border-b border-base-content/5 last:border-0 transition-all duration-200"
          >
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
                <span className="text-[10px] opacity-50 font-bold uppercase tracking-widest mt-0.5">
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
