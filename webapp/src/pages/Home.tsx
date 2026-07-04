import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import API from "../services/api";
import { Library } from "lucide-react";
import { ReleaseCard } from "../components/ui/ReleaseCard";
import { queryKeys } from "../hooks/queries";
import { useSiteSettingsStore } from "../stores/useSiteSettingsStore";
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
    <section className="space-y-10 pb-20">
      {/* Hero Section — compact, so the music shows up sooner (less to scroll past) */}
      <div
        className={clsx(
          "relative flex items-center px-6 py-8 lg:px-10 lg:py-12 rounded-[2rem] overflow-hidden border border-base-content/5",
          !siteSettings?.coverImage && "bg-gradient-to-br from-primary/5 to-secondary/5"
        )}
        style={heroStyle}
      >
        {siteSettings?.coverImage && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
        )}

        <div className="relative z-10 max-w-2xl">
          <h1 className={clsx(
            "text-3xl lg:text-5xl font-black tracking-tighter mb-3 leading-tight",
            siteSettings?.coverImage ? "text-white" : "text-prominent"
          )}>
            {welcomeTitle}
          </h1>
          <p className="text-base lg:text-lg text-base-content/60 mb-6 max-w-lg leading-relaxed">
            {siteSettings?.siteDescription ||
              "Your decentralized, self-hosted music streaming gateway."}
          </p>
          <div className="flex flex-wrap gap-3">
            {!isModuleHidden("hideNetwork") && (
              <Link to="/network" className="btn btn-ghost rounded-xl border border-base-content/10">
                Explore Network
              </Link>
            )}
            <Link to="/about" className="btn btn-ghost rounded-xl border border-base-content/10">
              About
            </Link>
            {siteSettings?.communityLink && (
              <a
                href={siteSettings.communityLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary rounded-xl px-8 border border-base-content/10 flex items-center gap-2"
              >
                Join Community
              </a>
            )}
          </div>
        </div>

        {!siteSettings?.coverImage && (
          <div className="absolute right-0 top-0 w-1/3 h-full bg-primary/10 blur-[100px] -z-10 animate-pulse"></div>
        )}
      </div>

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

