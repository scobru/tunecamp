import { useState, useEffect } from "react";
import API from "../../services/api";
import { PeerTrackCard } from "./PeerTrackCard";
import { User, ChevronDown, ChevronUp, Music, Loader2 } from "lucide-react";
import { StringUtils } from "../../utils/stringUtils";

interface PeerSession {
  id: string;
  user_id: number;
  username: string;
  connected_at: number;
  last_seen: number;
  ip_address?: string;
  allow_downloads?: number;
  trackCount?: number;
}

interface PeerSessionCardProps {
  session: PeerSession;
  allowDownloadsGlobal: boolean;
}

export const PeerSessionCard = ({ session, allowDownloadsGlobal }: PeerSessionCardProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isOpen && !loaded && !loading) {
      setLoading(true);
      API.getPeerTracks(session.id)
        .then((data) => {
          setTracks(data);
          setLoaded(true);
        })
        .catch((err) => {
          console.error("Failed to load peer tracks:", err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, loaded, session.id]);

  return (
    <div className="bg-base-200/40 rounded-2xl border border-base-content/5 overflow-hidden transition-all hover:border-base-content/10">
      {/* Card Header (clickable to expand) */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-base-200/60 transition-colors select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* User Icon/Avatar */}
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0">
            {session.username?.charAt(0).toUpperCase() || <User size={18} />}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm sm:text-base truncate flex items-center gap-2">
              {session.username}
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Online"></span>
            </h3>
            <p className="text-xs opacity-50 truncate">
              Connected {StringUtils.formatTimeAgo(session.connected_at)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="badge badge-neutral gap-1 text-xs font-semibold px-2.5 py-3">
            <Music size={12} className="opacity-70" />
            <span>{session.trackCount ?? 0} track{session.trackCount === 1 ? "" : "s"}</span>
          </div>

          {isOpen ? (
            <ChevronUp size={18} className="opacity-60" />
          ) : (
            <ChevronDown size={18} className="opacity-60" />
          )}
        </div>
      </div>

      {/* Expanded Tracks List */}
      {isOpen && (
        <div className="p-4 pt-0 border-t border-base-content/5 bg-base-300/10">
          {loading ? (
            <div className="py-6 flex items-center justify-center gap-2 text-sm opacity-50">
              <Loader2 className="animate-spin text-primary" size={16} />
              Loading peer catalog...
            </div>
          ) : tracks.length === 0 ? (
            <div className="py-6 text-center text-xs opacity-40">
              This peer is not sharing any tracks.
            </div>
          ) : (
            <div className="space-y-2 mt-3 max-h-[360px] overflow-y-auto pr-1">
              {tracks.map((track) => (
                <PeerTrackCard
                  key={track.id}
                  track={track}
                  sessionId={session.id}
                  sessionUsername={session.username}
                  allowDownloadsGlobal={allowDownloadsGlobal && session.allow_downloads !== 0}
                  queue={tracks}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
