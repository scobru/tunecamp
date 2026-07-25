import { confirm } from '@/utils/confirm';
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Upload, Trash2, GitBranch, Play, Pause, Save } from "lucide-react";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { canPublish } from "../utils/permissions";
import { notify } from "../utils/notify";
import { StringUtils } from "../utils/stringUtils";
import type { CollabProject } from "../types";

const CollabDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, role } = useAuthStore();
  const [project, setProject] = useState<CollabProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionNote, setVersionNote] = useState("");
  const [playingStemId, setPlayingStemId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const canContribute = isAuthenticated && canPublish(user, role);
  const isOwner = isAuthenticated && project != null && user?.userId != null && project.ownerId === user.userId;

  const load = () => {
    if (!id) return;
    setLoading(true);
    API.getCollabProject(parseInt(id, 10))
      .then(setProject)
      .catch((err) => notify.error(err, "Failed to load project"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  useEffect(() => {
    const audio = audioRef.current ?? (audioRef.current = new Audio());
    const onEnd = () => setPlayingStemId(null);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('ended', onEnd);
      audio.pause();
    };
  }, []);

  const toggleStem = (stemId: number, url: string) => {
    const audio = audioRef.current!;
    if (playingStemId === stemId) {
      audio.pause();
      setPlayingStemId(null);
      return;
    }
    audio.src = url;
    audio.currentTime = 0;
    audio.play();
    setPlayingStemId(stemId);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;
    setUploading(true);
    try {
      await API.uploadCollabStem(project.id, file);
      load();
    } catch (err) {
      notify.error(err, "Failed to upload stem");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteStem = async (stemId: number) => {
    if (!project || !await confirm("Delete this stem?")) return;
    try {
      await API.deleteCollabStem(project.id, stemId);
      load();
    } catch (err) {
      notify.error(err, "Failed to delete stem");
    }
  };

  const handleSaveVersion = async () => {
    if (!project) return;
    setSavingVersion(true);
    try {
      const state = JSON.stringify({ stems: (project.stems ?? []).map((s) => ({ id: s.id, name: s.name })) });
      await API.saveCollabVersion(project.id, state, versionNote.trim() || undefined);
      setVersionNote("");
      load();
    } catch (err) {
      notify.error(err, "Failed to save version");
    } finally {
      setSavingVersion(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!project || !await confirm("Delete this whole project? This cannot be undone.")) return;
    try {
      await API.deleteCollabProject(project.id);
      navigate("/collab");
    } catch (err) {
      notify.error(err, "Failed to delete project");
    }
  };

  if (loading) {
    return <div className="flex justify-center p-16"><span className="loading loading-spinner loading-lg" /></div>;
  }

  if (!project) {
    return (
      <div className="text-center py-20 opacity-40 space-y-3">
        <p className="text-lg font-bold">Project not found.</p>
        <Link to="/collab" className="btn btn-sm rounded-xl">Back to Collab</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <div className="flex items-center gap-3">
        <Link to="/collab" className="btn btn-ghost btn-sm btn-circle"><ArrowLeft size={18} /></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-black">{project.title}</h1>
          {project.description && <p className="text-sm opacity-60">{project.description}</p>}
        </div>
        {isOwner && (
          <button onClick={handleDeleteProject} className="btn btn-ghost btn-sm text-error gap-2">
            <Trash2 size={14} /> Delete Project
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-lg flex items-center gap-2"><Upload size={16} /> Stems</h2>
            {canContribute && (
              <>
                <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleUpload} disabled={uploading} />
                <button className="btn btn-primary btn-sm rounded-xl gap-2" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <span className="loading loading-spinner loading-xs" /> : <Upload size={14} />}
                  Upload Stem
                </button>
              </>
            )}
          </div>

          {(project.stems ?? []).length === 0 ? (
            <div className="text-center py-12 opacity-40 border border-dashed border-base-content/10 rounded-3xl">
              <p className="text-sm font-semibold">No stems uploaded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(project.stems ?? []).map((stem) => (
                <div key={stem.id} className="card bg-base-100 border border-base-content/5 rounded-2xl p-4 flex flex-row items-center gap-3">
                  <button
                    className="btn btn-circle btn-sm btn-primary"
                    onClick={() => toggleStem(stem.id, API.getCollabStemUrl(project.id, stem.id))}
                  >
                    {playingStemId === stem.id ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{stem.name}</p>
                    <p className="text-xs opacity-50">{stem.authorUsername || 'Unknown'} · {StringUtils.formatTimeAgo(new Date(stem.createdAt).getTime())}</p>
                  </div>
                  {(stem.authorId === user?.userId || isOwner) && (
                    <button className="btn btn-ghost btn-xs text-error" onClick={() => handleDeleteStem(stem.id)}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {canContribute && (
            <div className="card bg-base-200/40 border border-base-content/5 rounded-3xl p-5 space-y-3">
              <h3 className="font-black text-sm">Save Version</h3>
              <textarea
                className="textarea textarea-bordered textarea-sm w-full rounded-xl resize-none"
                placeholder="What changed? (optional)"
                value={versionNote}
                onChange={(e) => setVersionNote(e.target.value)}
                disabled={savingVersion}
              />
              <button className="btn btn-primary btn-sm rounded-xl gap-2 w-full" onClick={handleSaveVersion} disabled={savingVersion}>
                {savingVersion ? <span className="loading loading-spinner loading-xs" /> : <Save size={14} />}
                Save Snapshot
              </button>
            </div>
          )}

          <div className="card bg-base-100 border border-base-content/5 rounded-3xl p-5 space-y-3">
            <h3 className="font-black text-sm flex items-center gap-2"><GitBranch size={14} /> Version History</h3>
            {(project.versions ?? []).length === 0 ? (
              <p className="text-xs opacity-40">No versions saved yet.</p>
            ) : (
              <ul className="space-y-2">
                {(project.versions ?? []).map((v) => (
                  <li key={v.id} className="text-xs border-l-2 border-primary/30 pl-3 py-1">
                    <p className="font-bold">v{v.version} · {v.authorUsername || 'Unknown'}</p>
                    {v.note && <p className="opacity-60">{v.note}</p>}
                    <p className="opacity-40">{StringUtils.formatTimeAgo(new Date(v.createdAt).getTime())}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollabDetail;
