import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import API from "../services/api";
import { usePlayerStore } from "../stores/usePlayerStore";
import { Play, Library, Disc } from "lucide-react";
import clsx from "clsx";

export const Home = () => {
  const navigate = useNavigate();
  const [recentAlbums, setRecentAlbums] = useState<any[]>([]);
  const [libraryAlbums, setLibraryAlbums] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [siteSettings, setSiteSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [catalog, settings] = await Promise.all([
          API.getCatalog(),
          API.getSiteSettings(),
        ]);
        setRecentAlbums(catalog.recentReleases || []); // Show actual releases in main section
        setLibraryAlbums(catalog.recentAlbums || []);
        setStats(catalog.stats || {});
        setSiteSettings(settings);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-4 lg:p-8 space-y-8">
        <div className="space-y-4">
          <div className="skeleton h-32 w-full rounded-3xl"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="skeleton h-24 rounded-box"></div>
          <div className="skeleton h-24 rounded-box"></div>
          <div className="skeleton h-24 rounded-box"></div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div
              key={i}
              className="card bg-base-200 border border-base-content/5 shadow-xl"
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

  const welcomeTitle = siteSettings?.siteName
    ? `Welcome to ${siteSettings.siteName}`
    : "Welcome to TuneCamp";
  const heroStyle = siteSettings?.coverImage
    ? {
        backgroundImage: `url(${siteSettings.coverImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {};

  return (
    <section className="space-y-12 pb-20">
      {/* Hero Section */}
      <div
        className={clsx(
          "relative min-h-[30vh] lg:min-h-[40vh] flex items-center px-6 lg:px-12 rounded-[2rem] overflow-hidden border border-base-content/5",
          !siteSettings?.coverImage && "bg-gradient-to-br from-primary/5 to-secondary/5"
        )}
        style={heroStyle}
      >
        {siteSettings?.coverImage && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
        )}
        
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-4xl lg:text-7xl font-black tracking-tighter text-white mb-4 leading-tight">
            {welcomeTitle}
          </h1>
          <p className="text-lg lg:text-xl text-base-content/60 mb-8 max-w-lg leading-relaxed">
            {siteSettings?.siteDescription ||
              "Your decentralized, self-hosted music streaming gateway."}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="btn btn-primary rounded-xl px-8"
              onClick={() =>
                document
                  .getElementById("recent-releases")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
               Browse Music
            </button>
            <Link to="/about" className="btn btn-ghost rounded-xl border border-base-content/10">
              Explore Network
            </Link>
          </div>
        </div>

        {!siteSettings?.coverImage && (
          <div className="absolute right-0 top-0 w-1/3 h-full bg-primary/10 blur-[100px] -z-10 animate-pulse"></div>
        )}
      </div>

      {/* Stats Section - Minimalist */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-2">
        <div className="flex flex-col gap-1 p-4 rounded-2xl bg-base-200/30 border border-base-content/5">
           <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Total Library</span>
           <div className="flex items-baseline gap-2">
             <span className="text-3xl font-black text-primary">{stats.albums || 0}</span>
             <span className="text-xs opacity-40 font-bold uppercase">Albums</span>
           </div>
        </div>
        <div className="flex flex-col gap-1 p-4 rounded-2xl bg-base-200/30 border border-base-content/5">
           <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Audio Files</span>
           <div className="flex items-baseline gap-2">
             <span className="text-3xl font-black text-secondary">{stats.tracks || 0}</span>
             <span className="text-xs opacity-40 font-bold uppercase">Tracks</span>
           </div>
        </div>
        <div className="flex flex-col gap-1 p-4 rounded-2xl bg-base-200/30 border border-base-content/5">
           <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Diverse Styles</span>
           <div className="flex items-baseline gap-2">
             <span className="text-3xl font-black text-accent">{stats.genresCount || 0}</span>
             <span className="text-xs opacity-40 font-bold uppercase">Genres</span>
           </div>
        </div>
        <div className="flex flex-col gap-1 p-4 rounded-2xl bg-base-200/30 border border-base-content/5">
           <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Storage</span>
           <div className="flex items-baseline gap-2">
             <span className="text-3xl font-black text-neutral-content">{stats.totalSize || "0 GB"}</span>
             <span className="text-xs opacity-40 font-bold uppercase">Used</span>
           </div>
        </div>
      </div>

      {/* Genres Section */}
      {stats.genres && stats.genres.length > 0 && (
        <div className="px-2">
          <div className="flex flex-wrap gap-2 justify-center py-6 px-4 rounded-3xl bg-base-200/20 border border-base-content/5">
            {stats.genres.map((genre: string) => (
              <button
                key={genre}
                className="btn btn-xs md:btn-sm btn-ghost border border-base-content/10 hover:bg-primary hover:text-primary-content hover:border-primary transition-all rounded-full lowercase"
                onClick={() => navigate(`/search?q=${encodeURIComponent(genre)}`)}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent Releases */}
      <div className="space-y-6">
        <div id="recent-releases" className="flex items-end justify-between px-2">
          <div>
            <h2 className="text-3xl font-black tracking-tighter uppercase mb-1">Recent Releases</h2>
            <p className="text-sm opacity-40 font-medium">The latest published highlights</p>
          </div>
          <Link to="/albums" className="btn btn-link btn-sm no-underline opacity-40 hover:opacity-100 uppercase tracking-widest font-black text-[10px]">
            View All →
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 lg:gap-8">
          {recentAlbums.map((album: any) => {
            if (!album) return null;
            return (
              <div
                key={album.id}
                className="group cursor-pointer space-y-4"
                onClick={() =>
                  navigate(`/releases/${album.slug || album.id}`)
                }
              >
                <div className="aspect-square relative rounded-[1.5rem] overflow-hidden shadow-2xl bg-base-300 ring-1 ring-white/5 transition-all duration-500 group-hover:scale-[1.02] group-hover:ring-primary/20">
                  <img
                    src={album.coverImage || API.getReleaseCoverUrl(album.id)}
                    alt={album.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    onError={(e) => {
                       const target = e.target as HTMLImageElement;
                       target.style.display = 'none';
                       if (target.nextElementSibling) {
                          (target.nextElementSibling as HTMLElement).style.display = 'flex';
                       }
                    }}
                  />
                  <div className="hidden absolute inset-0 items-center justify-center opacity-30">
                     <Disc size={48} />
                  </div>
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-sm">
                    <button
                      className="btn btn-circle btn-lg btn-primary shadow-2xl scale-90 hover:scale-100 transition-all duration-300"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          const fullAlbum = await API.getRelease(album.id);
                          if (fullAlbum?.tracks?.length) {
                             usePlayerStore.getState().playQueue(fullAlbum.tracks, 0);
                          }
                        } catch (error) {
                          console.error("Failed to play album", error);
                        }
                      }}
                    >
                      <Play fill="currentColor" size={32} />
                    </button>
                  </div>
                </div>
                
                <div className="px-1">
                  <h3 className="font-bold text-lg truncate tracking-tight group-hover:text-primary transition-colors">
                    {album.title}
                  </h3>
                  <p className="text-sm font-medium opacity-40 uppercase tracking-widest truncate">
                    {album.artistName || album.artist_name}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] font-black opacity-30 border border-base-content/10 px-1.5 py-0.5 rounded uppercase">
                      {album.year}
                    </span>
                    <span className="text-[10px] font-black opacity-30 border border-base-content/10 px-1.5 py-0.5 rounded uppercase">
                      {album.type}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Library Albums */}
      {libraryAlbums.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-end justify-between px-2">
            <div>
              <h2 className="text-2xl font-black tracking-tighter uppercase mb-1 flex items-center gap-2">
                <Library size={24} className="text-secondary" /> Library Additions
              </h2>
              <p className="text-sm opacity-40 font-medium">Newest items in your personal collection</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 lg:gap-6 opacity-80">
            {libraryAlbums.map((album) => (
              <div
                key={album.id}
                className="group cursor-pointer space-y-2"
                onClick={() =>
                  navigate(`/albums/${album.slug || album.id}`)
                }
              >
                <div className="aspect-square relative rounded-xl overflow-hidden bg-base-300 ring-1 ring-white/5 transition-all group-hover:ring-secondary/40">
                  <img
                    src={album.coverImage || API.getAlbumCoverUrl(album.id)}
                    alt={album.title}
                    className="absolute inset-0 w-full h-full object-cover transition-opacity group-hover:opacity-80"
                    onError={(e) => {
                       const target = e.target as HTMLImageElement;
                       target.style.display = 'none';
                       if (target.nextElementSibling) {
                          (target.nextElementSibling as HTMLElement).style.display = 'flex';
                       }
                    }}
                  />
                  <div className="hidden absolute inset-0 items-center justify-center opacity-30">
                     <Disc size={32} />
                  </div>
                </div>
                <div className="px-1 text-center">
                  <h3 className="font-bold text-sm truncate">{album.title}</h3>
                  <p className="text-[10px] opacity-40 uppercase tracking-tight truncate">
                    {album.artistName || album.artist_name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

