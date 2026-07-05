import { useState, useEffect, useRef } from "react";
import { Radio, Play, Square, Shuffle, RefreshCw, ListMusic, Tag } from "lucide-react";
import API from "../../services/api";
import toast from "react-hot-toast";

interface RadioStatus {
    active: boolean;
    name: string;
    playlistId?: number | null;
    sources?: string[];
    shuffle: boolean;
    startedAt?: string;
    currentTrack?: { id: number; title: string; artist_name?: string; duration?: number } | null;
    listenerCount: number;
    hlsUrl: string;
}

interface Playlist {
    id: string | number;
    name: string;
    trackCount?: number;
}

export function AdminRadioPanel() {
    const [status, setStatus] = useState<RadioStatus | null>(null);
    const [userPlaylists, setUserPlaylists] = useState<Playlist[]>([]);
    const [genrePlaylists, setGenrePlaylists] = useState<Playlist[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({ name: "TuneCamp Radio", shuffle: false });
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        loadPlaylists();
        fetchStatus();
        pollRef.current = setInterval(fetchStatus, 10000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, []);

    const fetchStatus = async () => {
        try {
            const s = await API.getRadioStatus();
            setStatus(s);
            if (s.name && !s.active) setForm(f => ({ ...f, name: s.name || f.name }));
        } catch { /* ignore */ }
    };

    const loadPlaylists = async () => {
        try {
            const data = await API.getPlaylists();
            const all = data || [];
            // Genre playlists are virtual entries with a `genre:` id prefix.
            setGenrePlaylists(all.filter((p: any) => String(p.id).startsWith("genre:")));
            setUserPlaylists(all.filter((p: any) => !String(p.id).startsWith("genre:")));
        } catch { /* ignore */ }
    };

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleStart = async () => {
        if (selected.size === 0) { toast.error("Select at least one playlist or genre"); return; }
        setLoading(true);
        try {
            await API.startRadio({
                name: form.name,
                sources: Array.from(selected),
                shuffle: form.shuffle,
            });
            toast.success("Radio started!");
            await fetchStatus();
        } catch (e: any) {
            toast.error(e?.message || "Failed to start radio");
        } finally {
            setLoading(false);
        }
    };

    const handleStop = async () => {
        setLoading(true);
        try {
            await API.stopRadio();
            toast.success("Radio stopped");
            await fetchStatus();
        } catch (e: any) {
            toast.error(e?.message || "Failed to stop radio");
        } finally {
            setLoading(false);
        }
    };

    const CheckRow = ({ p }: { p: Playlist }) => {
        const id = String(p.id);
        return (
            <label className="label cursor-pointer gap-3 justify-start py-1.5 px-2 hover:bg-base-300/40 rounded-lg transition-colors overflow-hidden">
                <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary flex-shrink-0"
                    checked={selected.has(id)}
                    onChange={() => toggle(id)}
                />
                <span className="label-text flex-1 text-sm truncate min-w-0" title={`${p.name}${p.trackCount ? ` (${p.trackCount})` : ''}`}>
                    {p.name}
                    {p.trackCount ? <span className="opacity-50 font-medium"> ({p.trackCount})</span> : ""}
                </span>
            </label>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Radio size={22} className="text-primary" />
                <h3 className="font-bold text-lg">Radio Station</h3>
                {status?.active && (
                    <span className="badge badge-error gap-1 animate-pulse font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-white inline-block animate-ping" />
                        ON AIR
                    </span>
                )}
            </div>

            {/* Config form (Inactive state) */}
            {!status?.active && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Station Settings */}
                    <div className="bg-base-200/40 rounded-2xl border border-base-content/5 p-5 space-y-5 flex flex-col justify-between">
                        <div className="space-y-4">
                            <h4 className="font-bold text-xs uppercase tracking-wider opacity-60">Station Settings</h4>
                            
                            <div className="form-control w-full">
                                <label className="label py-1">
                                    <span className="label-text text-xs font-semibold opacity-70">Station Name</span>
                                </label>
                                <input
                                    type="text"
                                    className="input input-bordered input-md bg-base-300/30 rounded-xl focus:border-primary focus:outline-none"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="My Radio Station"
                                    maxLength={80}
                                />
                            </div>

                            <div className="form-control pt-2">
                                <label className="label cursor-pointer gap-3 justify-start p-0">
                                    <input
                                        type="checkbox"
                                        className="checkbox checkbox-primary rounded-md"
                                        checked={form.shuffle}
                                        onChange={e => setForm(f => ({ ...f, shuffle: e.target.checked }))}
                                    />
                                    <span className="label-text flex items-center gap-2 font-medium text-sm">
                                        <Shuffle size={14} className="opacity-70" /> Shuffle queue
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-base-content/5 space-y-3">
                            <div className="text-xs opacity-60">
                                {selected.size} source{selected.size !== 1 ? "s" : ""} selected — tracks from all picks are merged.
                            </div>
                            <button
                                className="btn btn-primary btn-block gap-2 rounded-xl"
                                onClick={handleStart}
                                disabled={loading || selected.size === 0}
                            >
                                {loading ? <span className="loading loading-spinner loading-sm" /> : <Play size={16} />}
                                Start Radio
                            </button>
                        </div>
                    </div>

                    {/* Right Column (2 cols): Source Selection */}
                    <div className="lg:col-span-2 bg-base-200/40 rounded-2xl border border-base-content/5 p-5 space-y-4">
                        <h4 className="font-bold text-xs uppercase tracking-wider opacity-60">Radio Sources</h4>
                        
                        <div className="grid gap-6 sm:grid-cols-2">
                            <div className="form-control">
                                <span className="label-text text-sm font-semibold flex items-center gap-1.5 mb-2 opacity-80">
                                    <ListMusic size={15} className="text-primary" /> Your playlists
                                </span>
                                <div className="bg-base-300/20 rounded-xl border border-base-content/5 p-2 h-72 overflow-y-auto overflow-x-hidden space-y-0.5">
                                    {userPlaylists.length === 0 ? (
                                        <div className="h-full flex items-center justify-center p-4">
                                            <span className="text-xs opacity-40">No playlists yet.</span>
                                        </div>
                                    ) : userPlaylists.map(p => <CheckRow key={p.id} p={p} />)}
                                </div>
                            </div>

                            <div className="form-control">
                                <span className="label-text text-sm font-semibold flex items-center gap-1.5 mb-2 opacity-80">
                                    <Tag size={15} className="text-primary" /> Genre mixes
                                </span>
                                <div className="bg-base-300/20 rounded-xl border border-base-content/5 p-2 h-72 overflow-y-auto overflow-x-hidden space-y-0.5">
                                    {genrePlaylists.length === 0 ? (
                                        <div className="h-full flex items-center justify-center p-4">
                                            <span className="text-xs opacity-40">No genres found.</span>
                                        </div>
                                    ) : genrePlaylists.map(p => <CheckRow key={p.id} p={p} />)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Status card (Active state) */}
            {status?.active && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Live Status & Info */}
                    <div className="bg-base-200/40 rounded-2xl border border-base-content/5 p-5 space-y-4 flex flex-col justify-between">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="font-bold text-xs uppercase tracking-wider opacity-60">Live Stream Info</h4>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-base-300 text-base-content/80 font-bold">
                                    {status.listenerCount} listener{status.listenerCount !== 1 ? "s" : ""}
                                </span>
                            </div>

                            <div className="space-y-2">
                                <div className="text-xl font-bold text-primary tracking-tight leading-snug break-words">
                                    {status.name}
                                </div>
                                
                                {status.currentTrack && (
                                    <div className="p-3 bg-base-300/30 rounded-xl border border-base-content/5 space-y-1">
                                        <span className="text-[10px] uppercase font-bold tracking-wider opacity-40">Now Playing</span>
                                        <div className="text-sm font-semibold truncate leading-tight">{status.currentTrack.title}</div>
                                        {status.currentTrack.artist_name && (
                                            <div className="text-xs opacity-60 truncate">{status.currentTrack.artist_name}</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-1 text-xs opacity-60">
                                {status.sources && status.sources.length > 0 && (
                                    <div>{status.sources.length} source{status.sources.length !== 1 ? "s" : ""} mixed</div>
                                )}
                                {status.startedAt && (
                                    <div>On air since {new Date(status.startedAt).toLocaleTimeString()}</div>
                                )}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-base-content/5 flex gap-2">
                            <button
                                className="btn btn-error flex-1 gap-2 rounded-xl btn-sm"
                                onClick={handleStop}
                                disabled={loading}
                            >
                                {loading ? <span className="loading loading-spinner loading-xs" /> : <Square size={14} />}
                                Stop Radio
                            </button>
                            <button
                                className="btn btn-ghost btn-square rounded-xl btn-sm border border-base-content/10"
                                onClick={fetchStatus}
                                disabled={loading}
                                title="Refresh Status"
                            >
                                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                            </button>
                        </div>
                    </div>

                    {/* Right Column (2 cols): Stream Connections & Links */}
                    <div className="lg:col-span-2 bg-base-200/40 rounded-2xl border border-base-content/5 p-5 space-y-5">
                        <h4 className="font-bold text-xs uppercase tracking-wider opacity-60">Stream Connections</h4>
                        
                        <div className="space-y-4">
                            <div className="form-control w-full">
                                <label className="label py-1">
                                    <span className="label-text text-xs font-semibold opacity-70">Direct HLS Stream URL</span>
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        className="input input-bordered input-sm bg-base-300/30 rounded-xl focus:outline-none font-mono text-xs flex-1"
                                        value={`${window.location.origin}${status.hlsUrl}`}
                                        onClick={e => (e.target as HTMLInputElement).select()}
                                    />
                                    <button
                                        className="btn btn-secondary btn-sm rounded-xl px-4"
                                        onClick={() => {
                                            navigator.clipboard.writeText(`${window.location.origin}${status.hlsUrl}`);
                                            toast.success("Stream URL copied!");
                                        }}
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                <div className="p-3 bg-base-300/20 rounded-xl border border-base-content/5 flex items-center justify-between">
                                    <div className="min-w-0">
                                        <div className="font-bold text-xs">M3U Playlist</div>
                                        <div className="text-[10px] opacity-50 font-mono mt-0.5 truncate">/api/radio/stream.m3u</div>
                                    </div>
                                    <a
                                        href="/api/radio/stream.m3u"
                                        className="btn btn-xs btn-outline rounded-lg flex-shrink-0"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        Open M3U
                                    </a>
                                </div>

                                <div className="p-3 bg-base-300/20 rounded-xl border border-base-content/5 flex items-center justify-between">
                                    <div className="min-w-0">
                                        <div className="font-bold text-xs">RSS Stream Feed</div>
                                        <div className="text-[10px] opacity-50 font-mono mt-0.5 truncate">/api/radio/feed.rss</div>
                                    </div>
                                    <a
                                        href="/api/radio/feed.rss"
                                        className="btn btn-xs btn-outline rounded-lg flex-shrink-0"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        Open RSS
                                    </a>
                                </div>
                            </div>

                            <div className="alert alert-info text-xs rounded-xl bg-primary/10 border-primary/20 text-base-content/90 flex gap-3 p-4">
                                <Radio size={16} className="text-primary flex-shrink-0" />
                                <span>
                                    Users can tune in at <a href="/radio" className="link font-bold text-primary" target="_blank">/radio</a> or via external streaming applications.
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
