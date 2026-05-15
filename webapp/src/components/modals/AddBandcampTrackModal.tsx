import { useState, useRef, useEffect } from "react";
import API from "../../services/api";
import { Search, Music } from "lucide-react";
import type { Track } from "../../types";

export const AddBandcampTrackModal = ({
  albumId,
  onAdd
}: {
  albumId?: number;
  onAdd?: (track: Track) => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [metadata, setMetadata] = useState<any>(null);

  useEffect(() => {
    const handleOpen = () => {
      setUrl("");
      setError("");
      setSuccess("");
      setMetadata(null);
      dialogRef.current?.showModal();
    };

    document.addEventListener("open-add-bandcamp-modal", handleOpen);
    return () => document.removeEventListener("open-add-bandcamp-modal", handleOpen);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError("");
    setMetadata(null);

    try {
      const data = await API.importBandcamp(url);
      setMetadata(data);
    } catch (e: any) {
      setError(e.message || "Failed to fetch Bandcamp metadata");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!metadata) return;
    
    setLoading(true);
    setError("");

    try {
      const track = await API.createTrack({
          title: metadata.title,
          url: url,
          service: 'bandcamp',
          externalArtwork: metadata.coverUrl,
          duration: metadata.duration,
          albumId: albumId
      });
      if (onAdd) onAdd(track);
      setSuccess("Bandcamp track added successfully!");
      setTimeout(() => {
        dialogRef.current?.close();
      }, 1500);
    } catch (e: any) {
      setError(e.message || "Failed to add track");
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog id="add-bandcamp-modal" className="modal" ref={dialogRef}>
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Music className="text-[#629aa9]" /> Add Bandcamp Track
        </h3>

        {!metadata ? (
            <form onSubmit={handleSearch}>
            <div className="form-control">
                <label className="label">
                <span className="label-text">Bandcamp Track URL</span>
                </label>
                <div className="flex gap-2">
                <input
                    type="url"
                    placeholder="https://artist.bandcamp.com/track/..."
                    className="input input-bordered w-full"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={loading}
                    required
                />
                <button 
                    type="submit" 
                    className="btn bg-[#629aa9] hover:bg-[#4d7b87] text-white" 
                    disabled={loading || !url}
                >
                    {loading ? <span className="loading loading-spinner loading-xs"></span> : <Search size={18} />}
                    Search
                </button>
                </div>
            </div>

            {error && <div className="alert alert-error py-2 text-sm mt-4">{error}</div>}

            <div className="modal-action">
                <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Cancel</button>
            </div>
            </form>
        ) : (
            <div className="space-y-4">
                <div className="flex items-center gap-4 bg-base-200 p-4 rounded-lg">
                    {metadata.coverUrl ? (
                        <img src={metadata.coverUrl} alt="Cover" className="w-16 h-16 rounded object-cover shadow" />
                    ) : (
                        <div className="w-16 h-16 bg-base-300 rounded flex items-center justify-center">
                            <Music size={24} className="opacity-50" />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="font-bold truncate">{metadata.title}</div>
                        <div className="text-sm opacity-70 truncate">{metadata.artist}</div>
                    </div>
                </div>

                {error && <div className="alert alert-error py-2 text-sm">{error}</div>}
                {success && <div className="alert alert-success py-2 text-sm">{success}</div>}

                <div className="modal-action">
                    <button type="button" className="btn btn-ghost" onClick={() => {
                        setMetadata(null);
                        setError("");
                    }} disabled={loading}>Back</button>
                    <button type="button" className="btn bg-[#629aa9] hover:bg-[#4d7b87] text-white" onClick={handleAdd} disabled={loading}>
                        {loading ? <span className="loading loading-spinner loading-xs"></span> : "Add Track to Release"}
                    </button>
                </div>
            </div>
        )}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
};
