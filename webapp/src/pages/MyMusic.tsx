import { useState, useEffect } from "react";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { useConfigStore } from "../stores/useConfigStore";
import { canPublish } from "../utils/permissions";
import { useNavigate } from "react-router-dom";
import {
  BarChart2,
  Music,
  Settings,
  Disc,
  User,
  Layout,
  Upload,
  ShoppingBag,
  Music2,
} from "lucide-react";
import { AdminReleaseModal } from "../components/modals/AdminReleaseModal";
import { UploadTracksModal } from "../components/modals/UploadTracksModal";
import { PageHeader } from "../components/ui/PageHeader";

import { AdminReleasesList } from "../components/admin/AdminReleasesList";
import { AdminTracksList } from "../components/admin/AdminTracksList";
import { AdminArtistsList } from "../components/admin/AdminArtistsList";
import { AdminAlbumsList } from "../components/admin/AdminAlbumsList";
import { AdminAssetsList } from "../components/admin/AdminAssetsList";
import { AdminSamplesList } from "../components/admin/AdminSamplesList";

const MyMusic = () => {
  const { user, isAuthenticated, isLoading, role } = useAuthStore();
  const { bumpCacheBuster } = useConfigStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    "overview" | "releases" | "albums" | "artists" | "tracks" | "samples" | "store"
  >("overview");
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !canPublish(user, role)) {
      navigate("/");
      return;
    }
    loadStats();
  }, [isAuthenticated, user, isLoading, role]);

  const loadStats = async () => {
    try {
      const data = await API.getAdminStats({ mine: true });
      setStats(data);
    } catch (e) {
      console.error(e);
    }
  };

  if (isLoading)
    return (
      <div className="p-12 text-center opacity-50">Loading dashboard...</div>
    );

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader 
        title="My Catalog"
        subtitle="Manage your artist profiles, releases, and audio files"
        icon={Upload}
        iconColor="text-primary"
      >
        {(user?.isRootAdmin || role === 'super_user' || role === 'admin') && (
           <button 
             className="btn btn-ghost btn-sm gap-2"
             onClick={() => navigate("/admin")}
           >
             <Settings size={16} /> Go to Admin
           </button>
        )}
      </PageHeader>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat bg-base-200/50 rounded-box border border-base-content/5 shadow-m3-1">
            <div className="stat-title opacity-60 text-xs font-bold tracking-normal">My Releases</div>
            <div className="stat-value text-primary">{stats.albums}</div>
          </div>
          <div className="stat bg-base-200/50 rounded-box border border-base-content/5 shadow-m3-1">
            <div className="stat-title opacity-60 text-xs font-bold tracking-normal">My Tracks</div>
            <div className="stat-value text-secondary">{stats.totalTracks}</div>
          </div>
          <div className="stat bg-base-200/50 rounded-box border border-base-content/5 shadow-m3-1">
            <div className="stat-title opacity-60 text-xs font-bold tracking-normal">Storage Used</div>
            <div className="stat-value text-accent text-2xl">
              {(stats.storageUsed / 1024 / 1024 / 1024).toFixed(3)} GB
            </div>
            {stats.storageQuota > 0 && (
              <>
                <div className="stat-desc mt-1">
                  of {(stats.storageQuota / 1024 / 1024 / 1024).toFixed(2)} GB
                  {" · "}
                  {Math.max(0, ((stats.storageQuota - stats.storageUsed) / 1024 / 1024 / 1024)).toFixed(2)} GB free
                </div>
                {(() => {
                  const pct = Math.min(100, Math.round((stats.storageUsed / stats.storageQuota) * 100));
                  return (
                    <progress
                      className={`progress mt-1 ${pct >= 90 ? 'progress-error' : pct >= 70 ? 'progress-warning' : 'progress-success'}`}
                      value={pct}
                      max={100}
                    />
                  );
                })()}
              </>
            )}
          </div>
          <div className="stat bg-base-200/50 rounded-box border border-base-content/5 shadow-m3-1">
            <div className="stat-title opacity-60 text-xs font-bold tracking-normal">Genres</div>
            <div className="stat-value">{stats.genresCount}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-lifted">
        <a
          role="tab"
          className={`tab gap-2 ${activeTab === "overview" ? "tab-active font-bold" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <Layout size={16}/> Overview
        </a>
        <a
          role="tab"
          className={`tab gap-2 ${activeTab === "releases" ? "tab-active font-bold" : ""}`}
          onClick={() => setActiveTab("releases")}
        >
          <Disc size={16}/> Releases
        </a>
        <a
          role="tab"
          className={`tab gap-2 ${activeTab === "albums" ? "tab-active font-bold" : ""}`}
          onClick={() => setActiveTab("albums")}
        >
          <Music size={16}/> Albums
        </a>
        <a
          role="tab"
          className={`tab gap-2 ${activeTab === "artists" ? "tab-active font-bold" : ""}`}
          onClick={() => setActiveTab("artists")}
        >
          <User size={16}/> Artists
        </a>
        <a
          role="tab"
          className={`tab gap-2 ${activeTab === "tracks" ? "tab-active font-bold" : ""}`}
          onClick={() => setActiveTab("tracks")}
        >
          Tracks
        </a>
        <a
          role="tab"
          className={`tab gap-2 ${activeTab === "samples" ? "tab-active font-bold" : ""}`}
          onClick={() => setActiveTab("samples")}
        >
          <Music2 size={16}/> Samples
        </a>
        <a
          role="tab"
          className={`tab gap-2 ${activeTab === "store" ? "tab-active font-bold" : ""}`}
          onClick={() => setActiveTab("store")}
        >
          <ShoppingBag size={16}/> Store Assets
        </a>
      </div>

      <div className="bg-base-100 p-6 rounded-b-box border-x border-b border-base-300 min-h-[400px] glass-effect">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <h3 className="font-bold text-lg tracking-tight px-1">Quick Actions</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(user?.isAdmin || user?.isActive || role === 'super_user') && (
                <>
                  <button
                    className="btn btn-primary gap-2 shadow-level-1 shadow-primary/10 hover:scale-[1.02] transition-transform"
                    onClick={() => navigate("/publish")}
                  >
                    📤 Publish New Content
                  </button>
                  <button
                    className="btn btn-outline gap-2 hover:scale-[1.02] transition-transform"
                    onClick={() => document.dispatchEvent(new CustomEvent("open-admin-artist-modal"))}
                  >
                    👤 Manage Artist Profile
                  </button>
                </>
              )}
            </div>
            <div className="divider opacity-10"></div>
            
            {stats && stats.genres && stats.genres.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-bold text-lg flex items-center gap-2 px-1">
                  <BarChart2 size={20} className="text-accent" /> Library Genres
                </h3>
                <div className="flex flex-wrap gap-2">
                  {stats.genres.map((genre: string) => (
                    <button
                      key={genre}
                      className="btn btn-sm btn-outline btn-accent rounded-full lowercase hover:bg-accent/10 transition-colors"
                      onClick={() => navigate(`/search?q=${encodeURIComponent(genre)}`)}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="text-center opacity-30 py-12 bg-base-200/20 rounded-box border border-base-content/5">
              <BarChart2 size={48} className="mx-auto mb-4" />
              <p className="font-medium">Personal analytics and sales data coming soon.</p>
            </div>
          </div>
        )}

        {activeTab === "releases" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg tracking-tight">My Public Releases</h3>
              <div className="flex gap-2">
                {(user?.isAdmin || user?.isActive) && (
                  <button
                    className="btn btn-sm btn-primary shadow-md"
                    onClick={() => navigate("/admin/release/new")}
                  >
                    Create Release
                  </button>
                )}
              </div>
            </div>
            <AdminReleasesList mine={true} />
          </div>
        )}

        {activeTab === "albums" && (
           <div className="space-y-4">
             <h3 className="font-bold text-lg tracking-tight">My Library Albums</h3>
             <AdminAlbumsList mine={true} />
           </div>
        )}

        {activeTab === "artists" && (
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold text-lg tracking-tight">My Artist Profiles</h3>
                    {(user?.isRootAdmin || role === 'super_user' || role === 'admin') && (
                        <button 
                            className="btn btn-sm btn-primary"
                            onClick={() => document.dispatchEvent(new CustomEvent("open-admin-artist-modal"))}
                        >
                            Create New Artist
                        </button>
                    )}
                </div>
                <AdminArtistsList />
            </div>
        )}

        {activeTab === "tracks" && <AdminTracksList mine={true} />}
        {activeTab === "samples" && <AdminSamplesList mine={true} />}
        {activeTab === "store" && <AdminAssetsList />}
      </div>

      <AdminReleaseModal
        onReleaseUpdated={() => {
          bumpCacheBuster();
          window.dispatchEvent(new CustomEvent("refresh-admin-releases"));
          window.dispatchEvent(new CustomEvent("refresh-admin-albums"));
        }}
      />
      {/* AdminArtistModal is rendered globally in MainLayout. Rendering a
          second instance here mounted two dialogs on the same event — closing
          one revealed the other in a stale (editable) lock state. */}
      <UploadTracksModal
        onUploadComplete={() => {
          bumpCacheBuster();
          window.dispatchEvent(new CustomEvent("refresh-admin-releases"));
          window.dispatchEvent(new CustomEvent("refresh-admin-albums"));
          window.dispatchEvent(new CustomEvent("refresh-admin-tracks"));
        }}
      />
    </div>
  );
};

export default MyMusic;

