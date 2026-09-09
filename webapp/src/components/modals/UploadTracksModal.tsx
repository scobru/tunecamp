import { confirm } from '@/utils/confirm';
import { useState, useRef, useEffect } from "react";
import API from "../../services/api";
import { UploadCloud, Music, X, Trash2 } from "lucide-react";
import type { Track } from "../../types";
import { UploadProgress } from "../ui/UploadProgress";
import { formatBytes } from "../../utils/format";

/** Stable key for a queued file, so removing one doesn't shift the others' progress. */
const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

/** Byte-level progress of one upload run. */
interface BatchProgress {
  /** Files in the run. */
  total: number;
  /** Files finished, successfully or not. */
  done: number;
  /** Bytes sent across the run, as a percentage of its total size. */
  percent: number;
  /** Per-file percentages, keyed by `fileKey()`, for the file rows. */
  files: Record<string, number>;
}

export const UploadTracksModal = ({
  onUploadComplete,
}: {
  onUploadComplete?: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [releaseSlug, setReleaseSlug] = useState<string>("");
  const [releaseTitle, setReleaseTitle] = useState<string>("");
  const [artistId, setArtistId] = useState<string | number>("");
  const [uploading, setUploading] = useState(false);
  /**
   * Progress of the current (or last) upload run, or null before the first
   * one.
   *
   * Counting finished files was the only feedback here, so a single 80 MB
   * file sat at 0% until it was completely done. This is weighted by bytes,
   * so the bar moves while the bytes move, and it survives the end of the run
   * so the artist sees a finished bar next to the result rather than a
   * progress bar that vanishes.
   */
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [existingTracks, setExistingTracks] = useState<Track[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [artistName, setArtistName] = useState("");
  const [albumTitle, setAlbumTitle] = useState("");
  const [artists, setArtists] = useState<any[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);

  useEffect(() => {
    const handleOpen = (e: CustomEvent) => {
      if (e.detail) {
        setReleaseSlug(e.detail.slug || "");
        setReleaseTitle(e.detail.title || "");
        setArtistId(e.detail.artistId || "");
        if (e.detail.slug) {
          loadExistingTracks(e.detail.slug);
        }
        setArtistName(e.detail.artistName || "");
        setAlbumTitle(e.detail.albumTitle || "");
        loadMetadataOptions();
      } else {
        setExistingTracks([]);
        setArtistName("");
        setAlbumTitle("");
        loadMetadataOptions();
      }
      setFiles([]);
      setError("");
      setSuccess("");
      setUploading(false);
      setBatch(null);
      dialogRef.current?.showModal();
    };

    document.addEventListener(
      "open-upload-tracks-modal",
      handleOpen as EventListener,
    );
    return () =>
      document.removeEventListener(
        "open-upload-tracks-modal",
        handleOpen as EventListener,
      );
  }, []);

  const loadMetadataOptions = async () => {
    try {
      const artistData = await API.getArtists();
      setArtists(artistData);
      const albumData = await API.getAlbums();
      setAlbums(albumData);
    } catch (e) {
      console.error("Failed to load metadata options:", e);
    }
  };

  const loadExistingTracks = async (slug: string) => {
    setLoadingExisting(true);
    try {
      const album = await API.getAlbum(slug);
      if (album && album.tracks) {
        setExistingTracks(album.tracks);
      }
    } catch (e: unknown) {
      console.error("Failed to load existing tracks:", e);
    } finally {
      setLoadingExisting(false);
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    if (
      !await confirm(
        "Are you sure you want to delete this track? This will remove it from the database.",
      )
    )
      return;

    try {
      await API.deleteTrack(trackId, true);
      setExistingTracks((prev: Track[]) =>
        prev.filter((t: Track) => t.id !== trackId),
      );
      if (onUploadComplete) onUploadComplete();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete track");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_: File, i: number) => i !== index));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return;

    setUploading(true);
    setError("");

    const batchFiles = [...files];
    // Weighted by size, not by file count: three short interludes finishing
    // first must not report an album as nearly uploaded.
    const totalBytes = batchFiles.reduce((sum, f) => sum + f.size, 0);
    const sentPercent: Record<string, number> = {};
    setBatch({ total: batchFiles.length, done: 0, percent: 0, files: {} });

    const publish = (finished = 0) =>
      setBatch((prev) => {
        const sentBytes = batchFiles.reduce(
          (sum, f) => sum + (f.size * (sentPercent[fileKey(f)] ?? 0)) / 100,
          0,
        );
        return {
          total: batchFiles.length,
          done: (prev?.done ?? 0) + finished,
          percent: totalBytes > 0 ? (sentBytes / totalBytes) * 100 : 0,
          files: { ...sentPercent },
        };
      });

    let successCount = 0;
    let failCount = 0;

    try {
      // Simple concurrency control
      const CONCURRENCY_LIMIT = 3;
      const queue = [...batchFiles];
      const activePromises: Promise<void>[] = [];

      const processNext = async () => {
        const file = queue.shift();
        if (!file) return;

        const key = fileKey(file);
        try {
          await API.uploadTracks([file], {
            releaseSlug,
            artistId,
            artist: artistName,
            album: albumTitle,
            onProgress: (percent) => {
              sentPercent[key] = percent;
              publish();
            },
          });
          // A finished file counts as fully sent even if the browser never
          // reported the last chunk.
          sentPercent[key] = 100;
          successCount++;
        } catch (err: unknown) {
          console.error(`Failed to upload ${file.name}:`, err);
          failCount++;
        } finally {
          publish(1);
        }

        if (queue.length > 0) {
          await processNext();
        }
      };

      // Start initial batch
      for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, files.length); i++) {
        activePromises.push(processNext());
      }

      await Promise.all(activePromises);

      if (failCount === 0) {
        setSuccess(`Successfully uploaded all ${successCount} tracks.`);
        setFiles([]);
      } else {
        setError(
          `Uploaded ${successCount} tracks, but ${failCount} failed. Check console for details.`,
        );
      }

      if (onUploadComplete) onUploadComplete();
      if (releaseSlug) loadExistingTracks(releaseSlug); // Refresh list
    } catch (e: unknown) {
      console.error(e);
      setError(
        e instanceof Error
          ? e.message
          : "An unexpected error occurred during upload",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <dialog id="upload-tracks-modal" className="modal" ref={dialogRef}>
      <div className="modal-box bg-base-100 border border-base-content/5">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
            ✕
          </button>
        </form>

        <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
          <UploadCloud size={20} className="text-secondary" /> Upload Tracks
        </h3>

        {/* Single / Release Toggle */}
        {!releaseTitle && (
          <div className="tabs tabs-boxed mb-4 bg-transparent p-0">
            <a
              className={`tab tab-sm ${!releaseSlug ? "tab-active" : ""}`}
              onClick={() => setReleaseSlug("")}
            >
              Library (Single)
            </a>
            <a
              className={`tab tab-sm ${releaseSlug ? "tab-active opacity-50 cursor-not-allowed" : ""}`}
              title="To upload to a specific release, use the Releases page"
            >
              Release
            </a>
          </div>
        )}

        {releaseTitle ? (
          <div className="alert alert-sm bg-base-200 mb-4 border-none flex-row">
            <Music size={16} className="opacity-50" />
            <span className="text-sm">
              Adding to: <span className="font-bold">{releaseTitle}</span>
            </span>
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text-alt font-bold opacity-50">Artist Name</span>
              </label>
              <input
                type="text"
                list="upload-artist-options"
                className="input input-bordered input-sm w-full"
                placeholder="Various / Unknown"
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
              />
              <datalist id="upload-artist-options">
                {artists.map((a) => (
                  <option key={a.id} value={a.name} />
                ))}
              </datalist>
            </div>
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text-alt font-bold opacity-50">Library Album Title</span>
              </label>
              <input
                type="text"
                list="upload-album-options"
                className="input input-bordered input-sm w-full"
                placeholder="Singles / Miscellaneous"
                value={albumTitle}
                onChange={(e) => setAlbumTitle(e.target.value)}
              />
              <datalist id="upload-album-options">
                {albums.map((a) => (
                  <option key={a.id} value={a.title} />
                ))}
              </datalist>
            </div>
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">Select Audio Files</span>
            </label>
            <div className="join w-full">
              <input
                type="file"
                className="file-input file-input-bordered w-full join-item"
                multiple
                accept="audio/*"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* Existing Tracks List */}
          {releaseSlug && existingTracks.length > 0 && (
            <div className="space-y-2">
              <label className="label">
                <span className="label-text-alt font-bold opacity-50">
                  Current Tracks
                </span>
              </label>
              <div className="bg-base-300/30 rounded p-2 max-h-40 overflow-y-auto space-y-1">
                {existingTracks.map((track: Track) => (
                  <div
                    key={track.id}
                    className="flex justify-between items-center text-xs p-2 hover:bg-base-content/5 rounded border border-base-content/5"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Music size={12} className="text-secondary opacity-50" />
                      <span className="truncate">{track.title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteTrack(String(track.id))}
                      className="btn btn-ghost btn-xs btn-square text-error"
                      title="Delete track"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loadingExisting && (
            <div className="text-center py-2">
              <span className="loading loading-spinner loading-xs text-secondary"></span>
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-2">
              <label className="label">
                <span className="label-text-alt font-bold opacity-50 text-secondary">
                  Files to Upload
                </span>
              </label>
              <div className="bg-base-200 rounded p-2 max-h-40 overflow-y-auto space-y-1">
                {files.map((file: File, i: number) => {
                  const percent = batch?.files[fileKey(file)] ?? 0;
                  return (
                    <div
                      key={i}
                      className="flex justify-between items-center gap-2 text-xs p-1 hover:bg-base-content/5 rounded"
                    >
                      <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                        <Music size={12} className="shrink-0" />
                        {uploading ? (
                          <UploadProgress
                            label={file.name}
                            percent={percent}
                            color="secondary"
                          />
                        ) : (
                          <>
                            <span className="truncate">{file.name}</span>
                            <span className="opacity-40 shrink-0">
                              {formatBytes(file.size)}
                            </span>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="btn btn-ghost btn-xs btn-square"
                        disabled={uploading}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <div className="text-error text-sm text-center">{error}</div>
          )}
          {success && (
            <div className="text-success text-sm text-center">{success}</div>
          )}

          <div className="modal-action flex-col">
            {batch && (
              <div className="w-full mb-2">
                <UploadProgress
                  label={
                    uploading
                      ? `Uploading ${batch.total} file${batch.total === 1 ? "" : "s"} — ${batch.done} of ${batch.total} done`
                      : `Finished — ${batch.done} of ${batch.total} file${batch.total === 1 ? "" : "s"}`
                  }
                  percent={batch.percent}
                  color="secondary"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => dialogRef.current?.close()}
              >
                Close
              </button>
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={uploading || files.length === 0}
              >
                {uploading ? (
                  <><span className="loading loading-spinner loading-xs"></span> Uploading...</>
                ) : "Start Upload"}
              </button>
            </div>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
};

