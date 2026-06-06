import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";
import { usePlayerStore } from "../stores/usePlayerStore";
import API from "../services/api";
import {
  Music,
  Play,
  Trash2,
  Clock,
  Plus,
  Heart,
  ArrowLeft,
  Unlock,
  Lock,
  Download,
  Image as ImageIcon,
  Globe
} from "lucide-react";
import type { UserPlaylist, Playlist, UserPlaylistTrack, Track } from "../types";
import { AddTrackToUserPlaylistModal } from "../components/modals/AddTrackToUserPlaylistModal";
import { formatDuration } from "../utils/format";

/**
 * Convert a UserPlaylistTrack to a playable Track object for the player store
 */
function toPlayableTrack(t: Track | UserPlaylistTrack): Track {
  if ('streamUrl' in t && t.streamUrl) {
    return t as Track;
  }
  
  // Local track from DB
  const track = t as Track;
  return {
    ...track,
    streamUrl: API.getStreamUrl(String(track.id)),
    coverUrl: track.albumId ? API.getAlbumCoverUrl(String(track.albumId)) : undefined
  };
}

const MyPlaylistDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<Playlist | UserPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated, user, isLoading: authLoading } = useAuthStore();
  const { playTrack } = usePlayerStore();

  useEffect(() => {
    // Wait for auth to finish loading so Zen session is recalled if available
    if (id && !authLoading) {
      loadPlaylist(id);
    }
  }, [id, authLoading]);

  const loadPlaylist = async (playlistId: string) => {
    setLoading(true);
    try {
      const data = await API.getPlaylist(playlistId);
      setPlaylist(data);
    } catch (e) {
      console.error("[Playlist] Load error:", e);
      navigate("/my-playlists");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (
      !playlist ||
      !confirm(
        "Are you sure you want to delete this playlist? This cannot be undone.",
      )
    )
      return;
    try {
      await API.deletePlaylist(String(playlist.id));
      navigate("/my-playlists");
    } catch (e) {
      console.error(e);
      alert("Failed to delete playlist");
    }
  };

  const handleRemoveTrack = async (trackId: string | number) => {
    if (!playlist) return;
    if (!confirm("Remove track from playlist?")) return;
    try {
      await API.removeTrackFromPlaylist(String(playlist.id), String(trackId));
      loadPlaylist(String(playlist.id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleVisibility = async () => {
    if (!playlist) return;
    try {
      await API.updatePlaylist(String(playlist.id), { isPublic: !playlist.isPublic });
      setPlaylist({ ...playlist, isPublic: !playlist.isPublic });
    } catch (e) {
      console.error(e);
      alert("Failed to update playlist visibility");
    }
  };

  const handleEditCover = async () => {
    if (!playlist) return;
    const currentCover = (playlist as any).coverUrl || (playlist as any).coverPath || "";
    const url = window.prompt(
      "Enter the URL for the playlist cover image:",
      currentCover,
    );
    if (url === null) return; // cancelled
    try {
      await API.updatePlaylist(String(playlist.id), { coverPath: url });
      setPlaylist({ ...playlist, coverUrl: url, coverPath: url } as any);
    } catch (e) {
      console.error(e);
      alert("Failed to update playlist cover");
    }
  };

  const handlePlayTrack = (track: Track | UserPlaylistTrack) => {
    if (!playlist || !playlist.tracks) return;
    const playable = toPlayableTrack(track);
    const allPlayable = playlist.tracks.map(toPlayableTrack);
    playTrack(playable, allPlayable);
  };

  const handlePlayAll = () => {
    if (!playlist || !playlist.tracks || !playlist.tracks.length) return;
    const allPlayable = playlist.tracks.map(toPlayableTrack);
    playTrack(allPlayable[0], allPlayable);
  };

  const isOwner = isAuthenticated && playlist != null && 'username' in playlist && user?.username === playlist.username;

  if (loading || authLoading)
    return (
      <div className="text-center opacity-50 py-12">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        {authLoading && <p className="mt-4 text-xs">Waiting for session...</p>}
      </div>
    );
  if (!playlist) return null;

  return (
    <div className="space-y-8 animate-fade-in p-6">
      {/* Back button */}
      <button
        onClick={() => navigate("/my-playlists")}
        className="btn btn-ghost btn-sm gap-2 -ml-2 opacity-60 hover:opacity-100"
      >
        <ArrowLeft size={16} /> My Playlists
      </button>

      {/* Hero */}
      <div className="flex flex-col md:flex-row gap-8 items-end">
        <div className="w-52 h-52 bg-gradient-to-br from-pink-500/30 to-purple-500/30 rounded-2xl shadow-2xl flex items-center justify-center shrink-0 overflow-hidden relative group">
          {(playlist as any).coverUrl || (playlist as any).coverPath ? (
            <img
              src={(playlist as any).coverUrl || (playlist as any).coverPath}
              className="w-full h-full object-cover"
              alt="Playlist Cover"
            />
          ) : (
            <Heart size={64} className="text-pink-300/50" />
          )}
          {isOwner && (
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <button
                className="btn btn-sm btn-circle btn-ghost text-white"
                onClick={handleEditCover}
                title="Edit Cover"
              >
                <ImageIcon size={20} />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="uppercase text-xs font-bold tracking-widest opacity-70 mb-2 flex items-center gap-2">
            <Heart size={12} className="text-pink-400" /> Personal Playlist
          </div>
          <h1 className="text-4xl lg:text-6xl font-black tracking-tighter mb-4 leading-tight">
            {playlist.name}
          </h1>
          {playlist.description && (
            <p className="opacity-70 text-lg mb-4 line-clamp-3">
              {playlist.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <div className="opacity-70">{playlist.trackCount} tracks</div>
            <span className="opacity-50">•</span>
            <div className="opacity-50">
              Created {new Date(playlist.createdAt).toLocaleDateString()}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {isOwner && (
              <>
                <button
                  className="btn btn-sm btn-primary gap-2"
                  onClick={() =>
                    document.dispatchEvent(
                      new CustomEvent("open-add-track-to-user-playlist-modal"),
                    )
                  }
                >
                  <Plus size={16} /> Add Tracks
                </button>
                <button
                  className="btn btn-error btn-sm btn-outline gap-2"
                  onClick={handleDelete}
                >
                  <Trash2 size={16} /> Delete Playlist
                </button>
                <button
                  className={`btn btn-sm btn-outline gap-2 ${playlist.isPublic ? "btn-success" : "text-opacity-70"}`}
                  onClick={handleToggleVisibility}
                  title={
                    playlist.isPublic
                      ? "Visible to everyone"
                      : "Only visible to you"
                  }
                >
                  {playlist.isPublic ? (
                    <Unlock size={16} />
                  ) : (
                    <Lock size={16} />
                  )}
                  {playlist.isPublic ? "Public" : "Private"}
                </button>
              </>
            )}
            <button
              className="btn btn-sm btn-outline gap-2"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                // Optional: show a quick toast/alert
              }}
            >
              Copy Link
            </button>
          </div>
        </div>

        <button
          className="btn btn-primary btn-circle btn-lg shadow-xl hover:scale-105 transition-transform"
          onClick={handlePlayAll}
          disabled={!playlist.tracks || playlist.tracks.length === 0}
        >
          <Play size={32} className="ml-1" />
        </button>
      </div>

      {/* Track list */}
      <div className="overflow-x-auto bg-base-200/30 rounded-xl border border-base-content/5">
        <table className="table w-full">
          <thead>
            <tr className="border-b border-base-content/10 text-xs uppercase opacity-50">
              <th className="w-12 text-center">#</th>
              <th>Title</th>
              <th>Source</th>
              <th className="text-right">
                <Clock size={16} />
              </th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {playlist.tracks &&
              playlist.tracks.map((track, i) => (
                <tr
                  key={`${track.id}-${i}`}
                  className="hover:bg-base-content/5 group border-b border-base-content/5 last:border-0"
                >
                  <td className="text-center opacity-50 font-mono w-12 group-hover:text-primary">
                    <span className="group-hover:hidden">{i + 1}</span>
                    <button
                      onClick={() => handlePlayTrack(track)}
                      className="hidden group-hover:flex items-center justify-center w-full"
                    >
                      <Play size={12} fill="currentColor" />
                    </button>
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-bold flex items-center gap-2">
                          {track.title}
                        </div>
                        <div className="text-xs opacity-50">
                          {track.artistName}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div
                      className={`badge badge-sm gap-1 ${(track as any).source === "network" ? "badge-secondary" : "badge-primary"} badge-outline`}
                    >
                      {(track as any).source === "network" ? (
                        <Globe size={10} />
                      ) : (
                        <Music size={10} />
                      )}
                      {(track as any).source === "network"
                        ? (track as any).siteName || "Network"
                        : "TuneCamp"}
                    </div>
                  </td>
                  <td className="text-right opacity-50 font-mono text-xs">
                    {formatDuration(track.duration)}
                  </td>
                  <td className="w-12 text-right">
                    {isOwner && (
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a
                          href={API.getTrackDownloadUrl(track.id)}
                          target="_blank"
                          className="btn btn-ghost btn-xs btn-circle text-success flex items-center justify-center"
                          title="Download Track"
                        >
                          <Download size={16} />
                        </a>
                        <button
                          className="btn btn-ghost btn-xs btn-circle text-error"
                          onClick={() => handleRemoveTrack(track.id)}
                          title="Remove Track"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            {(!playlist.tracks || playlist.tracks.length === 0) && (
              <tr>
                <td colSpan={5} className="text-center py-12 opacity-50">
                  <Music size={32} className="mx-auto mb-3 opacity-40" />
                  <p>No tracks in this playlist yet.</p>
                  <button
                    className="btn btn-primary btn-sm gap-2 mt-4"
                    onClick={() =>
                      document.dispatchEvent(
                        new CustomEvent(
                          "open-add-track-to-user-playlist-modal",
                        ),
                      )
                    }
                  >
                    <Plus size={14} /> Add your first track
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Track Modal */}
      {id && playlist && (
        <AddTrackToUserPlaylistModal
          playlistId={id}
          onAdded={() => id && loadPlaylist(id)}
          existingTrackIds={playlist.tracks?.map(t => {
            if ('source' in t && (t as any).source === 'network' && (t as any).siteUrl) {
               // Map network tracks back to their composite IDs if needed
               // But usually we can just use their ID if it's the composite one
               return String(t.id);
            }
            return String(t.id);
          }) || []}
        />
      )}
    </div>
  );
};

export default MyPlaylistDetails;

