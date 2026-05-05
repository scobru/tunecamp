import { useState, useRef, useEffect } from "react";
import API from "../../services/api";
import { Music, Save, OctagonAlert } from "lucide-react";

interface BatchTrackEditModalProps {
  selectedIds: (string | number)[];
  onTracksUpdated: () => void;
  onClose: () => void;
}

export const BatchTrackEditModal = ({ selectedIds, onTracksUpdated, onClose }: BatchTrackEditModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  
  // Fields to update
  const [artistName, setArtistName] = useState("");
  const [albumTitle, setAlbumTitle] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [price, setPrice] = useState("");
  const [priceUsdc, setPriceUsdc] = useState("");
  const [externalArtwork, setExternalArtwork] = useState("");
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState("");
  const currency = "ETH";

  // Control which fields are actually applied
  const [applyArtist, setApplyArtist] = useState(false);
  const [applyAlbum, setApplyAlbum] = useState(false);
  const [applyOwner, setApplyOwner] = useState(false);
  const [applyPricing, setApplyPricing] = useState(false);
  const [applyArtwork, setApplyArtwork] = useState(false);
  const [applyGenre, setApplyGenre] = useState(false);
  const [applyYear, setApplyYear] = useState(false);

  // Dropdown data
  const [artists, setArtists] = useState<any[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedIds.length > 0) {
      loadData();
      dialogRef.current?.showModal();
    }
  }, [selectedIds]);

  const loadData = async () => {
    try {
      const [artistsData, albumsData, adminsData] = await Promise.all([
        API.getArtists(),
        API.getAlbums(),
        API.getUsers(),
      ]);
      setArtists(artistsData);
      setAlbums(albumsData);
      setAdmins(adminsData);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) return;

    setLoading(true);
    setError("");

    try {
      const payload: any = {};

      if (applyArtist) {
        const matchedArtist = artists.find(a => a.name.toLowerCase() === artistName.trim().toLowerCase());
        if (matchedArtist) {
          payload.artistId = Number(matchedArtist.id);
        } else {
          payload.artist = artistName.trim();
          payload.artistId = null;
        }
      }

      if (applyAlbum) {
        const matchedAlbum = albums.find(a => a.title.toLowerCase() === albumTitle.trim().toLowerCase());
        if (matchedAlbum) {
          payload.albumId = Number(matchedAlbum.id);
        } else {
          payload.album = albumTitle.trim();
          payload.albumId = null;
        }
      }

      if (applyOwner) {
        const matchedOwner = admins.find(a => a.username.toLowerCase() === ownerName.trim().toLowerCase());
        if (matchedOwner) {
          payload.ownerId = Number(matchedOwner.id);
        } else if (!ownerName.trim()) {
          payload.ownerId = null;
        }
      }

      if (applyPricing) {
        payload.price = price ? parseFloat(price) : 0;
        payload.priceUsdc = priceUsdc ? parseFloat(priceUsdc) : 0;
        payload.currency = currency;
      }

      if (applyArtwork) {
        payload.externalArtwork = externalArtwork.trim();
      }

      if (applyGenre) {
        payload.genre = genre.trim();
      }

      if (applyYear) {
        payload.year = year ? parseInt(year) : null;
      }

      const res = (await API.updateTracksBatch(selectedIds, payload)) as any;
      
      if (res.failed > 0) {
        setError(`Updated ${res.success} tracks, but ${res.failed} failed: ${res.errors.join(", ")}`);
      } else {
        onTracksUpdated();
        dialogRef.current?.close();
        onClose();
      }
    } catch (e: any) {
      setError(e.message || "Failed to update tracks");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    dialogRef.current?.close();
    onClose();
  };

  return (
    <dialog id="batch-track-edit-modal" className="modal" ref={dialogRef} onClose={onClose}>
      <div className="modal-box bg-base-100 border border-base-content/5 max-w-2xl">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={handleClose}>
            ✕
          </button>
        </form>

        <h3 className="font-bold text-lg flex items-center gap-2 mb-2">
          <Music size={20} /> Batch Edit Tracks
        </h3>
        <p className="text-sm opacity-60 mb-6">
          Editing <span className="text-primary font-bold">{selectedIds.length}</span> selected tracks. 
          Check the box next to a field to apply that change to all selected tracks.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Artist Field */}
          <div className="flex items-start gap-4 p-3 rounded-lg bg-base-200/50">
            <input 
              type="checkbox" 
              className="checkbox checkbox-primary mt-3" 
              checked={applyArtist} 
              onChange={e => setApplyArtist(e.target.checked)} 
            />
            <div className="form-control flex-1">
              <label className="label">
                <span className="label-text">Artist</span>
              </label>
              <input
                type="text"
                list="batch-artist-options"
                className={`input input-bordered w-full ${!applyArtist && 'opacity-50'}`}
                placeholder="Change artist for all selected tracks"
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
                disabled={!applyArtist}
              />
              <datalist id="batch-artist-options">
                {artists.map((a) => (
                  <option key={a.id} value={a.name} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Album Field */}
          <div className="flex items-start gap-4 p-3 rounded-lg bg-base-200/50">
            <input 
              type="checkbox" 
              className="checkbox checkbox-primary mt-3" 
              checked={applyAlbum} 
              onChange={e => setApplyAlbum(e.target.checked)} 
            />
            <div className="form-control flex-1">
              <label className="label">
                <span className="label-text">Album</span>
              </label>
              <input
                type="text"
                list="batch-album-options"
                className={`input input-bordered w-full ${!applyAlbum && 'opacity-50'}`}
                placeholder="Change album for all selected tracks"
                value={albumTitle}
                onChange={(e) => setAlbumTitle(e.target.value)}
                disabled={!applyAlbum}
              />
              <datalist id="batch-album-options">
                {albums.map((a) => (
                  <option key={a.id} value={a.title} />
                ))}
              </datalist>
            </div>
          </div>

          {/* User/Owner Field */}
          <div className="flex items-start gap-4 p-3 rounded-lg bg-base-200/50">
            <input 
              type="checkbox" 
              className="checkbox checkbox-primary mt-3" 
              checked={applyOwner} 
              onChange={e => setApplyOwner(e.target.checked)} 
            />
            <div className="form-control flex-1">
              <label className="label">
                <span className="label-text">Uploader (User)</span>
              </label>
              <input
                type="text"
                list="batch-user-options"
                className={`input input-bordered w-full ${!applyOwner && 'opacity-50'}`}
                placeholder="Change uploader for all selected tracks"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                disabled={!applyOwner}
              />
              <datalist id="batch-user-options">
                {admins.map((u) => (
                  <option key={u.id} value={u.username} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Pricing Fields */}
          <div className="flex items-start gap-4 p-3 rounded-lg bg-base-200/50">
            <input 
              type="checkbox" 
              className="checkbox checkbox-primary mt-3" 
              checked={applyPricing} 
              onChange={e => setApplyPricing(e.target.checked)} 
            />
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Price (ETH)</span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  className={`input input-bordered w-full ${!applyPricing && 'opacity-50'}`}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={!applyPricing}
                />
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Price (USDC)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  className={`input input-bordered w-full ${!applyPricing && 'opacity-50'}`}
                  value={priceUsdc}
                  onChange={(e) => setPriceUsdc(e.target.value)}
                  disabled={!applyPricing}
                />
              </div>
            </div>
          </div>

          {/* Artwork Field */}
          <div className="flex items-start gap-4 p-3 rounded-lg bg-base-200/50">
            <input 
              type="checkbox" 
              className="checkbox checkbox-primary mt-3" 
              checked={applyArtwork} 
              onChange={e => setApplyArtwork(e.target.checked)} 
            />
            <div className="form-control flex-1">
              <label className="label">
                <span className="label-text">Cover Artwork URL</span>
              </label>
              <input
                type="text"
                className={`input input-bordered w-full ${!applyArtwork && 'opacity-50'}`}
                placeholder="https://example.com/cover.jpg"
                value={externalArtwork}
                onChange={(e) => setExternalArtwork(e.target.value)}
                disabled={!applyArtwork}
              />
            </div>
          </div>

          {/* Genre Field */}
          <div className="flex items-start gap-4 p-3 rounded-lg bg-base-200/50">
            <input 
              type="checkbox" 
              className="checkbox checkbox-primary mt-3" 
              checked={applyGenre} 
              onChange={e => setApplyGenre(e.target.checked)} 
            />
            <div className="form-control flex-1">
              <label className="label">
                <span className="label-text">Genre</span>
              </label>
              <input
                type="text"
                className={`input input-bordered w-full ${!applyGenre && 'opacity-50'}`}
                placeholder="Change genre for all selected tracks"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                disabled={!applyGenre}
              />
            </div>
          </div>

          {/* Year Field */}
          <div className="flex items-start gap-4 p-3 rounded-lg bg-base-200/50">
            <input 
              type="checkbox" 
              className="checkbox checkbox-primary mt-3" 
              checked={applyYear} 
              onChange={e => setApplyYear(e.target.checked)} 
            />
            <div className="form-control flex-1">
              <label className="label">
                <span className="label-text">Year</span>
              </label>
              <input
                type="number"
                className={`input input-bordered w-full ${!applyYear && 'opacity-50'}`}
                placeholder="Change year for all selected tracks"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                disabled={!applyYear}
              />
            </div>
          </div>

          {error && (
            <div className="alert alert-error text-sm flex items-start gap-2">
              <OctagonAlert size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary gap-2"
              disabled={loading || (!applyArtist && !applyAlbum && !applyOwner && !applyPricing && !applyArtwork && !applyGenre && !applyYear)}
            >
              <Save size={18} /> {loading ? "Updating..." : `Update ${selectedIds.length} Tracks`}
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={handleClose}>close</button>
      </form>
    </dialog>
  );
};

