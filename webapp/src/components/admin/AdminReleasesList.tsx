import { useState, useEffect } from "react";
import API from "../../services/api";
import { Globe, Lock, Send, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";

export const AdminReleasesList = ({ mine }: { mine?: boolean }) => {
  const navigate = useNavigate();
  const [releases, setReleases] = useState<any[]>([]);

  const loadReleases = () =>
    API.getAdminReleases({ mine }).then(setReleases).catch(console.error);

  useEffect(() => {
    loadReleases();
    window.addEventListener("refresh-admin-releases", loadReleases);
    return () =>
      window.removeEventListener("refresh-admin-releases", loadReleases);
  }, [mine]);

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

  if (releases.length === 0)
    return (
      <div className="opacity-50 text-center py-4">No releases found.</div>
    );

  return (
    <table className="table">
      <thead>
        <tr>
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
          <tr key={r.id}>
            <td className="font-bold">{r.title}</td>
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
              {r.status === 'draft' && mine && (
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
  );
};
