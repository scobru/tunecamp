import { useState, useEffect, useMemo } from "react";
import { useAuthStore } from "../stores/useAuthStore";
import { useWalletStore } from "../stores/useWalletStore";
import { usePurchases } from "../hooks/usePurchases";
import { useOwnedNFTs } from "../hooks/useOwnedNFTs";
import {
  User,
  Settings,
  Heart,
  Download,
  Camera,
  Check,
  Play,
  RefreshCw,
  Users,
  Clock,
  Globe,
  Shield,
  Copy,
  Plus,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Key,
} from "lucide-react";
import { usePlayerStore } from "../stores/usePlayerStore";
import API from "../services/api";
import { formatDuration } from "../utils/format";
import { notify } from "../utils/notify";
import type { Track } from "../types";
import clsx from "clsx";
import { ChangePasswordCard } from "../components/ui/ChangePasswordCard";
import { ArtistStripeConnectCard } from "../components/artist/ArtistStripeConnectCard";

const Profile = () => {
  const { user, isAuthenticated, role, isInitializing } = useAuthStore();
  // const isAdmin = role === 'admin' || role === 'super_user' || role === 'root_admin' || user?.isRootAdmin;
  const { address } = useWalletStore();
  const activeAddress = address;
  const { loading: purchasesLoading, isPurchased } = usePurchases();
  const { playTrack } = usePlayerStore();

  const [artistData, setArtistData] = useState<any>(null);
  const [artistLoading, setArtistLoading] = useState(false);
  const [siteHandle, setSiteHandle] = useState("site");

  useEffect(() => {
    API.getSiteSettings()
      .then((s) => { if (s?.siteHandle) setSiteHandle(s.siteHandle); })
      .catch(() => {});
  }, []);

  const isRoot = role === 'root_admin' || user?.isRootAdmin;
  // Listeners are pure consumers: even a stale artistId on their account must
  // not surface artist features — they see the "Become an Artist" card instead.
  const hasArtistProfile = !!user?.artistId && role !== 'user';
  const isCuratorOrAbove = role === 'super_user' || role === 'admin' || role === 'root_admin';

  const activeHandle = useMemo(() => {
    if (hasArtistProfile && artistData) {
      return `@${artistData.slug || artistData.name.toLowerCase().replace(/\s+/g, '')}@${window.location.host}`;
    }
    if (isRoot) {
      return `@${siteHandle}@${window.location.host}`;
    }
    return `@${user?.username || 'admin'}@${window.location.host}`;
  }, [user, artistData, isRoot, siteHandle]);

  const activeActorUri = useMemo(() => {
    if (hasArtistProfile && artistData) {
      return `${window.location.origin}/users/${artistData.slug || artistData.name.toLowerCase().replace(/\s+/g, '')}`;
    }
    if (isRoot) {
      return `${window.location.origin}/users/${siteHandle}`;
    }
    return `${window.location.origin}/users/${user?.username || 'admin'}`;
  }, [user, artistData, isRoot, siteHandle]);

  const [activeTab, setActiveTab] = useState<
    "settings" | "collection" | "artist"
  >("settings");

  // Ensure active tab is valid if user is not an artist
  useEffect(() => {
    if (!hasArtistProfile && activeTab === "artist") {
      setActiveTab("settings");
    }
  }, [hasArtistProfile, activeTab]);
  const [alias, setAlias] = useState(user?.alias || "");
  const [avatar, setAvatar] = useState<string | null>(user?.avatar || null);
  const [isSaving, setIsSaving] = useState(false);
  const [starredTracks, setStarredTracks] = useState<Track[]>([]);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(true);
  const [artistRequestedAt, setArtistRequestedAt] = useState<string | null>(null);
  const [requestingArtist, setRequestingArtist] = useState(false);

  // API Tokens State & Logic
  const [apiTokens, setApiTokens] = useState<any[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);
  const [isCreatingToken, setIsCreatingToken] = useState(false);

  const loadApiTokens = async () => {
    setLoadingTokens(true);
    try {
      const data = await API.getApiTokens();
      setApiTokens(data);
    } catch (err) {
      console.error("Failed to load API tokens", err);
    } finally {
      setLoadingTokens(false);
    }
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim() || isCreatingToken) return;
    setIsCreatingToken(true);
    setNewlyCreatedToken(null);
    try {
      const data = await API.createApiToken(newTokenName.trim());
      setNewlyCreatedToken(data.token);
      setNewTokenName("");
      loadApiTokens();
      notify.success("API token generated successfully!");
    } catch (err: any) {
      notify.error(err, "Failed to generate API token");
    } finally {
      setIsCreatingToken(false);
    }
  };

  const handleDeleteToken = async (id: number) => {
    if (!confirm("Are you sure you want to revoke this API token? Any applications using it will lose access.")) return;
    try {
      await API.deleteApiToken(id);
      loadApiTokens();
      notify.success("API token revoked successfully!");
    } catch (err: any) {
      notify.error(err, "Failed to revoke API token");
    }
  };

  useEffect(() => {
    if (isAuthenticated && isCuratorOrAbove) {
      loadApiTokens();
    }
  }, [isAuthenticated, role]);

  useEffect(() => {
    if (isAuthenticated && !hasArtistProfile) {
      API.getMyArtistRequest()
        .then((data) => setArtistRequestedAt(data.requestedAt))
        .catch(() => {});
    }
  }, [isAuthenticated, hasArtistProfile]);

  const handleRequestArtist = async () => {
    setRequestingArtist(true);
    try {
      await API.requestArtistProfile();
      setArtistRequestedAt(new Date().toISOString());
      notify.success("Request sent! An admin will review it.");
    } catch (e) {
      notify.error(e, "Failed to send request");
    } finally {
      setRequestingArtist(false);
    }
  };

  useEffect(() => {
    if (user) {
      setAlias(user.alias || "");
      setAvatar(user.avatar || null);
    }
  }, [user]);

  useEffect(() => {
    if (isAuthenticated) {
      setLoadingTracks(true);

      // Load tracks from API — backend already sets starred:true for liked tracks
      API.getTracks()
        .then((tracks) => {
          setAllTracks(tracks);
          setStarredTracks(tracks.filter(t => t.starred));
        })
        .finally(() => setLoadingTracks(false));

      // Load artist data if user is linked to an artist
      if (hasArtistProfile && user?.artistId) {
        setArtistLoading(true);
        API.getArtist(user.artistId)
          .then(setArtistData)
          .catch(console.error)
          .finally(() => setArtistLoading(false));
      }
    }
  }, [isAuthenticated, hasArtistProfile, user?.artistId]);

  const { ownedNFTs } = useOwnedNFTs(activeAddress);

  const purchasedTracks = useMemo(() => {
    return allTracks.filter((t) => {
      const isRecordPurchased = isPurchased(t.id);
      const isNFTPurchased = ownedNFTs.some(n => n.trackId === Number(t.id));
      return isRecordPurchased || isNFTPurchased;
    });
  }, [allTracks, isPurchased, ownedNFTs]);

  const handleUpdateAlias = async () => {
    if (!alias.trim()) return;
    setIsSaving(true);
    try {
      await API.patchProfile({ alias: alias.trim() });
      window.location.reload();
    } catch (err) {
      console.error("Failed to update alias:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const max_size = 400;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > max_size) {
            height *= max_size / width;
            width = max_size;
          }
        } else {
          if (height > max_size) {
            width *= max_size / height;
            height = max_size;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL("image/jpeg", 0.85);

        setAvatar(base64);
        setIsSaving(true);
        try {
          await API.patchProfile({ avatar: base64 });
          window.location.reload();
        } catch (err) {
          console.error("Failed to update avatar:", err);
        } finally {
          setIsSaving(false);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (isInitializing) {
    return (
      <div className="p-12 text-center opacity-50">Loading profile...</div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="p-12 text-center opacity-70 animate-fade-in">
        <User size={48} className="mx-auto mb-4 text-primary opacity-50" />
        <h2 className="text-xl font-bold mb-2">Login Required</h2>
        <p className="mb-4">Please login to view and manage your profile.</p>
        <button
          className="btn btn-primary gap-2"
          onClick={() =>
            document.dispatchEvent(new CustomEvent("open-auth-modal"))
          }
        >
          Login
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-24 p-6 md:px-0 md:pt-0 md:pb-16">
      {/* Profile Header */}
      <div className="flex flex-col md:flex-row items-center gap-8 border-b border-base-content/5 pb-10">
        <div className="relative group">
          <div className="w-32 h-32 rounded-full overflow-hidden ring-4 ring-primary/20 bg-neutral flex items-center justify-center text-4xl font-black">
            {avatar ? (
              <img
                src={avatar}
                alt={user?.alias || user?.username}
                className="w-full h-full object-cover"
              />
            ) : (
              (user?.alias || user?.username)?.charAt(0).toUpperCase()
            )}
          </div>
          <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-full">
            <Camera size={24} className="text-white" />
            <input
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleAvatarChange}
            />
          </label>
        </div>

        <div className="text-center md:text-left flex-1">
          <h1 className="text-4xl font-black tracking-tight mb-2">
            {user?.alias || user?.username}
          </h1>
          <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-4">
            <div className="badge badge-outline gap-2 py-3 px-4">
              <Heart size={14} className="text-primary" />
              {starredTracks.length} Likes
            </div>
            <div className="badge badge-outline gap-2 py-3 px-4">
              <Download size={14} className="text-secondary" />
              {purchasedTracks.length} Purchases
            </div>
            <div className="badge badge-outline gap-2 py-3 px-4 opacity-70">
              <Settings size={14} />
              Wallet: {address?.substring(0, 6)}...
              {address?.substring(address.length - 4)}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs tabs-boxed bg-base-300/50 p-1 rounded-2xl w-fit mx-auto md:mx-0">
        <button
          className={clsx(
            "tab tab-lg px-8 gap-2",
            activeTab === "settings" && "tab-active",
          )}
          onClick={() => setActiveTab("settings")}
        >
          <Settings size={18} /> Settings
        </button>
        <button
          className={clsx(
            "tab tab-lg px-8 gap-2",
            activeTab === "collection" && "tab-active",
          )}
          onClick={() => setActiveTab("collection")}
        >
          <Download size={18} /> Collection
        </button>
        {hasArtistProfile && (
          <button
            className={clsx(
              "tab tab-lg px-8 gap-2",
              activeTab === "artist" && "tab-active",
            )}
            onClick={() => setActiveTab("artist")}
          >
            <User size={18} className="text-secondary" /> Artist Profile
          </button>
        )}
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {activeTab === "settings" && (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="card bg-base-100/50 border border-base-content/5 p-6 space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <User size={20} className="text-primary" /> Account Settings
              </h3>

              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text opacity-60">
                    Display Name / Alias
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter alias"
                    className="input input-bordered flex-1"
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                  />
                  <button
                    className={clsx(
                      "btn btn-primary btn-square",
                      isSaving && "loading",
                    )}
                    onClick={handleUpdateAlias}
                    disabled={alias === user?.alias || isSaving}
                  >
                    {!isSaving && <Check size={20} />}
                  </button>
                </div>
                <label className="label">
                  <span className="label-text-alt opacity-40 italic">
                    This name is displayed across TuneCamp.
                  </span>
                </label>
              </div>

              <div className="divider opacity-10"></div>

              <div className="alert alert-info bg-primary/10 border-primary/20 text-sm">
                <Settings size={18} />
                <span>
                  Profile changes are saved on this server.
                </span>
              </div>
            </div>

            <div className="card bg-base-100/50 border border-base-content/5 p-6 space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Camera size={20} className="text-secondary" /> Profile Visuals
              </h3>
              <p className="text-sm opacity-60">
                Your profile picture is saved on the server. Square images work best (PNG/JPG, max 400px).
              </p>

              <div className="flex flex-col items-center gap-4 py-4">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-neutral ring-4 ring-secondary/20">
                  {avatar ? (
                    <img src={avatar} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl font-bold opacity-30">
                      TC
                    </div>
                  )}
                </div>
                <label className="btn btn-outline btn-sm gap-2">
                  <Camera size={16} /> Change Avatar
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleAvatarChange}
                  />
                </label>
              </div>
            </div>

            {/* Security: change password (works for every authenticated user) */}
            <ChangePasswordCard />

            {/* Artist profile request (listeners without a linked artist) */}
            {!hasArtistProfile && (
              <div className="card bg-base-100/50 border border-base-content/5 p-6 space-y-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <User size={20} className="text-secondary" /> Become an Artist
                </h3>
                <p className="text-sm opacity-60">
                  Want to publish your own music on this instance? Request an
                  artist profile — if an admin approves, your account is
                  promoted to Curator with a linked artist profile.
                </p>
                {artistRequestedAt ? (
                  <div className="alert alert-info bg-primary/10 border-primary/20 text-sm">
                    <Clock size={18} />
                    <span>
                      Request sent on {new Date(artistRequestedAt).toLocaleDateString()}. Waiting for admin approval.
                    </span>
                  </div>
                ) : (
                  <button
                    className="btn btn-secondary btn-outline w-fit gap-2"
                    onClick={handleRequestArtist}
                    disabled={requestingArtist}
                  >
                    {requestingArtist ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <ArrowRight size={16} />
                    )}
                    Request Artist Profile
                  </button>
                )}
              </div>
            )}

            {/* Role & Permissions Card */}
            <div className="card bg-base-100/50 border border-base-content/5 p-6 space-y-6 md:col-span-2">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Shield size={20} className="text-secondary" /> Account Role & Permissions
              </h3>
              <p className="text-sm opacity-60">
                Here you can view your current role within the TuneCamp platform and see what actions you can perform.
              </p>
              
              <div className="bg-base-200/30 rounded-2xl p-6 border border-base-content/5 flex flex-col md:flex-row gap-6 items-start">
                <div className="flex flex-col gap-2 min-w-[200px]">
                  <span className="text-xs opacity-50 tracking-normal font-black">Current Role</span>
                  <div className={clsx("badge badge-lg gap-2 font-bold py-4 px-5 text-sm tracking-normal rounded-xl shadow-sm border-0", 
                    role === 'root_admin' ? "bg-red-500/20 text-red-500" :
                    role === 'admin' ? "bg-primary/20 text-primary" :
                    role === 'super_user' ? "bg-secondary/20 text-secondary" :
                    "bg-accent/20 text-accent"
                  )}>
                    {role === 'root_admin' ? "Root Admin (Owner)" :
                     role === 'admin' ? "Manager (Full Admin)" :
                     role === 'super_user' ? "Curator (Super User)" :
                     "Listener (Standard)"}
                  </div>
                  {hasArtistProfile && (
                    <div className="badge badge-outline gap-1 py-3 px-4 mt-1 font-semibold text-xs border-base-content/10">
                      🎨 Linked Artist
                    </div>
                  )}
                </div>
                
                <div className="flex-1 space-y-4">
                  <div>
                    <h4 className="font-bold text-base">
                      {role === 'root_admin' && "Instance Owner (Root Admin)"}
                      {role === 'admin' && "Manager (Full Admin)"}
                      {role === 'super_user' && "Curator (Super User)"}
                      {role === 'user' && "Listener (Standard User)"}
                    </h4>
                    <p className="text-sm opacity-70 mt-1">
                      {role === 'root_admin' && "You have complete administrative and security control over this TuneCamp instance."}
                      {role === 'admin' && "You have administrative privileges to moderate the community, manage releases, and support artists."}
                      {role === 'super_user' && "You are responsible for music catalog quality, organization, and correcting track metadata."}
                      {role === 'user' && "You are a standard user. You can listen to music and purchase albums. Want to publish your own music? Request an artist profile to become a Curator."}
                    </p>
                  </div>
                  
                  <div className="divider opacity-5 my-2"></div>
                  
                  <div className="space-y-3">
                    <span className="text-xs opacity-50 tracking-normal font-bold">What you can do:</span>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      {role === 'root_admin' && [
                        "Manage all users, roles, and active/inactive status",
                        "Access encryption keys and master security keys",
                        "Modify global site settings (name, logo, backgrounds)",
                        "Manage Curation Queue and track promotions",
                        "Perform full backups and manage storage",
                        "Manage federation and global ActivityPub integration"
                      ].map((cap, idx) => (
                        <li key={idx} className="flex gap-2 items-start text-base-content/80">
                          <Check size={16} className="text-success mt-0.5 flex-shrink-0" />
                          <span>{cap}</span>
                        </li>
                      ))}

                      {role === 'admin' && [
                        "View user accounts registered on the server",
                        "Moderate posts and releases globally on the instance",
                        "Manage and promote content within the catalog",
                        "Manage ActivityPub follows and social federation",
                        "Act on behalf of artists assigned to you"
                      ].map((cap, idx) => (
                        <li key={idx} className="flex gap-2 items-start text-base-content/80">
                          <Check size={16} className="text-success mt-0.5 flex-shrink-0" />
                          <span>{cap}</span>
                        </li>
                      ))}

                      {role === 'super_user' && [
                        "Global visibility of the library (including drafts and private files)",
                        "Modify metadata for any track or album (titles, genres)",
                        "Upload tracks and curate catalog ordering",
                        "Correct errors or imperfections in covers and tags"
                      ].map((cap, idx) => (
                        <li key={idx} className="flex gap-2 items-start text-base-content/80">
                          <Check size={16} className="text-success mt-0.5 flex-shrink-0" />
                          <span>{cap}</span>
                        </li>
                      ))}

                      {role === 'user' && [
                        "Listen to public music (Arena) and purchase tracks",
                        "Create and manage personal playlists and favorites",
                        "Request an artist profile to publish your own music",
                        "Customize your profile, alias, and avatar"
                      ].map((cap, idx) => (
                        <li key={idx} className="flex gap-2 items-start text-base-content/80">
                          <Check size={16} className="text-success mt-0.5 flex-shrink-0" />
                          <span>{cap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Fediverse Identity — full-width panel below the 2-col grid */}
          <div className="card bg-base-100/50 border border-base-content/5 p-6 space-y-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Globe size={20} className="text-secondary" /> Fediverse Identity
            </h3>
            <p className="text-sm opacity-60">
              Your account is available as an ActivityPub actor. Follow or interact from Mastodon, Funkwhale, and other Fediverse apps.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text opacity-60">Fediverse Handle</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={activeHandle}
                    className="input input-bordered flex-1 font-mono text-sm"
                  />
                  <button
                    className="btn btn-ghost btn-square tooltip tooltip-left"
                    onClick={() => {
                      navigator.clipboard.writeText(activeHandle);
                      notify.success("Handle copied!");
                    }}
                    data-tip="Copy handle"
                  >
                    <Copy size={18} />
                  </button>
                </div>
              </div>
              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text opacity-60">Actor URI</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={activeActorUri}
                    className="input input-bordered flex-1 font-mono text-sm"
                  />
                  <button
                    className="btn btn-ghost btn-square tooltip tooltip-left"
                    onClick={() => {
                      navigator.clipboard.writeText(activeActorUri);
                      notify.success("Actor URI copied!");
                    }}
                    data-tip="Copy actor URI"
                  >
                    <Copy size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* API Tokens Panel */}
          {isCuratorOrAbove && (
            <div className="card bg-base-100/50 border border-base-content/5 p-6 space-y-4 mt-8">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Key size={20} className="text-primary" /> API Tokens
              </h3>
              <p className="text-sm opacity-60">
                Create personal API tokens to programmatically interact with the TuneCamp API.
                These tokens will run with your role's permissions ({role === 'root_admin' ? "Root Admin" : role === 'admin' ? "Manager" : "Curator"}).
              </p>

              {newlyCreatedToken && (
                <div className="alert alert-warning bg-warning/10 border-warning/20 flex flex-col items-start gap-3 p-4 rounded-2xl">
                  <div className="flex gap-2 items-center text-warning font-bold">
                    <ShieldCheck size={18} />
                    <span>Copy your API token now!</span>
                  </div>
                  <p className="text-sm opacity-90">
                    For security reasons, this token will not be shown again.
                  </p>
                  <div className="flex gap-2 w-full">
                    <input
                      type="text"
                      readOnly
                      value={newlyCreatedToken}
                      className="input input-bordered flex-1 font-mono text-sm bg-base-300"
                    />
                    <button
                      className="btn btn-ghost btn-square tooltip tooltip-left"
                      onClick={() => {
                        navigator.clipboard.writeText(newlyCreatedToken);
                        notify.success("API token copied!");
                      }}
                      data-tip="Copy token"
                    >
                      <Copy size={18} />
                    </button>
                    <button
                      className="btn btn-sm btn-ghost self-center"
                      onClick={() => setNewlyCreatedToken(null)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleCreateToken} className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="form-control flex-1">
                  <label className="label py-1">
                    <span className="label-text opacity-60">Token Name</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. My Script, Third Party App"
                    className="input input-bordered w-full"
                    value={newTokenName}
                    onChange={(e) => setNewTokenName(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary gap-2 w-full sm:w-auto"
                  disabled={isCreatingToken || !newTokenName.trim()}
                >
                  {isCreatingToken ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <Plus size={16} />
                  )}
                  Generate Token
                </button>
              </form>

              <div className="divider opacity-5 my-4"></div>

              {loadingTokens ? (
                <div className="text-center opacity-50 py-4">Loading active tokens...</div>
              ) : apiTokens.length === 0 ? (
                <div className="text-center opacity-40 py-6 text-sm italic">
                  No active API tokens found. Generate one above.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table w-full text-sm">
                    <thead>
                      <tr>
                        <th className="bg-transparent opacity-60">Name</th>
                        <th className="bg-transparent opacity-60">Token</th>
                        <th className="bg-transparent opacity-60">Created At</th>
                        <th className="bg-transparent opacity-60 w-16 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiTokens.map((t) => (
                        <tr key={t.id} className="hover:bg-base-200/30">
                          <td className="font-bold">{t.name}</td>
                          <td className="font-mono text-xs opacity-75">{t.token}</td>
                          <td>{new Date(t.created_at).toLocaleDateString()}</td>
                          <td className="text-center">
                            <button
                              type="button"
                              className="btn btn-ghost btn-square btn-sm text-error"
                              onClick={() => handleDeleteToken(t.id)}
                              title="Revoke Token"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          </>
        )}


        {activeTab === "collection" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            {purchasesLoading || loadingTracks ? (
              <div className="p-12 text-center opacity-50">
                Loading collection...
              </div>
            ) : purchasedTracks.length === 0 ? (
              <div className="p-20 text-center opacity-40 bg-base-200/20 rounded-3xl border border-dashed border-base-content/10">
                <Download size={48} className="mx-auto mb-4" />
                <p>Your collection is empty.</p>
              </div>
            ) : (
              <TrackList
                tracks={purchasedTracks}
                onPlay={(t) => playTrack(t, purchasedTracks)}
              />
            )}
          </div>
        )}

        {activeTab === "artist" && hasArtistProfile && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                {artistLoading ? (
                    <div className="p-12 text-center opacity-50">Loading artist profile...</div>
                ) : (
                    <ArtistProfileEditor initialData={artistData} onSaved={(data) => setArtistData(data)} />
                )}
            </div>
        )}
      </div>
    </div>
  );
};

const ArtistProfileEditor = ({ initialData, onSaved }: { initialData: any; onSaved: (data: any) => void }) => {
  const [name, setName] = useState(initialData?.name || "");
  const [bio, setBio] = useState(initialData?.bio || "");
  const [donationUrl, setDonationUrl] = useState("");
  const [socialLinks, setSocialLinks] = useState<{ platform: string; url: string }[]>([]);
  const [walletAddress, setWalletAddress] = useState(initialData?.walletAddress || "");
  const [mastodonInstance, setMastodonInstance] = useState("");
  const [mastodonToken, setMastodonToken] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [followersCount, setFollowersCount] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Identity Migration State
  const [aliases, setAliases] = useState<string[]>(initialData?.also_known_as || []);
  const [newAlias, setNewAlias] = useState("");
  const [targetMoveUri, setTargetMoveUri] = useState("");
  const [sourceImportUri, setSourceImportUri] = useState("");
  const [isAliasUpdating, setIsAliasUpdating] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || "");
      setBio(initialData.bio || "");
      setWalletAddress(initialData.walletAddress || "");
      setAliases(initialData.also_known_as || []);

      // Parse links
      if (initialData.links) {
        const links = initialData.links;
        const donation = links.find(
          (l: any) => l.type === "support" || l.platform?.toLowerCase() === "donation"
        );
        setDonationUrl(donation ? donation.url : "");
        setSocialLinks(
          links.filter((l: any) => l.type !== "support" && l.platform?.toLowerCase() !== "donation")
        );
      }

      // Parse Mastodon config
      if (initialData.postParams) {
        setMastodonInstance(initialData.postParams.instance || "");
        setMastodonToken(initialData.postParams.token || "");
      }

      // Fetch followers count helper
      API.getArtistFollowers(initialData.id)
        .then((f) => setFollowersCount(f.length))
        .catch(console.error);
    }
  }, [initialData]);

  const handleUpdateAliases = async (updatedAliases: string[]) => {
    if (!initialData?.id || isAliasUpdating) return;
    setIsAliasUpdating(true);
    try {
      await API.updateArtistAlias(initialData.id, updatedAliases.length > 0 ? updatedAliases : null);
      setAliases(updatedAliases);
      notify.success("Aliases updated successfully!");
    } catch (err: any) {
      notify.error(err, "Failed to update aliases");
    } finally {
      setIsAliasUpdating(false);
    }
  };

  const handleAddAlias = () => {
    if (!newAlias.trim()) return;
    const updated = [...aliases, newAlias.trim()];
    handleUpdateAliases(updated);
    setNewAlias("");
  };

  const handleRemoveAlias = (index: number) => {
    const updated = aliases.filter((_, i) => i !== index);
    handleUpdateAliases(updated);
  };

  const handleInitiateMove = async () => {
    if (!targetMoveUri.trim() || isMoving) return;
    if (!confirm(`Are you sure you want to initiate migration of this identity to ${targetMoveUri}?\nThis will broadcast a Move activity to all followers and they will automatically follow the new profile.`)) return;
    setIsMoving(true);
    try {
      await API.initiateArtistMove(initialData.id, targetMoveUri.trim());
      notify.success("Move initiated successfully! Followers will be redirected to your new profile.");
    } catch (err: any) {
      notify.error(err, "Failed to initiate move");
    } finally {
      setIsMoving(false);
    }
  };

  const handleImportIdentity = async () => {
    if (!sourceImportUri.trim() || isImporting) return;
    setIsImporting(true);
    try {
      await API.importArtistIdentity(initialData.id, sourceImportUri.trim());
      notify.success("Profile imported and verified successfully! Refreshing details...");
      window.location.reload();
    } catch (err: any) {
      notify.error(err, "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSync = async () => {
    if (!initialData?.id || isSyncing) return;
    if (!confirm("Synchronize your releases and posts with the Fediverse?")) return;
    setIsSyncing(true);
    try {
      await API.syncArtistActivityPub(initialData.id);
      notify.success("Synchronization complete!");
    } catch (err: any) {
      notify.error(err, "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage("");

    try {
      const allLinks: any[] = [...socialLinks];
      if (donationUrl) {
        allLinks.unshift({ platform: "Donation", url: donationUrl, type: "support" });
      }

      const postParams =
        mastodonInstance || mastodonToken
          ? {
              instance: mastodonInstance,
              token: mastodonToken,
            }
          : null;

      const updated = await API.updateArtist(initialData.id, {
        bio,
        links: allLinks,
        walletAddress: walletAddress || undefined,
        postParams,
      });

      if (avatarFile) {
        await API.uploadArtistAvatar(initialData.id, avatarFile);
      }

      setMessage("Artist profile updated successfully!");
      onSaved({ ...initialData, ...updated });
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (err: any) {
      console.error("Failed to update artist profile:", err);
      setMessage(`Update failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left Column: Profile & Identity */}
      <div className="lg:col-span-4 space-y-6">
        <div className="card bg-base-100/50 border border-base-content/5 p-6 space-y-6">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <User size={20} className="text-primary" /> Artist Identity
          </h3>

          <div className="flex flex-col items-center gap-4 py-2">
            <div className="w-32 h-32 rounded-2xl overflow-hidden bg-neutral border border-base-content/10 shadow-level-1 relative group">
              {avatarPreview ? (
                <img src={avatarPreview} className="w-full h-full object-cover" />
              ) : initialData?.id ? (
                <img
                  src={API.getArtistCoverUrl(initialData.id, Date.now())}
                  className="w-full h-full object-cover"
                />
              ) : null}
              <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <Camera size={24} className="text-white" />
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleAvatarChange}
                />
              </label>
            </div>
            <p className="text-xs opacity-40">Square images work best (PNG/JPG)</p>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text opacity-60">Artist Name</span>
            </label>
            <input type="text" className="input input-bordered opacity-50 bg-base-300" value={name} readOnly title="Managed by library metadata" />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text opacity-60">Bio / Description</span>
            </label>
            <textarea
              className="textarea textarea-bordered h-40"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Describe your sound..."
            />
          </div>
        </div>

        {/* Status Section */}
        <div className="card bg-primary/5 border border-primary/10 p-6 space-y-4">
          <h3 className="text-sm font-bold tracking-normal opacity-40">Digital Presence</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg text-primary">
                <Users size={18} />
              </div>
              <div>
                <div className="text-xl font-black">{followersCount ?? 0}</div>
                <div className="text-xs opacity-40 font-bold">Followers</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSync}
              className={clsx("btn btn-xs btn-outline gap-2", isSyncing && "loading")}
            >
              {!isSyncing && <RefreshCw size={12} />} Sync AP
            </button>
          </div>
        </div>
      </div>

      {/* Right Column: Monetization & Federation */}
      <div className="lg:col-span-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Monetization Section */}
          <div className="card bg-base-100/50 border border-base-content/5 p-6 space-y-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <span className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
                <Check size={18} />
              </span>{" "}
              Monetization
            </h3>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-bold text-emerald-400">Wallet Address</span>
              </label>
              <input
                type="text"
                className="input input-bordered border-emerald-500/20 font-mono text-xs"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x..."
              />
              <label className="label">
                <span className="label-text-alt opacity-40">Direct-to-Artist revenue goes here.</span>
              </label>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-bold text-emerald-400">Support / Donation URL</span>
              </label>
              <input
                type="url"
                className="input input-bordered border-emerald-500/20"
                value={donationUrl}
                onChange={(e) => setDonationUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            {initialData?.id && (
              <ArtistStripeConnectCard artistId={initialData.id} returnTo="/profile" />
            )}
          </div>

          {/* Social Section */}
          <div className="card bg-base-100/50 border border-base-content/5 p-6 space-y-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Globe size={20} className="text-sky-400" /> Web Links
            </h3>
            <div className="form-control">
              <label className="label">
                <span className="label-text opacity-60">Social Links (comma separated)</span>
              </label>
              <input
                type="text"
                className="input input-bordered"
                value={socialLinks.map((l) => l.url).join(", ")}
                onChange={(e) => {
                  const urls = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                  setSocialLinks(
                    urls.map((url) => {
                      let platform = "Social";
                      if (url.includes("twitter")) platform = "Twitter";
                      if (url.includes("x.com")) platform = "X";
                      if (url.includes("instagram")) platform = "Instagram";
                      if (url.includes("facebook")) platform = "Facebook";
                      if (url.includes("youtube")) platform = "YouTube";
                      return { platform, url };
                    })
                  );
                }}
                placeholder="twitter.com/..., instagram.com/..."
              />
            </div>
          </div>
        </div>

        {/* Federation Section */}
        <div className="card bg-base-100/50 border border-base-content/5 overflow-hidden">
          <div className="bg-base-200/40 p-6 border-b border-base-content/5">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Play size={20} className="text-indigo-400" /> Federation & Automation
            </h3>
            <p className="text-xs opacity-50 mt-1">Cross-post activities and manage community outreach.</p>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="form-control">
              <label className="label">
                <span className="label-text text-xs font-bold opacity-40">Mastodon Instance</span>
              </label>
              <input
                type="url"
                className="input input-sm input-bordered"
                value={mastodonInstance}
                onChange={(e) => setMastodonInstance(e.target.value)}
                placeholder="https://mastodon.social"
              />
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text text-xs font-bold opacity-40">Master Token</span>
              </label>
              <input
                type="password"
                className="input input-sm input-bordered"
                value={mastodonToken}
                onChange={(e) => setMastodonToken(e.target.value)}
                placeholder="Bearer Token"
              />
            </div>
          </div>
        </div>

        {/* Identity & Migration Section */}
        <div className="card bg-base-100/50 border border-base-content/5 overflow-hidden">
          <div className="bg-base-200/40 p-6 border-b border-base-content/5">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Globe size={20} className="text-violet-400" /> Identity Migration (ActivityPub)
            </h3>
            <p className="text-xs opacity-50 mt-1">
              Link your remote Fediverse profiles, import metadata, or migrate your followers.
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* Identity Info & Aliases */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-bold opacity-70 mb-3">ActivityPub Addresses</h4>
                <div className="space-y-3">
                  <div className="form-control">
                    <span className="label-text text-xs opacity-50 mb-1">Local Handle</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`@${initialData?.slug}@${window.location.host}`}
                        className="input input-sm input-bordered font-mono text-xs flex-1 bg-base-200/50"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`@${initialData?.slug}@${window.location.host}`);
                          notify.success("Handle copied to clipboard!");
                        }}
                        className="btn btn-sm btn-outline btn-square tooltip tooltip-left"
                        data-tip="Copy Handle"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="form-control">
                    <span className="label-text text-xs opacity-50 mb-1">Actor URI</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}/api/ap/users/${initialData?.slug}`}
                        className="input input-sm input-bordered font-mono text-xs flex-1 bg-base-200/50"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/api/ap/users/${initialData?.slug}`);
                          notify.success("Actor URI copied to clipboard!");
                        }}
                        className="btn btn-sm btn-outline btn-square tooltip tooltip-left"
                        data-tip="Copy Actor URI"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold opacity-70 mb-3">Verified Aliases</h4>
                <div className="space-y-3">
                  {aliases.length === 0 ? (
                    <p className="text-xs opacity-40 italic">
                      No aliases verified yet. Add aliases to prove ownership of remote accounts.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-36 overflow-y-auto">
                      {aliases.map((aliasUri, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 bg-base-200/50 p-2 rounded-lg border border-base-content/5">
                          <span className="text-xs font-mono truncate flex-1" title={aliasUri}>{aliasUri}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAlias(idx)}
                            className="btn btn-xs btn-ghost btn-square text-error"
                            disabled={isAliasUpdating}
                            title="Remove Alias"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 mt-2">
                    <input
                      type="url"
                      placeholder="https://mastodon.social/users/username"
                      value={newAlias}
                      onChange={(e) => setNewAlias(e.target.value)}
                      className="input input-sm input-bordered flex-1 text-xs"
                      disabled={isAliasUpdating}
                    />
                    <button
                      type="button"
                      onClick={handleAddAlias}
                      className={clsx("btn btn-sm btn-primary gap-1", isAliasUpdating && "loading")}
                      disabled={isAliasUpdating || !newAlias.trim()}
                    >
                      {!isAliasUpdating && <Plus size={14} />} Add
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="divider opacity-5 my-2"></div>

            {/* Import & Move Sections */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-base-200/30 p-4 rounded-xl border border-base-content/5 space-y-3">
                <h4 className="text-sm font-bold flex items-center gap-2 text-violet-400">
                  <ShieldCheck size={16} /> Import Profile Details
                </h4>
                <p className="text-xs opacity-60">
                  Copy profile metadata (bio, links, etc.) from a remote Fediverse account to this instance.
                </p>
                <div className="alert alert-info bg-info/5 border-info/20 text-xs py-2 px-3">
                  <span>
                    <strong>Requirement:</strong> The remote account must first add your local Actor URI to their aliases.
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="Remote Actor URI"
                    value={sourceImportUri}
                    onChange={(e) => setSourceImportUri(e.target.value)}
                    className="input input-sm input-bordered flex-1 text-xs"
                    disabled={isImporting}
                  />
                  <button
                    type="button"
                    onClick={handleImportIdentity}
                    className={clsx("btn btn-sm btn-secondary", isImporting && "loading")}
                    disabled={isImporting || !sourceImportUri.trim()}
                  >
                    Verify & Import
                  </button>
                </div>
              </div>

              {/* Export/Move Section */}
              <div className="bg-base-200/30 p-4 rounded-xl border border-base-content/5 space-y-3">
                <h4 className="text-sm font-bold flex items-center gap-2 text-warning">
                  <ArrowRight size={16} /> Migrate Out (Move)
                </h4>
                <p className="text-xs opacity-60">
                  Migrate your followers to another ActivityPub profile. This will redirect followers to your new instance.
                </p>
                {initialData?.moved_to ? (
                  <div className="alert alert-warning bg-warning/10 border-warning/20 text-xs py-2 px-3">
                    <span>This account has migrated to: <strong>{initialData.moved_to}</strong></span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="New Actor URI"
                        value={targetMoveUri}
                        onChange={(e) => setTargetMoveUri(e.target.value)}
                        className="input input-sm input-bordered flex-1 text-xs"
                        disabled={isMoving}
                      />
                      <button
                        type="button"
                        onClick={handleInitiateMove}
                        className={clsx("btn btn-sm btn-warning", isMoving && "loading")}
                        disabled={isMoving || !targetMoveUri.trim()}
                      >
                        Initiate Move
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
          <div className="flex-1 w-full">
            {message && (
              <div
                className={clsx(
                  "alert text-sm py-3",
                  message.includes("failed")
                    ? "alert-error bg-error/10 border-error/20"
                    : "alert-success bg-success/10 border-success/20"
                )}
              >
                {message}
              </div>
            )}
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-lg px-12 gap-3 w-full sm:w-auto shadow-level-1 shadow-primary/20"
            disabled={isSaving}
          >
            {isSaving ? <span className="loading loading-spinner" /> : <Check size={24} />}
            <span>Save Profile</span>
          </button>
        </div>
      </div>
    </form>
  );
};

const TrackList = ({
  tracks,
  onPlay,
}: {
  tracks: Track[];
  onPlay: (t: Track) => void;
}) => {
  return (
    <div className="overflow-x-auto bg-base-200/30 rounded-2xl border border-base-content/5 min-h-[300px]">
      <table className="table w-full">
        <thead>
          <tr className="border-b border-base-content/10 opacity-50 text-xs tracking-normal">
            <th className="w-12 text-center">#</th>
            <th>Title</th>
            <th>Album</th>
            <th className="text-right">
              <Clock size={16} />
            </th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((track, i) => (
            <tr
              key={track.id}
              className="hover:bg-base-content/5 group border-b border-base-content/5 last:border-0 transition-colors"
            >
              <td className="text-center font-mono w-12 relative">
                <span className="opacity-40 group-hover:opacity-0 transition-opacity absolute inset-0 flex items-center justify-center">
                  {i + 1}
                </span>
                <button
                  onClick={() => onPlay(track)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 flex items-center justify-center text-primary"
                >
                  <Play size={14} fill="currentColor" />
                </button>
              </td>
              <td>
                <div className="font-bold">{track.title}</div>
                <div className="text-xs opacity-40">{track.artistName}</div>
              </td>
              <td className="opacity-60 text-sm">{track.albumName}</td>
              <td className="text-right opacity-40 font-mono text-xs">
                {formatDuration(track.duration)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};


export default Profile;
