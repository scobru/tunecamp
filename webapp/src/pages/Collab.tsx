import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Users, Plus, Lock, GitBranch } from "lucide-react";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { canPublish } from "../utils/permissions";
import { PageHeader } from "../components/ui/PageHeader";
import { notify } from "../utils/notify";
import { StringUtils } from "../utils/stringUtils";
import type { CollabProject } from "../types";

const Collab = () => {
  const { user, isAuthenticated, role } = useAuthStore();
  const [projects, setProjects] = useState<CollabProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const canCreate = isAuthenticated && canPublish(user, role);

  const load = () => {
    setLoading(true);
    API.getCollabProjects()
      .then(setProjects)
      .catch((err) => notify.error(err, "Failed to load collab projects"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isAuthenticated) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      await API.createCollabProject({ title: title.trim(), description: description.trim() || undefined });
      setTitle("");
      setDescription("");
      load();
    } catch (err) {
      notify.error(err, "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Collab"
        subtitle="Build tracks together with other artists on this instance."
        icon={Users}
        iconColor="text-primary"
        gradientFrom="from-primary/20"
        gradientTo="to-primary/5"
      />

      {!isAuthenticated ? (
        <div className="max-w-md mx-auto my-16 p-8 text-center bg-base-200/50 rounded-3xl border border-base-content/5 glass-effect space-y-4">
          <Lock size={32} className="mx-auto opacity-40" />
          <p className="text-sm opacity-60">Log in to see and join collab projects.</p>
        </div>
      ) : (
        <>
          {canCreate && (
            <form onSubmit={handleCreate} className="card bg-base-200/40 border border-base-content/5 rounded-3xl p-6 space-y-3">
              <h3 className="font-black text-lg">Start a new project</h3>
              <input
                type="text"
                className="input input-bordered w-full rounded-xl"
                placeholder="Project title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={creating}
                required
              />
              <textarea
                className="textarea textarea-bordered w-full rounded-xl resize-none"
                placeholder="What are you building? (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={creating}
              />
              <button type="submit" className="btn btn-primary rounded-xl gap-2" disabled={creating || !title.trim()}>
                {creating ? <span className="loading loading-spinner loading-xs" /> : <Plus size={16} />}
                Create Project
              </button>
            </form>
          )}

          {loading ? (
            <div className="flex justify-center p-16"><span className="loading loading-spinner loading-lg" /></div>
          ) : projects.length === 0 ? (
            <div className="text-center py-20 opacity-30 space-y-3">
              <Users size={48} className="mx-auto" />
              <p className="text-lg font-bold">No collab projects yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  to={`/collab/${p.id}`}
                  className="card bg-base-100 border border-base-content/5 shadow-sm hover:shadow-lg hover:border-primary/30 transition-all hover:-translate-y-0.5 p-5 space-y-2"
                >
                  <h3 className="font-bold text-sm">{p.title}</h3>
                  {p.description && <p className="text-xs opacity-60 line-clamp-2">{p.description}</p>}
                  <div className="flex items-center justify-between text-[11px] opacity-40 font-bold pt-2">
                    <span className="flex items-center gap-1"><GitBranch size={11} /> {p.versionCount} version{p.versionCount === 1 ? '' : 's'}</span>
                    <span>{StringUtils.formatTimeAgo(new Date(p.updatedAt).getTime())}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Collab;
