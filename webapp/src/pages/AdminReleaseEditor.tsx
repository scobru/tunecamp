import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";
import API from "../services/api";
import { useWalletStore } from "../stores/useWalletStore";
import { ethers } from "ethers";
import { DEPLOYMENTS } from "shogun-contracts-sdk";
import { TrackPickerModal } from "../components/modals/TrackPickerModal";
import { UnlockCodeManager } from "../components/modals/UnlockCodeManager";
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
}

interface LocalRelease {
  id: number;
  title: string;
  artist_id: number;
  type: "album" | "single" | "ep";
  year: number;
  cover_path?: string;
  slug: string;
  description?: string;
  credits?: string;
  genre?: string;
  visibility: "public" | "private" | "unlisted";
  is_public: boolean;
  published_to_gundb?: boolean;
  published_to_ap?: boolean;
  use_nft?: boolean;
  price?: number | string;
  priceUsdc?: number | string;
  currency?: "ETH" | "USD" | "USDC";
  download?: string;
  license?: string;
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

  const { wallet, externalWallet, useExternalWallet, isExternalConnected, isWalletReady } = useWalletStore();
  const activeSigner = useExternalWallet ? externalWallet : wallet;
  const isReady = useExternalWallet ? isExternalConnected : isWalletReady;
  const [isSyncingPrices, setIsSyncingPrices] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

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
    use_nft: true,
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

  // Bandcamp Import
  const [bandcampUrl, setBandcampUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated || (role !== 'admin' && role !== 'user' && role !== 'super_user' && role !== 'root_admin') || (!isAdmin && !user?.isActive)) {
        navigate("/");
        return;
      }
      loadArtists();
      if (!isNew && id) {
        loadRelease(parseInt(id));
      }
    }
  }, [id, isLoading, isAuthenticated, role, isAdmin, user]);

  useEffect(() => {
    if (metadata.use_nft && tracks.length > 0 && isReady) {
      checkAllRegistrations();
    }
  }, [metadata.use_nft, isReady, tracks.length]);

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
        published_to_gundb:
          data.published_to_gundb !== undefined
            ? !!data.published_to_gundb
            : true,
        published_to_ap:
          data.published_to_ap !== undefined ? !!data.published_to_ap : true,
        price: data.price,
        priceUsdc: data.price_usdc || data.priceUsdc || 0,
        currency: data.currency || "ETH",
        download: data.download || "none",
        genre: data.genre || "",
        license: data.license || "copyright",
        use_nft: data.use_nft !== undefined ? !!data.use_nft : true,
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
      alert("Failed to delete release");
      setSaving(false);
    }
  };

  const handleSave = async (exit: boolean = false) => {
    setSaving(true);
    try {
      // Prepare track IDs in order
      const track_ids = tracks.map((t) => t.id);

      const dataToSave = {
        ...metadata,
        artistId: metadata.artist_id, // Map frontend snake_case to API camelCase
        // Map frontend state to API expected keys
        publishedToGunDB: metadata.published_to_gundb,
        publishedToAP: metadata.published_to_ap,
        genres: metadata.genre
          ? metadata.genre.split(",").map((s: string) => s.trim())
          : [],
        track_ids, // Send full list of IDs to sync associations
        tracks_data: tracks.map((t) => ({ 
          id: t.id, 
          title: t.title, 
          price: t.price, 
          priceUsdc: t.priceUsdc,
          currency: t.currency || "ETH" 
        }))
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
          alert("Some files failed to upload. Please try again.");
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
      alert("Failed to save release or upload tracks.");
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
      alert("Wallet not connected.");
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
      
      alert(`Track "${track.title}" registered successfully.`);
    } catch (e: any) {
      console.error(e);
      alert(`Registration failed: ${e.message}`);
      const updatedTracks = [...tracks];
      updatedTracks[idx].isRegistering = false;
      setTracks(updatedTracks);
    }
  };

  const handleBandcampImport = async () => {
    if (!bandcampUrl) return;
    setIsImporting(true);
    try {
      const data = await API.importFromBandcamp(bandcampUrl);
      if (data) {
        setMetadata(prev => ({
          ...prev,
          title: data.title || prev.title,
          year: data.year || prev.year,
        }));

        if (data.cover) {
          setCoverPreview(data.cover);
          // Fetch the image and set as coverFile so it can be uploaded
          try {
            const response = await fetch(data.cover);
            const blob = await response.blob();
            const file = new File([blob], "cover.jpg", { type: "image/jpeg" });
            setCoverFile(file);
          } catch(e) {
            console.error("Failed to fetch cover image file", e);
          }
        }

        if (data.tracks && data.tracks.length > 0) {
          const importedTracks: LocalTrack[] = data.tracks.map((t: any, idx: number) => ({
             id: -(idx + 1), // temp negative id
             title: t.title,
             duration: t.duration,
             position: t.position || (idx + 1),
             price: 0,
             priceUsdc: 0,
             currency: 'ETH',
             file_path: null,
             url: null,
             service: 'local',
             lyrics: t.lyrics || "",
             isDirty: true
          }));
          setTracks(importedTracks);
        }
        alert("Metadata imported successfully!");
      }
    } catch (e: any) {
      alert("Failed to import: " + e.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleSyncPrices = async () => {
    if (!activeSigner || !isReady) {
      alert("Wallet not connected.");
      return;
    }
    if (isNew) {
      alert("Please save the release first.");
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
      alert(`Synchronized ${pricingData.length} track price(s) to the blockchain.`);
    } catch (e: any) {
      console.error(e);
      setSyncMessage("");
      alert(`Sync failed: ${e.message}`);
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
            className="btn btn-ghost btn-circle lg:btn-sm lg:btn-ghost"
            title="Back"
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
            <div className="lg:col-span-4 xl:col-span-3 space-y-8">
              {/* Cover Art */}
              <div className="card bg-base-100 shadow-xl overflow-hidden border border-base-content/5">
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
                      <span className="text-sm font-bold tracking-widest uppercase">Select Cover</span>
                    </div>
                  )}
                  {(isAdmin || (isSuperUser && user?.artistId)) && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center text-white p-4 text-center">
                      <Download className="w-8 h-8 mb-2" />
                      <span className="font-bold uppercase tracking-widest text-sm">Change Cover Image</span>
                      <p className="text-[10px] opacity-70 mt-2">Square JPEG or PNG, min 1400px</p>
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
              <div className="card bg-base-100 shadow-xl border border-base-content/5 p-6 space-y-6">
                {(isAdmin || (isSuperUser && user?.artistId)) && (
                  <div className="form-control">
                    <label className="label text-xs font-bold uppercase tracking-widest opacity-50">Import from Bandcamp</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="input input-bordered input-sm flex-1 font-mono text-xs"
                        placeholder="https://artist.bandcamp.com/album/..."
                        value={bandcampUrl}
                        onChange={(e) => setBandcampUrl(e.target.value)}
                      />
                      <button 
                        className="btn btn-sm btn-primary"
                        onClick={handleBandcampImport}
                        disabled={isImporting || !bandcampUrl}
                      >
                        {isImporting ? <span className="loading loading-spinner loading-xs"></span> : "Import"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="form-control">
                  <label className="label text-xs font-bold uppercase tracking-widest opacity-50">Album Title</label>
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
                  <label className="label text-xs font-bold uppercase tracking-widest opacity-50">Artist</label>
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="form-control">
                    <label className="label text-xs font-bold uppercase tracking-widest opacity-50">Year</label>
                    <input
                      type="number"
                      className="input input-bordered w-full"
                      value={metadata.year}
                      onChange={(e) => setMetadata((prev) => ({ ...prev, year: parseInt(e.target.value) }))}
                    />
                  </div>
                  <div className="form-control">
                    <label className="label text-xs font-bold uppercase tracking-widest opacity-50">Type</label>
                    <select
                      className="select select-bordered w-full"
                      value={metadata.type}
                      onChange={(e) => setMetadata((prev) => ({ ...prev, type: e.target.value as any }))}
                    >
                      <option value="album">Album</option>
                      <option value="single">Single</option>
                      <option value="ep">EP</option>
                    </select>
                  </div>
                </div>

                <div className="form-control">
                  <label className="label text-xs font-bold uppercase tracking-widest opacity-50">Genre / Tags</label>
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
              <div className="card bg-base-100 shadow-xl border border-base-content/5 p-6 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest opacity-50">Visibility & Distribution</h3>
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
                        className="checkbox checkbox-xs checkbox-primary"
                        checked={metadata.published_to_gundb !== false}
                        onChange={(e) => setMetadata((prev) => ({ ...prev, published_to_gundb: e.target.checked }))}
                      />
                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">Push to GunDB (P2P)</span>
                    </label>
                    <label className="flex items-center gap-3 p-2 cursor-pointer hover:bg-base-200 rounded-lg transition-colors">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-xs checkbox-secondary"
                        checked={metadata.published_to_ap !== false}
                        onChange={(e) => setMetadata((prev) => ({ ...prev, published_to_ap: e.target.checked }))}
                      />
                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">Push to ActivityPub</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* CENTER/RIGHT COLUMN: TRACKS & WEB3 */}
            <div className="lg:col-span-8 xl:col-span-9 space-y-8">
              
              {/* Actions Toolbar */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-base-100 p-4 rounded-2xl shadow-lg border border-base-content/5">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-black italic tracking-tighter uppercase flex items-center gap-3">
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
                </div>
              </div>

              {/* Tracks Table */}
              <div className="card bg-base-100 shadow-2xl border border-base-content/5 overflow-hidden font-sans">
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
                                  <span className="text-[9px] font-mono opacity-40 uppercase shrink-0">File:</span>
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
                                    className="input input-ghost input-xs w-full font-mono text-[9px] opacity-40 focus:opacity-100 p-0 h-auto"
                                  />
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[9px] font-mono opacity-40 uppercase shrink-0">Genre:</span>
                                  <input
                                    type="text"
                                    value={track.genre || ""}
                                    onChange={(e) => {
                                      const newTracks = [...tracks];
                                      newTracks[idx].genre = e.target.value;
                                      newTracks[idx].isDirty = true;
                                      setTracks(newTracks);
                                    }}
                                    className="input input-ghost input-xs w-24 font-mono text-[9px] opacity-40 focus:opacity-100 p-0 h-auto"
                                    placeholder="Techno..."
                                  />
                                  <span className="text-[9px] font-mono opacity-40 uppercase shrink-0">Year:</span>
                                  <input
                                    type="number"
                                    value={track.year || ""}
                                    onChange={(e) => {
                                      const newTracks = [...tracks];
                                      newTracks[idx].year = e.target.value;
                                      newTracks[idx].isDirty = true;
                                      setTracks(newTracks);
                                    }}
                                    className="input input-ghost input-xs w-16 font-mono text-[9px] opacity-40 focus:opacity-100 p-0 h-auto"
                                    placeholder="2024"
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="hidden md:table-cell font-mono text-xs opacity-50">
                              {track.duration ? `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, "0")}` : "--:--"}
                            </td>
                            <td className="hidden lg:table-cell">
                                <span className="badge badge-outline badge-xs opacity-40 font-mono scale-90 uppercase">
                                  {track.lossless_path ? (track.lossless_path.toLowerCase().endsWith(".wav") ? "WAV" : "FLAC") : (track.format || "MP3")}
                                </span>
                            </td>
                            {metadata.use_nft && (
                              <td>
                                {track.registrationStatus === 'registered' ? (
                                  <div className="badge badge-success badge-sm gap-1 font-bold text-[9px]">Sì</div>
                                ) : track.registrationStatus === 'unregistered' ? (
                                  <button 
                                    className="btn btn-xs btn-outline btn-secondary font-bold text-[9px]"
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
                            </td>
                            <td className="text-right">
                              <div className="flex gap-1 justify-end">
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
                          {track.showLyrics && (
                            <tr className="bg-base-200/20">
                              <td colSpan={metadata.use_nft ? 7 : 6} className="p-4">
                                <div className="card bg-base-300/40 p-4 rounded-xl border border-primary/10 space-y-3">
                                  <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-primary">Lyrics: {track.title}</label>
                                    <button 
                                      className="btn btn-xs btn-ghost text-[9px]"
                                      onClick={async () => {
                                          try {
                                            const response = await fetch(`/api/tracks/${track.id}/lyrics`);
                                            const data = await response.json();
                                            if (data.lyrics) {
                                              const newTracks = [...tracks];
                                              newTracks[idx].lyrics = data.lyrics; newTracks[idx].isDirty = true; setTracks(newTracks);
                                            } else alert("No lyrics found in metadata.");
                                          } catch (e) { alert("Fetch failed"); }
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
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
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
               <div className="card bg-base-100 shadow-xl border border-base-content/5 p-6 mt-8">
                 <h3 className="text-xs font-bold uppercase tracking-widest opacity-50 mb-4 flex items-center gap-2">
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
                  <div className="card bg-base-100 shadow-xl border border-base-content/5 p-6 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest opacity-50 flex items-center gap-2">
                       <Download className="w-3 h-3" /> Payment & Web3 Settings
                    </h3>
                    <div className="form-control">
                      <label className="label-text-alt font-black uppercase tracking-widest opacity-40 mb-2">Smart Contract Mode</label>
                      <div className="flex items-center justify-between bg-base-200 p-3 rounded-xl border border-base-content/5">
                        <span className={`text-[10px] font-bold ${metadata.use_nft === false ? 'text-primary' : 'opacity-40'}`}>Direct Payment</span>
                        <input 
                          type="checkbox" className="toggle toggle-primary toggle-sm mx-2" 
                          checked={metadata.use_nft !== false} 
                          onChange={(e) => setMetadata(prev => ({ ...prev, use_nft: e.target.checked }))} 
                        />
                        <span className={`text-[10px] font-bold ${metadata.use_nft !== false ? 'text-primary' : 'opacity-40'}`}>Smart Contract (NFT)</span>
                      </div>
                    </div>
                    
                    {!isNew && metadata.use_nft && (
                      <div className="bg-secondary/5 border border-secondary/20 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
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
                  <div className="card bg-base-100 shadow-xl border border-base-content/5 p-6 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest opacity-50">Download Experience</h3>
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
                              <span className="text-[10px] opacity-50">
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

                  <div className="card bg-base-100 shadow-xl border border-base-content/5 p-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest opacity-50 mb-4">Legals & Rights</h3>
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


      </div>
    </div>
  );
}

