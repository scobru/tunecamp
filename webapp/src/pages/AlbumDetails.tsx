import { useState, useEffect } from "react";
import API from "../services/api";
import { Share2, Play, Heart, Download, Unlock, ExternalLink, RefreshCw, CheckCircle2, Wallet, Copyright, Mic } from "lucide-react";

import { useParams, Link } from "react-router-dom";
import { usePlayerStore } from "../stores/usePlayerStore";
import { useAuthStore } from "../stores/useAuthStore";
import { useConfigStore } from "../stores/useConfigStore";
import { usePurchases } from "../hooks/usePurchases";
import { useOwnedNFTs } from "../hooks/useOwnedNFTs";
import { useWalletStore } from "../stores/useWalletStore";

import { formatDuration } from "../utils/format";
import { notify } from "../utils/notify";
import type { Track } from "../types";
import clsx from "clsx";


import { Comments } from "../components/Comments";
import { RelatedTracks } from "../components/RelatedTracks";

const AlbumDetails = () => {
  const { idOrSlug } = useParams();
  const isRelease = window.location.pathname.startsWith('/releases');
  const [album, setAlbum] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const { playTrack } = usePlayerStore();
  const { cacheBuster } = useConfigStore();
  const { isAdminAuthenticated: isAdmin, isAuthenticated, user } = useAuthStore();
  const { isPurchased, verifyAndGetCode } = usePurchases();
  const { address } = useWalletStore();
  const activeAddress = address;
  const { ownedNFTs } = useOwnedNFTs(activeAddress);
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
  const [isAlbumLiked, setIsAlbumLiked] = useState(false);
  const [seedingMagnet, setSeedingMagnet] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  const isTrackUnlocked = (track: any) => {
    return isAdmin || isPurchased(track.id) || 
           ownedNFTs.some(n => n.trackId === Number(track.id)) ||
           (user?.artistId && (String(track.artistId) === String(user.artistId) || String(album?.artistId) === String(user.artistId)));
  };

  useEffect(() => {
    if (idOrSlug) {
      const fetchCall = isRelease ? API.getRelease(idOrSlug) : API.getAlbum(idOrSlug);
      fetchCall
        .then((data: any) => {
          setAlbum(data);
          setIsAlbumLiked(!!data.starred);
          if (data.tracks) {
            const backendLiked = new Set(data.tracks.filter((t: any) => t && t.starred).map((t: any) => String(t.id)));
            const allAlbumTrackIds = new Set<string>(data.tracks.filter((t: any) => t).map((t: any) => String(t.id)));
            // Smart merge: apply backend truth for tracks in this album, preserve other state
            setLikedTrackIds(prev => {
              const next = new Set(prev);
              allAlbumTrackIds.forEach(id => {
                if (backendLiked.has(id)) next.add(id);
                else next.delete(id);
              });
              return next;
            });
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [idOrSlug, isRelease]);

  useEffect(() => {
    if (isAuthenticated) {
      // Load starred tracks from backend as authoritative source
      if (API.getToken()) {
        API.getStarredTracks().then((starredIds: string[]) => {
          setLikedTrackIds(prev => new Set([...Array.from(prev), ...starredIds]));
        }).catch(console.error);
      }
    }
  }, [isAuthenticated]);

  const handleLikeTrack = async (track: Track) => {
    if (!isAuthenticated && !isAdmin) {
      document.dispatchEvent(new CustomEvent("open-auth-modal"));
      return;
    }

    const trackIdStr = String(track.id);
    const isCurrentlyLiked = likedTrackIds.has(trackIdStr);

    // Optimistic update
    setLikedTrackIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlyLiked) next.delete(trackIdStr);
      else next.add(trackIdStr);
      return next;
    });

    try {
      if (API.getToken()) {
        if (isCurrentlyLiked) await API.unstarTrack(track.id);
        else await API.starTrack(track.id);
      }
    } catch (err) {
      console.error("Failed to toggle track like:", err);
      // Rollback on failure
      setLikedTrackIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyLiked) next.add(trackIdStr);
        else next.delete(trackIdStr);
        return next;
      });
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
      notify.success("Link copied to clipboard!");
    }
  };

  const handleShareTrack = (track: any) => {
    const url = `${window.location.origin}/share/tr_${track.id}`;
    if (navigator.share) {
      navigator.share({ title: track.title, url }).catch(console.error);
    } else {
      navigator.clipboard.writeText(url);
      notify.success("Link copied to clipboard!");
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

  const handleShareAsTorrent = async () => {
      if (!album || !album.tracks) return;
      
      setIsSeeding(true);
      try {
          // Collect file paths from tracks
          const filePaths = album.tracks
            .map((t: any) => t.file_path || t.filePath)
            .filter(Boolean);
            
          if (filePaths.length === 0) {
              notify.error("No local files found for this album.");
              return;
          }

          const res = await API.seedTorrent(filePaths, album.title);
          setSeedingMagnet(res.magnetUri);
          notify.success("Torrent seeding started!");
      } catch (err: any) {
          console.error("Seeding failed:", err);
          notify.error(err, "Failed to start seeding");
      } finally {
          setIsSeeding(false);
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
      <div className="relative group rounded-3xl overflow-hidden border border-base-content/5 bg-base-200/20">
        {/* Background Ambient Blur */}
        <div className="absolute inset-0 z-0">
          {album?.coverImage && (
            <img
              src={isRelease ? API.getReleaseCoverUrl(album.id, cacheBuster) : API.getAlbumCoverUrl(album.id, cacheBuster)}
              className="w-full h-full object-cover opacity-10 blur-[100px] scale-150"
              aria-hidden="true"
            />
          )}
        </div>

        <div className="relative z-10 flex flex-col md:flex-row gap-8 lg:gap-12 p-8 lg:p-12 items-center md:items-end">
            <div className="relative group/cover">
              <img
                src={isRelease ? API.getReleaseCoverUrl(album.id, cacheBuster) : API.getAlbumCoverUrl(album.id, cacheBuster)}
                alt={album.title}
                className="w-56 h-56 md:w-72 md:h-72 rounded-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] object-cover ring-1 ring-base-content/10"
                loading="eager"
                onError={(e) => {
                  // Use a LOCAL inline SVG placeholder instead of an external service
                  // (placehold.co): self-hosted/federated instances may be offline or
                  // block third-party requests via CSP, which left the cover box blank.
                  const img = e.target as HTMLImageElement;
                  const FALLBACK =
                    "data:image/svg+xml;charset=utf-8," +
                    encodeURIComponent(
                      "<svg xmlns='http://www.w3.org/2000/svg' width='500' height='500'><rect width='100%' height='100%' fill='#1f2937'/><text x='50%' y='50%' fill='#9ca3af' font-family='sans-serif' font-size='28' text-anchor='middle' dominant-baseline='middle'>No Cover</text></svg>"
                    );
                  if (img.src !== FALLBACK) img.src = FALLBACK;
                }}
              />
              
            </div>

          <div className="flex-1 space-y-6 text-center md:text-left">
            <div className="space-y-2">
              <div className="flex items-center justify-center md:justify-start gap-3">
                 {album.product_type === "podcast" || album.productType === "podcast" ? (
                   <span className="badge badge-secondary font-black tracking-[0.2em] text-xs flex items-center gap-1 shadow-md shadow-secondary/15">
                      <Mic size={10} /> Podcast
                   </span>
                 ) : (
                   <span className="badge badge-primary font-black tracking-[0.2em] text-xs">
                      {album.type}
                   </span>
                 )}
                 {hasLossless && (
                   <span className="badge badge-outline font-black tracking-[0.2em] text-xs opacity-40">
                      Hi-Res
                   </span>
                 )}
              </div>
              <h1 className="text-5xl lg:text-8xl font-black tracking-tighter text-prominent leading-none">
                {album.title}
              </h1>
              {(album.product_type === "podcast" || album.productType === "podcast") && (
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-xs opacity-75 font-bold tracking-normal pt-1">
                  {album.podcast_category && (
                    <span className="badge badge-sm badge-outline border-base-content/25 text-base-content/75">{album.podcast_category}</span>
                  )}
                  {album.podcast_author && (
                    <span>By {album.podcast_author}</span>
                  )}
                  {album.podcast_explicit ? (
                    <span className="badge badge-error badge-sm text-[11px] font-black">Explicit</span>
                  ) : null}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 text-lg lg:text-2xl font-medium tracking-tight">
                {album.album_artist || album.albumArtist ? (
                  <span className="text-primary font-bold">{album.album_artist || album.albumArtist}</span>
                ) : album.artistId ? (
                  <Link
                    to={`/artists/${album.artist_slug || album.artistSlug || album.artistId}`}
                    className="hover:text-primary transition-colors underline decoration-base-content/10 underline-offset-8"
                  >
                    {album.artistName || album.artist_name}
                  </Link>
                ) : (
                  <span className="opacity-80">{album.artistName || album.artist_name}</span>
                )}
                <span className="opacity-60 font-black">•</span>
                <span className="opacity-70">{album.year}</span>
                <span className="opacity-60 font-black">•</span>
                <span className="opacity-70 text-base">
                  {album.tracks?.length} tracks
                </span>
              </div>
            </div>

            {seedingMagnet && (
              <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex flex-col gap-2 max-w-xl mx-auto md:mx-0 animate-fade-in">
                 <div className="flex justify-between items-center text-xs font-bold text-primary tracking-normal">
                    <span>Magnet Link Ready</span>
                    <button className="btn btn-xs btn-ghost" onClick={() => setSeedingMagnet(null)}>Dismiss</button>
                 </div>
                 <div className="flex gap-2 items-center bg-base-100/50 p-2 rounded-xl border border-base-content/5">
                    <code className="text-xs font-mono truncate flex-1">{seedingMagnet}</code>
                    <button 
                      className="btn btn-xs btn-primary" 
                      onClick={() => {
                        navigator.clipboard.writeText(seedingMagnet);
                        notify.success("Magnet link copied!");
                      }}
                    >Copy</button>
                 </div>
              </div>
            )}

            <div className="flex flex-wrap gap-4 justify-center md:justify-start pt-2">
              <button
                className="btn btn-primary btn-lg rounded-2xl px-10 shadow-level-1 shadow-primary/20 hover:scale-105 transition-all"
                onClick={handlePlay}
              >
                <Play fill="currentColor" size={20} /> Play Album
              </button>

              <button
                className={clsx("btn btn-lg btn-square rounded-2xl border border-base-content/5 hover:bg-base-content/5 hover:border-base-content/10 transition-all tooltip tooltip-top", isAlbumLiked && "text-primary")}
                onClick={handleLikeAlbum}
                data-tip={isAlbumLiked ? "Unstar Album" : "Star Album"}
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

              {isAdmin && (
                <button
                  className={clsx("btn btn-lg btn-square rounded-2xl border border-base-content/5 hover:bg-base-content/5 transition-all", isSeeding && "loading")}
                  onClick={handleShareAsTorrent}
                  title="Share as Torrent (Seed)"
                >
                  <RefreshCw size={24} className={clsx("opacity-60", seedingMagnet && "text-primary opacity-100")} />
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
                      className="select select-ghost select-md rounded-xl focus:outline-none text-xs font-black tracking-normal"
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
           <h2 className="text-sm font-black tracking-[0.2em] opacity-60">Tracklist</h2>
           <div className="flex items-center gap-6 text-xs font-black tracking-normal opacity-40">
              <span className="hidden md:block">Duration</span>
              <span className="w-8"></span>
           </div>
        </div>

        <div className="list bg-base-200/10 rounded-3xl border border-base-content/5 overflow-visible">
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
                   <div className="flex flex-col">
                     <div className="flex items-center gap-3">
                       <button 
                         onClick={() => playTrack(track, album.tracks!)}
                         className="font-bold text-lg truncate hover:text-primary transition-colors text-left tracking-tight"
                       >
                         {track.title}
                       </button>
                       {track.losslessPath && (
                          <span className="text-[11px] font-black opacity-30 border border-base-content/10 px-1.5 rounded" aria-label="High Resolution Audio">Hi-Res</span>
                       )}
                     </div>
                      {(album.product_type === 'podcast' || album.productType === 'podcast') && (
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {(track.podcast_season_num !== undefined && track.podcast_season_num !== null) && (
                            <span className="badge badge-xs badge-outline opacity-60">Season {track.podcast_season_num}</span>
                          )}
                          {(track.podcast_episode_num !== undefined && track.podcast_episode_num !== null) && (
                            <span className="badge badge-xs badge-outline opacity-60">Episode {track.podcast_episode_num}</span>
                          )}
                          {(track.podcast_episode_type || track.podcastEpisodeType) && (track.podcast_episode_type || track.podcastEpisodeType) !== 'full' && (
                            <span className="badge badge-xs badge-ghost text-[11px] font-black opacity-60">
                              {track.podcast_episode_type || track.podcastEpisodeType}
                            </span>
                          )}
                        </div>
                      )}
                     {(track.artist_name || track.artistName) && 
                      (track.artist_name || track.artistName) !== (album.album_artist || album.albumArtist || album.artistName || album.artist_name) && (
                       <span className="text-xs opacity-50 truncate -mt-1 font-medium">{track.artist_name || track.artistName}</span>
                     )}
                      {(album.product_type === 'podcast' || album.productType === 'podcast') && track.description && (
                        <p className="text-xs opacity-75 mt-1.5 line-clamp-2 text-left leading-relaxed max-w-3xl font-medium">
                          {track.description}
                        </p>
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
                    aria-label={`Play ${track.title}`}
                    title="Play Track"
                  >
                    <Play size={18} fill="currentColor" aria-hidden="true" />
                  </button>
                  
                  <button 
                    onClick={() => handleLikeTrack(track)}
                    className={clsx("btn btn-ghost btn-sm btn-circle", likedTrackIds.has(String(track.id)) && "text-primary")}
                    aria-label={likedTrackIds.has(String(track.id)) ? `Unlike ${track.title}` : `Like ${track.title}`}
                    title={likedTrackIds.has(String(track.id)) ? "Unlike Track" : "Like Track"}
                  >
                    <Heart size={18} fill={likedTrackIds.has(String(track.id)) ? "currentColor" : "none"} aria-hidden="true" />
                  </button>

                  {unlocked && (
                    <button 
                      onClick={async () => {
                        if (isAdmin || (user?.artistId && (String(track.artistId) === String(user.artistId) || String(album?.artistId) === String(user.artistId)))) {
                          window.open(API.getTrackDownloadUrl(track.id), "_blank");
                          return;
                        }
                        const code = await verifyAndGetCode(track.id);
                        if (code) window.open(`/api/payments/download/${track.id}?code=${code}`, "_blank");
                      }}
                      className="btn btn-ghost btn-sm btn-circle text-success"
                      aria-label={`Download ${track.title}`}
                      title="Download Track"
                    >
                      <CheckCircle2 size={18} aria-hidden="true" />
                    </button>
                  )}

                  {!unlocked && album.download === "free" && (
                    <a 
                      href={`/api/albums/${album.slug || album.id}/download?format=${downloadFormat}`} 
                      target="_blank"
                      className="btn btn-ghost btn-sm btn-circle text-success flex items-center justify-center"
                      aria-label={`Free Download ${track.title}`}
                      title="Free Download"
                    >
                      <Download size={18} aria-hidden="true" />
                    </a>
                  )}

                  {!unlocked && album.download !== "free" && isRelease && (
                    <button 
                      onClick={() => {
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
                      }}
                      className="btn btn-ghost btn-sm btn-circle text-secondary"
                      aria-label={`Purchase ${track.title}`}
                      title="Purchase Track"
                    >
                      <Wallet size={18} aria-hidden="true" />
                    </button>
                  )}

                  <button 
                    onClick={() => handleShareTrack(track)}
                    className="btn btn-ghost btn-sm btn-circle text-base-content/70 hover:text-base-content"
                    aria-label={`Share ${track.title}`}
                    title="Share Track"
                  >
                    <Share2 size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        </div>

        {/* AI Recommendations */}
        {album.tracks?.[0] && (
        <div className="px-2">
          <RelatedTracks trackId={album.tracks[0].id} />
        </div>
        )}

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
        <div className="text-xs font-black tracking-[0.2em] opacity-40">
           Published on TuneCamp • {album.year}
        </div>
      </div>

      {/* Comments Section */}
      <div className="px-2">
        <Comments
          trackId={album.tracks?.[0]?.id ? String(album.tracks[0].id) : undefined}
        />
      </div>

    </div>
  );
};


;

export default AlbumDetails;


