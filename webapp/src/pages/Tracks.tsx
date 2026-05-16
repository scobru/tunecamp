import { useState, useEffect, useMemo } from "react";
import API from "../services/api";
import {
  Play,
  Heart,
  MoreHorizontal,
  Search,
  CheckCircle2,
  Download,
  Share2,
  ListMusic,
} from "lucide-react";

import { usePlayerStore } from "../stores/usePlayerStore";
import { useAuthStore } from "../stores/useAuthStore";
import { usePurchases } from "../hooks/usePurchases";
import { useWalletStore } from "../stores/useWalletStore";
import { useOwnedNFTs } from "../hooks/useOwnedNFTs";
import { ZenSocial } from "../services/zen";
import { formatDuration } from "../utils/format";
import type { Track } from "../types";
import clsx from "clsx";

export const Tracks = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const { playTrack } = usePlayerStore();
  const { isAuthenticated, isAdminAuthenticated, user } = useAuthStore();
  const { isPurchased } = usePurchases();
  const { address, externalAddress, useExternalWallet, isExternalConnected } = useWalletStore();
  const activeAddress = useExternalWallet && isExternalConnected ? externalAddress : address;
  const { ownedNFTs } = useOwnedNFTs(activeAddress);
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    API.getTracks()
      .then((data) => {
        setTracks(data);
        // Initialize likedTrackIds from backend starred status
        const backendLiked = data.filter(t => t && t.starred).map(t => String(t.id));
        setLikedTrackIds(prev => new Set([...Array.from(prev), ...backendLiked]));
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        setLoading(false);
      });

    if (isAuthenticated) {
      ZenSocial.getLikedTracks().then((liked) => {
        setLikedTrackIds(prev => new Set([...Array.from(prev), ...liked.filter((t: any) => t && t.id).map((t: any) => String(t.id))]));
      });
    } else if (!isAdminAuthenticated) {
      setLikedTrackIds(new Set());
    }
  }, [isAuthenticated, isAdminAuthenticated]);

  const filteredTracks = useMemo(() => {
    const lower = filter.toLowerCase();
    return tracks.filter((t) => {
      if (!t || !t.title) return false;
      return (
        t.title.toLowerCase().includes(lower) ||
        t.artistName?.toLowerCase().includes(lower) ||
        t.albumName?.toLowerCase().includes(lower)
      );
    });
  }, [filter, tracks]);

  const handleLike = async (track: Track) => {
    if (!isAuthenticated && !isAdminAuthenticated) {
      document.dispatchEvent(new CustomEvent("open-auth-modal"));
      return;
    }
    
    const trackIdStr = String(track.id);
    const isCurrentlyLiked = likedTrackIds.has(trackIdStr);

    try {
      // Toggle in Zen if user is fully authenticated with Zen
      if (isAuthenticated && user?.zenProfile) {
        try {
          await ZenSocial.toggleLikeTrack(track);
        } catch (zenErr) {
          console.warn("Zen like sync failed:", zenErr);
        }
      }

      // Toggle in Backend (SQLite) if user has a token
      if (API.getToken()) {
        if (isCurrentlyLiked) {
          await API.unstarTrack(track.id);
        } else {
          await API.starTrack(track.id);
        }
      }

      setLikedTrackIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyLiked) next.delete(trackIdStr);
        else next.add(trackIdStr);
        return next;
      });
    } catch (err) {
      console.error("Failed to toggle like:", err);
    }
  };


  const handleShare = (track: Track) => {
    const url = `${window.location.origin}/share/tr_${track.id}`;
    if (navigator.share) {
      navigator.share({ title: track.title, url }).catch(console.error);
    } else {
      navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    }
  };

  if (loading)
    return <div className="p-12 text-center opacity-50">Loading tracks...</div>;

  return (
    <div className="space-y-8 min-h-screen pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
        <div className="space-y-2">
          <h1 className="text-4xl lg:text-6xl font-black tracking-tighter uppercase">
            Tracks
          </h1>
          <p className="text-sm opacity-60 font-medium tracking-widest uppercase">
            Explore the complete audio library ({tracks.length})
          </p>
        </div>

        <div className="relative group max-w-md w-full">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40 group-focus-within:opacity-100 transition-opacity"
            size={18}
          />
          <input
            type="text"
            aria-label="Filter tracks"
            placeholder="Search titles, artists, albums..."
            className="input input-lg bg-base-200/50 border-base-content/5 focus:border-primary/30 w-full pl-12 rounded-2xl transition-all"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="list bg-base-200/20 rounded-[2rem] border border-base-content/5 overflow-visible">
          {filteredTracks.slice(0, 100).map((track, i) => {
            if (!track || !track.title) return null;
            const isLiked = track.liked || likedTrackIds.has(String(track.id));
            const purchased = isAdminAuthenticated || isPurchased(String(track.id)) || 
                             ownedNFTs.some(n => n.trackId === Number(track.id) && n.balance > 0) || 
                             (user?.artistId && String(track.artistId) === String(user.artistId));
            
            return (
              <div
                key={track.id}
                className="list-row items-center hover:bg-base-content/5 transition-colors px-4 py-2 group border-b border-base-content/5 last:border-0"
              >
                <div className="text-xs font-black opacity-40 w-8 tabular-nums group-hover:opacity-0 transition-opacity">
                   {String(i + 1).padStart(2, '0')}
                </div>
                
                <div className="list-col-grow min-w-0">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => playTrack(track, filteredTracks)}
                      className="font-bold text-base truncate hover:text-primary transition-colors text-left"
                    >
                      {track.title}
                    </button>
                    {track.losslessPath && (
                      <span className="text-[8px] font-black opacity-30 border border-base-content/10 px-1 rounded uppercase">Hi-Res</span>
                    )}
                    {isLiked && <Heart size={10} className="text-primary" fill="currentColor" />}
                  </div>
                  <div className="text-xs opacity-60 font-medium truncate uppercase tracking-widest mt-0.5">
                    {track.artistName} • {track.albumName}
                  </div>
                </div>

                <div className="hidden md:block opacity-60 font-mono text-xs tabular-nums">
                  {formatDuration(track.duration)}
                </div>

                <div className="list-col-wrap flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => playTrack(track, filteredTracks)}
                    className="btn btn-ghost btn-sm btn-circle text-primary"
                  >
                    <Play size={16} fill="currentColor" />
                  </button>
                  
                  <button 
                    onClick={() => handleLike(track)}
                    className={clsx("btn btn-ghost btn-sm btn-circle", isLiked && "text-primary")}
                  >
                    <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
                  </button>

                  <div className="dropdown dropdown-end">
                    <div role="button" tabIndex={0} className="btn btn-ghost btn-sm btn-circle">
                      <MoreHorizontal size={16} />
                    </div>
                    <ul tabIndex={0} className="dropdown-content z-[50] menu p-2 shadow-2xl bg-base-300 rounded-2xl w-52 border border-base-content/10 mt-2">
                      {purchased && (
                        <li>
                          <a 
                            className="text-success font-bold"
                            onClick={() => window.open(API.getTrackDownloadUrl(track.id), "_blank")}
                          >
                            <CheckCircle2 size={16} /> Download
                          </a>
                        </li>
                      )}
                      {!purchased && track.albumDownload === "free" && (
                        <li>
                          <a href={`/api/albums/${String(track.albumId)}/download`} target="_blank" rel="noreferrer">
                             <Download size={16} /> Free Download
                          </a>
                        </li>
                      )}
                      <li>
                        <a onClick={() => handleShare(track)}>
                          <Share2 size={16} /> Share Track
                        </a>
                      </li>
                      <li>
                        <a onClick={() => {
                          if (!isAuthenticated) return window.dispatchEvent(new CustomEvent("open-auth-modal"));
                          document.dispatchEvent(new CustomEvent("open-playlist-modal", { detail: { trackId: track.id } }));
                        }}>
                          <ListMusic size={16} /> Add to Playlist
                        </a>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {filteredTracks.length > 100 && (
          <div className="text-center py-8">
            <p className="text-xs font-black uppercase tracking-widest opacity-20">Showing first 100 tracks. Refine your search to find more.</p>
          </div>
        )}
      </div>

    </div>
  );
};


