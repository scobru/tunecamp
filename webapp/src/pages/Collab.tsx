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
  const [initialStem, setInitialStem] = useState<File | null>(null);
  const [bgImage, setBgImage] = useState<File | null>(null);
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
    if (!title.trim() || !initialStem) return;
    setCreating(true);
    try {
      const project = await API.createCollabProject({ title: title.trim(), description: description.trim() || undefined });
      
      // Upload initial stem
      const stem = await API.uploadCollabStem(project.id, initialStem);
      
      // Read background image as base64 if present
      let backgroundImageBase64 = null;
      if (bgImage) {
        backgroundImageBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(bgImage);
        });
      }
      
      // Create initial version with a locked track
      const state = {
        tracks: [
          {
            id: `track-${Date.now()}`,
            name: stem.name,
            volume: 1.0,
            muted: false,
            solo: false,
            locked: true,
            samples: [
              {
                id: `clip-${Date.now()}`,
                sampleId: stem.id.toString(),
                name: stem.name,
                startTime: 0,
                duration: 10,
                url: API.getCollabStemUrl(project.id, stem.id),
              }
            ]
          }
        ],
        stems: [{ id: stem.id, name: stem.name }],
        backgroundImage: backgroundImageBase64
      };
      
      await API.saveCollabVersion(project.id, JSON.stringify(state), "Initial base track");
      
      setTitle("");
      setDescription("");
      setInitialStem(null);
      setBgImage(null);
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
              <div className="space-y-1">
                <label className="text-xs font-bold opacity-70 ml-1">Initial Base Track (Required)</label>
                <input
                  type="file"
                  accept="audio/*"
                  className="file-input file-input-bordered w-full rounded-xl"
                  onChange={(e) => setInitialStem(e.target.files?.[0] || null)}
                  disabled={creating}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold opacity-70 ml-1">Canvas Background Image (Optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  className="file-input file-input-bordered w-full rounded-xl"
                  onChange={(e) => setBgImage(e.target.files?.[0] || null)}
                  disabled={creating}
                />
              </div>
              <button type="submit" className="btn btn-primary rounded-xl gap-2 mt-2" disabled={creating || !title.trim() || !initialStem}>
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
