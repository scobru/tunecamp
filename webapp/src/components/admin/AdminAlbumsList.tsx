import { useState, useEffect } from "react";
import API from "../../services/api";
import { Disc, Edit, Trash2, Globe, Lock, Share2 } from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "../../stores/useAuthStore";
import { useConfigStore } from "../../stores/useConfigStore";
import { notify } from "../../utils/notify";

export const AdminAlbumsList = ({ mine }: { mine?: boolean }) => {
  const { user } = useAuthStore();
  const { cacheBuster } = useConfigStore();
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const loadAlbums = async () => {
    setLoading(true);
    try {
      const data = await API.getAlbums();
      
      let filtered = data;
      if (mine && user?.userId) {
        filtered = data.filter(a => (a as any).owner_id === user.userId || (user.artistId && (a as any).artist_id === user.artistId));
      }
      
      setAlbums(filtered.filter(a => !a.is_release));
    } catch (e) {
      console.error("Failed to load albums:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlbums();
    window.addEventListener("refresh-admin-albums", loadAlbums);
    return () => window.removeEventListener("refresh-admin-albums", loadAlbums);
  }, [mine]);

  const filteredAlbums = albums.filter(album => 
    album.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    album.artistName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredAlbums.map((a) => a.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleDelete = async (id: string | number, title: string) => {
    if (!confirm(`Are you sure you want to delete album "${title}"? Tracks will not be deleted unless you choose to in the next step.`)) return;
    const keepFiles = confirm("Keep audio files on server?");
    try {
      await API.deleteAlbum(String(id), keepFiles);
      loadAlbums();
    } catch (e: any) {
      notify.error(e, "Delete failed");
    }
  };

  const handleDeleteBatch = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} selected albums?`)) return;
    const keepFiles = confirm("Keep audio files on server?");
    try {
        await API.deleteReleasesBatch(selectedIds, keepFiles);
        setSelectedIds([]);
        loadAlbums();
    } catch (e: any) {
        notify.error(e, "Batch delete failed");
    }
  };

  const handleVisibilityBatch = async (visibility: 'public' | 'private') => {
    if (selectedIds.length === 0) return;
    try {
        await API.updateReleasesVisibilityBatch(selectedIds, visibility);
        setSelectedIds([]);
        loadAlbums();
    } catch (e: any) {
        notify.error(e, "Batch visibility update failed");
    }
  };

  const handlePromote = async (id: string | number) => {
      if (!confirm("Promote this library album to a formal Release? This will allow it to be sold and federated.")) return;
      try {
          await API.promoteToRelease(String(id));
          notify.success("Album promoted to release draft!");
          window.dispatchEvent(new CustomEvent("refresh-admin-releases"));
          loadAlbums();
      } catch (e: any) {
          notify.error(e, "Promotion failed");
      }
  };

  if (loading) return <div className="p-4 text-center opacity-50">Loading albums...</div>;

  if (albums.length === 0)
    return (
      <div className="opacity-50 text-center py-8">
        <Disc size={48} className="mx-auto mb-4 opacity-20" />
        <p>No library albums found.</p>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-xs">
          <Disc className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={18} />
          <input
            type="text"
            placeholder="Search albums..."
            className="input input-bordered w-full pl-10 h-10 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="text-xs opacity-50 font-mono">
          {filteredAlbums.length} {filteredAlbums.length === 1 ? 'album' : 'albums'} found
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-4 p-2 bg-base-200 rounded-lg border border-base-300 animate-in fade-in slide-in-from-top-2">
            <span className="text-sm font-medium ml-2">{selectedIds.length} albums selected</span>
            
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
                    checked={selectedIds.length === filteredAlbums.length && filteredAlbums.length > 0}
                    onChange={handleSelectAll}
                />
              </th>
              <th className="w-16">Cover</th>
              <th>Title</th>
              <th>Artist</th>
              <th>Year</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAlbums.map((a) => (
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
                    <div className="w-12 h-12 rounded-lg bg-neutral flex items-center justify-center overflow-hidden">
                      {a.coverPath || a.coverImage ? (
                        <img src={API.getAlbumCoverUrl(a.id, cacheBuster)} alt={a.title} className="object-cover w-full h-full" />
                      ) : (
                        <Disc size={24} className="opacity-20" />
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="flex flex-col">
                    <span className="font-bold">{a.title}</span>
                    <span className="text-xs opacity-50">{a.genre || "No genre"}</span>
                  </div>
                </td>
                <td>{a.artistName || "Unknown Artist"}</td>
                <td>{a.year || "-"}</td>
                <td>
                  <div className={clsx("badge badge-sm", a.visibility === 'public' ? "badge-success" : "badge-ghost")}>
                     {a.visibility === 'public' ? <Globe size={12} className="mr-1"/> : <Lock size={12} className="mr-1"/>}
                     {a.visibility || 'private'}
                  </div>
                </td>
                <td>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-xs btn-ghost gap-1"
                      onClick={() => document.dispatchEvent(new CustomEvent("open-admin-release-modal", { detail: a }))}
                    >
                      <Edit size={14} /> Edit
                    </button>
                    <button
                      className="btn btn-xs btn-ghost text-primary gap-1 tooltip tooltip-top"
                      onClick={() => handlePromote(a.id)}
                      data-tip="Promote to formal Release"
                    >
                      <Share2 size={14} /> Promote
                    </button>
                    <button
                      className="btn btn-xs btn-ghost text-error"
                      onClick={() => handleDelete(a.id, a.title)}
                    >
                      <Trash2 size={14} />
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
