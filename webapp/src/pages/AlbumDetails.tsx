import { useState, useEffect } from "react";
import API from "../services/api";
import { Share2, Trash2, Camera, Loader2, Play, Heart, Download, Unlock, ExternalLink, MoreHorizontal, CheckCircle2, Wallet, Music, Copyright } from "lucide-react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { usePlayerStore } from "../stores/usePlayerStore";
import { useAuthStore } from "../stores/useAuthStore";
import { usePurchases } from "../hooks/usePurchases";
import { useOwnedNFTs } from "../hooks/useOwnedNFTs";
import { useWalletStore } from "../stores/useWalletStore";
import { ZenSocial } from "../services/zen";
import { formatDuration } from "../utils/format";
import type { Track } from "../types";
import clsx from "clsx";


import { Comments } from "../components/Comments";

export const AlbumDetails = () => {
  const { idOrSlug } = useParams();
  const navigate = useNavigate();
  const isRelease = window.location.pathname.startsWith('/releases');
  const [album, setAlbum] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const { playTrack } = usePlayerStore();
  const [coverVersion] = useState(Date.now()); // Cache buster
  const { isAdminAuthenticated: isAdmin, isAuthenticated, user } = useAuthStore();
  const { isPurchased, verifyAndGetCode } = usePurchases();
  const { address, externalAddress, useExternalWallet, isExternalConnected } = useWalletStore();
  const activeAddress = useExternalWallet && isExternalConnected ? externalAddress : address;
  const { ownedNFTs } = useOwnedNFTs(activeAddress);
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
  const [isAlbumLiked, setIsAlbumLiked] = useState(false);

  const isTrackUnlocked = (track: any) => {
    return isAdmin || isPurchased(track.id) || 
           ownedNFTs.some(n => n.trackId === Number(track.id)) ||
           (user?.artistId && (String(track.artistId) === String(user.artistId) || String(album?.artistId) === String(user.artistId)));
  };

  const [uploading, setUploading] = useState(false);
  const isOwnerOrAdmin = isAdmin || (user?.artistId && String(album?.owner_id) === String(user.artistId));

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !album) return;
    setUploading(true);
    try {
      await API.uploadCover(e.target.files[0], album.slug);
      // Force refresh album data to show new cover
      const data = await (isRelease ? API.getRelease(idOrSlug!) : API.getAlbum(idOrSlug!));
      setAlbum(data);
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Failed to upload cover");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (idOrSlug) {
      const fetchCall = isRelease ? API.getRelease(idOrSlug) : API.getAlbum(idOrSlug);
      fetchCall
        .then((data: any) => {
          setAlbum(data);
          setIsAlbumLiked(!!data.starred);
          if (data.tracks) {
            const backendLiked = data.tracks.filter((t: any) => t && t.starred).map((t: any) => String(t.id));
            setLikedTrackIds(new Set(backendLiked));
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [idOrSlug, isRelease]);

  useEffect(() => {
    if (isAuthenticated) {
      ZenSocial.getLikedTracks().then((liked) => {
        setLikedTrackIds((prev) => new Set([...Array.from(prev), ...liked.filter((t: any) => t && t.id).map((t: any) => String(t.id))]));
      });
    }
  }, [isAuthenticated]);

  const handleLikeTrack = async (track: Track) => {
    if (!isAuthenticated && !isAdmin) {
      document.dispatchEvent(new CustomEvent("open-auth-modal"));
      return;
    }
    
    const trackIdStr = String(track.id);
    const isCurrentlyLiked = likedTrackIds.has(trackIdStr);

    try {
      if (isAuthenticated && user?.zenProfile) {
        try {
          await ZenSocial.toggleLikeTrack(track);
        } catch (zenErr) {
          console.warn("Zen like sync failed:", zenErr);
        }
      }
      if (API.getToken()) {
        if (isCurrentlyLiked) await API.unstarTrack(track.id);
        else await API.starTrack(track.id);
      }

      setLikedTrackIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyLiked) next.delete(trackIdStr);
        else next.add(trackIdStr);
        return next;
      });
    } catch (err) {
      console.error("Failed to toggle track like:", err);
    }
  };

  const handleLikeAlbum = async () => {
    if (!isAuthenticated && !isAdmin) {
      document.dispatchEvent(new CustomEvent("open-auth-modal"));
      return;
    }
    if (!album) return;

    try {
      if (API.getToken()) {
        if (isAlbumLiked) await API.unstarAlbum(album.id);
        else await API.starAlbum(album.id);
      }
      setIsAlbumLiked(!isAlbumLiked);
    } catch (err) {
      console.error("Failed to toggle album like:", err);
    }
  };

  const [downloadFormat, setDownloadFormat] = useState("mp3");

  const handleShareAlbum = () => {
    const url = `${window.location.origin}/share/al_${album.id}`;
    if (navigator.share) {
      navigator.share({ title: album.title, url }).catch(console.error);
    } else {
      navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    }
  };

  const handleShareTrack = (track: any) => {
    const url = `${window.location.origin}/share/tr_${track.id}`;
    if (navigator.share) {
      navigator.share({ title: track.title, url }).catch(console.error);
    } else {
      navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    }
  };

  const handleUnlock = () => {
    window.dispatchEvent(new CustomEvent("open-unlock-modal", { 
        detail: { albumId: String(album.id) } 
    }));
  };

  const handlePlay = () => {
    if (album?.tracks && album.tracks.length > 0) {
      playTrack(album.tracks[0], album.tracks);
    }
  };

  const handleDeleteAlbum = async () => {
    if (!album) return;
    const isFormalRelease = !!isRelease;
    const isRootAdmin = !!user?.isRootAdmin;
    
    // Permission check matching backend
    const canDelete = isRootAdmin || String(album.owner_id) === String(user?.artistId);
    
    if (!canDelete) {
      alert("You do not have permission to delete this " + (isFormalRelease ? "release" : "album") + ".");
      return;
    }

    if (!window.confirm(`Are you sure you want to delete this ${isFormalRelease ? 'release' : 'album'}? This action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      await API.deleteAlbum(album.id);
      alert(`${isFormalRelease ? 'Release' : 'Album'} deleted successfully.`);
      navigate(isFormalRelease ? '/releases' : '/');
    } catch (err: any) {
      console.error("Failed to delete album:", err);
      alert(err.message || "Failed to delete album");
      setLoading(false);
    }
  };


  // Parse external links safely
  const externalLinks = (() => {
    if (!album?.external_links) return [];
    try {
      return JSON.parse(album.external_links);
    } catch {
      return [];
    }
  })();

  const licenseInfo = (() => {
    if (!album?.license || album.license === 'copyright') return { name: 'All Rights Reserved', url: null };
    
    const mapping: Record<string, { name: string, url: string }> = {
        'cc-by': { name: 'CC BY 4.0 (Attribution)', url: 'https://creativecommons.org/licenses/by/4.0/' },
        'cc-by-sa': { name: 'CC BY-SA 4.0 (ShareAlike)', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
        'cc-by-nc': { name: 'CC BY-NC 4.0 (NonCommercial)', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
        'cc-by-nc-sa': { name: 'CC BY-NC-SA 4.0 (NonCommercial ShareAlike)', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
        'cc-by-nd': { name: 'CC BY-ND 4.0 (NoDerivs)', url: 'https://creativecommons.org/licenses/by-nd/4.0/' },
        'cc-by-nc-nd': { name: 'CC BY-NC-ND 4.0 (NonCommercial NoDerivs)', url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' },
        'public-domain': { name: 'Public Domain / CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' }
    };

    return mapping[album.license] || { name: album.license, url: null };
  })();

  if (loading)
    return <div className="p-12 text-center opacity-50">Loading album...</div>;
  if (!album)
    return <div className="p-12 text-center opacity-50">Album not found.</div>;

  const hasLossless = album.tracks?.some((t: any) => t.losslessPath);

  return (
    <div className="space-y-12 animate-fade-in pb-20">
      {/* Header / Hero */}
      <div className="relative group rounded-[2.5rem] overflow-hidden border border-base-content/5 bg-base-200/20">
        {/* Background Ambient Blur */}
        <div className="absolute inset-0 z-0">
          {album?.coverImage && (
            <img
              src={isRelease ? API.getReleaseCoverUrl(album.id, coverVersion) : API.getAlbumCoverUrl(album.id, coverVersion)}
              className="w-full h-full object-cover opacity-10 blur-[100px] scale-150"
            />
          )}
        </div>

        <div className="relative z-10 flex flex-col md:flex-row gap-8 lg:gap-12 p-8 lg:p-12 items-center md:items-end">
            <div className="relative group/cover">
              <img
                src={isRelease ? API.getReleaseCoverUrl(album.id, coverVersion) : API.getAlbumCoverUrl(album.id, coverVersion)}
                alt={album.title}
                className="w-56 h-56 md:w-72 md:h-72 rounded-[2rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] object-cover ring-1 ring-base-content/10"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://placehold.co/500x500?text=No+Cover";
                }}
              />
              
              {!isRelease && isOwnerOrAdmin && (
                <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover/cover:opacity-100 transition-opacity cursor-pointer rounded-[2rem] border-2 border-dashed border-white/20 hover:border-primary/50">
                  {uploading ? (
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-8 h-8 text-white mb-2" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-white">Upload Cover</span>
                    </>
                  )}
                  <input type="file" className="hidden" accept="image/*" onChange={handleCoverUpload} disabled={uploading} />
                </label>
              )}
            </div>

          <div className="flex-1 space-y-6 text-center md:text-left">
            <div className="space-y-2">
              <div className="flex items-center justify-center md:justify-start gap-3">
                 <span className="text-[10px] font-black uppercase tracking-[0.3em] bg-primary text-primary-content px-2 py-0.5 rounded-md">
                    {album.type}
                 </span>
                 {hasLossless && (
                   <span className="text-[10px] font-black uppercase tracking-[0.3em] border border-white/20 px-2 py-0.5 rounded-md opacity-40">
                      Hi-Res
                   </span>
                 )}
              </div>
              <h1 className="text-5xl lg:text-8xl font-black tracking-tighter text-prominent leading-none">
                {album.title}
              </h1>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 text-lg lg:text-2xl font-medium tracking-tight">
                {album.artistId ? (
                  <Link
                    to={`/artists/${album.artist_slug || album.artistSlug || album.artistId}`}
                    className="hover:text-primary transition-colors underline decoration-base-content/10 underline-offset-8"
                  >
                    {album.artistName || album.artist_name}
                  </Link>
                ) : (
                  <span className="opacity-80">{album.artistName}</span>
                )}
                <span className="opacity-60 font-black">•</span>
                <span className="opacity-70">{album.year}</span>
                <span className="opacity-60 font-black">•</span>
                <span className="opacity-70 text-base">
                  {album.tracks?.length} tracks
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 justify-center md:justify-start pt-2">
              <button
                className="btn btn-primary btn-lg rounded-2xl px-10 shadow-2xl shadow-primary/20 hover:scale-105 transition-all"
                onClick={handlePlay}
              >
                <Play fill="currentColor" size={20} /> Play Album
              </button>

              <button
                className={clsx("btn btn-lg btn-square rounded-2xl border border-base-content/5 hover:bg-base-content/5 hover:border-base-content/10 transition-all", isAlbumLiked && "text-primary")}
                onClick={handleLikeAlbum}
                title={isAlbumLiked ? "Unstar Album" : "Star Album"}
              >
                <Heart size={24} fill={isAlbumLiked ? "currentColor" : "none"} />
              </button>

              <button
                className="btn btn-lg btn-square rounded-2xl border border-base-content/5 hover:bg-base-content/5 hover:border-base-content/10 transition-all"
                onClick={handleShareAlbum}
                title="Share Album"
              >
                <Share2 size={24} className="opacity-60" />
              </button>

              {(user?.isRootAdmin || (user?.artistId && String(album?.owner_id) === String(user.artistId))) && (
                <button
                  className="btn btn-lg btn-square rounded-2xl border border-red-500/10 hover:bg-red-500/10 hover:border-red-500/20 text-red-500/50 hover:text-red-500 transition-all"
                  onClick={handleDeleteAlbum}
                  title="Delete Album"
                >
                  <Trash2 size={24} />
                </button>
              )}

              {(album.download === "free" || album.download === "codes") && (
                <div className="flex gap-1 bg-base-300/50 p-1 rounded-[1.25rem] border border-base-content/5 backdrop-blur-md">
                  {album.download === "free" && (
                    <a
                      href={`/api/${isRelease ? 'releases' : 'albums'}/${album.slug || album.id}/download?format=${downloadFormat}`}
                      className="btn btn-ghost btn-md rounded-xl gap-2 hover:bg-base-content/10"
                      target="_blank"
                    >
                      <Download size={18} /> Download
                    </a>
                  )}

                  {album.download === "codes" && (
                    <button
                      className="btn btn-ghost btn-md rounded-xl gap-2 hover:bg-base-content/10"
                      onClick={handleUnlock}
                    >
                      <Unlock size={18} /> Unlock
                    </button>
                  )}

                  {hasLossless && (
                    <select
                      className="select select-ghost select-md rounded-xl focus:outline-none uppercase text-[10px] font-black tracking-widest"
                      value={downloadFormat}
                      onChange={(e) => setDownloadFormat(e.target.value)}
                    >
                      <option value="mp3">MP3</option>
                      <option value="wav">WAV</option>
                    </select>
                  )}
                </div>
              )}

              {externalLinks.length > 0 && (
                <div className="flex flex-wrap gap-2">
                   {externalLinks.map((link: any, i: number) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      className="btn btn-ghost btn-lg btn-square rounded-2xl border border-base-content/5 hover:bg-base-content/5 hover:border-base-content/10 transition-all"
                      title={link.label}
                    >
                      <ExternalLink size={20} className="opacity-40" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tracklist using daisyUI 5 list-row */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-4">
           <h2 className="text-sm font-black uppercase tracking-[0.2em] opacity-60">Tracklist</h2>
           <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest opacity-40">
              <span className="hidden md:block">Duration</span>
              <span className="w-8"></span>
           </div>
        </div>

        <div className="list bg-base-200/10 rounded-[2.5rem] border border-base-content/5 overflow-visible">
          {album.tracks?.map((track: any, i: number) => {
            if (!track) return null;
            const unlocked = isTrackUnlocked(track);
            return (
              <div
                key={track.id}
                className="list-row items-center hover:bg-base-content/5 transition-colors px-6 py-4 group border-b border-base-content/5 last:border-0"
              >
                <div className="text-xs font-black opacity-40 w-8 group-hover:opacity-0 transition-opacity">
                   {String(i + 1).padStart(2, '0')}
                </div>
                
                <div className="list-col-grow min-w-0">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => playTrack(track, album.tracks!)}
                      className="font-bold text-lg truncate hover:text-primary transition-colors text-left tracking-tight"
                    >
                      {track.title}
                    </button>
                    {track.losslessPath && (
                       <span className="text-[9px] font-black opacity-30 border border-base-content/10 px-1.5 rounded uppercase">Hi-Res</span>
                    )}
                  </div>
                </div>

                <div className="hidden md:block opacity-60 font-mono text-sm tabular-nums">
                   {formatDuration(track.duration)}
                </div>

                <div className="list-col-wrap flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => playTrack(track, album.tracks!)}
                    className="btn btn-ghost btn-sm btn-circle text-primary"
                  >
                    <Play size={18} fill="currentColor" />
                  </button>
                  
                  <button 
                    onClick={() => handleLikeTrack(track)}
                    className={clsx("btn btn-ghost btn-sm btn-circle", likedTrackIds.has(String(track.id)) && "text-primary")}
                  >
                    <Heart size={18} fill={likedTrackIds.has(String(track.id)) ? "currentColor" : "none"} />
                  </button>

                  <div className="dropdown dropdown-end">
                    <div role="button" tabIndex={0} className="btn btn-ghost btn-sm btn-circle">
                       <MoreHorizontal size={18} />
                    </div>
                    <ul tabIndex={0} className="dropdown-content z-[20] menu p-2 shadow-2xl bg-base-300 rounded-2xl w-52 border border-base-content/10 mt-2">
                       {(unlocked || album.download === "free" || isRelease) && (
                         <li>
                           {unlocked ? (
                             <a className="text-success font-bold" onClick={async () => {
                                if (isAdmin || (user?.artistId && (String(track.artistId) === String(user.artistId) || String(album?.artistId) === String(user.artistId)))) {
                                  window.open(API.getTrackDownloadUrl(track.id), "_blank");
                                  return;
                                }
                                const code = await verifyAndGetCode(track.id);
                                if (code) window.open(`/api/payments/download/${track.id}?code=${code}`, "_blank");
                             }}>
                               <CheckCircle2 size={16} /> Download
                             </a>
                           ) : album.download === "free" ? (
                             <a href={`/api/albums/${album.slug || album.id}/download?format=${downloadFormat}`} target="_blank">
                                <Download size={16} /> Free Download
                             </a>
                           ) : isRelease && (
                             <a onClick={() => {
                               if (!isAdmin && !useAuthStore.getState().isAuthenticated) return window.dispatchEvent(new CustomEvent("open-auth-modal"));
                               window.dispatchEvent(new CustomEvent("open-checkout-modal", { 
                                 detail: { 
                                   track: { 
                                     ...track, 
                                     id: String(track.id).replace("tr_", ""),
                                     albumId: album.id,
                                     artist: track.artistName || track.artist_name || album.artist_name || "Unknown Artist"
                                   } 
                                 } 
                               }));
                             }}>
                               <Wallet size={16} className="text-secondary" /> Purchase Track
                             </a>
                           )}
                         </li>
                       )}

                       <li>
                         <a onClick={() => handleShareTrack(track)}>
                            <Share2 size={16} /> Share Track
                         </a>
                       </li>
                       {isAdmin && (
                         <li className="border-t border-base-content/5 mt-1 pt-1 opacity-50 hover:opacity-100">
                           <a onClick={() => document.dispatchEvent(new CustomEvent("open-admin-track-modal", { detail: track }))}>
                             <Music size={16} /> Edit Metadata
                           </a>
                         </li>
                       )}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Info / License */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 px-4 py-8 border-t border-base-content/5">
        <div className="flex items-center gap-3 opacity-40">
           <Copyright size={18} />
           <span className="text-sm font-medium tracking-tight">
              {licenseInfo.url ? (
                <a href={licenseInfo.url} target="_blank" className="hover:text-primary underline underline-offset-4 decoration-base-content/10">{licenseInfo.name}</a>
              ) : licenseInfo.name}
           </span>
        </div>
        <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">
           Published on TuneCamp • {album.year}
        </div>
      </div>

      {/* Comments Section */}
      <div className="px-2">
        <Comments
          trackId={album.tracks?.[0]?.id ? String(album.tracks[0].id) : undefined}
          albumId={String(album.id)}
        />
      </div>
    </div>
  );
};


