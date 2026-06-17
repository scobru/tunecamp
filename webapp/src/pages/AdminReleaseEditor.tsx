import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";
import API from "../services/api";
import { useWalletStore } from "../stores/useWalletStore";
import { notify } from "../utils/notify";
import { ethers } from "ethers";
import { DEPLOYMENTS } from "shogun-contracts-sdk";
import { TrackPickerModal } from "../components/modals/TrackPickerModal";
import { UnlockCodeManager } from "../components/modals/UnlockCodeManager";
import { ImportBandcampReleaseModal } from "../components/modals/ImportBandcampReleaseModal";
import { AddYouTubeTrackModal } from "../components/modals/AddYouTubeTrackModal";
import {
  Image as ImageIcon,
  Music,
  X,
  Plus,
  Trash2,
  Globe,
  Lock,
  Library,
  Key,
  Download,
  Link as LinkIcon,
  AlignLeft,
  Disc,
  Youtube,
  Mic,
} from "lucide-react";

interface LocalTrack {
  id: number;
  title: string;
  duration: number;
  position: number;
  price?: number | string;
  priceUsdc?: number | string;
  currency?: "ETH" | "USD" | "USDC";
  file_path: string | null;
  url: string | null;
  service: string | null;
  external_artwork?: string;
  lossless_path?: string;
  artistName?: string;
  format?: string;
  isDirty?: boolean; // Track if metadata changed
  lyrics?: string;
  genre?: string;
  year?: number | string;
  showLyrics?: boolean; // Toggle visibility of lyrics editor
  registrationStatus?: 'unknown' | 'registered' | 'unregistered';
  isRegistering?: boolean;
  description?: string;
  podcast_episode_num?: number | string;
  podcast_season_num?: number | string;
  podcast_episode_type?: string;
  showPodcastFields?: boolean;
}

interface LocalRelease {
  id: number;
  title: string;
  artist_id: number;
  type: "album" | "single" | "liveset" | "podcast";
  year: number;
  cover_path?: string;
  slug: string;
  description?: string;
  credits?: string;
  genre?: string;
  visibility: "public" | "private" | "unlisted";
  is_public: boolean;
  published_to_ap?: boolean;
  use_nft?: boolean;
  price?: number | string;
  priceUsdc?: number | string;
  currency?: "ETH" | "USD" | "USDC";
  download?: string;
  license?: string;
  album_artist?: string;
  product_type?: "music" | "podcast";
  podcast_author?: string;
  podcast_email?: string;
  podcast_category?: string;
  podcast_explicit?: boolean | number;
}

export default function AdminReleaseEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role, isAuthenticated, isLoading } = useAuthStore();
  const isNew = !id;
  const isAdmin = role === 'admin' || role === 'root_admin';
  const isSuperUser = role === 'super_user';


  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [artists, setArtists] = useState<any[]>([]);

  const { signer, isConnected } = useWalletStore();
  const activeSigner = signer;
  const isReady = isConnected;
  const [isSyncingPrices, setIsSyncingPrices] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  // Global payments mode: when Web3 is disabled, releases are direct/Stripe only (no NFT mode).
  const [web3Enabled, setWeb3Enabled] = useState(false);

  // Metadata State
  const [metadata, setMetadata] = useState<Partial<LocalRelease>>({
    title: "",
    type: "album",
    year: new Date().getFullYear(),
    visibility: "private",
    description: "",
    credits: "",
    genre: "",
    price: 0,
    priceUsdc: 0,
    currency: "ETH",
    download: "none",
    license: "copyright",
    use_nft: false,
    album_artist: "",
    product_type: "music",
    podcast_author: "",
    podcast_email: "",
    podcast_category: "",
    podcast_explicit: false,
  });

  // Tracks State
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [uploadingFileIndex, setUploadingFileIndex] = useState<number | null>(
    null,
  );

  // Track Picker
  const [showTrackPicker, setShowTrackPicker] = useState(false);

  // Cover Art
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  // Unlock Codes Modal
  const [showUnlockManager, setShowUnlockManager] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated || (role !== 'admin' && role !== 'user' && role !== 'super_user' && role !== 'root_admin') || (!isAdmin && user && user.isActive === false)) {
        navigate("/");
        return;
      }

      const isRoot = role === 'root_admin' || user?.isRootAdmin;
      const hasArtist = !!user?.artistId;

      if (isNew && !isRoot && !hasArtist) {
        navigate("/admin");
        return;
      }

      loadArtists();
      if (!isNew && id) {
        loadRelease(parseInt(id));
      }
    }
  }, [id, isLoading, isAuthenticated, role, isAdmin, user, isNew]);

  useEffect(() => {
    if (metadata.use_nft && tracks.length > 0 && isReady) {
      checkAllRegistrations();
    }
  }, [metadata.use_nft, isReady, tracks.length]);

  // Read the global payments mode; if Web3 is off, NFT mode is unavailable.
  useEffect(() => {
    fetch("/api/payments/onramp-config")
      .then((res) => res.json())
      .then((data) => setWeb3Enabled(!!data.web3Enabled))
      .catch((err) => console.error("Failed to fetch payment config", err));
  }, []);

  useEffect(() => {
    if (!web3Enabled) {
      setMetadata((prev) => (prev.use_nft === false ? prev : { ...prev, use_nft: false }));
    }
  }, [web3Enabled]);

  const loadArtists = async () => {
    try {
      const data = await API.getArtists();
      setArtists(data);
      // Default to first artist if new
      if (isNew && data.length > 0) {
        // If user is a specific artist, pre-set it
        const currentUserId = user?.artistId?.toString();
        const userArtistExists = currentUserId && data.some(a => a.id.toString() === currentUserId);
        const targetArtistId = userArtistExists ? user!.artistId : (data.length > 0 ? data[0].id : null);
        
        if (targetArtistId) {
            setMetadata((prev) => ({ ...prev, artist_id: parseInt(targetArtistId as string) }));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadRelease = async (releaseId: number) => {
    setLoading(true);
    try {
      const data: any = await API.getAdminRelease(releaseId);
      setMetadata({
        id: parseInt(data.id),
        title: data.title,
        artist_id: parseInt(data.artist_id || data.artistId),
        type: data.type,
        year: data.year,
        slug: data.slug,
        description: data.description,
        visibility: data.visibility || (data.is_public ? "public" : "private"),
        is_public: !!data.is_public,
        published_to_ap:
          data.published_to_ap !== undefined ? !!data.published_to_ap : true,
        price: data.price,
        priceUsdc: data.price_usdc || data.priceUsdc || 0,
        currency: data.currency || "ETH",
        download: data.download || "none",
        genre: data.genre || "",
        license: data.license || "copyright",
        use_nft: data.use_nft !== undefined ? !!data.use_nft : true,
        album_artist: data.album_artist || data.albumArtist || "",
        product_type: data.product_type || data.productType || "music",
        podcast_author: data.podcast_author || data.podcastAuthor || "",
        podcast_email: data.podcast_email || data.podcastEmail || "",
        podcast_category: data.podcast_category || data.podcastCategory || "",
        podcast_explicit: data.podcast_explicit !== undefined ? !!data.podcast_explicit : false,
      });

      if (data.slug || releaseId) {
        setCoverPreview(API.getReleaseCoverUrl(data.slug || releaseId));
      }
      if (data.tracks) {
        setTracks(
          data.tracks.sort(
            (a: any, b: any) => (a.track_num || a.position || 0) - (b.track_num || b.position || 0),
          ),
        );
      }
    } catch (e) {
      console.error("Failed to load release", e);
      navigate("/admin"); // Fallback
    } finally {
      setLoading(false);
    }
  };

  const handleAddLibraryTracks = (selected: any[]) => {
    const newTracks: LocalTrack[] = selected.map((t) => ({
      id: parseInt(t.id),
      title: t.title,
      duration: t.duration,
      position: tracks.length + 1, // Append
      price: 0,
      priceUsdc: 0,
      currency: "ETH" as "ETH" | "USD" | "USDC",
      file_path: t.file_path || t.path || null,
      url: t.url || null,
      service: t.service || "local",
      artistName: t.artist_name || t.artistName,
    }));

    // Filter out duplicates
    const unique = newTracks.filter(
      (nt) => !tracks.find((t) => t.id === nt.id),
    );

    setTracks((prev) => [...prev, ...unique]);
  };

  const handleRemoveTrack = (index: number) => {
    setTracks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this release? This cannot be undone.",
      )
    )
      return;

    setSaving(true);
    try {
      if (id) {
        await API.deleteRelease(id);
        navigate("/admin");
      }
    } catch (e) {
      console.error("Failed to delete release", e);
      notify.error(e, "Failed to delete release");
      setSaving(false);
    }
  };

  const handleSave = async (exit: boolean = false) => {
    setSaving(true);
    try {
      // Prepare track IDs in order.
      // Use track_id if available (for existing release tracks) to reference the library track.
      // Fallback to id for newly added library tracks (which use id) or ghost tracks.
      const track_ids = tracks.map((t: any) => t.track_id || t.id);

      const dataToSave = {
        ...metadata,
        album_artist: metadata.album_artist,
        price_usdc: metadata.priceUsdc,
        genres: metadata.genre
          ? metadata.genre.split(",").map((s: string) => s.trim())
          : [],
        track_ids,
        tracks_data: tracks.map((t: any) => ({ 
          id: t.track_id || t.id, 
          title: t.title, 
          price: t.price, 
          price_usdc: t.priceUsdc,
          currency: t.currency || "ETH" 
        })),
      } as any;

      let releaseId = id ? parseInt(id) : null;
      let currentSlug = metadata.slug;

      // 1. Create or Update Release
      if (isNew) {
        const created: any = await API.createRelease(dataToSave);
        releaseId = parseInt(created.id);
        currentSlug = created.slug;
      } else if (releaseId) {
        await API.updateRelease(String(releaseId), dataToSave);
        // Fetch fresh slug if needed
        if (!currentSlug) {
          const fresh = await API.getAdminRelease(releaseId);
          currentSlug = fresh.slug;
        }
      }

      if (!releaseId) throw new Error("No release ID available");

      // 2. Upload Cover
      if (coverFile && currentSlug) {
        await API.uploadCover(coverFile, currentSlug);
      }

      // 3. Handle File Uploads (Sequentially to report progress/errors)
      if (filesToUpload.length > 0 && currentSlug) {
        try {
          setUploadingFileIndex(0);
          await API.uploadTracks(filesToUpload, {
            releaseSlug: currentSlug,
            artistId: metadata.artist_id,
          });
        } catch (e) {
          console.error("Upload failed", e);
          notify.error(e, "Some files failed to upload. Please try again.");
          // Don't clear filesToUpload so user can retry
          throw e;
        }
      }

      // Save Track Metadata changes (Title, Filename, Lyrics)
      const tracksToUpdate = tracks.filter((t) => t.isDirty);
      for (const t of tracksToUpdate) {
        try {
          const updateData: any = {
            title: t.title,
            price: t.price,
            priceUsdc: t.priceUsdc,
            currency: t.currency || "ETH",
            lyrics: t.lyrics,
            genre: t.genre,
            year: t.year,
            description: t.description,
            podcast_episode_num: t.podcast_episode_num,
            podcast_season_num: t.podcast_season_num,
            podcast_episode_type: t.podcast_episode_type,
          };

          if (t.file_path) {
            updateData.fileName = t.file_path.split("/").pop() || "";
          }

          await API.updateTrack(String(t.id), updateData);
        } catch (e) {
          console.error(`Failed to update track ${t.id}`, e);
        }
      }

      if (exit) {
        navigate("/admin");
      } else {
        // Reload
        setFilesToUpload([]);
        // Reload release to get updated state (including new tracks if any were uploaded)
        setUploadingFileIndex(null);
        setCoverFile(null);
        loadRelease(releaseId);
      }
    } catch (e) {
      console.error("Save failed", e);
      notify.error(e, "Failed to save release or upload tracks.");
    } finally {
      setSaving(false);
      setUploadingFileIndex(null);
    }
  };

  const checkAllRegistrations = async () => {
    if (!activeSigner || !isReady || tracks.length === 0) return;
    
    try {
      const settings = await API.getSiteSettings();
      const checkoutAddress = settings?.web3_checkout_address;
      if (!checkoutAddress) return;

      const network = await activeSigner.provider!.getNetwork();
      const chainId = String(network.chainId);
      
      const checkoutAbi = (DEPLOYMENTS as any)[chainId]?.["TuneCampFactory#TuneCampCheckout"]?.abi || (DEPLOYMENTS as any)["84532"]?.["TuneCampFactory#TuneCampCheckout"]?.abi || (DEPLOYMENTS as any)["8453"]?.["TuneCampFactory#TuneCampCheckout"]?.abi;
      if (!checkoutAbi) return;

      const checkoutContract = new ethers.Contract(checkoutAddress, checkoutAbi, activeSigner as any);
      const actualNftAddress = await checkoutContract.nft();
      const nftAbi = (DEPLOYMENTS as any)[chainId]?.["TuneCampFactory#TuneCampNFT"]?.abi || (DEPLOYMENTS as any)["84532"]?.["TuneCampFactory#TuneCampNFT"]?.abi || (DEPLOYMENTS as any)["8453"]?.["TuneCampFactory#TuneCampNFT"]?.abi;
      const nftContract = new ethers.Contract(actualNftAddress, nftAbi, activeSigner as any);
      
      const newTracks = [...tracks];
      let changed = false;

      for (let i = 0; i < newTracks.length; i++) {
        if (!newTracks[i].id || isNaN(Number(newTracks[i].id))) continue;
        
        try {
          const currentArtist = await nftContract.trackArtist(newTracks[i].id);
          const status = currentArtist === ethers.ZeroAddress ? 'unregistered' : 'registered';
          if (newTracks[i].registrationStatus !== status) {
            newTracks[i].registrationStatus = status;
            changed = true;
          }
        } catch (e) {
          console.warn(`Failed to check registration for track ${newTracks[i].id}`, e);
        }
      }

      if (changed) {
        setTracks(newTracks);
      }
    } catch (e) {
      console.error("Failed to check registrations", e);
    }
  };

  const handleRegisterTrack = async (idx: number) => {
    if (!activeSigner || !isReady) {
      notify.warning("Wallet not connected.");
      return;
    }
    
    const track = tracks[idx];
    const newTracks = [...tracks];
    newTracks[idx].isRegistering = true;
    setTracks(newTracks);

    try {
      const settings = await API.getSiteSettings();
      const checkoutAddress = settings?.web3_checkout_address;
      if (!checkoutAddress) throw new Error("Store instances not fully configured.");

      const network = await activeSigner.provider!.getNetwork();
      const chainId = String(network.chainId);
      const checkoutAbi = (DEPLOYMENTS as any)[chainId]?.["TuneCampFactory#TuneCampCheckout"]?.abi || (DEPLOYMENTS as any)["84532"]?.["TuneCampFactory#TuneCampCheckout"]?.abi || (DEPLOYMENTS as any)["8453"]?.["TuneCampFactory#TuneCampCheckout"]?.abi;
      const checkoutContract = new ethers.Contract(checkoutAddress, checkoutAbi, activeSigner as any);
      const actualNftAddress = await checkoutContract.nft();
      const nftAbi = (DEPLOYMENTS as any)[chainId]?.["TuneCampFactory#TuneCampNFT"]?.abi || (DEPLOYMENTS as any)["84532"]?.["TuneCampFactory#TuneCampNFT"]?.abi || (DEPLOYMENTS as any)["8453"]?.["TuneCampFactory#TuneCampNFT"]?.abi;
      const nftContract = new ethers.Contract(actualNftAddress, nftAbi, activeSigner as any);
      
      const adminAddress = await activeSigner.getAddress();
      
      // Register
      const txReg = await nftContract.registerTrack(track.id, adminAddress, 0, 0, 0);
      await txReg.wait();

      // Update status
      const updatedTracks = [...tracks];
      updatedTracks[idx].registrationStatus = 'registered';
      updatedTracks[idx].isRegistering = false;
      setTracks(updatedTracks);
      
      notify.success(`Track "${track.title}" registered successfully.`);
    } catch (e: any) {
      console.error(e);
      notify.error(e, "Registration failed");
      const updatedTracks = [...tracks];
      updatedTracks[idx].isRegistering = false;
      setTracks(updatedTracks);
    }
  };

  const handleSyncPrices = async () => {
    if (!activeSigner || !isReady) {
      notify.warning("Wallet not connected.");
      return;
    }
    if (isNew) {
      notify.warning("Please save the release first.");
      return;
    }

    setIsSyncingPrices(true);
    setSyncMessage("Preparing to sync...");
    
    try {
      const settings = await API.getSiteSettings();
      const checkoutAddress = settings?.web3_checkout_address;
      if (!checkoutAddress) throw new Error("Store instances not fully configured.");

      const network = await activeSigner.provider!.getNetwork();
      const chainId = String(network.chainId);
      const checkoutAbi = (DEPLOYMENTS as any)[chainId]?.["TuneCampFactory#TuneCampCheckout"]?.abi || (DEPLOYMENTS as any)["84532"]?.["TuneCampFactory#TuneCampCheckout"]?.abi || (DEPLOYMENTS as any)["8453"]?.["TuneCampFactory#TuneCampCheckout"]?.abi;
      const checkoutContract = new ethers.Contract(checkoutAddress, checkoutAbi, activeSigner as any);
      
      const pricingData = tracks.filter(t => 
        (Number(t.price) > 0 || Number(t.priceUsdc) > 0) && t.registrationStatus === 'registered'
      );

      if (pricingData.length === 0) {
        setSyncMessage("No registered and priced tracks to sync.");
        setIsSyncingPrices(false);
        return;
      }

      setSyncMessage("Sending price update transaction...");
      const trackIds = [];
      const roles = [];
      const pricesUSDC = [];
      const pricesETH = [];

      for (const t of pricingData) {
        trackIds.push(t.id);
        roles.push(0); // License
        const priceUsdcToUse = String(t.priceUsdc || 0);
        pricesUSDC.push(ethers.parseUnits(priceUsdcToUse, 6));
        const priceToUse = String(t.price || 0);
        pricesETH.push(ethers.parseEther(priceToUse));
      }

      const tx = await checkoutContract.setPriceBatch(trackIds, roles, pricesUSDC, pricesETH);
      setSyncMessage("Transaction sent! Waiting for confirmation...");
      await tx.wait();
      
      setSyncMessage("");
      notify.success(`Synchronized ${pricingData.length} track price(s) to the blockchain.`);
    } catch (e: any) {
      console.error(e);
      setSyncMessage("");
      notify.error(e, "Sync failed");
    } finally {
      setIsSyncingPrices(false);
    }
  };

  // Drag and Drop handlers for File Upload
  const handleDropAudio = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("audio/"),
    );
    if (files.length > 0) {
      setFilesToUpload((prev) => [...prev, ...files]);
    }
  };

  const handleDropCover = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Header / Toolbar - Sticky and Responsive */}
      <div className="sticky top-0 z-50 navbar bg-base-100/60 backdrop-blur-xl border-b border-base-content/5 px-4 lg:px-6 min-h-[4rem]">
        <div className="flex-1 gap-2 lg:gap-4 overflow-hidden">
          <button
            onClick={() => navigate("/admin")}
            className="btn btn-ghost btn-circle lg:btn-sm lg:btn-ghost tooltip tooltip-bottom"
            data-tip="Back"
          >
            <span className="lg:hidden">&larr;</span>
            <span className="hidden lg:inline">&larr; Back</span>
          </button>
          <h1 className="text-base lg:text-xl font-bold truncate">
            {isNew ? "New Release" : metadata.title}
          </h1>
        </div>
        <div className="flex-none gap-2">
          {!isNew && (isAdmin || (isSuperUser && user?.artistId)) && (
            <button
              className="btn btn-ghost btn-sm text-error hidden sm:flex"
              id="delete-release-btn"
              onClick={handleDelete}
              disabled={saving}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </button>
          )}
          {(isAdmin || isSuperUser) && (
            <>
              <button
                className="btn btn-ghost btn-sm"
                id="save-release-btn"
                onClick={() => handleSave(false)}
                disabled={saving}
              >
                Save
              </button>
              <button
                className="btn btn-primary btn-sm px-6"
                id="publish-release-btn"
                onClick={() => handleSave(true)}
                disabled={saving}
              >
                {saving
                  ? "..."
                  : metadata.visibility === "public"
                    ? "Publish"
                    : "Save & Close"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-base-300/10">
        <div className="container mx-auto px-4 py-8 lg:p-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12">
            {/* LEFT COLUMN: PRIMARY METADATA & COVER */}
            <div className="lg:col-span-4 space-y-8">
              {/* Cover Art */}
              <div className="card bg-base-100 shadow-level-1 overflow-hidden border border-base-content/5">
                <div
                  className={`aspect-square bg-base-200 flex flex-col items-center justify-center relative group ${(isAdmin || isSuperUser) ? 'cursor-pointer' : ''}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(isAdmin || isSuperUser) ? handleDropCover : undefined}
                  onClick={() => (isAdmin || isSuperUser) && document.getElementById("cover-upload-large")?.click()}
                >
                  {coverPreview ? (
                    <img
                      src={coverPreview}
                      className="w-full h-full object-cover"
                      alt="Cover"
                    />
                  ) : (
                    <div className="text-center opacity-30">
                      <ImageIcon className="w-16 h-16 mx-auto mb-2" />
                      <span className="text-sm font-bold tracking-normal">Select Cover</span>
                    </div>
                  )}
                  {(isAdmin || (isSuperUser && user?.artistId)) && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center text-white p-4 text-center">
                      <Download className="w-8 h-8 mb-2" />
                      <span className="font-bold tracking-normal text-sm">Change Cover Image</span>
                      <p className="text-xs opacity-70 mt-2">Square JPEG or PNG, min 1400px</p>
                    </div>
                  )}
                  <input
                    id="cover-upload-large"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setCoverFile(e.target.files[0]);
                        setCoverPreview(URL.createObjectURL(e.target.files[0]));
                      }
                    }}
                  />
                </div>
              </div>

              {/* Album Primary Info */}
              <div className="card bg-base-100 shadow-level-1 border border-base-content/5 p-6 space-y-6">
                <div className="form-control">
                  <label className="label text-[11px] font-bold tracking-normal opacity-50 whitespace-normal">Album Title</label>
                  <input
                    type="text"
                    className="input input-bordered w-full font-bold focus:border-primary"
                    value={metadata.title}
                    onChange={(e) => setMetadata((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Release Title"
                    disabled={!isAdmin && !isSuperUser}
                  />
                </div>

                <div className="form-control">
                  <label className="label text-[11px] font-bold tracking-normal opacity-50 whitespace-normal">Artist</label>
                  {user?.isRootAdmin ? (
                    <select
                      className="select select-bordered w-full"
                      value={metadata.artist_id}
                      onChange={(e) => setMetadata((prev) => ({ ...prev, artist_id: parseInt(e.target.value) }))}
                    >
                      {artists.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="bg-base-200/50 p-3 rounded-lg text-sm font-medium border border-base-content/5">
                       {artists.find(a => a.id.toString() === metadata.artist_id?.toString())?.name || "Loading..."}
                    </div>
                  )}
                </div>

                <div className="form-control">
                  <label className="label text-[11px] font-bold tracking-normal opacity-50 whitespace-normal">Album Artist</label>
                  <input
                    type="text"
                    className="input input-bordered w-full text-sm"
                    placeholder="Various Artists, etc."
                    value={metadata.album_artist || ""}
                    onChange={(e) => setMetadata((prev) => ({ ...prev, album_artist: e.target.value }))}
                  />
                  <label className="label">
                    <span className="label-text-alt opacity-40">Leave empty to use primary artist name</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="form-control">
                    <label className="label text-[11px] font-bold tracking-normal opacity-50 whitespace-normal">Release Type</label>
                    <select
                      className="select select-bordered w-full text-sm font-bold"
                      value={metadata.type}
                      onChange={(e) => {
                        const newType = e.target.value as LocalRelease["type"];
                        setMetadata((prev) => ({
                          ...prev,
                          type: newType,
                          // product_type is derived from the category and kept in sync
                          // so the podcast RSS feed and Subsonic channel keep working.
                          product_type: newType === "podcast" ? "podcast" : "music",
                        }));
                      }}
                    >
                      <option value="album">Album</option>
                      <option value="single">Single</option>
                      <option value="liveset">Liveset</option>
                      <option value="podcast">Podcast</option>
                    </select>
                  </div>
                  <div className="form-control">
                    <label className="label text-[11px] font-bold tracking-normal opacity-50 whitespace-normal">Year</label>
                    <input
                      type="number"
                      className="input input-bordered w-full"
                      value={metadata.year}
                      onChange={(e) => setMetadata((prev) => ({ ...prev, year: parseInt(e.target.value) }))}
                    />
                  </div>
                </div>

                {metadata.type === "podcast" && (
                  <div className="card bg-secondary/5 border border-secondary/10 p-4 rounded-xl space-y-4">
                    <h3 className="text-sm font-black tracking-normal text-secondary flex items-center gap-2">
                      <Mic className="w-4 h-4" /> Podcast Channel Settings
                    </h3>
                    
                    <div className="form-control">
                      <label className="label text-xs font-bold tracking-normal opacity-50">Podcast Author</label>
                      <input
                        type="text"
                        className="input input-bordered input-sm w-full text-sm"
                        placeholder="Author Name"
                        value={metadata.podcast_author || ""}
                        onChange={(e) => setMetadata((prev) => ({ ...prev, podcast_author: e.target.value }))}
                      />
                    </div>

                    <div className="form-control">
                      <label className="label text-xs font-bold tracking-normal opacity-50">Podcast Email</label>
                      <input
                        type="email"
                        className="input input-bordered input-sm w-full text-sm"
                        placeholder="author@example.com"
                        value={metadata.podcast_email || ""}
                        onChange={(e) => setMetadata((prev) => ({ ...prev, podcast_email: e.target.value }))}
                      />
                    </div>

                    <div className="form-control">
                      <label className="label text-xs font-bold tracking-normal opacity-50">Podcast Category</label>
                      <select
                        className="select select-bordered select-sm w-full text-sm"
                        value={metadata.podcast_category || ""}
                        onChange={(e) => setMetadata((prev) => ({ ...prev, podcast_category: e.target.value }))}
                      >
                        <option value="">Select Category</option>
                        <option value="Arts">Arts</option>
                        <option value="Business">Business</option>
                        <option value="Comedy">Comedy</option>
                        <option value="Education">Education</option>
                        <option value="Fiction">Fiction</option>
                        <option value="Government">Government</option>
                        <option value="History">History</option>
                        <option value="Health & Fitness">Health & Fitness</option>
                        <option value="Kids & Family">Kids & Family</option>
                        <option value="Leisure">Leisure</option>
                        <option value="Music">Music</option>
                        <option value="News">News</option>
                        <option value="Religion & Spirituality">Religion & Spirituality</option>
                        <option value="Science">Science</option>
                        <option value="Society & Culture">Society & Culture</option>
                        <option value="Sports">Sports</option>
                        <option value="Technology">Technology</option>
                        <option value="True Crime">True Crime</option>
                        <option value="TV & Film">TV & Film</option>
                      </select>
                    </div>

                    <div className="form-control flex flex-row items-center justify-between p-2 rounded-lg bg-base-200/50">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold tracking-normal opacity-80">Explicit Content</span>
                        <span className="text-[11px] opacity-40">Mark if this podcast contains adult content</span>
                      </div>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-secondary checkbox-sm"
                        checked={!!metadata.podcast_explicit}
                        onChange={(e) => setMetadata((prev) => ({ ...prev, podcast_explicit: e.target.checked }))}
                      />
                    </div>
                  </div>
                )}

                <div className="form-control">
                  <label className="label text-[11px] font-bold tracking-normal opacity-50 whitespace-normal">Genre / Tags</label>
                  <input
                    type="text"
                    className="input input-bordered w-full text-sm"
                    placeholder="techno, ambient..."
                    value={metadata.genre || ""}
                    onChange={(e) => setMetadata((prev) => ({ ...prev, genre: e.target.value }))}
                  />
                </div>
              </div>

              {/* Visibility & Federation */}
              <div className="card bg-base-100 shadow-level-1 border border-base-content/5 p-6 space-y-4">
                <h3 className="text-[11px] font-bold tracking-normal opacity-50 whitespace-normal">Visibility & Distribution</h3>
                <div className="grid grid-cols-1 gap-2">
                   {["public", "unlisted", "private"].map((v) => (
                     <label key={v} className={`flex items-center gap-3 p-3 rounded-xl border border-base-content/5 cursor-pointer transition-all ${metadata.visibility === v ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/30' : 'hover:bg-base-200'}`}>
                        <input
                          type="radio"
                          name="visibility"
                          className="radio radio-primary radio-sm"
                          checked={metadata.visibility === v}
                          onChange={() => setMetadata((prev) => ({ ...prev, visibility: v as any }))}
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-bold capitalize flex items-center gap-2">
                            {v === 'public' && <Globe className="w-3 h-3 text-primary" />}
                            {v === 'unlisted' && <LinkIcon className="w-3 h-3" />}
                            {v === 'private' && <Lock className="w-3 h-3" />}
                            {v}
                          </span>
                        </div>
                     </label>
                   ))}
                </div>

                {(metadata.visibility === "public" || metadata.visibility === "unlisted") && (
                  <div className="space-y-2 mt-4 pt-4 border-t border-base-content/5">
                    <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-base-200 rounded-lg transition-colors">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-xs checkbox-secondary"
                        checked={metadata.published_to_ap !== false}
                        onChange={(e) => setMetadata((prev) => ({ ...prev, published_to_ap: e.target.checked }))}
                      />
                      <span className="text-xs font-bold tracking-normal opacity-70">Push to ActivityPub</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* CENTER/RIGHT COLUMN: TRACKS & WEB3 */}
            <div className="lg:col-span-8 space-y-8">
              
              {/* Actions Toolbar */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-base-100 p-4 rounded-2xl shadow-level-1 border border-base-content/5">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-black italic tracking-tighter flex items-center gap-3">
                    <Music className="w-6 h-6 text-primary" /> Tracks
                  </h2>
                  <div className="badge badge-primary badge-outline font-mono">{tracks.length} Brani</div>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <button
                      className="btn btn-sm btn-outline gap-2"
                      onClick={() => setShowTrackPicker(true)}
                    >
                      <Library className="w-4 h-4" /> Add Library
                    </button>
                    <label className="btn btn-sm btn-primary gap-2">
                      <Plus className="w-4 h-4" /> Upload Audio
                      <input
                        type="file" multiple accept="audio/*" className="hidden"
                        onChange={(e) => {
                          if (e.target.files)
                            setFilesToUpload((prev) => [...prev, ...Array.from(e.target.files!)]);
                        }}
                      />
                    </label>
                    <button
                      className="btn btn-sm bg-[#629aa9] hover:bg-[#4d7b87] text-white gap-2 border-none"
                      onClick={() => document.dispatchEvent(new Event('open-import-bandcamp-modal'))}
                    >
                      <Globe className="w-4 h-4" /> Import from Bandcamp
                    </button>
                    <button 
                      type="button"
                      className="btn btn-sm btn-ghost gap-2"
                      onClick={() => window.dispatchEvent(new CustomEvent('open-add-youtube-modal'))}
                    >
                      <Youtube className="w-4 h-4 text-red-500" /> Add YouTube
                    </button>
                </div>
              </div>

              {/* Tracks Table */}
              <div className="card bg-base-100 shadow-level-1 border border-base-content/5 overflow-hidden font-sans">
                <div className="overflow-x-auto">
                  <table className="table table-md w-full">
                    <thead>
                      <tr className="bg-base-200/50">
                        <th className="w-10">#</th>
                        <th>Title</th>
                        <th className="hidden md:table-cell">Duration</th>
                        <th className="hidden lg:table-cell">Format</th>
                        {metadata.use_nft && <th className="w-20">NFT</th>}
                        <th className="w-48 text-center">Pricing</th>
                        <th className="w-20 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody onDragOver={(e) => e.preventDefault()} onDrop={handleDropAudio}>
                      {tracks.length === 0 && filesToUpload.length === 0 && (
                        <tr>
                          <td colSpan={metadata.use_nft ? 7 : 6} className="py-20 text-center opacity-40">
                             <Music className="w-12 h-12 mx-auto mb-4 opacity-10" />
                             <p className="text-lg font-bold">No tracks added yet</p>
                             <p className="text-sm">Drag audio files here or use the buttons above</p>
                          </td>
                        </tr>
                      )}
                      {tracks.map((track, idx) => (
                        <React.Fragment key={track.id}>
                          <tr className="hover:bg-primary/5 transition-colors group">
                            <td className="font-mono opacity-50 text-xs">{idx + 1}</td>
                            <td>
                              <div className="flex flex-col">
                                <input
                                  type="text"
                                  value={track.title}
                                  onChange={(e) => {
                                    const newTracks = [...tracks];
                                    newTracks[idx].title = e.target.value;
                                    newTracks[idx].isDirty = true;
                                    setTracks(newTracks);
                                  }}
                                  className="input input-ghost input-sm w-full font-bold focus:bg-base-300 p-1 -ml-1 h-auto"
                                />
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[11px] font-mono opacity-40 shrink-0">File:</span>
                                  <input
                                    type="text"
                                    value={track.file_path?.split("/").pop() || ""}
                                    onChange={(e) => {
                                      const newTracks = [...tracks];
                                      const dir = (track.file_path || "").includes("/") ? track.file_path!.substring(0, track.file_path!.lastIndexOf("/") + 1) : "";
                                      newTracks[idx].file_path = dir + e.target.value;
                                      newTracks[idx].isDirty = true;
                                      setTracks(newTracks);
                                    }}
                                    className="input input-ghost input-xs w-full font-mono text-[11px] opacity-40 focus:opacity-100 p-0 h-auto"
                                  />
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[11px] font-mono opacity-40 shrink-0">Genre:</span>
                                  <input
                                    type="text"
                                    value={track.genre || ""}
                                    onChange={(e) => {
                                      const newTracks = [...tracks];
                                      newTracks[idx].genre = e.target.value;
                                      newTracks[idx].isDirty = true;
                                      setTracks(newTracks);
                                    }}
                                    className="input input-ghost input-xs w-24 font-mono text-[11px] opacity-40 focus:opacity-100 p-0 h-auto"
                                    placeholder="Techno..."
                                  />
                                  <span className="text-[11px] font-mono opacity-40 shrink-0">Year:</span>
                                  <input
                                    type="number"
                                    value={track.year || ""}
                                    onChange={(e) => {
                                      const newTracks = [...tracks];
                                      newTracks[idx].year = e.target.value;
                                      newTracks[idx].isDirty = true;
                                      setTracks(newTracks);
                                    }}
                                    className="input input-ghost input-xs w-16 font-mono text-[11px] opacity-40 focus:opacity-100 p-0 h-auto"
                                    placeholder="2024"
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="hidden md:table-cell font-mono text-xs opacity-50">
                              {track.duration ? `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, "0")}` : "--:--"}
                            </td>
                            <td className="hidden lg:table-cell">
                                <span className="badge badge-outline badge-xs opacity-40 font-mono scale-90">
                                  {track.lossless_path ? (track.lossless_path.toLowerCase().endsWith(".wav") ? "WAV" : "FLAC") : (track.format || "MP3")}
                                </span>
                            </td>
                            {metadata.use_nft && (
                              <td>
                                {track.registrationStatus === 'registered' ? (
                                  <div className="badge badge-success badge-sm gap-1 font-bold text-[11px]">Sì</div>
                                ) : track.registrationStatus === 'unregistered' ? (
                                  <button 
                                    className="btn btn-xs btn-outline btn-secondary font-bold text-[11px]"
                                    onClick={() => handleRegisterTrack(idx)}
                                    disabled={track.isRegistering}
                                  >
                                    {track.isRegistering ? <span className="loading loading-spinner loading-xs"></span> : "Register"}
                                  </button>
                                ) : (
                                  <span className="loading loading-dots loading-xs opacity-20"></span>
                                )}
                              </td>
                            )}
                            <td>
                              <div className="flex items-center gap-1 justify-center">
                                <select
                                  className="select select-ghost select-xs px-1 opacity-50 focus:opacity-100 font-bold"
                                  value={track.currency || (track.priceUsdc ? "USDC" : "ETH")}
                                  onChange={(e) => {
                                    const newTracks = [...tracks];
                                    newTracks[idx].currency = e.target.value as any;
                                    newTracks[idx].isDirty = true;
                                    setTracks(newTracks);
                                  }}
                                >
                                  <option value="ETH">ETH</option>
                                  <option value="USD">USD</option>
                                  <option value="USDC">USDC</option>
                                </select>
                                <label className={`input input-xs input-bordered flex items-center gap-1 w-24 ${metadata.use_nft && track.registrationStatus !== 'registered' ? 'opacity-30' : ''}`}>
                                  <input
                                    type="number" step="any" min="0"
                                    className="w-full bg-transparent text-right py-0 h-6"
                                    placeholder="0.00"
                                    disabled={metadata.use_nft && track.registrationStatus !== 'registered'}
                                    value={track.currency === "USDC" ? (track.priceUsdc ?? "") : (track.price ?? "")}
                                    onChange={(e) => {
                                      const newTracks = [...tracks];
                                      const val = e.target.value === "" ? "" : e.target.value;
                                      if (track.currency === "USDC") newTracks[idx].priceUsdc = val;
                                      else newTracks[idx].price = val;
                                      newTracks[idx].isDirty = true;
                                      setTracks(newTracks);
                                    }}
                                  />
                                </label>
                              </div>
                            </td>                             <td className="text-right">
                              <div className="flex gap-1 justify-end">
                                {metadata.type === "podcast" && (
                                  <button
                                    className={`btn btn-square btn-xs ${(track.description || track.podcast_episode_num || track.podcast_season_num) ? "btn-secondary" : "btn-ghost"}`}
                                    onClick={() => {
                                      const newTracks = [...tracks];
                                      newTracks[idx].showPodcastFields = !newTracks[idx].showPodcastFields;
                                      setTracks(newTracks);
                                    }}
                                    title="Podcast Episode Settings"
                                  >
                                    <Mic className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  className={`btn btn-square btn-xs ${track.lyrics ? "btn-primary" : "btn-ghost"}`}
                                  onClick={() => {
                                    const newTracks = [...tracks];
                                    newTracks[idx].showLyrics = !newTracks[idx].showLyrics;
                                    setTracks(newTracks);
                                  }}
                                  title="Lyrics"
                                >
                                  <AlignLeft className="w-3 h-3" />
                                </button>
                                <button
                                  className="btn btn-square btn-xs btn-ghost text-error opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleRemoveTrack(idx)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {metadata.type === "podcast" && track.showPodcastFields && (
                            <tr className="bg-base-200/20">
                              <td colSpan={metadata.use_nft ? 7 : 6} className="p-4">
                                <div className="card bg-base-300/40 p-4 rounded-xl border border-secondary/10 space-y-3">
                                  <label className="text-xs font-black tracking-normal text-secondary">Episode Settings: {track.title}</label>
                                  <div className="grid grid-cols-3 gap-4">
                                    <div className="form-control">
                                      <label className="label text-xs font-bold tracking-normal opacity-50">Episode Number</label>
                                      <input
                                        type="number"
                                        className="input input-bordered input-sm w-full"
                                        placeholder="1"
                                        value={track.podcast_episode_num || ""}
                                        onChange={(e) => {
                                          const newTracks = [...tracks];
                                          newTracks[idx].podcast_episode_num = e.target.value === "" ? "" : parseInt(e.target.value);
                                          newTracks[idx].isDirty = true;
                                          setTracks(newTracks);
                                        }}
                                      />
                                    </div>
                                    <div className="form-control">
                                      <label className="label text-xs font-bold tracking-normal opacity-50">Season Number</label>
                                      <input
                                        type="number"
                                        className="input input-bordered input-sm w-full"
                                        placeholder="1"
                                        value={track.podcast_season_num || ""}
                                        onChange={(e) => {
                                          const newTracks = [...tracks];
                                          newTracks[idx].podcast_season_num = e.target.value === "" ? "" : parseInt(e.target.value);
                                          newTracks[idx].isDirty = true;
                                          setTracks(newTracks);
                                        }}
                                      />
                                    </div>
                                    <div className="form-control">
                                      <label className="label text-xs font-bold tracking-normal opacity-50">Episode Type</label>
                                      <select
                                        className="select select-bordered select-sm w-full font-bold"
                                        value={track.podcast_episode_type || "full"}
                                        onChange={(e) => {
                                          const newTracks = [...tracks];
                                          newTracks[idx].podcast_episode_type = e.target.value;
                                          newTracks[idx].isDirty = true;
                                          setTracks(newTracks);
                                        }}
                                      >
                                        <option value="full">Full Episode</option>
                                        <option value="trailer">Trailer</option>
                                        <option value="bonus">Bonus</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div className="form-control">
                                    <label className="label text-xs font-bold tracking-normal opacity-50">Episode Description / Summary</label>
                                    <textarea
                                      className="textarea textarea-bordered textarea-sm w-full h-20 text-sm"
                                      placeholder="Episode summary, show notes, and links..."
                                      value={track.description || ""}
                                      onChange={(e) => {
                                        const newTracks = [...tracks];
                                        newTracks[idx].description = e.target.value;
                                        newTracks[idx].isDirty = true;
                                        setTracks(newTracks);
                                      }}
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          {track.showLyrics && (
                            <tr className="bg-base-200/20">
                              <td colSpan={metadata.use_nft ? 7 : 6} className="p-4">
                                <div className="card bg-base-300/40 p-4 rounded-xl border border-primary/10 space-y-3">
                                  <div className="flex justify-between items-center">
                                    <label className="text-xs font-black tracking-normal text-primary">Lyrics: {track.title}</label>
                                    <button 
                                      className="btn btn-xs btn-ghost text-[11px]"
                                      onClick={async () => {
                                          try {
                                            const response = await fetch(`/api/tracks/${track.id}/lyrics`);
                                            const data = await response.json();
                                            if (data.lyrics) {
                                              const newTracks = [...tracks];
                                              newTracks[idx].lyrics = data.lyrics; newTracks[idx].isDirty = true; setTracks(newTracks);
                                            } else notify.warning("No lyrics found in metadata.");
                                          } catch (e) { notify.error(e, "Fetch failed"); }
                                      }}
                                    >Fill from Metadata</button>
                                  </div>
                                  <textarea
                                    className="textarea textarea-bordered w-full h-32 text-sm font-mono"
                                    placeholder="Lyrics content..."
                                    value={track.lyrics || ""}
                                    onChange={(e) => {
                                      const newTracks = [...tracks];
                                      newTracks[idx].lyrics = e.target.value; newTracks[idx].isDirty = true; setTracks(newTracks);
                                    }}
                                  />
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}

              {/* Pending Uploads */}
              {filesToUpload.map((file, idx) => (
                <div
                  key={`upload-${idx}`}
                  className="card card-compact bg-base-100/50 border border-dashed border-primary/30"
                >
                  <div className="card-body flex-row items-center gap-4 py-3">
                    {uploadingFileIndex !== null && (
                      <div className="loading loading-spinner loading-xs text-primary"></div>
                    )}
                    <div className="flex-1 truncate">{file.name}</div>
                    <div className="badge badge-ghost">Pending Upload</div>
                    <button
                      className="btn btn-ghost btn-xs btn-circle"
                      onClick={() =>
                        setFilesToUpload((prev) =>
                          prev.filter((_, i) => i !== idx),
                        )
                      }
                      disabled={uploadingFileIndex !== null}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
                    </tbody>
                  </table>
                </div>

                {/* Pending Uploads */}
                {filesToUpload.length > 0 && (
                  <div className="bg-primary/5 p-4 border-t border-primary/20 space-y-2">
                    <h4 className="text-xs font-bold tracking-normal text-primary flex items-center gap-2">
                      <Plus className="w-3 h-3" /> Pending Uploads
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {filesToUpload.map((file, idx) => (
                        <div key={`upload-${idx}`} className="flex items-center gap-3 bg-base-100 p-2 rounded-lg text-xs border border-base-content/5">
                          {uploadingFileIndex !== null ? <span className="loading loading-spinner loading-xs text-primary"></span> : <Music className="w-3 h-3 opacity-30" />}
                          <span className="flex-1 truncate opacity-70">{file.name}</span>
                          <button className="btn btn-ghost btn-xs btn-circle text-error" onClick={() => setFilesToUpload(prev => prev.filter((_, i) => i !== idx))} disabled={uploadingFileIndex !== null}>
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

               {/* Description & Credits - Full Width */}
               <div className="card bg-base-100 shadow-level-1 border border-base-content/5 p-6 mt-8">
                 <h3 className="text-[11px] font-bold tracking-normal opacity-50 whitespace-normal mb-4 flex items-center gap-2">
                     <Disc className="w-4 h-4" /> Description & Credits
                 </h3>
                 <div className="form-control">
                   <textarea
                     className="textarea textarea-bordered min-h-[16rem] w-full text-sm leading-relaxed"
                     placeholder="Album bio, credits, and story..."
                     value={metadata.description || ""}
                     onChange={(e) => setMetadata((prev) => ({ ...prev, description: e.target.value }))}
                   />
                 </div>
               </div>

              {/* Web3 & Advanced Actions Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                {/* Payment & Web3 */}
                <div className="space-y-6">
                  <div className="card bg-base-100 shadow-level-1 border border-base-content/5 p-6 space-y-4">
                    <h3 className="text-[11px] font-bold tracking-normal opacity-50 whitespace-normal flex items-center gap-2">
                       <Download className="w-3 h-3" /> Payment & Web3 Settings
                    </h3>
                    <div className="form-control">
                      <label className="label-text-alt font-black tracking-normal opacity-40 mb-2">Payment Mode</label>
                      {web3Enabled ? (
                        <div className="flex items-center justify-between bg-base-200 p-3 rounded-xl border border-base-content/5">
                          <span className={`text-xs font-bold ${metadata.use_nft === false ? 'text-primary' : 'opacity-40'}`}>Direct Payment</span>
                          <input
                            type="checkbox" className="toggle toggle-primary toggle-sm mx-2"
                            checked={metadata.use_nft !== false}
                            onChange={(e) => setMetadata(prev => ({ ...prev, use_nft: e.target.checked }))}
                          />
                          <span className={`text-xs font-bold ${metadata.use_nft !== false ? 'text-primary' : 'opacity-40'}`}>Smart Contract (NFT)</span>
                        </div>
                      ) : (
                        <div className="bg-base-200 p-3 rounded-xl border border-base-content/5 text-[11px] opacity-60 leading-relaxed">
                          <span className="font-bold text-primary">Direct Payment (Stripe)</span> — Web3 is disabled for this node.
                          A root admin can enable the NFT store under <span className="font-semibold">Admin → Settings → Payments &amp; Web3</span>.
                        </div>
                      )}
                    </div>
                    
                    {!isNew && metadata.use_nft && (
                      <div className="bg-secondary/5 border border-secondary/20 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-center text-xs font-bold tracking-normal">
                          <span className="opacity-50">NFT Registrations:</span>
                          <span className="text-secondary">{tracks.filter(t => t.registrationStatus === 'registered').length}/{tracks.length}</span>
                        </div>
                        <button
                          type="button" className="btn btn-secondary btn-sm w-full font-bold"
                          disabled={isSyncingPrices || !isReady || tracks.every(t => t.registrationStatus !== 'registered')}
                          onClick={handleSyncPrices}
                        >
                          {isSyncingPrices ? syncMessage || "Syncing..." : "Sync Prices to Blockchain"}
                        </button>
                      </div>
                    )}
                  </div>


                </div>

                {/* Downloads & Advanced */}
                <div className="space-y-6">
                  <div className="card bg-base-100 shadow-level-1 border border-base-content/5 p-6 space-y-4">
                    <h3 className="text-[11px] font-bold tracking-normal opacity-50 whitespace-normal">Download Experience</h3>
                    <div className="grid grid-cols-1 gap-2">
                       {["none", "free", "codes"].map((d) => (
                         <label key={d} className={`flex items-center gap-3 p-3 rounded-xl border border-base-content/5 cursor-pointer transition-all ${metadata.download === d || (!metadata.download && d === "none") ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/30' : 'hover:bg-base-200'}`}>
                            <input
                              type="radio" name="download_method" className="radio radio-primary radio-sm"
                              checked={metadata.download === d || (!metadata.download && d === "none")}
                              onChange={() => setMetadata((prev) => ({ ...prev, download: d as any, price: 0 }))}
                            />
                            <div className="flex flex-col">
                              <span className="text-sm font-bold capitalize">
                                {d === 'none' ? 'Streaming Only' : d === 'free' ? 'Free Download' : 'Unlock Codes'}
                              </span>
                              <span className="text-xs opacity-50">
                                {d === 'none' ? 'Basic streaming' : d === 'free' ? 'Public download' : 'Require unique code'}
                              </span>
                            </div>
                         </label>
                       ))}
                    </div>
                    {metadata.download === "codes" && !isNew && (
                      <button className="btn btn-sm btn-ghost border-primary/20 w-full gap-2 bg-primary/5" onClick={() => setShowUnlockManager(true)}>
                        <Key size={14} /> Manage Codes
                      </button>
                    )}
                  </div>

                  <div className="card bg-base-100 shadow-level-1 border border-base-content/5 p-6">
                    <h3 className="text-[11px] font-bold tracking-normal opacity-50 whitespace-normal mb-4">Legals & Rights</h3>
                    <select
                      className="select select-bordered w-full text-sm"
                      value={metadata.license || "copyright"}
                      onChange={(e) => setMetadata((prev) => ({ ...prev, license: e.target.value }))}
                    >
                      <option value="copyright">All Rights Reserved</option>
                      <option value="cc-by">Creative Commons BY</option>
                      <option value="cc-by-sa">Creative Commons BY-SA</option>
                      <option value="cc-by-nc">Creative Commons BY-NC</option>
                      <option value="cc-by-nc-sa">Creative Commons BY-NC-SA</option>
                      <option value="public-domain">Public Domain / CC0</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <TrackPickerModal
          isOpen={showTrackPicker}
          onClose={() => setShowTrackPicker(false)}
          onTracksSelected={handleAddLibraryTracks}
          excludeTrackIds={tracks.map((t) => t.id)}
        />

        <UnlockCodeManager
          releaseId={metadata.id || ""}
          isOpen={showUnlockManager}
          onClose={() => setShowUnlockManager(false)}
        />

        <ImportBandcampReleaseModal
          onImport={async (m) => {
            // Import release-level metadata only — no tracks are created.
            const parsedYear = m.date ? new Date(m.date).getFullYear() : NaN;
            setMetadata((prev) => ({
              ...prev,
              title: m.title || prev.title,
              album_artist: m.artist || prev.album_artist,
              genre: m.genre || prev.genre,
              year: Number.isFinite(parsedYear) ? parsedYear : prev.year,
            }));

            // Cover is best-effort: pull it through the same-origin proxy and stage it
            // as a real file so the normal save flow uploads it to the server.
            if (m.cover) {
              try {
                const blob = await API.proxyImageBlob(m.cover);
                const file = new File([blob], "bandcamp-cover.jpg", { type: blob.type || "image/jpeg" });
                setCoverFile(file);
                setCoverPreview(URL.createObjectURL(file));
              } catch (e) {
                notify.error(e, "Imported metadata, but the cover art could not be downloaded — set it manually.");
              }
            }
          }}
        />

        <AddYouTubeTrackModal
          albumId={metadata.id}
          onComplete={() => {
            // Re-fetch tracks for the release to sync UI
            if (metadata.id) {
                API.getAdminRelease(metadata.id).then(release => {
                    if (release.tracks) {
                        const mapped: LocalTrack[] = release.tracks.map((t: any) => ({
                            id: Number(t.id),
                            title: t.title,
                            duration: t.duration,
                            position: t.track_num || t.position || 0,
                            price: t.price || 0,
                            priceUsdc: t.price_usdc || t.priceUsdc || 0,
                            currency: t.currency || "ETH",
                            file_path: t.file_path || t.path || null,
                            url: t.url || t.streamUrl || null,
                            service: t.service || "local",
                            artistName: t.artist_name || t.artistName,
                            external_artwork: t.external_artwork || t.coverUrl
                        }));
                        setTracks(mapped.sort((a, b) => a.position - b.position));
                    }
                });
            }
          }}
        />


      </div>
    </div>
  );
}

