import { useState, useEffect } from "react";
import API from "../services/api";
import { Link } from "react-router-dom";
import { ListMusic, Globe, Lock, Music, LayoutGrid, List, AlignJustify } from "lucide-react";
import type { Playlist } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import clsx from "clsx";

// Extended interface to handle both types
interface UnifiedPlaylist extends Playlist {
  isUserPlaylist?: boolean;
}

const Playlists = () => {
  const [playlists, setPlaylists] = useState<UnifiedPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'minimal'>('minimal');

  useEffect(() => {
    loadPlaylists();
    window.addEventListener("refresh-playlists", loadPlaylists);
    return () => window.removeEventListener("refresh-playlists", loadPlaylists);
  }, []);

  const loadPlaylists = async () => {
    setLoading(true);
    try {
      const apiData = await API.getPlaylists().catch(() => []);
      const normalized = apiData.filter(p => p.isPublic).map(p => ({
        ...p,
        isUserPlaylist: false,
        createdAt: new Date((p as any).createdAt || (p as any).created_at || 0).getTime()
      }));
      setPlaylists(normalized.sort((a, b) => (b as any).createdAt - (a as any).createdAt) as any);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader 
        title="Playlists" 
        subtitle={`${playlists.length} public playlists on the network`}
        icon={ListMusic}
        iconColor="text-secondary"
      >
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
      </PageHeader>

      {loading ? (
        <div className="text-center opacity-50 py-12">Loading playlists...</div>
      ) : playlists.length === 0 ? (
        <div className="text-center opacity-50 py-12 border-2 border-dashed border-base-content/5 rounded-2xl">
          <ListMusic size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg">No playlists found.</p>
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
              to={p.isUserPlaylist ? `/my-playlists/${p.id}` : `/playlists/${p.id}`}
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
                      {p.coverPath ? (
                        <img
                          src={p.coverPath}
                          className="w-full h-full object-cover"
                          alt=""
                        />
                      ) : (
                        <Music size={20} className="text-secondary" />
                      )}
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
                    {p.coverPath ? (
                      <img
                        src={p.coverPath}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    ) : (
                      <Music size={viewMode === 'list' ? 20 : 14} className="text-secondary" />
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
    </div>
  );
};

export default Playlists;

