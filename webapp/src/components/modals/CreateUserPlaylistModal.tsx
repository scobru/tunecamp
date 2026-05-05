import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "../../stores/useAuthStore";
import { API } from "../../services/api";
import { Save, Heart } from "lucide-react";

import type { UserPlaylist, Playlist } from "../../types";

export const CreateUserPlaylistModal = ({
  onCreated,
}: {
  onCreated?: (playlist: Playlist | UserPlaylist) => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const { isAuthenticated } = useAuthStore();
  const [error, setError] = useState("");

  useEffect(() => {
    const handleOpen = () => {
      if (isAuthenticated) {
        dialogRef.current?.showModal();
      }
    };
    document.addEventListener("open-create-user-playlist-modal", handleOpen);
    return () =>
      document.removeEventListener(
        "open-create-user-playlist-modal",
        handleOpen,
      );
  }, [isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setLoading(true);
    setError("");

    try {
      const newPlaylist = await API.createPlaylist(
        name,
        description,
        isPublic
      );
      onCreated?.(newPlaylist);
      dialogRef.current?.close();
      setName("");
      setDescription("");
      setIsPublic(false);
    } catch (e: any) {
      setError(e.message || "Failed to create playlist");
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <dialog id="create-user-playlist-modal" className="modal" ref={dialogRef}>
      <div className="modal-box bg-base-100 border border-base-content/5">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
            ✕
          </button>
        </form>

        <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
          <Heart size={24} className="text-pink-400" /> Create Playlist
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">Name</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="My Awesome Playlist"
              autoFocus
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">Description</span>
            </label>
            <textarea
              className="textarea textarea-bordered h-24"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
            />
          </div>

          <div className="form-control">
            <label className="label cursor-pointer justify-start gap-4">
              <input
                type="checkbox"
                className="checkbox checkbox-primary"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              <span className="label-text">
                Make playlist public (visible to everyone)
              </span>
            </label>
          </div>

          {error && <div className="text-error text-sm">{error}</div>}

          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary gap-2"
              disabled={loading}
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm"></span>
              ) : (
                <Save size={16} />
              )}
              Create
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
};

