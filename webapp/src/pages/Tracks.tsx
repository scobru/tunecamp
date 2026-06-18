import { useState, useEffect, useMemo } from "react";
import API from "../services/api";
import {
  Play,
  Heart,
  Search,
  CheckCircle2,
  Download,
  Share2,
  ListMusic,
  Music,
} from "lucide-react";

import { usePlayerStore } from "../stores/usePlayerStore";
import { useAuthStore } from "../stores/useAuthStore";
import { usePurchases } from "../hooks/usePurchases";
import { useWalletStore } from "../stores/useWalletStore";
import { useOwnedNFTs } from "../hooks/useOwnedNFTs";
import { useTracks } from "../hooks/queries";

import { formatDuration } from "../utils/format";
import { PageHeader } from "../components/ui/PageHeader";
import { notify } from "../utils/notify";
import type { Track } from "../types";
import clsx from "clsx";

const Tracks = () => {
  const { data: tracks = [], isLoading: loading } = useTracks();
  const [filter, setFilter] = useState("");
  const { playTrack } = usePlayerStore();
  const { isAuthenticated, isAdminAuthenticated, user } = useAuthStore();
  const { isPurchased } = usePurchases();
  const { address } = useWalletStore();
  const activeAddress = address;
  const { ownedNFTs } = useOwnedNFTs(activeAddress);
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());

  // Seed liked state from the backend starred flags whenever the list loads.
  useEffect(() => {
    const backendLiked = tracks.filter(t => t && t.starred).map(t => String(t.id));
    if (backendLiked.length) {
      setLikedTrackIds(prev => new Set([...Array.from(prev), ...backendLiked]));
    }
  }, [tracks]);

  useEffect(() => {
    if (!isAuthenticated && !isAdminAuthenticated) {
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
      notify.success("Link copied to clipboard!");
    }
  };

  if (loading)
    return <div className="p-12 text-center opacity-50">Loading tracks...</div>;

  return (
    <div className="space-y-8 min-h-screen pb-20">
      <PageHeader 
        title="Tracks" 
        subtitle={`Explore the complete audio library (${tracks.length} tracks)`}
        icon={Music}
        iconColor="text-primary"
      >
        <div className="relative group w-full sm:w-80">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40 group-focus-within:opacity-100 transition-opacity"
            size={18}
          />
          <input
            type="text"
            aria-label="Filter tracks"
            placeholder="Search titles, artists..."
            className="input input-bordered w-full pl-12 rounded-2xl transition-all"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </PageHeader>

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
                      <span className="text-[8px] font-black opacity-30 border border-base-content/10 px-1 rounded">Hi-Res</span>
                    )}
                    {isLiked && <Heart size={10} className="text-primary" fill="currentColor" />}
                  </div>
                  <div className="text-xs opacity-60 font-medium truncate tracking-normal mt-0.5">
                    {track.artistName} • {track.albumName}
                  </div>
                </div>

                <div className="hidden md:block opacity-60 font-mono text-xs tabular-nums">
                  {formatDuration(track.duration)}
                </div>

                <div className="list-col-wrap flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => playTrack(track, filteredTracks)}
                    className="btn btn-ghost btn-sm btn-circle text-primary tooltip tooltip-top"
                    data-tip="Play Track"
                  >
                    <Play size={16} fill="currentColor" />
                  </button>
                  
                  <button 
                    onClick={() => handleLike(track)}
                    className={clsx("btn btn-ghost btn-sm btn-circle tooltip tooltip-top", isLiked && "text-primary")}
                    data-tip={isLiked ? "Unlike Track" : "Like Track"}
                  >
                    <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
                  </button>

                  {purchased && (
                    <button 
                      onClick={() => window.open(API.getTrackDownloadUrl(track.id), "_blank")}
                      className="btn btn-ghost btn-sm btn-circle text-success tooltip tooltip-top"
                      data-tip="Download Track"
                    >
                      <CheckCircle2 size={16} />
                    </button>
                  )}

                  {!purchased && track.albumDownload === "free" && (
                    <a 
                      href={`/api/albums/${String(track.albumId)}/download`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="btn btn-ghost btn-sm btn-circle text-success flex items-center justify-center tooltip tooltip-top"
                      data-tip="Free Download"
                    >
                      <Download size={16} />
                    </a>
                  )}

                  <button 
                    onClick={() => handleShare(track)}
                    className="btn btn-ghost btn-sm btn-circle text-base-content/70 hover:text-base-content tooltip tooltip-top"
                    data-tip="Share Track"
                  >
                    <Share2 size={16} />
                  </button>

                  <button 
                    onClick={() => {
                      if (!isAuthenticated) return window.dispatchEvent(new CustomEvent("open-auth-modal"));
                      document.dispatchEvent(new CustomEvent("open-playlist-modal", { detail: { trackId: track.id } }));
                    }}
                    className="btn btn-ghost btn-sm btn-circle text-base-content/70 hover:text-base-content tooltip tooltip-left"
                    data-tip="Add to Playlist"
                  >
                    <ListMusic size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {filteredTracks.length > 100 && (
          <div className="text-center py-8">
            <p className="text-xs font-black tracking-normal opacity-20">Showing first 100 tracks. Refine your search to find more.</p>
          </div>
        )}
      </div>

    </div>
  );
};


;

export default Tracks;


