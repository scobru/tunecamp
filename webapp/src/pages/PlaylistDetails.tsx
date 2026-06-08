import { useState, useEffect } from "react";
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
} from "lucide-react";
import { formatDuration } from "../utils/format";
import type { Playlist } from "../types";

const PlaylistDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
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
      navigate("/playlists");
    } catch (e) {
      console.error(e);
      alert("Failed to delete playlist");
    }
  };

  const handleRemoveTrack = async (trackId: string) => {
    if (!playlist) return;
    if (!confirm("Remove track from playlist?")) return;
    try {
      await API.removeTrackFromPlaylist(String(playlist.id), trackId);
      loadPlaylist(String(playlist.id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditCover = async () => {
    if (!playlist || !isAdminAuthenticated) return;
    const url = window.prompt(
      "Enter the URL or path for the playlist cover image:",
      playlist.coverPath || "",
    );
    if (url === null) return; // user cancelled
    try {
      await API.updatePlaylist(String(playlist.id), { coverPath: url });
      setPlaylist({ ...playlist, coverPath: url });
    } catch (e) {
      console.error(e);
      alert("Failed to update playlist cover");
    }
  };

  if (loading)
    return (
      <div className="text-center opacity-50 py-12">Loading playlist...</div>
    );
  if (!playlist) return null;

  return (
    <div className="space-y-8 animate-fade-in p-6">
      <div className="flex flex-col md:flex-row gap-8 items-end">
        <div className="w-52 h-52 bg-gradient-to-br from-primary to-secondary rounded-2xl shadow-level-1 flex items-center justify-center text-6xl text-base-100/50 shrink-0 overflow-hidden relative group">
          {playlist.coverPath ? (
            <img
              src={playlist.coverPath}
              className="w-full h-full object-cover"
              alt="Playlist Cover"
            />
          ) : (
            <Music size={64} />
          )}
          {isAdminAuthenticated && !id?.startsWith("genre:") && (
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
          <div className="text-xs font-bold tracking-normal opacity-70 mb-2">
            Playlist
          </div>
          <h1 className="text-4xl lg:text-6xl font-black tracking-tighter mb-4 leading-tight">
            {playlist.name}
          </h1>
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
                  } catch (e) {
                    console.error(e);
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
                        className="btn btn-ghost btn-xs btn-circle text-error opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove Track"
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

