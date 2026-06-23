import { useState, useEffect, useRef } from "react";
import { Radio, Play, Square, Shuffle, RefreshCw } from "lucide-react";
import API from "../../services/api";
import toast from "react-hot-toast";

interface RadioStatus {
    active: boolean;
    name: string;
    playlistId?: number | null;
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
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({
        name: "TuneCamp Radio",
        playlistId: "",
        shuffle: false,
    });
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
        } catch {}
    };

    const loadPlaylists = async () => {
        try {
            const data = await API.getPlaylists();
            const filtered = (data || []).filter((p: any) => !String(p.id).startsWith("genre:"));
            setPlaylists(filtered);
            if (filtered.length > 0 && !form.playlistId) {
                setForm(f => ({ ...f, playlistId: String(filtered[0].id) }));
            }
        } catch {}
    };

    const handleStart = async () => {
        if (!form.playlistId) { toast.error("Select a playlist first"); return; }
        setLoading(true);
        try {
            await API.startRadio({
                name: form.name,
                playlistId: Number(form.playlistId),
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

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Radio size={22} className="text-primary" />
                <h3 className="font-bold text-lg">Radio Station</h3>
                {status?.active && (
                    <span className="badge badge-error gap-1 animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-white inline-block" />
                        ON AIR
                    </span>
                )}
            </div>

            {/* Status card */}
            {status?.active && (
                <div className="bg-base-200/60 rounded-box border border-base-content/10 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="font-semibold text-primary">{status.name}</span>
                        <span className="text-xs opacity-60">{status.listenerCount} listener{status.listenerCount !== 1 ? "s" : ""}</span>
                    </div>
                    {status.currentTrack && (
                        <div className="text-sm">
                            <span className="opacity-60">Now playing: </span>
                            <span className="font-medium">{status.currentTrack.title}</span>
                            {status.currentTrack.artist_name && (
                                <span className="opacity-70"> — {status.currentTrack.artist_name}</span>
                            )}
                        </div>
                    )}
                    {status.startedAt && (
                        <div className="text-xs opacity-50">
                            On air since {new Date(status.startedAt).toLocaleTimeString()}
                        </div>
                    )}
                    <div className="text-xs opacity-50 font-mono break-all">
                        Stream: {window.location.origin}{status.hlsUrl}
                    </div>
                </div>
            )}

            {/* Config form */}
            {!status?.active && (
                <div className="space-y-4 max-w-md">
                    <div className="form-control">
                        <label className="label"><span className="label-text text-sm font-medium">Station Name</span></label>
                        <input
                            type="text"
                            className="input input-bordered input-sm"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="My Radio Station"
                            maxLength={80}
                        />
                    </div>

                    <div className="form-control">
                        <label className="label"><span className="label-text text-sm font-medium">Playlist</span></label>
                        <select
                            className="select select-bordered select-sm"
                            value={form.playlistId}
                            onChange={e => setForm(f => ({ ...f, playlistId: e.target.value }))}
                        >
                            <option value="">— Select a playlist —</option>
                            {playlists.map(p => (
                                <option key={p.id} value={String(p.id)}>
                                    {p.name}{p.trackCount ? ` (${p.trackCount} tracks)` : ""}
                                </option>
                            ))}
                        </select>
                        {playlists.length === 0 && (
                            <span className="text-xs opacity-50 mt-1">No playlists found — create one in the Playlists section first.</span>
                        )}
                    </div>

                    <div className="form-control">
                        <label className="label cursor-pointer gap-3 justify-start">
                            <input
                                type="checkbox"
                                className="checkbox checkbox-sm checkbox-primary"
                                checked={form.shuffle}
                                onChange={e => setForm(f => ({ ...f, shuffle: e.target.checked }))}
                            />
                            <span className="label-text flex items-center gap-1">
                                <Shuffle size={14} /> Shuffle playlist
                            </span>
                        </label>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
                {!status?.active ? (
                    <button
                        className="btn btn-primary btn-sm gap-2"
                        onClick={handleStart}
                        disabled={loading || !form.playlistId}
                    >
                        {loading ? <span className="loading loading-spinner loading-xs" /> : <Play size={15} />}
                        Start Radio
                    </button>
                ) : (
                    <>
                        <button
                            className="btn btn-error btn-sm gap-2"
                            onClick={handleStop}
                            disabled={loading}
                        >
                            {loading ? <span className="loading loading-spinner loading-xs" /> : <Square size={15} />}
                            Stop Radio
                        </button>
                        <button
                            className="btn btn-ghost btn-sm gap-2"
                            onClick={fetchStatus}
                            disabled={loading}
                        >
                            <RefreshCw size={14} /> Refresh
                        </button>
                    </>
                )}
            </div>

            {status?.active && (
                <div className="alert alert-info text-sm">
                    <Radio size={16} />
                    <span>
                        Users can tune in at <a href="/radio" className="link" target="_blank">/radio</a> or via the direct HLS stream.
                    </span>
                </div>
            )}
        </div>
    );
}
