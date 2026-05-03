import { useState, useEffect } from "react";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { useNavigate } from "react-router-dom";
import {
  BarChart2,
  Music,
  Settings,
} from "lucide-react";
import { AdminReleaseModal } from "../components/modals/AdminReleaseModal";
import { UploadTracksModal } from "../components/modals/UploadTracksModal";
import { CreatePostModal } from "../components/modals/CreatePostModal";

import { AdminReleasesList } from "../components/admin/AdminReleasesList";
import { AdminTracksList } from "../components/admin/AdminTracksList";

export const MyMusic = () => {
  const { user, isAuthenticated, isLoading, role } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    "overview" | "albums" | "tracks"
  >("overview");
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      navigate("/");
      return;
    }
    loadStats();
  }, [isAuthenticated, user, isLoading]);

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
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Music size={32} className="text-primary" /> My Music
        </h1>
        {user?.isRootAdmin && (
           <button 
             className="btn btn-ghost btn-sm gap-2"
             onClick={() => navigate("/admin")}
           >
             <Settings size={16} /> Go to Admin
           </button>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat bg-base-200 rounded-box border border-white/5">
            <div className="stat-title">My Releases</div>
            <div className="stat-value text-primary">{stats.albums}</div>
          </div>
          <div className="stat bg-base-200 rounded-box border border-white/5">
            <div className="stat-title">My Tracks</div>
            <div className="stat-value text-secondary">{stats.totalTracks}</div>
          </div>
          <div className="stat bg-base-200 rounded-box border border-white/5">
            <div className="stat-title">Storage Used</div>
            <div className="stat-value text-accent">
              {(stats.storageUsed / 1024 / 1024 / 1024).toFixed(4)} GB
            </div>
          </div>
          <div className="stat bg-base-200 rounded-box border border-white/5">
            <div className="stat-title">Genres</div>
            <div className="stat-value">{stats.genresCount}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-lifted">
        <a
          role="tab"
          className={`tab ${activeTab === "overview" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </a>
        <a
          role="tab"
          className={`tab ${activeTab === "albums" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("albums")}
        >
          Releases
        </a>
        <a
          role="tab"
          className={`tab ${activeTab === "tracks" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("tracks")}
        >
          Tracks
        </a>
      </div>

      <div className="bg-base-100 p-6 rounded-b-box border-x border-b border-base-300 min-h-[400px]">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <h3 className="font-bold text-lg">Quick Actions</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(user?.isAdmin || user?.isActive || role === 'super_user') && (
                <>
                  <button
                    className="btn btn-primary gap-2"
                    onClick={() =>
                      document.dispatchEvent(
                        new CustomEvent("open-upload-tracks-modal"),
                      )
                    }
                  >
                    📤 Upload Tracks
                  </button>
                  {((user?.isAdmin || user?.isActive) && (role !== 'super_user' || user?.artistId)) && (
                    <button
                      className="btn btn-secondary gap-2"
                      onClick={() => navigate("/admin/release/new")}
                    >
                      💿 New Release
                    </button>
                  )}
                </>
              )}
              {((user?.isAdmin || user?.isActive) && (role !== 'super_user' || user?.artistId)) && (
                <button
                  className="btn btn-outline gap-2"
                  onClick={() =>
                    document.dispatchEvent(
                      new CustomEvent("open-create-post-modal"),
                    )
                  }
                >
                  📝 New Post
                </button>
              )}
            </div>
            <div className="divider"></div>
            
            {stats && stats.genres && stats.genres.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <BarChart2 size={20} className="text-accent" /> Library Genres
                </h3>
                <div className="flex flex-wrap gap-2">
                  {stats.genres.map((genre: string) => (
                    <button
                      key={genre}
                      className="btn btn-sm btn-outline btn-accent rounded-full lowercase"
                      onClick={() => navigate(`/search?q=${encodeURIComponent(genre)}`)}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="text-center opacity-50 py-8">
              <BarChart2 size={48} className="mx-auto mb-4" />
              <p>Personal analytics and sales data coming soon.</p>
            </div>
          </div>
        )}

        {activeTab === "albums" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">My Releases</h3>
              <div className="flex gap-2">
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() =>
                    document.dispatchEvent(
                      new CustomEvent("open-create-post-modal"),
                    )
                  }
                >
                  Create Post
                </button>
                {(user?.isAdmin || user?.isActive) && (
                  <button
                    className="btn btn-sm btn-primary"
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

        {activeTab === "tracks" && <AdminTracksList mine={true} />}
      </div>

      <AdminReleaseModal
        onReleaseUpdated={() =>
          window.dispatchEvent(new CustomEvent("refresh-admin-releases"))
        }
      />
      <UploadTracksModal
        onUploadComplete={() =>
          window.dispatchEvent(new CustomEvent("refresh-admin-releases"))
        }
      />
      <CreatePostModal
        onPostCreated={() =>
          window.dispatchEvent(new CustomEvent("refresh-admin-releases"))
        }
      />
    </div>
  );
};
