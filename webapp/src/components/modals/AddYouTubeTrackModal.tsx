import { useState, useRef, useEffect } from "react";
import API from "../../services/api";
import { Youtube, Search } from "lucide-react";

export const AddYouTubeTrackModal = ({
  albumId,
  onComplete,
}: {
  albumId?: number;
  onComplete?: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const handleOpen = () => {
      setUrl("");
      setError("");
      setSuccess("");
      setLoading(false);
      dialogRef.current?.showModal();
    };

    document.addEventListener("open-add-youtube-modal", handleOpen as EventListener);
    return () => document.removeEventListener("open-add-youtube-modal", handleOpen as EventListener);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await API.createYouTubeTrack(url, albumId);
      setSuccess("Track added to your library successfully!");
      setUrl("");
      if (onComplete) {
          onComplete();
          // Dispatch global refresh event
          window.dispatchEvent(new CustomEvent("refresh-admin-tracks"));
      }
      
      // Close modal after success delay
      setTimeout(() => dialogRef.current?.close(), 1500);
    } catch (err: any) {
      setError(err.message || "Failed to add track from YouTube");
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog id="add-youtube-modal" className="modal" ref={dialogRef}>
      <div className="modal-box bg-base-100 border border-base-content/5">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
            Ô£ò
          </button>
        </form>

        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Youtube size={24} className="text-red-500" /> Add from YouTube
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-control">
            <p className="text-sm opacity-70 mb-4">
              Enter a YouTube URL to fetch the song and add it to your library. 
              The track will be streamed directly from YouTube.
            </p>
            <label className="label">
              <span className="label-text">YouTube Video URL</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="https://www.youtube.com/watch?v=..."
                className="input input-bordered w-full"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                required
              />
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={loading || !url}
              >
                {loading ? <span className="loading loading-spinner loading-xs"></span> : <Search size={18} />}
                Add
              </button>
            </div>
          </div>

          {error && <div className="alert alert-error py-2 text-sm">{error}</div>}
          {success && <div className="alert alert-success py-2 text-sm">{success}</div>}

          <div className="modal-action">
             <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Cancel</button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
};

