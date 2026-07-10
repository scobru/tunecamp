import { confirm } from '@/utils/confirm';
import { useState, useEffect } from "react";
import API from "../../services/api";
import { User, Trash2, Check, X } from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "../../stores/useAuthStore";
import { notify } from "../../utils/notify";

export const AdminUsersList = () => {
  const { user, role } = useAuthStore();
  const isRootAdmin = !!user?.isRootAdmin || role === 'root_admin';
  const [users, setUsers] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selfPublishEnabled, setSelfPublishEnabled] = useState(false);

  const loadUsers = () => API.getUsers().then(setUsers).catch(console.error);

  useEffect(() => {
    loadUsers();
    API.getSiteSettings()
      .then((s) => setSelfPublishEnabled(s?.listenerSelfPublish === true || (s?.listenerSelfPublish as any) === "true"))
      .catch(() => {});
    window.addEventListener("refresh-admin-users", loadUsers);
    return () => window.removeEventListener("refresh-admin-users", loadUsers);
  }, []);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(users.map((u) => u.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleDelete = async (id: string | number, username: string) => {
    if (
      !await confirm(
        `Are you sure you want to delete user ${username}? This cannot be undone.`,
      )
    )
      return;
    try {
      await API.deleteUser(String(id));
      loadUsers();
    } catch (e: any) {
      console.error(e);
      notify.error(e, "Failed to delete user");
    }
  };

  const handleApproveArtist = async (id: string | number, username: string) => {
    try {
      await API.approveArtistRequest(id);
      notify.success(`Artist profile created for ${username}`);
      loadUsers();
      window.dispatchEvent(new CustomEvent("refresh-admin-artists"));
    } catch (e: any) {
      notify.error(e, "Failed to approve artist request");
    }
  };

  const handleDismissArtist = async (id: string | number) => {
    try {
      await API.dismissArtistRequest(id);
      loadUsers();
    } catch (e: any) {
      notify.error(e, "Failed to dismiss artist request");
    }
  };

  const handleDeleteBatch = async () => {
    if (selectedIds.length === 0) return;
    if (!await confirm(`Permanently delete ${selectedIds.length} selected users? This cannot be undone.`)) return;
    try {
        await API.deleteUsersBatch(selectedIds);
        setSelectedIds([]);
        loadUsers();
    } catch (e: any) {
        notify.error(e, "Batch delete failed");
    }
  };

  if (users.length === 0)
    return <div className="opacity-50 text-center py-4">No users found.</div>;

  return (
    <div className="flex flex-col gap-4">
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-4 p-2 bg-error/10 rounded-lg border border-error/20 animate-in fade-in slide-in-from-top-2">
            <span className="text-sm font-medium text-error ml-2">{selectedIds.length} users selected</span>
            
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

      <table className="table">
        <thead>
          <tr>
            {isRootAdmin && (
              <th className="w-10">
                  <input 
                      type="checkbox" 
                      className="checkbox checkbox-sm" 
                      checked={selectedIds.length === users.length && users.length > 0}
                      onChange={handleSelectAll}
                  />
              </th>
            )}
            <th>Username</th>
            <th>Role</th>
            <th>Linked Artist</th>
            <th>Peer Sharing</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={clsx(selectedIds.includes(u.id) && "bg-base-200")}>
              {isRootAdmin && (
                <td>
                  <input 
                      type="checkbox" 
                      className="checkbox checkbox-sm" 
                      checked={selectedIds.includes(u.id)}
                      onChange={() => handleSelectOne(u.id)}
                  />
                </td>
              )}
              <td className="font-bold">{u.username}</td>
              <td>
                {u.role === "root_admin" ? (
                  <span className="badge badge-accent badge-outline">Root Admin</span>
                ) : u.role === "admin" ? (
                  <span className="badge badge-primary badge-outline">Manager</span>
                ) : u.role === "super_user" ? (
                  <span className="badge badge-info badge-outline">Curator</span>
                ) : (
                  <span className="badge badge-ghost">Listener</span>
                )}
                {u.role === "user" && u.artist_id && (
                  <span className="badge badge-accent badge-outline ml-2 text-[10px]">🎨 Artist</span>
                )}
                {u.is_active === 0 && (
                  <span className="badge badge-error ml-2">Disabled</span>
                )}
              </td>
              <td className="opacity-70">
                {u.artist_id && u.artist_name ? (
                  <span className="flex items-center gap-1">
                    <User size={12} /> {u.artist_name}
                  </span>
                ) : u.artist_requested_at && !selfPublishEnabled ? (
                  <span className="flex items-center gap-2">
                    <span className="badge badge-warning badge-outline badge-sm">Artist requested</span>
                    {isRootAdmin && (
                      <>
                        <button
                          className="btn btn-xs btn-success btn-outline gap-1 tooltip"
                          data-tip="Approve: create artist profile and link it"
                          onClick={() => handleApproveArtist(u.id, u.username)}
                        >
                          <Check size={12} /> Approve
                        </button>
                        <button
                          className="btn btn-xs btn-ghost text-error tooltip"
                          data-tip="Dismiss request"
                          onClick={() => handleDismissArtist(u.id)}
                        >
                          <X size={12} />
                        </button>
                      </>
                    )}
                  </span>
                ) : (
                  "-"
                )}
              </td>
              <td>
                <input
                  type="checkbox"
                  className="toggle toggle-xs toggle-primary tooltip"
                  data-tip={u.role === "root_admin" || u.role === "admin" ? "Admins can always use peer sharing" : undefined}
                  checked={u.can_peer === 1 || u.role === "root_admin" || u.role === "admin"}
                  disabled={u.id === 1 || u.role === "root_admin" || u.role === "admin" || !isRootAdmin}
                  onChange={async () => {
                    try {
                      await API.updateUserCanPeer(u.id, u.can_peer !== 1);
                      notify.success(`Updated peer permission for ${u.username}`);
                      loadUsers();
                    } catch (e: any) {
                      notify.error(e, "Failed to update peer permission");
                    }
                  }}
                />
              </td>
              <td className="opacity-50">
                {u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}
              </td>
              <td className="flex gap-2">
                {isRootAdmin ? (
                  <>
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={() =>
                        document.dispatchEvent(
                          new CustomEvent("open-admin-user-modal", { detail: u }),
                        )
                      }
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-xs btn-ghost text-error"
                      onClick={() => handleDelete(u.id, u.username)}
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <span className="text-xs opacity-40 italic">Read-only</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

