import { useState, useEffect, useMemo } from "react";
import { useAuthStore } from "../stores/useAuthStore";
import { useWalletStore } from "../stores/useWalletStore";
import { usePurchases } from "../hooks/usePurchases";
import { useOwnedNFTs } from "../hooks/useOwnedNFTs";
import { ZenAuth } from "../services/zen";
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
} from "lucide-react";
import { usePlayerStore } from "../stores/usePlayerStore";
import API from "../services/api";
import { formatDuration } from "../utils/format";
import type { Track } from "../types";
import clsx from "clsx";

export const Profile = () => {
  const { user, isAuthenticated, role, isInitializing } = useAuthStore();
  const isAdmin = role === 'admin' || role === 'super_user' || user?.isRootAdmin;
  const { address, externalAddress, useExternalWallet, isExternalConnected } = useWalletStore();
  const activeAddress = useExternalWallet && isExternalConnected ? externalAddress : address;
  const { loading: purchasesLoading, isPurchased } = usePurchases();
  const { playTrack } = usePlayerStore();

  const [activeTab, setActiveTab] = useState<
    "settings" | "collection" | "artist"
  >("settings");

  // Ensure active tab is valid if user is not an artist/admin
  useEffect(() => {
    if ((!user?.artistId || !isAdmin) && activeTab === "artist") {
      setActiveTab("settings");
    }
  }, [user?.artistId, isAdmin, activeTab]);
  const [artistData, setArtistData] = useState<any>(null);
  const [artistLoading, setArtistLoading] = useState(false);
  const [alias, setAlias] = useState(user?.zenProfile?.alias || "");
  const [avatar, setAvatar] = useState<string | null>(user?.zenProfile?.profile?.avatar || null);
  const [isSaving, setIsSaving] = useState(false);
  const [starredTracks, setStarredTracks] = useState<Track[]>([]);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(true);

  useEffect(() => {
    if (user) {
      setAlias(user.zenProfile?.alias || "");
      setAvatar(user.zenProfile?.profile?.avatar || null);
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

      // Load artist data if user is linked to an artist AND is admin
      if (user?.artistId && isAdmin) {
        setArtistLoading(true);
        API.getArtist(user.artistId)
          .then(setArtistData)
          .catch(console.error)
          .finally(() => setArtistLoading(false));
      }
    }
  }, [isAuthenticated, user?.artistId, isAdmin]);

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
      await ZenAuth.updateAlias(alias);
      // Force local store update or reload if necessary
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
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setAvatar(base64);
      setIsSaving(true);
      try {
        await ZenAuth.updateProfile({ avatar: base64 });
      } catch (err) {
        console.error("Failed to update avatar:", err);
      } finally {
        setIsSaving(false);
      }
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
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-20 p-6 md:p-0">
      {/* Profile Header */}
      <div className="flex flex-col md:flex-row items-center gap-8 border-b border-base-content/5 pb-10">
        <div className="relative group">
          <div className="w-32 h-32 rounded-full overflow-hidden ring-4 ring-primary/20 bg-neutral flex items-center justify-center text-4xl font-black">
            {avatar ? (
              <img
                src={avatar}
                alt={user?.zenProfile?.alias}
                className="w-full h-full object-cover"
              />
            ) : (
              user?.zenProfile?.alias?.charAt(0).toUpperCase()
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
            {user?.zenProfile?.alias || user?.username}
            <span className="text-lg font-normal opacity-40 ml-3">
              @{user?.zenProfile?.pub?.substring(0, 8)}
            </span>
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
        {user?.artistId && (
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
                    disabled={alias === user?.zenProfile?.alias || isSaving}
                  >
                    {!isSaving && <Check size={20} />}
                  </button>
                </div>
                <label className="label">
                  <span className="label-text-alt opacity-40 italic">
                    This name is used across TuneCamp and Zen.
                  </span>
                </label>
              </div>

              <div className="divider opacity-10"></div>
              
              <div className="form-control w-full">
                  <label className="label">
                      <span className="label-text opacity-60">Backup Account Pair (Zen)</span>
                  </label>
                  <p className="text-xs opacity-50 mb-2">
                       This JSON contains your decentralized cryptographic keys. Save it somewhere safe. 
                       You can use it to log into TuneCamp from another device if you forget your password.
                  </p>
                  
                  {/* Since Zen.user()._.sea might not be typed easily, we access it dynamically */}
                  { ZenAuth.user?.is && (ZenAuth.user as any)._?.sea ? (
                      <div className="flex flex-col gap-2">
                          <textarea 
                              readOnly 
                              className="textarea textarea-bordered font-mono text-xs h-24 w-full bg-base-200"
                              value={JSON.stringify((ZenAuth.user as any)._?.sea, null, 2)}
                          />
                          <button 
                              className="btn btn-sm btn-outline btn-secondary self-start gap-2"
                              onClick={() => {
                                  navigator.clipboard.writeText(JSON.stringify((ZenAuth.user as any)._?.sea));
                                  alert('Pair copied to clipboard!');
                              }}
                          >
                              Copy Backup Pair
                          </button>
                      </div>
                  ) : (
                      <div className="text-sm opacity-50 italic">
                          Pair not available for this session. Log in again with password to reveal.
                      </div>
                  )}
              </div>

              <div className="divider opacity-10"></div>

              <div className="alert alert-info bg-primary/10 border-primary/20 text-sm">
                <Settings size={18} />
                <span>
                  Your account is decentralized. Updates are stored in Zen and
                  synced across peers.
                </span>
              </div>
            </div>

            <div className="card bg-base-100/50 border border-base-content/5 p-6 space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Camera size={20} className="text-secondary" /> Profile Visuals
              </h3>
              <p className="text-sm opacity-60">
                Your profile picture is stored locally on your device and shared
                via Zen. Larger images may take longer to sync.
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
          </div>
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

        {activeTab === "artist" && user?.artistId && (
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

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || "");
      setBio(initialData.bio || "");
      setWalletAddress(initialData.walletAddress || "");

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
      alert("Synchronization complete!");
    } catch (err: any) {
      alert("Sync failed: " + err.message);
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
            <div className="w-32 h-32 rounded-2xl overflow-hidden bg-neutral border border-base-content/10 shadow-xl relative group">
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
          <h3 className="text-sm font-bold uppercase tracking-widest opacity-40">Digital Presence</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg text-primary">
                <Users size={18} />
              </div>
              <div>
                <div className="text-xl font-black">{followersCount ?? 0}</div>
                <div className="text-[10px] opacity-40 uppercase font-bold">Followers</div>
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
          <div className="bg-gradient-to-r from-indigo-500/10 to-transparent p-6 border-b border-base-content/5">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Play size={20} className="text-indigo-400" /> Federation & Automation
            </h3>
            <p className="text-xs opacity-50 mt-1">Cross-post activities and manage community outreach.</p>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="form-control">
              <label className="label">
                <span className="label-text text-xs uppercase font-bold opacity-40">Mastodon Instance</span>
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
                <span className="label-text text-xs uppercase font-bold opacity-40">Master Token</span>
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
            className="btn btn-primary btn-lg px-12 gap-3 w-full sm:w-auto shadow-xl shadow-primary/20"
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
          <tr className="border-b border-base-content/10 opacity-50 text-xs uppercase tracking-wider">
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

