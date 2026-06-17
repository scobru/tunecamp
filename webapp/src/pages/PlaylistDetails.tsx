import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { usePlayerStore } from "../stores/usePlayerStore";
import {
  Music,
  Play,
  Clock,
  Trash2,
  Globe,
  Lock,
  Image as ImageIcon,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { formatDuration } from "../utils/format";
import { notify } from "../utils/notify";
import type { Playlist } from "../types";

const PlaylistDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const { isAdminAuthenticated } = useAuthStore();
  const { playTrack } = usePlayerStore();

  useEffect(() => {
    if (id) loadPlaylist(id);
  }, [id]);

  const loadPlaylist = async (playlistId: string) => {
    setLoading(true);
    try {
      const data = await API.getPlaylist(playlistId);
      setPlaylist(data);
    } catch (e) {
      console.error(e);
      navigate("/playlists");
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
      notify.success("Playlist deleted successfully");
      navigate("/playlists");
    } catch (e) {
      console.error(e);
      notify.error(e, "Failed to delete playlist");
    }
  };

  const handleRemoveTrack = async (trackId: string) => {
    if (!playlist) return;
    if (!confirm("Remove track from playlist?")) return;
    try {
      await API.removeTrackFromPlaylist(String(playlist.id), trackId);
      loadPlaylist(String(playlist.id));
      notify.success("Track removed from playlist");
    } catch (e) {
      console.error(e);
      notify.error(e, "Failed to remove track");
    }
  };

  const canEdit = isAdminAuthenticated && !id?.startsWith("genre:");

  const startRename = () => {
    if (!playlist) return;
    setNameDraft(playlist.name);
    setIsEditingName(true);
  };

  const handleRename = async () => {
    if (!playlist) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      notify.error(new Error("Name cannot be empty"), "Rename failed");
      return;
    }
    if (trimmed === playlist.name) {
      setIsEditingName(false);
      return;
    }
    try {
      await API.updatePlaylist(String(playlist.id), { name: trimmed });
      setPlaylist({ ...playlist, name: trimmed });
      setIsEditingName(false);
      notify.success("Playlist renamed");
    } catch (e) {
      console.error(e);
      notify.error(e, "Failed to rename playlist");
    }
  };

  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleEditCover = () => {
    if (!playlist || !isAdminAuthenticated || id?.startsWith("genre:")) return;
    coverInputRef.current?.click();
  };

  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !playlist) return;
    try {
      const res = await API.uploadPlaylistCover(String(playlist.id), file);
      // Bust the browser cache by appending a timestamp
      setPlaylist({ ...playlist, coverPath: res.coverPath + `?v=${Date.now()}` });
      notify.success("Playlist cover updated");
    } catch (err) {
      notify.error(err, "Failed to upload cover");
    }
    e.target.value = "";
  };

  if (loading)
    return (
      <div className="text-center opacity-50 py-12">Loading playlist...</div>
    );
  if (!playlist) return null;

  // Collect unique track cover URLs for the collage (up to 4)
  const trackCovers = Array.from(
    new Map(
      (playlist.tracks ?? [])
        .filter((t: any) => t.album_id || t.albumId)
        .map((t: any) => [t.album_id ?? t.albumId, `/api/tracks/${t.id}/cover`])
    ).values()
  ).slice(0, 4);

  return (
    <div className="space-y-8 animate-fade-in p-6">
      {/* Hidden file input for cover upload */}
      <input
        ref={coverInputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={handleCoverFileChange}
      />

      <div className="flex flex-col md:flex-row gap-8 items-end">
        <div className="w-52 h-52 rounded-2xl shadow-level-1 shrink-0 overflow-hidden relative group">
          {playlist.coverPath ? (
            // Custom cover set by admin
            <img
              src={playlist.coverPath}
              className="w-full h-full object-cover"
              alt="Playlist Cover"
            />
          ) : trackCovers.length >= 4 ? (
            // 2×2 collage with first 4 distinct album covers
            <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
              {trackCovers.map((url, i) => (
                <img key={i} src={url} className="w-full h-full object-cover" alt="" />
              ))}
            </div>
          ) : trackCovers.length > 0 ? (
            // Fewer than 4 covers — show the first one full-size
            <img src={trackCovers[0]} className="w-full h-full object-cover" alt="Playlist Cover" />
          ) : (
            // No covers available — gradient placeholder
            <div className="w-full h-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-base-100/50">
              <Music size={64} />
            </div>
          )}
          {isAdminAuthenticated && !id?.startsWith("genre:") && (
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <button
                className="btn btn-sm btn-circle btn-ghost text-white tooltip tooltip-top"
                onClick={handleEditCover}
                data-tip="Upload Cover"
              >
                <ImageIcon size={20} />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold tracking-normal opacity-70 mb-2">
            Playlist
          </div>
          {isEditingName ? (
            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") setIsEditingName(false);
                }}
                className="input input-bordered text-3xl lg:text-5xl font-black tracking-tighter h-auto py-2 w-full max-w-2xl"
              />
              <button
                className="btn btn-sm btn-circle btn-success"
                onClick={handleRename}
                data-tip="Save"
              >
                <Check size={18} />
              </button>
              <button
                className="btn btn-sm btn-circle btn-ghost"
                onClick={() => setIsEditingName(false)}
                data-tip="Cancel"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <h1 className="text-4xl lg:text-6xl font-black tracking-tighter mb-4 leading-tight flex items-center gap-3 group/title">
              {playlist.name}
              {canEdit && (
                <button
                  className="btn btn-sm btn-circle btn-ghost opacity-0 group-hover/title:opacity-100 transition-opacity tooltip tooltip-top"
                  onClick={startRename}
                  data-tip="Rename"
                >
                  <Pencil size={18} />
                </button>
              )}
            </h1>
          )}
          <p className="opacity-70 text-lg mb-4 line-clamp-3">
            {playlist.description}
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <div className="badge badge-ghost gap-1">
              {playlist.isPublic ? <Globe size={12} /> : <Lock size={12} />}
              {playlist.isPublic ? "Public" : "Private"}
            </div>
            <span className="opacity-50">•</span>
            <div className="opacity-70">{playlist.trackCount} tracks</div>
            <span className="opacity-50">•</span>
            <div className="opacity-50">
              Created {new Date(playlist.createdAt).toLocaleDateString()}
            </div>
          </div>

          {isAdminAuthenticated && !id?.startsWith("genre:") && (
            <div className="mt-6 flex gap-2">
              <button
                className={`btn btn-sm btn-outline gap-2 ${playlist.isPublic ? "btn-secondary" : "btn-ghost"}`}
                onClick={async () => {
                  if (!playlist) return;
                  try {
                    await API.updatePlaylist(String(playlist.id), {
                      isPublic: !playlist.isPublic,
                    });
                    loadPlaylist(String(playlist.id));
                    notify.success(`Playlist is now ${!playlist.isPublic ? "Public" : "Private"}`);
                  } catch (e) {
                    console.error(e);
                    notify.error(e, "Failed to update playlist visibility");
                  }
                }}
              >
                {playlist.isPublic ? <Globe size={16} /> : <Lock size={16} />}
                {playlist.isPublic ? "Make Private" : "Make Public"}
              </button>
              <button
                className="btn btn-error btn-sm btn-outline gap-2"
                onClick={handleDelete}
              >
                <Trash2 size={16} /> Delete Playlist
              </button>
            </div>
          )}
        </div>

        <button
          className="btn btn-primary btn-circle btn-lg shadow-level-1 hover:scale-105 transition-transform"
          onClick={() => {
            if (playlist.tracks && playlist.tracks.length > 0) {
              playTrack(playlist.tracks[0], playlist.tracks);
            }
          }}
          disabled={!playlist.tracks || playlist.tracks.length === 0}
        >
          <Play size={32} className="ml-1" />
        </button>
      </div>

      <div className="overflow-visible bg-base-200/30 rounded-xl border border-base-content/5">
        <table className="table w-full">
          <thead>
            <tr className="border-b border-base-content/10 text-xs opacity-50">
              <th className="w-12 text-center">#</th>
              <th>Title</th>
              <th>Album</th>
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
                      onClick={() => playTrack(track, playlist.tracks!)}
                      className="hidden group-hover:flex items-center justify-center w-full"
                    >
                      <Play size={12} fill="currentColor" />
                    </button>
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-bold">{track.title}</div>
                        <div className="text-xs opacity-50">
                          {track.artistName}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="opacity-60 text-sm">{track.albumName}</td>
                  <td className="text-right opacity-50 font-mono text-xs">
                    {formatDuration(track.duration)}
                  </td>
                  <td>
                    {isAdminAuthenticated && !id?.startsWith("genre:") && (
                      <button
                        onClick={() => handleRemoveTrack(String(track.id))}
                        className="btn btn-ghost btn-xs btn-circle text-error opacity-0 group-hover:opacity-100 transition-opacity tooltip tooltip-left"
                        data-tip="Remove Track"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            {(!playlist.tracks || playlist.tracks.length === 0) && (
              <tr>
                <td colSpan={5} className="text-center py-12 opacity-50">
                  No tracks in this playlist yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PlaylistDetails;

