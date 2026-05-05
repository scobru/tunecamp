import { useState, useEffect } from "react";
import { useAuthStore } from "../stores/useAuthStore";
import { useNavigate } from "react-router-dom";
import {
  Globe,
  Shield,
  Settings,
  User,
  MessageSquare,
  PenTool,
  Network,
} from "lucide-react";
import { IdentityPanel } from "../components/admin/IdentityPanel";
import { ArtistFediversePanel } from "../components/artist/ArtistFediversePanel";
import { ActivityPubPanel } from "../components/admin/ActivityPubPanel";
import { CreatePostModal } from "../components/modals/CreatePostModal";
import API from "../services/api";

export const Social = () => {
  const { user, isAuthenticated, isLoading, role } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    "community" | "identity" | "automation" | "federation"
  >("community");

  const [artistData, setArtistData] = useState<any>(null);
  const [mastodonInstance, setMastodonInstance] = useState("");
  const [mastodonToken, setMastodonToken] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isAdmin = role === "admin" || user?.isRootAdmin;
  const isRootAdmin = !!user?.isRootAdmin;

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      navigate("/");
      return;
    }
    // Load artist data for automation tab
    if (user?.artistId && isAdmin) {
      API.getArtist(user.artistId)
        .then((data) => {
          setArtistData(data);
          if (data?.postParams) {
            setMastodonInstance(data.postParams.instance || "");
            setMastodonToken(data.postParams.token || "");
          }
        })
        .catch(console.error);
    }
  }, [isAuthenticated, user, isLoading]);

  const handleSaveAutomation = async () => {
    if (!artistData?.id) return;
    setIsSaving(true);
    setMessage("");
    try {
      const postParams =
        mastodonInstance || mastodonToken
          ? { instance: mastodonInstance, token: mastodonToken }
          : null;
      await API.updateArtist(artistData.id, { postParams });
      setMessage("Automation settings saved!");
    } catch (err: any) {
      setMessage(`Failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading)
    return (
      <div className="p-12 text-center opacity-50">Loading social hub...</div>
    );

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Globe size={32} className="text-primary" /> Social
        </h1>
      </div>

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-lifted">
        <a
          role="tab"
          className={`tab ${activeTab === "community" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("community")}
        >
          <MessageSquare size={16} className="mr-2" />
          Community
        </a>
        <a
          role="tab"
          className={`tab ${activeTab === "identity" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("identity")}
        >
          <Shield size={16} className="mr-2" />
          Identity
        </a>
        {isRootAdmin && (
          <a
            role="tab"
            className={`tab ${activeTab === "federation" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("federation")}
          >
            <Network size={16} className="mr-2" />
            Federation
          </a>
        )}
        <a
          role="tab"
          className={`tab ${activeTab === "automation" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("automation")}
        >
          <Settings size={16} className="mr-2" />
          Automation
        </a>
      </div>

      <div className="bg-base-100 p-6 rounded-b-box border-x border-b border-base-300 min-h-[400px] glass-effect">
        {activeTab === "community" && <ArtistFediversePanel />}

        {activeTab === "identity" && (
          <div className="space-y-4">
            <div className="alert alert-info py-2 shadow-m3-1">
              <User size={16} />
              <span>
                Configure your ActivityPub identity. This is how other users on
                the Fediverse will see you.
              </span>
            </div>
            <IdentityPanel isRootAdmin={user?.isRootAdmin} />
          </div>
        )}

        {activeTab === "federation" && isRootAdmin && <ActivityPubPanel />}

        {activeTab === "automation" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <PenTool size={24} className="text-primary" />
                Federation & Automation
              </h2>
              <p className="opacity-70 text-sm mt-1 font-medium">
                Cross-post activities to external Mastodon instances.
              </p>
            </div>

            <div className="card card-m3 overflow-hidden">
              <div className="bg-gradient-to-r from-primary/10 to-transparent p-6 border-b border-base-content/5">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  Mastodon Cross-Posting
                </h3>
                <p className="text-xs opacity-50 mt-1">
                  Automatically mirror your posts and releases to your Mastodon
                  account.
                </p>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs uppercase font-bold opacity-40">
                      Mastodon Instance
                    </span>
                  </label>
                  <input
                    type="url"
                    className="input input-bordered focus:border-primary transition-all"
                    value={mastodonInstance}
                    onChange={(e) => setMastodonInstance(e.target.value)}
                    placeholder="https://mastodon.social"
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs uppercase font-bold opacity-40">
                      Access Token
                    </span>
                  </label>
                  <input
                    type="password"
                    className="input input-bordered focus:border-primary transition-all"
                    value={mastodonToken}
                    onChange={(e) => setMastodonToken(e.target.value)}
                    placeholder="Bearer Token"
                  />
                </div>
              </div>
              <div className="p-6 pt-0 flex items-center gap-4">
                <button
                  className="btn btn-primary gap-2 shadow-lg"
                  onClick={handleSaveAutomation}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <Settings size={16} />
                  )}
                  Save Settings
                </button>
                {message && (
                  <span
                    className={`text-sm font-medium ${message.includes("Failed") ? "text-error" : "text-success"}`}
                  >
                    {message}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <CreatePostModal
        onPostCreated={() =>
          window.dispatchEvent(new CustomEvent("refresh-social-content"))
        }
      />
    </div>
  );
};


