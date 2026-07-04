import { useState, useEffect } from "react";
import API from "../services/api";
import { Link, useSearchParams } from "react-router-dom";
import { ListMusic, Globe, Lock, Music, LayoutGrid, List, AlignJustify, Plus, Heart } from "lucide-react";
import type { Playlist, UserPlaylist } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuthStore } from "../stores/useAuthStore";
import { CreateUserPlaylistModal } from "../components/modals/CreateUserPlaylistModal";
import clsx from '@/utils/clsx';

type Tab = "mine" | "public";

const isGenreMix = (p: Playlist) =>
  p.username === "system" || String(p.id).startsWith("genre:");

const renderPlaylistCover = (p: Playlist, iconSize: number) => {
  const trackCovers = p.trackCovers || [];
  if (p.coverPath) {
    return (
      <img
        src={p.coverPath}
        className="w-full h-full object-cover"
        alt=""
      />
    );
  }
  if (trackCovers.length >= 4) {
    return (
      <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
        {trackCovers.map((url, i) => (
          <img key={i} src={url} className="w-full h-full object-cover" alt="" />
        ))}
      </div>
    );
  }
  if (trackCovers.length > 0) {
    return (
      <img src={trackCovers[0]} className="w-full h-full object-cover" alt="" />
    );
  }
  return <Music size={iconSize} className="text-secondary" />;
};

const Playlists = () => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'minimal'>('minimal');
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, user } = useAuthStore();

  const tab: Tab = searchParams.get("tab") === "public" ? "public" : "mine";
  const setTab = (t: Tab) => setSearchParams(t === "mine" ? {} : { tab: t }, { replace: true });

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    loadPlaylists();
    window.addEventListener("refresh-playlists", loadPlaylists);
    return () => window.removeEventListener("refresh-playlists", loadPlaylists);
  }, [isAuthenticated]);

  const loadPlaylists = async () => {
    setLoading(true);
    try {
      const data = await API.getPlaylists();
      setPlaylists(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreated = (newPlaylist: Playlist | UserPlaylist) => {
    setPlaylists((prev) => {
      if (prev.some((p) => p.id === newPlaylist.id)) return prev;
      return [newPlaylist as Playlist, ...prev];
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in p-6">
        <div className="p-6 rounded-3xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 mb-6">
          <Heart size={64} className="text-pink-400" />
        </div>
        <h1 className="text-3xl font-black mb-3">Playlists</h1>
        <p className="opacity-60 text-lg mb-6 text-center max-w-md">
          Login with your community account to create your own playlists and
          discover the public ones on this instance.
        </p>
        <button
          className="btn btn-primary gap-2"
          onClick={() =>
            document.dispatchEvent(new CustomEvent("open-auth-modal"))
          }
        >
          Login to Get Started
        </button>
      </div>
    );
  }

  const minePlaylists = playlists.filter(
    (p) => !isGenreMix(p) && p.username === user?.username,
  );
  const publicPlaylists = playlists.filter((p) => p.isPublic);
  const visible = tab === "mine" ? minePlaylists : publicPlaylists;

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Playlists"
        subtitle={
          tab === "mine"
            ? `${minePlaylists.length} personal playlists`
            : `${publicPlaylists.length} public playlists on the network`
        }
        icon={ListMusic}
        iconColor="text-secondary"
      >
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="join bg-base-200 w-full sm:w-auto justify-center">
            <button
              className={clsx("btn btn-sm join-item flex-1 sm:flex-initial", viewMode === 'grid' && "btn-active")}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={clsx("btn btn-sm join-item flex-1 sm:flex-initial", viewMode === 'list' && "btn-active")}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <List size={16} />
            </button>
            <button
              className={clsx("btn btn-sm join-item flex-1 sm:flex-initial", viewMode === 'minimal' && "btn-active")}
              onClick={() => setViewMode('minimal')}
              title="Minimal View"
            >
              <AlignJustify size={16} />
            </button>
          </div>
          {tab === "mine" && (
            <button
              className="btn btn-primary btn-sm h-10 w-full sm:w-auto gap-2"
              onClick={() =>
                document.dispatchEvent(
                  new CustomEvent("open-create-user-playlist-modal"),
                )
              }
            >
              <Plus size={20} /> New Playlist
            </button>
          )}
        </div>
      </PageHeader>

      <div role="tablist" className="tabs tabs-boxed bg-base-200 w-fit">
        <button
          role="tab"
          className={clsx("tab gap-2", tab === "mine" && "tab-active")}
          onClick={() => setTab("mine")}
        >
          <Heart size={14} /> My Playlists
        </button>
        <button
          role="tab"
          className={clsx("tab gap-2", tab === "public" && "tab-active")}
          onClick={() => setTab("public")}
        >
          <Globe size={14} /> Public
        </button>
      </div>

      {loading ? (
        <div className="text-center opacity-50 py-12">Loading playlists...</div>
      ) : visible.length === 0 ? (
        <div className="text-center opacity-50 py-16 border-2 border-dashed border-base-content/5 rounded-2xl">
          <ListMusic size={48} className="mx-auto mb-4 opacity-50" />
          {tab === "mine" ? (
            <>
              <p className="text-lg font-bold">No playlists yet</p>
              <p className="text-sm mt-2 opacity-70">
                Create your first playlist to start collecting your favorite tracks!
              </p>
              <button
                className="btn btn-primary btn-sm gap-2 mt-6"
                onClick={() =>
                  document.dispatchEvent(
                    new CustomEvent("open-create-user-playlist-modal"),
                  )
                }
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
          viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" :
          viewMode === 'list' ? "grid-cols-1 md:grid-cols-2" :
          "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"
        )}>
          {visible.map((p) => (
            <Link
              to={`/playlists/${p.id}`}
              key={p.id}
              className={clsx(
                "group transition-all duration-300 shadow-level-1 border border-base-content/5 overflow-hidden",
                viewMode === 'grid' && "card bg-base-200 hover:bg-base-300 hover:-translate-y-1",
                viewMode === 'list' && "flex items-center gap-4 bg-base-200 p-4 rounded-xl hover:bg-base-300",
                viewMode === 'minimal' && "flex items-center gap-3 bg-base-200/40 p-2 px-3 rounded-lg hover:bg-base-200"
              )}
            >
              {viewMode === 'grid' ? (
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
                    viewMode === 'list' ? "w-12 h-12" : "w-8 h-8"
                  )}>
                    {renderPlaylistCover(p, viewMode === 'list' ? 20 : 14)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className={clsx(
                      "font-bold group-hover:text-primary transition-colors truncate",
                      viewMode === 'list' ? "text-lg" : "text-sm"
                    )}>
                      {p.name}
                    </h2>
                    {viewMode === 'list' && p.description && (
                      <p className="opacity-60 text-xs truncate">{p.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs opacity-40 tabular-nums">
                      {p.trackCount} tracks
                    </span>
                    {viewMode === 'list' && (
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

      <CreateUserPlaylistModal onCreated={handleCreated} />
    </div>
  );
};

export default Playlists;
