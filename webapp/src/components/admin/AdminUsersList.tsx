import { useState, useEffect } from "react";
import API from "../../services/api";
import { User, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "../../stores/useAuthStore";

export const AdminUsersList = () => {
  const { user, role } = useAuthStore();
  const isRootAdmin = !!user?.isRootAdmin || role === 'root_admin';
  const [users, setUsers] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const loadUsers = () => API.getUsers().then(setUsers).catch(console.error);

  useEffect(() => {
    loadUsers();
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
      !confirm(
        `Are you sure you want to delete user ${username}? This cannot be undone.`,
      )
    )
      return;
    try {
      await API.deleteUser(String(id));
      loadUsers();
    } catch (e: any) {
      console.error(e);
      alert("Failed to delete user: " + (e.message || "Unknown error"));
    }
  };

  const handleDeleteBatch = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Permanently delete ${selectedIds.length} selected users? This cannot be undone.`)) return;
    try {
        await API.deleteUsersBatch(selectedIds);
        setSelectedIds([]);
        loadUsers();
    } catch (e: any) {
        alert("Batch delete failed: " + (e.message || "Unknown error"));
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
                {u.is_active === 0 && (
                  <span className="badge badge-error ml-2">Disabled</span>
                )}
              </td>
              <td className="opacity-70">
                {u.artist_id ? (
                  <span className="flex items-center gap-1">
                    <User size={12} /> {u.artist_name || "Linked"}
                  </span>
                ) : (
                  "-"
                )}
              </td>
              <td className="opacity-50">
                {new Date(u.createdAt).toLocaleDateString()}
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

