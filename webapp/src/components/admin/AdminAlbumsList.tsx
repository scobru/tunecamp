import { useState, useEffect } from "react";
import API from "../../services/api";
import { Disc, Edit, Trash2, Globe, Lock, Share2 } from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "../../stores/useAuthStore";

export const AdminAlbumsList = ({ mine }: { mine?: boolean }) => {
  const { user } = useAuthStore();
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAlbums = async () => {
    setLoading(true);
    try {
      // getAlbums returns owned + public + starred.
      const data = await API.getAlbums();
      
      // If "mine" is requested, filter to show only albums owned by this user
      // or if they are the artist.
      let filtered = data;
      if (mine && user?.userId) {
        filtered = data.filter(a => (a as any).owner_id === user.userId || (user.artistId && (a as any).artist_id === user.artistId));
      }
      
      // Filter out formal releases if we want ONLY library albums
      // (Usually releases have is_release=1 or are formal releases)
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

  const handleDelete = async (id: string | number, title: string) => {
    if (!confirm(`Are you sure you want to delete album "${title}"? Tracks will not be deleted unless you choose to in the next step.`)) return;
    const keepFiles = confirm("Keep audio files on server?");
    try {
      await API.deleteAlbum(String(id), keepFiles);
      loadAlbums();
    } catch (e: any) {
      alert("Delete failed: " + e.message);
    }
  };

  const handlePromote = async (id: string | number) => {
      if (!confirm("Promote this library album to a formal Release? This will allow it to be sold and federated.")) return;
      try {
          await API.promoteToRelease(String(id));
          alert("Album promoted to release draft!");
          window.dispatchEvent(new CustomEvent("refresh-admin-releases"));
          loadAlbums();
      } catch (e: any) {
          alert("Promotion failed: " + e.message);
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
    <div className="overflow-x-auto">
      <table className="table w-full">
        <thead>
          <tr>
            <th className="w-16">Cover</th>
            <th>Title</th>
            <th>Artist</th>
            <th>Year</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {albums.map((a) => (
            <tr key={a.id} className="hover:bg-base-200/50 transition-colors">
              <td>
                <div className="avatar">
                  <div className="w-12 h-12 rounded-lg bg-neutral flex items-center justify-center overflow-hidden">
                    {a.coverPath || a.coverImage ? (
                      <img src={API.getAlbumCoverUrl(a.id)} alt={a.title} className="object-cover w-full h-full" />
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
                    className="btn btn-xs btn-ghost text-primary gap-1"
                    onClick={() => handlePromote(a.id)}
                    title="Promote to formal Release"
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
  );
};
