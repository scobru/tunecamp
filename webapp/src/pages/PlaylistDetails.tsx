import { confirm } from '@/utils/confirm';
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
  Plus,
  ArrowLeft,
  Download,
} from "lucide-react";
import { formatDuration } from "../utils/format";
import { notify } from "../utils/notify";
import { AddTrackToUserPlaylistModal } from "../components/modals/AddTrackToUserPlaylistModal";
import type { Playlist, Track, UserPlaylistTrack } from "../types";

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

/**
 * Single detail page for every playlist: genre mixes, public playlists and the
 * user's own. Edit affordances follow ownership (or admin auth), not the route.
 */
const PlaylistDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const { user, isAuthenticated, isAdminAuthenticated, isLoading: authLoading } = useAuthStore();
  const { playTrack } = usePlayerStore();

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

  useEffect(() => {
    // Wait for auth to finish loading so the session token is attached
    if (id && !authLoading) loadPlaylist(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, authLoading]);

  const isGenreMix = !!id?.startsWith("genre:");
  const isOwner =
    isAuthenticated && playlist != null && 'username' in playlist && user?.username === (playlist as any).username;
  const canEdit = !isGenreMix && (isOwner || isAdminAuthenticated);

  const handleDelete = async () => {
    if (
      !playlist ||
      !await confirm(
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

  const handleRemoveTrack = async (trackId: string | number) => {
    if (!playlist) return;
    if (!await confirm("Remove track from playlist?")) return;
    try {
      await API.removeTrackFromPlaylist(String(playlist.id), String(trackId));
      loadPlaylist(String(playlist.id));
      notify.success("Track removed from playlist");
    } catch (e) {
      console.error(e);
      notify.error(e, "Failed to remove track");
    }
  };

  const handleToggleVisibility = async () => {
    if (!playlist) return;
    try {
      const newStatus = !playlist.isPublic;
      await API.updatePlaylist(String(playlist.id), { isPublic: newStatus });
      setPlaylist({ ...playlist, isPublic: newStatus });
      notify.success(`Playlist is now ${newStatus ? "Public" : "Private"}`);
    } catch (e) {
      console.error(e);
      notify.error(e, "Failed to update playlist visibility");
    }
  };

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
    if (!playlist || !canEdit) return;
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

  const handlePlayTrack = (track: Track | UserPlaylistTrack) => {
    if (!playlist || !playlist.tracks) return;
    playTrack(toPlayableTrack(track), playlist.tracks.map(toPlayableTrack));
  };

  const handlePlayAll = () => {
    if (!playlist || !playlist.tracks || !playlist.tracks.length) return;
    const allPlayable = playlist.tracks.map(toPlayableTrack);
    playTrack(allPlayable[0], allPlayable);
  };

  if (loading || authLoading)
    return (
      <div className="text-center opacity-50 py-12">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
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

  const customCover = (playlist as any).coverUrl || playlist.coverPath;

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

      {/* Back button */}
      <button
        onClick={() => navigate("/playlists")}
        className="btn btn-ghost btn-sm gap-2 -ml-2 opacity-60 hover:opacity-100"
      >
        <ArrowLeft size={16} /> Playlists
      </button>

      <div className="flex flex-col md:flex-row gap-8 items-end">
        <div className="w-52 h-52 rounded-2xl shadow-level-1 shrink-0 overflow-hidden relative group">
          {customCover ? (
            <img
              src={customCover}
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
            <img src={trackCovers[0]} className="w-full h-full object-cover" alt="Playlist Cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-base-100/50">
              <Music size={64} />
            </div>
          )}
          {canEdit && (
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
          {playlist.description && (
            <p className="opacity-70 text-lg mb-4 line-clamp-3">
              {playlist.description}
            </p>
          )}

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

          <div className="mt-6 flex flex-wrap gap-2">
            {canEdit && (
              <>
                {isOwner && (
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
                )}
                <button
                  className={`btn btn-sm btn-outline gap-2 ${playlist.isPublic ? "btn-secondary" : "btn-ghost"}`}
                  onClick={handleToggleVisibility}
                >
                  {playlist.isPublic ? <Lock size={16} /> : <Globe size={16} />}
                  {playlist.isPublic ? "Make Private" : "Make Public"}
                </button>
                <button
                  className="btn btn-error btn-sm btn-outline gap-2"
                  onClick={handleDelete}
                >
                  <Trash2 size={16} /> Delete Playlist
                </button>
              </>
            )}
            {playlist.isPublic && (
              <button
                className="btn btn-sm btn-outline gap-2"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  notify.success("Playlist link copied to clipboard!");
                }}
              >
                Copy Link
              </button>
            )}
          </div>
        </div>

        <button
          className="btn btn-primary btn-circle btn-lg shadow-level-1 hover:scale-105 transition-transform"
          onClick={handlePlayAll}
          disabled={!playlist.tracks || playlist.tracks.length === 0}
        >
          <Play size={32} className="ml-1" />
        </button>
      </div>

      <div className="overflow-x-auto bg-base-200/30 rounded-xl border border-base-content/5">
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
                      onClick={() => handlePlayTrack(track)}
                      className="hidden group-hover:flex items-center justify-center w-full"
                    >
                      <Play size={12} fill="currentColor" />
                    </button>
                  </td>
                  <td>
                    <div className="font-bold">{track.title}</div>
                    <div className="text-xs opacity-50">{track.artistName}</div>
                  </td>
                  <td className="opacity-60 text-sm">
                    {(track as any).source === "network" ? (
                      <div className="badge badge-sm gap-1 badge-secondary badge-outline">
                        <Globe size={10} />
                        {(track as any).siteName || "Network"}
                      </div>
                    ) : (
                      track.albumName
                    )}
                  </td>
                  <td className="text-right opacity-50 font-mono text-xs">
                    {formatDuration(track.duration)}
                  </td>
                  <td className="w-12 text-right">
                    {canEdit && (
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isOwner && (
                          <a
                            href={API.getTrackDownloadUrl(track.id)}
                            target="_blank"
                            className="btn btn-ghost btn-xs btn-circle text-success flex items-center justify-center tooltip tooltip-top"
                            data-tip="Download Track"
                          >
                            <Download size={16} />
                          </a>
                        )}
                        <button
                          className="btn btn-ghost btn-xs btn-circle text-error tooltip tooltip-left"
                          onClick={() => handleRemoveTrack(track.id)}
                          data-tip="Remove Track"
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
                  {isOwner && (
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
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Track Modal (owner only) */}
      {id && playlist && isOwner && (
        <AddTrackToUserPlaylistModal
          playlistId={id}
          onAdded={() => id && loadPlaylist(id)}
          existingTrackIds={playlist.tracks?.map(t => String(t.id)) || []}
        />
      )}
    </div>
  );
};

export default PlaylistDetails;
