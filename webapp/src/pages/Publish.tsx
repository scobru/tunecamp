import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";
import { canPublish } from "../utils/permissions";
import { UploadCloud, Disc, PackagePlus, ArrowUpCircle } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { UploadTracksModal } from "../components/modals/UploadTracksModal";
import { AdminAssetModal } from "../components/modals/AdminAssetModal";

const Publish = () => {
  const { isAuthenticated, isLoading, role, user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !canPublish(user, role)) {
      navigate("/");
      return;
    }
  }, [isAuthenticated, user, isLoading, role]);

  if (isLoading) {
    return <div className="p-12 text-center opacity-50">Loading Hub...</div>;
  }

  if (!isAuthenticated) return null;

  const handleOpenUploadModal = () => {
    document.dispatchEvent(new CustomEvent("open-upload-tracks-modal"));
  };

  const handleOpenAssetModal = () => {
    document.dispatchEvent(new CustomEvent("open-admin-asset-modal", { detail: null }));
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Publishing Hub"
        subtitle="Upload music, create releases, or put digital products on the store"
        icon={ArrowUpCircle}
        iconColor="text-primary"
      />

      <div className="grid gap-6 md:grid-cols-3">
        {/* Release creation card */}
        <div className="card bg-base-200/50 border border-base-content/5 shadow-m3-1 hover:shadow-m3-2 transition-all duration-medium-1 hover:-translate-y-0.5 flex flex-col justify-between p-6">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 text-primary">
              <Disc size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg text-prominent">Music Release</h3>
              <p className="text-sm opacity-60 mt-1">
                Publish a Single, EP, or Album. Upload your audio tracks, add artwork, and configure release-wide metadata.
              </p>
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={() => navigate("/admin/release/new")}
              className="btn btn-primary btn-block rounded-full shadow-md"
            >
              Create Release
            </button>
          </div>
        </div>

        {/* Tracks Upload Card */}
        <div className="card bg-base-200/50 border border-base-content/5 shadow-m3-1 hover:shadow-m3-2 transition-all duration-medium-1 hover:-translate-y-0.5 flex flex-col justify-between p-6">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center border border-secondary/20 text-secondary">
              <UploadCloud size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg text-prominent">Upload Tracks</h3>
              <p className="text-sm opacity-60 mt-1">
                Upload raw audio files directly to your music library as singles or miscellaneous tracks for cataloging.
              </p>
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={handleOpenUploadModal}
              className="btn btn-secondary btn-block rounded-full shadow-md"
            >
              Upload Tracks
            </button>
          </div>
        </div>

        {/* Store Asset Card */}
        <div className="card bg-base-200/50 border border-base-content/5 shadow-m3-1 hover:shadow-m3-2 transition-all duration-medium-1 hover:-translate-y-0.5 flex flex-col justify-between p-6">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center border border-accent/20 text-accent">
              <PackagePlus size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg text-prominent">Sell Store Asset</h3>
              <p className="text-sm opacity-60 mt-1">
                Put digital files (PDF, ZIP), videos, or exclusive membership content up for sale in the public Store.
              </p>
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={handleOpenAssetModal}
              className="btn btn-accent btn-block rounded-full shadow-md"
            >
              Add Store Asset
            </button>
          </div>
        </div>
      </div>

      {/* Global Modals for Upload and Store Asset Creation */}
      <UploadTracksModal />
      <AdminAssetModal />
    </div>
  );
};

export default Publish;
