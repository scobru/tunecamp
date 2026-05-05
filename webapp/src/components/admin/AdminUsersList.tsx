import { useState, useEffect } from "react";
import API from "../../services/api";
import { User } from "lucide-react";

export const AdminUsersList = () => {
  const [users, setUsers] = useState<any[]>([]);

  const loadUsers = () => API.getUsers().then(setUsers).catch(console.error);

  useEffect(() => {
    loadUsers();
    window.addEventListener("refresh-admin-users", loadUsers);
    return () => window.removeEventListener("refresh-admin-users", loadUsers);
  }, []);

  const handleDelete = async (id: string, username: string) => {
    if (
      !confirm(
        `Are you sure you want to delete user ${username}? This cannot be undone.`,
      )
    )
      return;
    try {
      await API.deleteUser(id);
      loadUsers();
    } catch (e) {
      console.error(e);
      alert("Failed to delete user");
    }
  };

  if (users.length === 0)
    return <div className="opacity-50 text-center py-4">No users found.</div>;

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Username</th>
          <th>Role</th>
          <th>Linked Artist</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id}>
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
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

