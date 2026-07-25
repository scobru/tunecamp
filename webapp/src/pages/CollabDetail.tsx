import { confirm } from "@/utils/confirm";
import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Upload, Trash2, GitBranch, Play, Pause, Save, Plus, Sliders } from "lucide-react";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { canPublish } from "../utils/permissions";
import { notify } from "../utils/notify";
import { StringUtils } from "../utils/stringUtils";
import type { CollabProject, CollabStem } from "../types";
import { audioEngine } from "../core/collab/AudioEngine";
import type { TrackState, TrackClip } from "../core/collab/AudioEngine";
import { TimelineEditor } from "../components/collab/TimelineEditor";
import { TransportBar } from "../components/collab/TransportBar";
import { CanvasVisualizer } from "../components/collab/CanvasVisualizer";
import { SampleLibraryModal } from "../components/collab/SampleLibraryModal";

const CollabDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, role } = useAuthStore();
  const [project, setProject] = useState<CollabProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionNote, setVersionNote] = useState("");
  const [playingStemId, setPlayingStemId] = useState<number | null>(null);

  // Timeline DAW State
  const [tracks, setTracks] = useState<TrackState[]>([
    { id: "track-1", name: "Track 1", volume: 1.0, muted: false, solo: false, samples: [] },
  ]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>("track-1");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState<number>(50);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);

  // Modals & Overlays
  const [sampleModalOpen, setSampleModalOpen] = useState(false);
  const [canvasActive, setCanvasActive] = useState(false);
  
  const [recordingStartTime, setRecordingStartTime] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bgInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const canContribute = isAuthenticated && canPublish(user, role);
  const isOwner = isAuthenticated && project != null && user?.userId != null && project.ownerId === user.userId;

  const load = () => {
    if (!id) return;
    setLoading(true);
    API.getCollabProject(parseInt(id, 10))
      .then((proj) => {
        setProject(proj);
        // Preload stem buffers in background
        if (proj.stems && proj.stems.length > 0) {
          proj.stems.forEach((stem) => {
            const url = API.getCollabStemUrl(proj.id, stem.id);
            audioEngine.loadAudioFromUrl(url, stem.id.toString()).catch(() => {});
          });
        }
        // Load state from latest version if available
        if (proj.versions && proj.versions.length > 0) {
          const latest = proj.versions[0];
          parseAndApplyVersionState(latest.state);
        }
      })
      .catch((err) => notify.error(err, "Failed to load project"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    return () => {
      audioEngine.stopPlayback();
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [id]);

  useEffect(() => {
    const updateTime = () => {
      if (audioEngine.isPlaying) {
        setCurrentTime(audioEngine.getCurrentTime());
        setIsPlaying(true);
        animFrameRef.current = requestAnimationFrame(updateTime);
      } else {
        setIsPlaying(false);
      }
    };

    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateTime);
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  const parseAndApplyVersionState = (rawState: string) => {
    try {
      const parsed = JSON.parse(rawState);
      if (parsed.tracks && Array.isArray(parsed.tracks) && parsed.tracks.length > 0) {
        setTracks(parsed.tracks);
        if (parsed.tracks[0]?.id) setSelectedTrackId(parsed.tracks[0].id);
      }
      if (parsed.backgroundImage !== undefined) {
        setBackgroundImage(parsed.backgroundImage);
      }
    } catch {
      // Ignore unparseable state
    }
  };

  const handlePlay = () => {
    audioEngine.playTimeline(tracks);
    setIsPlaying(true);
  };

  const handlePause = () => {
    audioEngine.pausePlayback();
    setIsPlaying(false);
  };

  const handleStop = () => {
    audioEngine.stopPlayback();
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const handleSeek = (seconds: number) => {
    audioEngine.seek(seconds);
    setCurrentTime(seconds);
  };

  const handleAddTrack = () => {
    const newTrackId = `track-${Date.now()}`;
    const newTrack: TrackState = {
      id: newTrackId,
      name: `Track ${tracks.length + 1}`,
      volume: 1.0,
      muted: false,
      solo: false,
      samples: [],
    };
    setTracks([...tracks, newTrack]);
    setSelectedTrackId(newTrackId);
  };

  const handleSelectStemForTrack = (stem: CollabStem) => {
    const targetTrackId = selectedTrackId || tracks[0]?.id;
    if (!targetTrackId) return;

    const stemIdStr = stem.id.toString();
    const stemUrl = API.getCollabStemUrl(project!.id, stem.id);

    // Preload audio into engine if not present
    audioEngine.loadAudioFromUrl(stemUrl, stemIdStr);

    const newClip: TrackClip = {
      id: `clip-${Date.now()}`,
      sampleId: stemIdStr,
      name: stem.name,
      startTime: currentTime,
      duration: 10, // Default estimated duration
      url: stemUrl,
    };

    setTracks(
      tracks.map((t) => (t.id === targetTrackId ? { ...t, samples: [...t.samples, newClip] } : t))
    );
    notify.success(`Added ${stem.name} to track`);
  };

  const handleToggleRecord = async () => {
    if (isRecording) {
      const blob = await audioEngine.stopRecording();
      setIsRecording(false);
      
      // Stop playback if we were playing while recording
      if (isPlaying) {
        handlePause();
      }

      if (blob && project) {
        setUploading(true);
        try {
          const file = new File([blob], `Mic Recording ${new Date().toLocaleTimeString()}.webm`, { type: blob.type });
          const stem = await API.uploadCollabStem(project.id, file);
          
          notify.success("Recording uploaded as stem!");
          
          // Add as new track automatically
          const newTrackId = `track-${Date.now()}`;
          const newClip: TrackClip = {
            id: `clip-${Date.now()}`,
            sampleId: stem.id.toString(),
            name: stem.name,
            startTime: recordingStartTime,
            duration: 10, // Default estimate, gets clamped by buffer anyway
            url: API.getCollabStemUrl(project.id, stem.id),
          };
          
          setTracks(prev => [
            ...prev,
            {
              id: newTrackId,
              name: stem.name,
              volume: 1.0,
              muted: false,
              solo: false,
              samples: [newClip]
            }
          ]);
          setSelectedTrackId(newTrackId);
          
          // Trigger a load to fetch the stem in the library list too
          load();
        } catch (err) {
          notify.error(err, "Failed to upload mic recording");
        } finally {
          setUploading(false);
        }
      }
    } else {
      try {
        await audioEngine.startRecording();
        setIsRecording(true);
        setRecordingStartTime(currentTime);
        
        // Auto-play the timeline so they can sing along
        if (!isPlaying) {
          handlePlay();
        }
        
        notify.info("Recording microphone...");
      } catch (err) {
        notify.error(err, "Could not access microphone");
      }
    }
  };

  const handleExportWav = async () => {
    if (tracks.every((t) => t.samples.length === 0)) {
      notify.error("No clips on timeline to export!");
      return;
    }
    try {
      notify.info("Rendering mixdown WAV...");
      const wavBlob = await audioEngine.exportWav(tracks);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project?.title || "collab"}-mixdown.wav`;
      a.click();
      URL.revokeObjectURL(url);
      notify.success("WAV export complete!");
    } catch (err) {
      notify.error(err, "Failed to export WAV");
    }
  };

  const toggleStem = (stemId: number, url: string) => {
    const audio = audioRef.current ?? (audioRef.current = new Audio());
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
      notify.success("Stem uploaded successfully!");
      load();
    } catch (err) {
      notify.error(err, "Failed to upload stem");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteStem = async (stemId: number) => {
    if (!project || !(await confirm("Delete this stem?"))) return;
    try {
      await API.deleteCollabStem(project.id, stemId);
      load();
    } catch (err) {
      notify.error(err, "Failed to delete stem");
    }
  };

  const handleUploadBg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = () => {
      setBackgroundImage(reader.result as string);
      notify.success("Background image updated (remember to save a snapshot!)");
    };
    reader.readAsDataURL(file);
    
    if (bgInputRef.current) bgInputRef.current.value = "";
  };

  const handleSaveVersion = async () => {
    if (!project) return;
    setSavingVersion(true);
    try {
      const state = JSON.stringify({ 
        tracks, 
        stems: (project.stems ?? []).map((s) => ({ id: s.id, name: s.name })),
        backgroundImage 
      });
      await API.saveCollabVersion(project.id, state, versionNote.trim() || undefined);
      notify.success("Snapshot version saved!");
      setVersionNote("");
      load();
    } catch (err) {
      notify.error(err, "Failed to save version");
    } finally {
      setSavingVersion(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!project || !(await confirm("Delete this whole project? This cannot be undone."))) return;
    try {
      await API.deleteCollabProject(project.id);
      navigate("/collab");
    } catch (err) {
      notify.error(err, "Failed to delete project");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-16">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20 opacity-40 space-y-3">
        <p className="text-lg font-bold">Project not found.</p>
        <Link to="/collab" className="btn btn-sm rounded-xl">
          Back to Collab
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/collab" className="btn btn-ghost btn-sm btn-circle">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black truncate">{project.title}</h1>
          {project.description && <p className="text-xs opacity-60 truncate">{project.description}</p>}
        </div>
        {isOwner && (
          <button onClick={handleDeleteProject} className="btn btn-ghost btn-sm text-error gap-2">
            <Trash2 size={14} /> Delete Project
          </button>
        )}
      </div>

      {/* Multitrack DAW Visual Composition Editor */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-lg flex items-center gap-2">
            <Sliders size={18} className="text-primary" /> Composition Studio
          </h2>
          {canContribute && (
            <button
              className="btn btn-primary btn-sm rounded-xl gap-2"
              onClick={() => setSampleModalOpen(true)}
            >
              <Plus size={14} /> Add Clip to Track
            </button>
          )}
        </div>

        <TimelineEditor
          audioEngine={audioEngine}
          tracks={tracks}
          pixelsPerSecond={pixelsPerSecond}
          currentTime={currentTime}
          selectedTrackId={selectedTrackId}
          selectedClipId={selectedClipId}
          onSelectTrack={setSelectedTrackId}
          onSelectClip={setSelectedClipId}
          onUpdateTracks={setTracks}
          onSeek={handleSeek}
        />

        {/* Floating / Sticky Transport Bar */}
        <TransportBar
          isPlaying={isPlaying}
          isRecording={isRecording}
          currentTime={currentTime}
          zoom={pixelsPerSecond}
          onPlay={handlePlay}
          onPause={handlePause}
          onStop={handleStop}
          onToggleRecord={handleToggleRecord}
          onZoomIn={() => setPixelsPerSecond((z) => Math.min(150, z + 15))}
          onZoomOut={() => setPixelsPerSecond((z) => Math.max(20, z - 15))}
          onAddTrack={handleAddTrack}
          onExportWav={handleExportWav}
          onToggleCanvas={() => setCanvasActive(true)}
        />
      </div>

      {/* Stems & Versions Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start pt-4">
        {/* Stems list */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-base flex items-center gap-2">
              <Upload size={16} /> Stems Library ({project.stems?.length || 0})
            </h2>
            {canContribute && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
                <button
                  className="btn btn-outline btn-sm rounded-xl gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(project.stems ?? []).map((stem) => (
                <div
                  key={stem.id}
                  className="card bg-base-100 border border-base-content/5 rounded-2xl p-4 flex flex-row items-center gap-3 shadow-sm hover:shadow-md transition-shadow"
                >
                  <button
                    className="btn btn-circle btn-sm btn-primary"
                    onClick={() => toggleStem(stem.id, API.getCollabStemUrl(project.id, stem.id))}
                  >
                    {playingStemId === stem.id ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{stem.name}</p>
                    <p className="text-xs opacity-50">
                      {stem.authorUsername || "Unknown"} · {StringUtils.formatTimeAgo(new Date(stem.createdAt).getTime())}
                    </p>
                  </div>
                  {canContribute && (
                    <button
                      className="btn btn-ghost btn-xs text-primary"
                      onClick={() => handleSelectStemForTrack(stem)}
                      title="Add to active track"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                  {(stem.authorId === user?.userId || isOwner) && (
                    <button
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => handleDeleteStem(stem.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save Version & Version History */}
        <div className="space-y-4">
          {canContribute && (
            <div className="card bg-base-200/40 border border-base-content/5 rounded-3xl p-5 space-y-3">
              <h3 className="font-black text-sm">Save Snapshot Version</h3>
              <textarea
                className="textarea textarea-bordered textarea-sm w-full rounded-xl resize-none"
                placeholder="What changed in this composition? (optional)"
                value={versionNote}
                onChange={(e) => setVersionNote(e.target.value)}
                disabled={savingVersion}
              />
              <button
                className="btn btn-primary btn-sm rounded-xl gap-2 w-full"
                onClick={handleSaveVersion}
                disabled={savingVersion}
              >
                {savingVersion ? <span className="loading loading-spinner loading-xs" /> : <Save size={14} />}
                Save Snapshot
              </button>
            </div>
          )}

          <div className="card bg-base-100 border border-base-content/5 rounded-3xl p-5 space-y-3">
            <h3 className="font-black text-sm flex items-center gap-2">
              <GitBranch size={14} /> Version History
            </h3>
            {canContribute && (
              <>
                <input
                  ref={bgInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadBg}
                />
                <button
                  className="btn btn-outline btn-xs rounded-xl w-full opacity-60 hover:opacity-100"
                  onClick={() => bgInputRef.current?.click()}
                >
                  Change Canvas Background
                </button>
              </>
            )}
            {(project.versions ?? []).length === 0 ? (
              <p className="text-xs opacity-40">No versions saved yet.</p>
            ) : (
              <ul className="space-y-2">
                {(project.versions ?? []).map((v) => (
                  <li
                    key={v.id}
                    className="text-xs border-l-2 border-primary/30 pl-3 py-1.5 hover:bg-base-200/50 rounded-r-xl cursor-pointer transition-colors"
                    onClick={() => {
                      parseAndApplyVersionState(v.state);
                      notify.info(`Restored version snapshot v${v.version}`);
                    }}
                  >
                    <p className="font-bold text-primary">v{v.version} · {v.authorUsername || "Unknown"}</p>
                    {v.note && <p className="opacity-75 italic">{v.note}</p>}
                    <p className="opacity-40 text-[10px]">{StringUtils.formatTimeAgo(new Date(v.createdAt).getTime())}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Modal & Visualizer */}
      <SampleLibraryModal
        open={sampleModalOpen}
        stems={project.stems || []}
        onClose={() => setSampleModalOpen(false)}
        onSelectStem={handleSelectStemForTrack}
      />

      <CanvasVisualizer
        audioEngine={audioEngine}
        active={canvasActive}
        backgroundImage={backgroundImage}
        onClose={() => setCanvasActive(false)}
      />
    </div>
  );
};

export default CollabDetail;
