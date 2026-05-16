import { useState, useEffect } from "react";
import API from "../../services/api";
import { User, Edit, Trash2, Globe, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useAuthStore } from "../../stores/useAuthStore";
import { useConfigStore } from "../../stores/useConfigStore";

export const AdminArtistsList = () => {
  const { user, role } = useAuthStore();
  const { cacheBuster } = useConfigStore();
  const navigate = useNavigate();
  const [artists, setArtists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const loadArtists = async () => {
    setLoading(true);
    try {
      const data = await API.getArtists();
      
      const isAdmin = role === 'admin' || role === 'super_user' || user?.isRootAdmin;
      if (!isAdmin && user?.artistId) {
          setArtists(data.filter(a => a.id === user.artistId));
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

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(artists.map((a) => a.id));
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
    if (!confirm(`Are you sure you want to delete artist "${name}"? This will NOT delete their tracks, but they will become "Unknown Artist".`)) return;
    try {
      await API.deleteArtist(String(id));
      loadArtists();
    } catch (e: any) {
      alert("Delete failed: " + e.message);
    }
  };

  const handleDeleteBatch = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} selected artists? Their tracks will become "Unknown Artist".`)) return;
    try {
        await API.deleteArtistsBatch(selectedIds);
        setSelectedIds([]);
        loadArtists();
    } catch (e: any) {
        alert("Batch delete failed: " + e.message);
    }
  };

  const handleVisibilityBatch = async (visibility: 'public' | 'private') => {
    if (selectedIds.length === 0) return;
    try {
        await API.updateArtistsVisibilityBatch(selectedIds, visibility);
        setSelectedIds([]);
        loadArtists();
    } catch (e: any) {
        alert("Batch visibility update failed: " + e.message);
    }
  };

  if (loading) return <div className="p-4 text-center opacity-50">Loading artists...</div>;

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
                    checked={selectedIds.length === artists.length && artists.length > 0}
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
            {artists.map((a) => (
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
                      {(user?.isRootAdmin || role === 'super_user') && (
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
