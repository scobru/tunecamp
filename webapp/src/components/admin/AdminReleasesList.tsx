import { useState, useEffect } from "react";
import API from "../../services/api";
import { Globe, Lock, Send, CheckCircle, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useAuthStore } from "../../stores/useAuthStore";

export const AdminReleasesList = ({ mine }: { mine?: boolean }) => {
  const { user, role } = useAuthStore();
  const navigate = useNavigate();
  const [releases, setReleases] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const loadReleases = () =>
    API.getAdminReleases({ mine }).then(setReleases).catch(console.error);

  useEffect(() => {
    loadReleases();
    window.addEventListener("refresh-admin-releases", loadReleases);
    return () =>
      window.removeEventListener("refresh-admin-releases", loadReleases);
  }, [mine]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(releases.map((r) => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Permanently delete ${selectedIds.length} selected items?`)) return;
    
    try {
        await API.deleteReleasesBatch(selectedIds);
        setSelectedIds([]);
        loadReleases();
    } catch (e: any) {
        alert("Batch delete failed: " + e.message);
    }
  };

  const handlePromote = async (id: number) => {
    if (!confirm("Request promotion to public release? This will notify the Admin.")) return;
    try {
        await API.requestPromotion(id);
        alert("Promotion requested!");
        loadReleases();
    } catch (e: any) {
        alert("Promotion failed: " + e.message);
    }
  };

  const handleFinalize = async (id: number) => {
    if (!confirm("Finalize release? This will broadcast it to the Fediverse and Zen network.")) return;
    try {
        await API.finalizeRelease(id);
        alert("Release finalized!");
        loadReleases();
    } catch (e: any) {
        alert("Finalization failed: " + e.message);
    }
  };

  const handleToggleVisibility = async (e: React.MouseEvent, release: any) => {
    e.stopPropagation(); // prevent row click if any
    const newVisibility =
      release.visibility === "public" ? "private" : "public";

    // Optimistic update
    const oldReleases = [...releases];
    setReleases(
      releases.map((r) =>
        r.id === release.id ? { ...r, visibility: newVisibility } : r,
      ),
    );

    try {
      await API.toggleReleaseVisibility(release.id, newVisibility);
    } catch (e) {
      console.error(e);
      alert("Failed to update visibility");
      setReleases(oldReleases); // Rollback
    }
  };

  const handleVisibilityBatch = async (visibility: 'public' | 'private') => {
    if (selectedIds.length === 0) return;
    try {
        await API.updateReleasesVisibilityBatch(selectedIds, visibility);
        setSelectedIds([]);
        loadReleases();
    } catch (e: any) {
        alert("Batch visibility update failed: " + e.message);
    }
  };

  if (releases.length === 0)
    return (
      <div className="opacity-50 text-center py-4">No releases found.</div>
    );

  return (
    <div className="flex flex-col gap-4">
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-4 p-2 bg-base-200 rounded-lg border border-base-300 animate-in fade-in slide-in-from-top-2">
            <span className="text-sm font-medium ml-2">{selectedIds.length} items selected</span>
            
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
                onClick={handleDeleteSelected}
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
      <table className="table">
        <thead>
          <tr>
            <th className="w-10">
                <input 
                    type="checkbox" 
                    className="checkbox checkbox-sm" 
                    checked={selectedIds.length === releases.length && releases.length > 0}
                    onChange={handleSelectAll}
                />
            </th>
            <th>Title</th>
            <th>Artist</th>
            <th>Type</th>
            <th>Status</th>
            <th>Visibility</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {releases.map((r) => (
            <tr key={r.id} className={clsx(selectedIds.includes(r.id) && "bg-base-200/50")}>
              <td>
                <input 
                    type="checkbox" 
                    className="checkbox checkbox-sm" 
                    checked={selectedIds.includes(r.id)}
                    onChange={() => handleSelectOne(r.id)}
                />
              </td>
              <td className="font-bold">
                  <div className="flex items-center gap-2">
                      {r.title}
                      {r.is_formal_release ? (
                          <span className="badge badge-outline badge-xs text-[10px] opacity-70">Release</span>
                      ) : (
                          <span className="badge badge-ghost badge-xs text-[10px] opacity-70">Library</span>
                      )}
                  </div>
              </td>
              <td>{r.artistName}</td>
              <td>
                <div className="badge badge-sm">{r.type}</div>
              </td>
              <td>
                <div className={clsx("badge badge-sm", {
                  'badge-ghost opacity-50': r.status === 'draft',
                  'badge-info': r.status === 'pending',
                  'badge-warning': r.status === 'approved' || r.status === 'awaiting_finalization',
                  'badge-success': r.status === 'released'
                })}>
                  {r.status || 'draft'}
                </div>
              </td>
              <td>
                <button
                  className={`btn btn-xs btn-ghost gap-1 ${r.visibility === "public" ? "text-success" : "text-base-content/50"}`}
                  onClick={(e) => handleToggleVisibility(e, r)}
                  title={r.visibility === "public" ? "Public" : "Private"}
                >
                  {r.visibility === "public" ? (
                    <Globe size={14} />
                  ) : (
                    <Lock size={14} />
                  )}
                  <span className="hidden md:inline">{r.visibility}</span>
                </button>
              </td>
              <td className="flex gap-2">
                {r.status === 'draft' && mine && (user?.isRootAdmin || r.owner_id === user?.userId || (role === 'admin' && !user?.artistId) || role === 'super_user') && (
                    <button 
                      className="btn btn-xs btn-primary gap-1"
                      onClick={() => handlePromote(r.id)}
                    >
                        <Send size={12} /> Promote
                    </button>
                )}
                {r.status === 'awaiting_finalization' && mine && (
                    <button 
                      className="btn btn-xs btn-success gap-1"
                      onClick={() => handleFinalize(r.id)}
                    >
                        <CheckCircle size={12} /> Finalize
                    </button>
                )}
                <button
                  className="btn btn-xs btn-ghost"
                  onClick={() => {
                    if (r.is_formal_release) {
                      navigate(`/admin/release/${r.id}/edit`);
                    } else {
                      document.dispatchEvent(
                        new CustomEvent("open-admin-release-modal", {
                          detail: r,
                        }),
                      );
                    }
                  }}
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

