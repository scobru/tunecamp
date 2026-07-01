import { confirm } from '@/utils/confirm';
import { useState, useRef, useEffect } from "react";
import API from "../../services/api";
import { Music, Trash2, Save, Search, FileText, Loader2 } from "lucide-react";
import { genreDatalistOptions } from "../../constants/genres";
import { MetadataMatchModal } from "../MetadataMatchModal";
import { useConfigStore } from "../../stores/useConfigStore";

interface AdminTrackModalProps {
  onTrackUpdated: () => void;
}

export const AdminTrackModal = ({ onTrackUpdated }: AdminTrackModalProps) => {
  const { bumpCacheBuster } = useConfigStore();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [albumTitle, setAlbumTitle] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [trackId, setTrackId] = useState<string | null>(null);
  const [trackNum, setTrackNum] = useState<string>("");
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [currentTrackData, setCurrentTrackData] = useState<any>(null);
  const [hasCustomArtwork, setHasCustomArtwork] = useState(false);
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [fetchingLyrics, setFetchingLyrics] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingArtwork, setUploadingArtwork] = useState(false);

  // Dropdown data
  const [artists, setArtists] = useState<any[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleOpen = async (e: CustomEvent) => {
      if (e.detail) {
        setTrackId(e.detail.id);
        setTitle(e.detail.title || "");
        setArtistName(e.detail.artist_name || "");
        setAlbumTitle(e.detail.album_title || "");
        setOwnerName(e.detail.owner_name || "");
        setTrackNum(e.detail.track_num ? String(e.detail.track_num) : "");
        setArtworkUrl(e.detail.coverUrl || null);
        setHasCustomArtwork(!!e.detail.external_artwork);
        setGenre(e.detail.genre || "");
        setYear(e.detail.year ? String(e.detail.year) : "");
        setLyrics(e.detail.lyrics || "");
        setCurrentTrackData(e.detail);

        loadData();
        dialogRef.current?.showModal();
      }
    };

    document.addEventListener(
      "open-admin-track-modal",
      handleOpen as unknown as EventListener,
    );
    return () =>
      document.removeEventListener(
        "open-admin-track-modal",
        handleOpen as unknown as EventListener,
      );
  }, []);

  const loadData = async () => {
    try {
      const [artistsData, albumsData, releasesData, adminsData] = await Promise.all([
        API.getArtists(),
        API.getAlbums(),
        API.getReleases().catch(() => []),
        API.getUsers(),
      ]);
      setArtists(artistsData);
      // Merge library albums + releases so release-linked tracks resolve correctly
      const mergedAlbums = [...albumsData];
      const seenIds = new Set(mergedAlbums.map((a: any) => a.id));
      for (const r of (releasesData || [])) {
        if (!seenIds.has((r as any).id)) {
          mergedAlbums.push(r as any);
          seenIds.add((r as any).id);
        }
      }
      setAlbums(mergedAlbums);
      setAdmins(adminsData);
    } catch (e) {
      console.error(e);
    }
  };

  const handleFetchLyrics = async () => {
    if (!artistName || !title) {
      setError("Artist and Title are required to fetch lyrics");
      return;
    }

    setFetchingLyrics(true);
    setError("");
    try {
      const res = await API.fetchLyricsMetadata(artistName, title);
      if (res.lyrics) {
        setLyrics(res.lyrics);
      }
    } catch (err: any) {
      setError(err.message || "Lyrics not found");
    } finally {
      setFetchingLyrics(false);
    }
  };

  const handleArtworkClick = () => {
    fileInputRef.current?.click();
  };

  const handleArtworkChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !trackId) return;

    setUploadingArtwork(true);
    setError("");
    try {
      const res = await API.uploadTrackArtwork(trackId, file);
      setArtworkUrl(`${res.url}?v=${Date.now()}`);
      setHasCustomArtwork(true);
      bumpCacheBuster();
      onTrackUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to upload artwork");
    } finally {
      setUploadingArtwork(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async () => {
    if (
      !trackId ||
      !await confirm(
        "Are you sure you want to delete this track? This cannot be undone.",
      )
    )
      return;

    setLoading(true);
    setError("");
    try {
      await API.deleteTrack(trackId, true); // Always delete file
      onTrackUpdated();
      dialogRef.current?.close();
    } catch (e: any) {
      setError(e.message || "Failed to delete track");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackId) return;

    setLoading(true);
    setError("");

    try {
      const matchedArtist = artists.find(a => a.name.toLowerCase() === artistName.trim().toLowerCase());
      const matchedAlbum = albums.find(a => a.title.toLowerCase() === albumTitle.trim().toLowerCase());

      const payload: any = {
        title,
        trackNumber: trackNum ? parseInt(trackNum) : undefined,
        genre,
        year: year ? parseInt(year) : null,
        lyrics,
      };

      if (matchedArtist) {
        payload.artistId = String(matchedArtist.id);
      } else if (
        currentTrackData &&
        (artistName.trim() === (currentTrackData.artist_name || "").trim() ||
         artistName.trim() === (currentTrackData.artistName || "").trim() ||
         artistName.trim() === (currentTrackData.artist || "").trim()) &&
        (currentTrackData.artist_id || currentTrackData.artistId)
      ) {
        payload.artistId = String(currentTrackData.artist_id || currentTrackData.artistId);
      } else {
        payload.artist = artistName.trim();
        payload.artistId = null;
      }

      if (matchedAlbum) {
        payload.albumId = String(matchedAlbum.id);
      } else if (
        currentTrackData &&
        (albumTitle.trim() === (currentTrackData.album_title || "").trim() ||
         albumTitle.trim() === (currentTrackData.albumName || "").trim() ||
         albumTitle.trim() === (currentTrackData.album || "").trim()) &&
        (currentTrackData.album_id || currentTrackData.albumId)
      ) {
        payload.albumId = String(currentTrackData.album_id || currentTrackData.albumId);
      } else {
        payload.album = albumTitle.trim();
        payload.albumId = null;
      }

      const matchedOwner = admins.find(a => a.username.toLowerCase() === ownerName.trim().toLowerCase());
      if (matchedOwner) {
        payload.ownerId = String(matchedOwner.id);
      } else if (!ownerName.trim()) {
        payload.ownerId = null;
      }

      await API.updateTrack(trackId, payload);

      bumpCacheBuster();
      onTrackUpdated();
      dialogRef.current?.close();
    } catch (e: any) {
      setError(e.message || "Failed to update track");
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog id="admin-track-modal" className="modal" ref={dialogRef}>
      <div className="modal-box bg-base-100 border border-base-content/5">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
            ✕
          </button>
        </form>

        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Music size={20} /> Edit Track
          </h3>
          <button
            type="button"
            className="btn btn-sm btn-ghost gap-2 text-primary"
            onClick={() => setShowMetadataModal(true)}
          >
            <Search size={14} /> Match Metadata
          </button>
        </div>

        {trackId && (
          <div className="flex flex-col items-center mb-6">
            <div 
              className={`w-32 h-32 rounded-lg bg-base-300 border-2 border-dashed border-white/20 flex items-center justify-center cursor-pointer overflow-hidden relative ${uploadingArtwork ? 'opacity-50' : 'hover:border-primary transition-colors'}`}
              onClick={handleArtworkClick}
            >
              {artworkUrl ? (
                <img src={artworkUrl} alt="Track Artwork" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center p-4 cursor-pointer">
                  <Music className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <span className="text-xs opacity-50">Upload Custom Artwork</span>
                </div>
              )}
              {uploadingArtwork && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <span className="loading loading-spinner loading-md text-primary"></span>
                </div>
              )}
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/jpeg,image/png,image/webp" 
              onChange={handleArtworkChange} 
            />
            {hasCustomArtwork && (
              <div className="text-xs opacity-50 mt-2 text-center max-w-xs truncate">
                Custom artwork applied
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">Title</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">Genre</span>
              </label>
              <input
                type="text"
                list="genre-list-track"
                className="input input-bordered w-full"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="e.g. Techno"
              />
              <datalist id="genre-list-track">
                {genreDatalistOptions(genre || "").map(g => <option key={g} value={g} />)}
              </datalist>
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Year</span>
              </label>
              <input
                type="number"
                className="input input-bordered w-full"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g. 2024"
              />
            </div>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">Artist</span>
            </label>
            <input
              type="text"
              list="artist-options"
              className="input input-bordered w-full"
              placeholder="(Various / Unknown)"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
            />
            <datalist id="artist-options">
              {artists.map((a) => (
                <option key={a.id} value={a.name} />
              ))}
            </datalist>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">Album</span>
            </label>
            <input
              type="text"
              list="album-options"
              className="input input-bordered w-full"
              placeholder="(None / Single)"
              value={albumTitle}
              onChange={(e) => setAlbumTitle(e.target.value)}
            />
            <datalist id="album-options">
              {albums.map((a) => (
                <option key={a.id} value={a.title} />
              ))}
            </datalist>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text text-primary font-bold">Uploader (User)</span>
            </label>
            <input
              type="text"
              list="user-options"
              className="input input-bordered w-full border-primary/30"
              placeholder="Select the User who uploaded this"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
            <datalist id="user-options">
              {admins.map((u) => (
                <option key={u.id} value={u.username} />
              ))}
            </datalist>
            <div className="label">
              <span className="label-text-alt opacity-50">This user will 'own' the file quota.</span>
            </div>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">Track Number</span>
            </label>
            <input
              type="number"
              className="input input-bordered w-full"
              value={trackNum}
              onChange={(e) => setTrackNum(e.target.value)}
            />
          </div>

          <div className="form-control">
            <label className="label flex justify-between items-center">
              <span className="label-text">Lyrics</span>
              <button
                type="button"
                className="btn btn-xs btn-ghost gap-1 text-primary"
                onClick={handleFetchLyrics}
                disabled={fetchingLyrics || !artistName || !title}
              >
                {fetchingLyrics ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                Fetch from lyrics.ovh
              </button>
            </label>
            <textarea
              className="textarea textarea-bordered w-full h-32 font-mono text-xs"
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Song lyrics..."
            />
          </div>

          {error && (
            <div className="text-error text-sm text-center">{error}</div>
          )}

          <div className="modal-action flex justify-between items-center">
            <div>
              <button
                type="button"
                className="btn btn-error btn-outline"
                onClick={handleDelete}
                disabled={loading}
              >
                <Trash2 size={18} /> Delete Track
              </button>
            </div>
            <div className="flex gap-2">
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
                <Save size={18} /> {loading ? "Saving..." : "Update Track"}
              </button>
            </div>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>

      {showMetadataModal && currentTrackData && (
        <MetadataMatchModal
          item={currentTrackData}
          type="track"
          onClose={() => setShowMetadataModal(false)}
          onMatched={(updated) => {
            setTitle(updated.title || "");
            setArtistName(updated.artist_name || updated.artistName || "");
            setAlbumTitle(updated.album_title || updated.albumName || "");
            setArtworkUrl(updated.coverUrl || updated.cover_path || null);
            setHasCustomArtwork(!!(updated as any).external_artwork || !!updated.cover_path);
            setGenre(updated.genre || "");
            setYear(updated.year ? String(updated.year) : "");
            if (updated.lyrics) {
              setLyrics(updated.lyrics);
            }
            setCurrentTrackData((prev: any) => ({ ...prev, ...updated }));
            onTrackUpdated();
            setShowMetadataModal(false);
          }}
        />
      )}
    </dialog>
  );
};

