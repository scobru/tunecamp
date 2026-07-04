import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import API from "../services/api";
import { Library } from "lucide-react";
import { ReleaseCard } from "../components/ui/ReleaseCard";
import { queryKeys } from "../hooks/queries";
import { useSiteSettingsStore } from "../stores/useSiteSettingsStore";
import { useAuthStore } from "../stores/useAuthStore";
import { usePlayerStore } from "../stores/usePlayerStore";
import { Play, Pause, Shuffle } from "lucide-react";
import clsx from "clsx";

const Home = () => {
  const navigate = useNavigate();
  const { data: catalog, isLoading: loading } = useQuery({
    queryKey: queryKeys.catalog,
    queryFn: () => API.getCatalog(),
  });
  const { settings: siteSettings, fetchFlags, isModuleHidden } = useSiteSettingsStore();

  // Cap the number of items shown on Home to reduce cognitive load.
  // The full lists live behind the "View All" links (cf. Spotify redesign:
  // a Home that surfaces a few relevant things instead of an endless wall).
  const HOME_RELEASES_LIMIT = 10;
  const HOME_LIBRARY_LIMIT = 8;
  const HOME_GENRES_LIMIT = 12;

  const recentAlbums: any[] = (catalog?.recentReleases || []).slice(0, HOME_RELEASES_LIMIT);
  const libraryAlbums: any[] = (catalog?.recentAlbums || []).slice(0, HOME_LIBRARY_LIMIT);
  const stats: any = catalog?.stats || {};
  const genres: string[] = (stats.genres || []).slice(0, HOME_GENRES_LIMIT);

  const { user } = useAuthStore();
  const { currentTrack, isPlaying, togglePlay, progress, duration, playQueue, recentlyPlayed } = usePlayerStore();

  const handleResume = () => {
    togglePlay();
  };

  const handleShuffleLatest = async () => {
    try {
      // Fetch some random tracks to shuffle
      const data = await API.getRandomTracks(20);
      if (data && data.length > 0) {
        playQueue(data, 0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const handlePlayHistory = async (e: React.MouseEvent, item: any) => {
    e.preventDefault();
    if (item.type === 'track' || item.type === 'radio') {
      try {
        const data = await API.getTrack(item.trackId || item.id);
        if (data) playQueue([data], 0);
      } catch (err) { console.error(err); }
    } else if (item.type === 'album') {
      try {
        const data = await API.getAlbum(item.id);
        if (data && data.tracks) playQueue(data.tracks, 0);
      } catch (err) { console.error(err); }
    } else if (item.type === 'playlist') {
      try {
        const data = await API.getPlaylist(String(item.id));
        if (data && data.tracks) playQueue(data.tracks, 0);
      } catch (err) { console.error(err); }
    }
  };

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  if (loading) {
    return (
      <div className="p-4 lg:p-8 space-y-8">
        <div className="space-y-4">
          <div className="skeleton h-40 w-full rounded-[2rem]"></div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div
              key={i}
              className="card bg-base-200 border border-base-content/5 shadow-level-1"
            >
              <figure className="aspect-square w-full">
                <div className="skeleton w-full h-full rounded-none"></div>
              </figure>
              <div className="card-body p-4 gap-2">
                <div className="skeleton h-4 w-3/4 rounded"></div>
                <div className="skeleton h-3 w-1/2 rounded opacity-50"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }


  const heroStyle = siteSettings?.coverImage
    ? {
        backgroundImage: `url(${siteSettings.coverImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {};

  return (
    <section className="space-y-10 pb-20">
      {/* Actionable Hero Section */}
      <div
        className={clsx(
          "relative flex flex-col md:flex-row items-center justify-between px-6 py-8 lg:px-10 lg:py-12 rounded-[2rem] overflow-hidden border border-base-content/5 gap-8",
          !siteSettings?.coverImage && "bg-gradient-to-br from-primary/5 to-secondary/5"
        )}
        style={heroStyle}
      >
        {siteSettings?.coverImage && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
        )}

        <div className="relative z-10 max-w-2xl w-full">
          <h1 className={clsx(
            "text-3xl lg:text-5xl font-black tracking-tighter mb-3 leading-tight",
            siteSettings?.coverImage ? "text-white" : "text-prominent"
          )}>
            {getGreeting()}{user?.username ? `, ${user.username}` : ""}
          </h1>
          <p className="text-base lg:text-lg text-base-content/60 mb-6 max-w-lg leading-relaxed">
            {siteSettings?.siteDescription ||
              "Your decentralized, self-hosted music streaming gateway."}
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <button 
              onClick={handleResume} 
              className="btn btn-primary rounded-xl px-8 border-none flex items-center gap-2 shadow-level-2 shadow-primary/30 text-primary-content hover:-translate-y-1 transition-transform"
            >
              {isPlaying ? <Pause fill="currentColor" size={20} /> : <Play fill="currentColor" size={20} />}
              {isPlaying ? "Pause" : "Resume"}
            </button>
            <button 
              onClick={handleShuffleLatest} 
              className="btn btn-secondary rounded-xl px-8 border-none flex items-center gap-2 shadow-level-2 shadow-secondary/30 text-secondary-content hover:-translate-y-1 transition-transform"
            >
              <Shuffle size={20} />
              Shuffle Latest
            </button>
            {!isModuleHidden("hideNetwork") && (
              <Link to="/network" className="btn btn-ghost rounded-xl border border-base-content/10 hidden sm:flex">
                Explore Network
              </Link>
            )}
          </div>
        </div>

        {/* Optional Last Played Card inside Hero */}
        {currentTrack && (
          <div className="relative z-10 hidden lg:block w-72 shrink-0 group">
            <div className="card bg-base-100/50 backdrop-blur-xl border border-base-content/10 shadow-level-2 overflow-hidden hover:bg-base-100 transition-colors cursor-pointer" onClick={handleResume}>
              <div className="flex items-center gap-4 p-4">
                <div className="relative w-16 h-16 rounded-lg overflow-hidden shadow-level-1 shrink-0">
                  <img 
                    src={currentTrack.coverUrl || "/placeholder.png"} 
                    alt={currentTrack.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.png' }}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="btn btn-circle btn-sm btn-primary border-none text-primary-content">
                      {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                    </div>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black tracking-widest uppercase opacity-50 mb-0.5">Last Played</p>
                  <h3 className="font-bold text-sm truncate">{currentTrack.title}</h3>
                  <p className="text-xs opacity-60 truncate">{currentTrack.artistName}</p>
                </div>
              </div>
              <div className="h-1 bg-base-content/10 w-full">
                <div 
                  className="h-full bg-primary"
                  style={{ width: duration > 0 ? `${(progress / duration) * 100}%` : '0%' }}
                />
              </div>
            </div>
          </div>
        )}

        {!siteSettings?.coverImage && (
          <div className="absolute right-0 top-0 w-1/3 h-full bg-primary/10 blur-[100px] -z-10 animate-pulse"></div>
        )}
      </div>

      {/* Jump back in (Recently Played) */}
      {recentlyPlayed && recentlyPlayed.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-end justify-between px-2">
            <div>
              <h2 className="text-3xl font-black tracking-tighter mb-1">Jump back in</h2>
              <p className="text-sm opacity-40 font-medium">Your recent plays</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 lg:gap-6 opacity-90">
            {recentlyPlayed.slice(0, 8).map((item) => (
              <div 
                key={`${item.type}-${item.id}-${item.timestamp}`} 
                onClick={(e) => handlePlayHistory(e, item)}
                className="group relative flex flex-col gap-2 cursor-pointer"
              >
                <div className="aspect-square rounded-xl overflow-hidden shadow-level-1 relative border border-base-content/5">
                  <img src={item.cover || "/placeholder.png"} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.png' }} />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                     <div className="btn btn-circle btn-primary btn-sm scale-0 group-hover:scale-100 transition-transform delay-75 shadow-level-2 border-none text-primary-content">
                        <Play fill="currentColor" size={16} />
                     </div>
                  </div>
                </div>
                <div className="px-1">
                  <h3 className="font-bold text-sm truncate group-hover:text-primary transition-colors">{item.title}</h3>
                  <p className="text-xs opacity-60 truncate capitalize">{item.type} • {item.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Releases — the primary, most relevant content sits right under the hero */}
      <div className="space-y-6">
        <div id="recent-releases" className="flex items-end justify-between px-2">
          <div>
            <h2 className="text-3xl font-black tracking-tighter mb-1">Recent Releases</h2>
            <p className="text-sm opacity-40 font-medium">The latest published highlights</p>
          </div>
          <Link to="/releases" className="btn btn-link btn-sm no-underline opacity-40 hover:opacity-100 tracking-normal font-black text-xs">
            View All →
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 lg:gap-8">
          {recentAlbums.map((album: any) => (
            <ReleaseCard key={album.id} item={album} type="release" />
          ))}
        </div>
      </div>

      {/* Library Albums */}
      {libraryAlbums.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-end justify-between px-2">
            <div>
              <h2 className="text-2xl font-black tracking-tighter mb-1 flex items-center gap-2">
                <Library size={24} className="text-secondary" /> Library Additions
              </h2>
              <p className="text-sm opacity-40 font-medium">Newest items in your personal collection</p>
            </div>
            {/* No "View All": the full private archive lives at /library, which is
                gated to admins/artists — linking it here 404s for listeners. */}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 lg:gap-6 opacity-80">
            {libraryAlbums.map((album) => (
              <ReleaseCard key={album.id} item={album} type="library" />
            ))}
          </div>
        </div>
      )}

      {/* Browse by Genre — demoted below the content as a secondary entry point */}
      {genres.length > 0 && (
        <div className="space-y-4">
          <h2 className="px-2 text-sm font-black tracking-[0.2em] uppercase opacity-40">Browse by Genre</h2>
          <div className="flex flex-wrap gap-2 px-2">
            {genres.map((genre: string) => (
              <button
                key={genre}
                className="btn btn-xs md:btn-sm btn-ghost border border-base-content/10 hover:bg-primary hover:text-primary-content hover:border-primary transition-all rounded-full lowercase"
                onClick={() => navigate(`/playlists/genre:${encodeURIComponent(genre)}`)}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats — least relevant for day-to-day use, kept as a slim strip at the bottom */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-2">
        <div className="flex items-baseline gap-2 p-3 rounded-2xl bg-base-200/30 border border-base-content/5">
          <span className="text-2xl font-black text-primary tabular-nums">{stats.albums || 0}</span>
          <span className="text-xs opacity-40 font-bold">Albums</span>
        </div>
        <div className="flex items-baseline gap-2 p-3 rounded-2xl bg-base-200/30 border border-base-content/5">
          <span className="text-2xl font-black text-secondary tabular-nums">{stats.tracks || 0}</span>
          <span className="text-xs opacity-40 font-bold">Tracks</span>
        </div>
        <div className="flex items-baseline gap-2 p-3 rounded-2xl bg-base-200/30 border border-base-content/5">
          <span className="text-2xl font-black text-accent tabular-nums">{stats.genresCount || 0}</span>
          <span className="text-xs opacity-40 font-bold">Genres</span>
        </div>
        <div className="flex items-baseline gap-2 p-3 rounded-2xl bg-base-200/30 border border-base-content/5">
          <span className="text-2xl font-black text-neutral-content tabular-nums">{stats.totalSize || "0 GB"}</span>
          <span className="text-xs opacity-40 font-bold">Used</span>
        </div>
      </div>

    </section>
  );
};

export default Home;

