import { useState, useRef, useEffect } from "react";
import API from "../../services/api";
import { Search, Globe, Info } from "lucide-react";

/** Metadata returned by POST /api/import/bandcamp (see extractBandcampMetadata). */
export interface BandcampReleaseMetadata {
  title: string;
  artist: string;
  date?: string;
  cover?: string;
  genre?: string;
  tracks?: { title: string; duration: number; streamUrl?: string; position: number }[];
  url?: string;
}

/**
 * ImportBandcampReleaseModal — imports only the RELEASE metadata (cover art, album
 * title, artist, year, genre) from a Bandcamp album/release URL. It does NOT create
 * or download any tracks: the artist adds tracks manually (Upload Audio) or from the
 * library (Add Library).
 */
export const ImportBandcampReleaseModal = ({
  onImport,
}: {
  onImport?: (metadata: BandcampReleaseMetadata) => void | Promise<void>;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [metadata, setMetadata] = useState<BandcampReleaseMetadata | null>(null);

  useEffect(() => {
    const handleOpen = () => {
      setUrl("");
      setError("");
      setMetadata(null);
      dialogRef.current?.showModal();
    };

    document.addEventListener("open-import-bandcamp-modal", handleOpen);
    return () => document.removeEventListener("open-import-bandcamp-modal", handleOpen);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError("");
    setMetadata(null);

    try {
      const data = await API.importBandcamp(url);
      setMetadata({ ...data, url });
    } catch (e: any) {
      setError(e.message || "Failed to fetch Bandcamp metadata");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!metadata) return;

    setLoading(true);
    setError("");

    try {
      await onImport?.(metadata);
      dialogRef.current?.close();
    } catch (e: any) {
      setError(e.message || "Failed to import metadata");
    } finally {
      setLoading(false);
    }
  };

  const trackCount = metadata?.tracks?.length ?? 0;

  return (
    <dialog id="import-bandcamp-modal" className="modal" ref={dialogRef}>
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Globe className="text-[#629aa9]" /> Import from Bandcamp
        </h3>

        {!metadata ? (
          <form onSubmit={handleSearch}>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Bandcamp Album/Release URL</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://artist.bandcamp.com/album/..."
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
                  Fetch
                </button>
              </div>
            </div>

            <div className="alert mt-4 py-2 text-xs items-start">
              <Info size={16} className="opacity-70 mt-0.5" />
              <span>
                Only the release metadata and cover art are imported. Tracks are not downloaded — add them
                manually with <strong>Upload Audio</strong> or from your library with <strong>Add Library</strong>.
              </span>
            </div>

            {error && <div className="alert alert-error py-2 text-sm mt-4">{error}</div>}

            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4 bg-base-200 p-4 rounded-lg">
              {metadata.cover ? (
                <img src={metadata.cover} alt="Cover" className="w-16 h-16 rounded object-cover shadow" />
              ) : (
                <div className="w-16 h-16 bg-base-300 rounded flex items-center justify-center">
                  <Globe size={24} className="opacity-50" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{metadata.title || "Untitled"}</div>
                <div className="text-sm opacity-70 truncate">{metadata.artist}</div>
                {trackCount > 0 && (
                  <div className="text-xs opacity-50 mt-1">{trackCount} track{trackCount === 1 ? "" : "s"} on Bandcamp (not imported)</div>
                )}
              </div>
            </div>

            <div className="alert py-2 text-xs items-start">
              <Info size={16} className="opacity-70 mt-0.5" />
              <span>Importing release metadata and cover only. Add tracks manually or from your library.</span>
            </div>

            {error && <div className="alert alert-error py-2 text-sm">{error}</div>}

            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => { setMetadata(null); setError(""); }} disabled={loading}>Back</button>
              <button type="button" className="btn bg-[#629aa9] hover:bg-[#4d7b87] text-white" onClick={handleImport} disabled={loading}>
                {loading ? <span className="loading loading-spinner loading-xs"></span> : "Import Metadata"}
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
