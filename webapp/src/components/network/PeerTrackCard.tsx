import { memo, useState } from "react";
import { Play, Pause, Download, Library, Loader2 } from "lucide-react";
import { usePlayerStore } from "../../stores/usePlayerStore";
import { useAuthStore } from "../../stores/useAuthStore";
import { formatDuration } from "../../utils/format";
import API from "../../services/api";

interface PeerTrack {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  file_size?: number;
  mime_type?: string;
  allow_download?: number;
}

interface PeerTrackCardProps {
  track: PeerTrack;
  sessionId: string;
  sessionUsername: string;
  allowDownloadsGlobal: boolean;
  queue: PeerTrack[];
}

export const PeerTrackCard = memo(({
  track,
  sessionId,
  sessionUsername,
  allowDownloadsGlobal,
  queue
}: PeerTrackCardProps) => {
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayerStore();
  const role = useAuthStore((s) => s.role);
  const canImport = role === "root_admin" || role === "admin";
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  const peerTrackId = `peer:${sessionId}:${track.id}`;
  const isCurrent = currentTrack?.id === peerTrackId;
  const isCurrentlyPlaying = isCurrent && isPlaying;

  const playerTrack = {
    id: peerTrackId,
    title: track.title,
    artistName: track.artist || sessionUsername || "Unknown Artist",
    albumTitle: track.album || "Peer Share",
    streamUrl: `/api/peers/${sessionId}/tracks/${track.id}/stream?token=${API.getToken()}`,
    coverUrl: "",
    coverImage: "",
    duration: track.duration || 0,
    service: "peer",
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrent) {
      togglePlay();
    } else {
      // Map entire queue to player tracks so user can skip between them
      const playerQueue = queue.map((t) => ({
        id: `peer:${sessionId}:${t.id}`,
        title: t.title,
        artistName: t.artist || sessionUsername || "Unknown Artist",
        albumTitle: t.album || "Peer Share",
        streamUrl: `/api/peers/${sessionId}/tracks/${t.id}/stream?token=${API.getToken()}`,
        coverUrl: "",
        coverImage: "",
        duration: t.duration || 0,
        service: "peer",
      }));
      playTrack(playerTrack as any, playerQueue as any);
    }
  };

  const downloadUrl = `/api/peers/${sessionId}/tracks/${track.id}/download?token=${API.getToken()}`;
  const canDownload = allowDownloadsGlobal && track.allow_download !== 0;

  const handleImport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (importing || imported) return;
    setImporting(true);
    try {
      await API.importPeerTrack(sessionId, track.id);
      setImported(true);
    } catch (err) {
      console.error("Failed to import peer track:", err);
      alert("Failed to import track into the library.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      onClick={handlePlayClick}
      className={`flex items-center gap-4 p-3 rounded-xl border transition-all cursor-pointer group ${
        isCurrent
          ? "bg-primary/10 border-primary/30 shadow-md shadow-primary/5"
          : "bg-base-200/40 border-base-content/5 hover:bg-base-200/80 hover:border-base-content/10"
      }`}
    >
      {/* Play / Status Icon */}
      <button
        onClick={handlePlayClick}
        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-all ${
          isCurrent
            ? "bg-primary text-primary-content"
            : "bg-base-300 opacity-80 group-hover:opacity-100 group-hover:bg-primary group-hover:text-primary-content"
        }`}
      >
        {isCurrentlyPlaying ? (
          <Pause size={18} className="fill-current" />
        ) : (
          <Play size={18} className="fill-current ml-0.5" />
        )}
      </button>

      {/* Track Info */}
      <div className="flex-1 min-w-0">
        <h4 className={`font-bold text-sm truncate ${isCurrent ? "text-primary" : ""}`}>
          {track.title}
        </h4>
        <div className="text-xs opacity-60 truncate flex items-center gap-1.5 mt-0.5">
          <span>{track.artist || sessionUsername || "Unknown Artist"}</span>
          {track.album && (
            <>
              <span className="opacity-45">•</span>
              <span className="italic">{track.album}</span>
            </>
          )}
        </div>
      </div>

      {/* Metadata & Actions */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs font-mono opacity-50">
          {formatDuration(track.duration || 0)}
        </span>

        {canImport && canDownload && (
          <button
            onClick={handleImport}
            disabled={importing || imported}
            className="btn btn-xs btn-ghost btn-circle opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity tooltip tooltip-left"
            data-tip={imported ? "Imported into library" : "Import into library"}
          >
            {importing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Library size={14} className={imported ? "text-success" : "opacity-70 hover:opacity-100"} />
            )}
          </button>
        )}

        {canDownload && (
          <a
            href={downloadUrl}
            download={`${track.artist || sessionUsername} - ${track.title}`}
            onClick={(e) => e.stopPropagation()}
            className="btn btn-xs btn-ghost btn-circle opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity tooltip tooltip-left"
            data-tip="Download Track"
          >
            <Download size={14} className="opacity-70 hover:opacity-100" />
          </a>
        )}
      </div>
    </div>
  );
});

PeerTrackCard.displayName = "PeerTrackCard";
