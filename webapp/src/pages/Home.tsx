import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import API from "../services/api";
import { Library } from "lucide-react";
import { ReleaseCard } from "../components/ui/ReleaseCard";
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
          <h1 className={clsx(
            "text-4xl lg:text-7xl font-black tracking-tighter mb-4 leading-tight",
            siteSettings?.coverImage ? "text-white" : "text-prominent"
          )}>
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
        <div className="flex flex-col gap-1 p-4 rounded-3xl bg-base-200/30 border border-base-content/5">
           <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Total Library</span>
           <div className="flex items-baseline gap-2">
             <span className="text-3xl font-black text-primary">{stats.albums || 0}</span>
             <span className="text-xs opacity-40 font-bold uppercase">Albums</span>
           </div>
        </div>
        <div className="flex flex-col gap-1 p-4 rounded-3xl bg-base-200/30 border border-base-content/5">
           <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Audio Files</span>
           <div className="flex items-baseline gap-2">
             <span className="text-3xl font-black text-secondary">{stats.tracks || 0}</span>
             <span className="text-xs opacity-40 font-bold uppercase">Tracks</span>
           </div>
        </div>
        <div className="flex flex-col gap-1 p-4 rounded-3xl bg-base-200/30 border border-base-content/5">
           <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Diverse Styles</span>
           <div className="flex items-baseline gap-2">
             <span className="text-3xl font-black text-accent">{stats.genresCount || 0}</span>
             <span className="text-xs opacity-40 font-bold uppercase">Genres</span>
           </div>
        </div>
        <div className="flex flex-col gap-1 p-4 rounded-3xl bg-base-200/30 border border-base-content/5">
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
          <Link to="/releases" className="btn btn-link btn-sm no-underline opacity-40 hover:opacity-100 uppercase tracking-widest font-black text-[10px]">
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
              <h2 className="text-2xl font-black tracking-tighter uppercase mb-1 flex items-center gap-2">
                <Library size={24} className="text-secondary" /> Library Additions
              </h2>
              <p className="text-sm opacity-40 font-medium">Newest items in your personal collection</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 lg:gap-6 opacity-80">
            {libraryAlbums.map((album) => (
              <ReleaseCard key={album.id} item={album} type="library" />
            ))}
          </div>
        </div>
      )}

    </section>
  );
};

export default Home;

