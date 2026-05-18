import { useState, useEffect } from "react";
import { useAuthStore } from "../stores/useAuthStore";
import { Link } from "react-router-dom";
import { ListMusic, Plus, Music, Lock, Unlock, Heart, LayoutGrid, List, AlignJustify } from "lucide-react";
import clsx from "clsx";
import type { Playlist, UserPlaylist } from "../types";
import API from "../services/api";
import { CreateUserPlaylistModal } from "../components/modals/CreateUserPlaylistModal";

const MyPlaylists = () => {
  const [playlists, setPlaylists] = useState<(Playlist | UserPlaylist)[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'minimal'>('minimal');
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) loadPlaylists();
    else setLoading(false);
  }, [isAuthenticated]);

  const loadPlaylists = async () => {
    setLoading(true);
    try {
      const data = await API.getPlaylists();
      // Filter out system dynamic playlists (genre mixes) and playlists owned by others
      const userOnly = data.filter(p => 
          p.username !== 'system' && 
          !String(p.id).startsWith('genre:') &&
          p.username === user?.username
      );
      setPlaylists(userOnly);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreated = (newPlaylist: Playlist | UserPlaylist) => {
    setPlaylists((prev) => {
      if (prev.some((p) => p.id === newPlaylist.id)) return prev;
      return [newPlaylist, ...prev];
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in p-6">
        <div className="p-6 rounded-3xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 mb-6">
          <Heart size={64} className="text-pink-400" />
        </div>
        <h1 className="text-3xl font-black mb-3">My Playlists</h1>
        <p className="opacity-60 text-lg mb-6 text-center max-w-md">
          Login with your community account to create and manage personal
          playlists.
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

  return (
    <div className="space-y-8 animate-fade-in p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/20">
            <Heart size={32} className="text-pink-400" />
          </div>
          <div>
            <h1 className="text-4xl font-bold">My Playlists</h1>
            <p className="opacity-50 text-sm mt-1">
              {user?.zenProfile?.alias || user?.username}'s personal collection
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="join bg-base-200">
            <button
              className={clsx("btn btn-sm join-item", viewMode === 'grid' && "btn-active")}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={clsx("btn btn-sm join-item", viewMode === 'list' && "btn-active")}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <List size={16} />
            </button>
            <button
              className={clsx("btn btn-sm join-item", viewMode === 'minimal' && "btn-active")}
              onClick={() => setViewMode('minimal')}
              title="Minimal View"
            >
              <AlignJustify size={16} />
            </button>
          </div>
          <button
            className="btn btn-primary gap-2"
            onClick={() =>
              document.dispatchEvent(
                new CustomEvent("open-create-user-playlist-modal"),
              )
            }
          >
            <Plus size={20} /> New Playlist
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center opacity-50 py-12">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="mt-4">Loading your playlists...</p>
        </div>
      ) : playlists.length === 0 ? (
        <div className="text-center opacity-50 py-16 border-2 border-dashed border-base-content/5 rounded-2xl">
          <ListMusic size={48} className="mx-auto mb-4 opacity-50" />
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
        </div>
      ) : (
        <div className={clsx(
          "grid gap-6",
          viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : 
          viewMode === 'list' ? "grid-cols-1 md:grid-cols-2" : 
          "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"
        )}>
          {playlists.map((p) => (
            <Link
              to={`/my-playlists/${p.id}`}
              key={p.id}
              className={clsx(
                "group transition-all duration-300 shadow-xl border border-base-content/5 overflow-hidden",
                viewMode === 'grid' && "card bg-base-200 hover:bg-base-300 hover:-translate-y-1",
                viewMode === 'list' && "flex items-center gap-4 bg-base-200 p-4 rounded-xl hover:bg-base-300",
                viewMode === 'minimal' && "flex items-center gap-3 bg-base-200/40 p-2 px-3 rounded-lg hover:bg-base-200"
              )}
            >
              {viewMode === 'grid' ? (
                <div className="card-body">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500/30 to-purple-500/30 flex items-center justify-center overflow-hidden">
                      {(p as any).coverUrl || (p as any).coverPath ? (
                        <img
                          src={(p as any).coverUrl || (p as any).coverPath}
                          className="w-full h-full object-cover"
                          alt=""
                        />
                      ) : (
                        <Music size={20} className="text-pink-300" />
                      )}
                    </div>
                    <h2 className="card-title text-lg group-hover:text-primary transition-colors flex-1 truncate">
                      {p.name}
                    </h2>
                  </div>
                  {p.description && (
                    <p className="opacity-70 line-clamp-2 text-sm">
                      {p.description}
                    </p>
                  )}

                  <div className="card-actions justify-between mt-4 items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs opacity-50">
                        {p.trackCount} tracks
                      </span>
                      <span className="opacity-30">•</span>
                      <span className="text-xs opacity-50 flex items-center gap-1">
                        {p.isPublic ? <Unlock size={12} /> : <Lock size={12} />}
                        {p.isPublic ? "Public" : "Private"}
                      </span>
                    </div>
                    <span className="text-xs opacity-40">
                      {p.updatedAt || p.createdAt
                        ? new Date(p.updatedAt || p.createdAt).toLocaleDateString()
                        : ""}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div className={clsx(
                    "rounded-lg bg-gradient-to-br from-pink-500/30 to-purple-500/30 flex items-center justify-center overflow-hidden shrink-0",
                    viewMode === 'list' ? "w-12 h-12" : "w-8 h-8"
                  )}>
                    {(p as any).coverUrl || (p as any).coverPath ? (
                      <img
                        src={(p as any).coverUrl || (p as any).coverPath}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    ) : (
                      <Music size={viewMode === 'list' ? 20 : 14} className="text-pink-300" />
                    )}
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
                        {p.isPublic ? <Unlock size={10} /> : <Lock size={10} />}
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

export default MyPlaylists;

