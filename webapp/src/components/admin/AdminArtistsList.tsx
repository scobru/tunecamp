import { confirm } from '@/utils/confirm';
import { useState, useEffect } from "react";
import API from "../../services/api";
import { User, Edit, Trash2, Globe, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import clsx from '@/utils/clsx';
import { useAuthStore } from "../../stores/useAuthStore";
import { useConfigStore } from "../../stores/useConfigStore";
import { notify } from "../../utils/notify";

export const AdminArtistsList = () => {
  const { user, role } = useAuthStore();
  const { cacheBuster } = useConfigStore();
  const navigate = useNavigate();
  const [artists, setArtists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const isAdmin = role === 'admin' || role === 'super_user' || user?.isRootAdmin;

  const loadArtists = async () => {
    setLoading(true);
    try {
      const data = await API.getArtists();
      
      if (!isAdmin && user?.artistId) {
          setArtists(data.filter(a => String(a.id) === String(user.artistId)));
      } else {
          setArtists(data);
      }
    } catch (e) {
      console.error("Failed to load artists:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArtists();
    window.addEventListener("refresh-admin-artists", loadArtists);
    return () => window.removeEventListener("refresh-admin-artists", loadArtists);
  }, []);

  const filteredArtists = artists.filter(artist => 
    artist.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    artist.slug?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredArtists.map((a) => a.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleDelete = async (id: string | number, name: string) => {
    if (!await confirm(`Are you sure you want to delete artist "${name}"? This will NOT delete their tracks, but they will become "Unknown Artist".`)) return;
    try {
      await API.deleteArtist(String(id));
      loadArtists();
    } catch (e: any) {
      notify.error(e, "Delete failed");
    }
  };

  const handleDeleteBatch = async () => {
    if (selectedIds.length === 0) return;
    if (!await confirm(`Delete ${selectedIds.length} selected artists? Their tracks will become "Unknown Artist".`)) return;
    try {
        await API.deleteArtistsBatch(selectedIds);
        setSelectedIds([]);
        loadArtists();
    } catch (e: any) {
        notify.error(e, "Batch delete failed");
    }
  };

  const handleVisibilityBatch = async (visibility: 'public' | 'private') => {
    if (selectedIds.length === 0) return;
    try {
        await API.updateArtistsVisibilityBatch(selectedIds, visibility);
        setSelectedIds([]);
        loadArtists();
    } catch (e: any) {
        notify.error(e, "Batch visibility update failed");
    }
  };

  if (loading) return (
    <div className="flex flex-col gap-3 p-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton h-14 w-full rounded-lg" />
      ))}
    </div>
  );

  if (artists.length === 0)
    return (
      <div className="opacity-50 text-center py-8">
        <User size={48} className="mx-auto mb-4 opacity-20" />
        <p>No artists found.</p>
        <button 
            className="btn btn-primary btn-sm mt-4"
            onClick={() => document.dispatchEvent(new CustomEvent("open-admin-artist-modal"))}
        >
            Create Artist Profile
        </button>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-xs">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={18} />
          <input
            type="text"
            placeholder="Search artists..."
            className="input input-bordered w-full pl-10 h-10 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="text-xs opacity-50 font-mono">
          {filteredArtists.length} {filteredArtists.length === 1 ? 'artist' : 'artists'} found
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-4 p-2 bg-base-200 rounded-lg border border-base-300 animate-in fade-in slide-in-from-top-2">
            <span className="text-sm font-medium ml-2">{selectedIds.length} artists selected</span>
            
            <div className="flex gap-2">
                <button 
                    className="btn btn-sm btn-ghost gap-2 text-success"
                    onClick={() => handleVisibilityBatch('public')}
                >
                    <Globe size={16} /> Make Public
                </button>
                <button 
                    className="btn btn-sm btn-ghost gap-2"
                    onClick={() => handleVisibilityBatch('private')}
                >
                    <Lock size={16} /> Make Private
                </button>
            </div>

            <div className="flex-1"></div>

            <button 
                className="btn btn-sm btn-error gap-2"
                onClick={handleDeleteBatch}
            >
                <Trash2 size={16} /> Delete Selected
            </button>
            <button 
                className="btn btn-sm btn-ghost"
                onClick={() => setSelectedIds([])}
            >
                Cancel
            </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <th className="w-10">
                <input 
                    type="checkbox" 
                    className="checkbox checkbox-sm" 
                    checked={selectedIds.length === filteredArtists.length && filteredArtists.length > 0}
                    onChange={handleSelectAll}
                />
              </th>
              <th className="w-16">Photo</th>
              <th>Name</th>
              <th>Status</th>
              <th>Visibility</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredArtists.map((a) => (
              <tr key={a.id} className={clsx("hover:bg-base-200/50 transition-colors", selectedIds.includes(a.id) && "bg-base-200")}>
                <td>
                    <input 
                        type="checkbox" 
                        className="checkbox checkbox-sm" 
                        checked={selectedIds.includes(a.id)}
                        onChange={() => handleSelectOne(a.id)}
                    />
                </td>
                <td>
                  <div className="avatar">
                    <div className="w-10 h-10 rounded-xl bg-neutral flex items-center justify-center">
                      {a.photoPath || a.coverImage ? (
                        <img src={API.getArtistCoverUrl(a.id, cacheBuster)} alt={a.name} className="object-cover" />
                      ) : (
                        <User size={20} className="opacity-30" />
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="flex flex-col">
                    <span className="font-bold">{a.name}</span>
                    <span className="text-xs opacity-50">{a.slug}</span>
                  </div>
                </td>
                <td>
                   <div className="flex flex-col gap-1">
                      {a.isReleasing && <span className="badge badge-primary badge-xs">Releasing</span>}
                      {a.hasPublicContent ? (
                          <span className="badge badge-success badge-xs gap-1"><Globe size={10}/> Public</span>
                      ) : (
                          <span className="badge badge-ghost badge-xs">Private</span>
                      )}
                   </div>
                </td>
                <td>
                  <div className={clsx("badge badge-sm", a.visibility === 'public' ? "badge-success" : "badge-ghost")}>
                      {a.visibility || 'public'}
                  </div>
                </td>
                <td>
                  <div className="flex gap-2">
                      <button
                          className="btn btn-xs btn-ghost gap-1"
                          onClick={() => document.dispatchEvent(new CustomEvent("open-admin-artist-modal", { detail: a }))}
                      >
                          <Edit size={14} /> Edit
                      </button>
                      {isAdmin && (
                          <button
                              className="btn btn-xs btn-ghost text-error"
                              onClick={() => handleDelete(a.id, a.name)}
                          >
                              <Trash2 size={14} />
                          </button>
                      )}
                      <button 
                          className="btn btn-xs btn-ghost"
                          onClick={() => navigate(`/artists/${a.slug || a.id}`)}
                      >
                          View Profile
                      </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
