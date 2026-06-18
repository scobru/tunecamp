import { useState, useEffect, useRef, useCallback } from "react";
import Hls from "hls.js";
import { Radio, Mic, Users, Headphones, StopCircle, Loader2, LogOut } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuthStore } from "../stores/useAuthStore";
import API from "../services/api";
import type { LiveSession } from "../types";
import clsx from "clsx";

// Music-friendly capture: browsers default to voice processing which mangles music.
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 2,
};

// MediaRecorder chunk cadence: each chunk is POSTed to the server's HLS ingest.
const CHUNK_MS = 1000;

const Live = () => {
    const { isAuthenticated, role, user } = useAuthStore();
    // Mirrors the server gate: managers/root always, curators only when linked
    // to an artist profile. Listeners never broadcast, even with a stale artistId.
    const canBroadcast = isAuthenticated && (
        role === "admin" || role === "root_admin" || (role === "super_user" && !!user?.artistId)
    );

    const [enabled, setEnabled] = useState(true);
    const [sessions, setSessions] = useState<LiveSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    // Broadcast state
    const [title, setTitle] = useState("");
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [listenerCount, setListenerCount] = useState(0);

    // Audio input selection. Browsers expose input *devices* (a USB interface,
    // a line-in, the built-in mic all appear here) rather than abstract input
    // "types"; "" means "let the browser pick its default".
    const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState("");

    // Listening state
    const [listeningTo, setListeningTo] = useState<LiveSession | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const sessionRef = useRef<LiveSession | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);

    const refreshSessions = useCallback(async () => {
        try {
            const data = await API.getLiveSessions();
            setEnabled(data.enabled);
            setSessions(data.sessions);

            // Listener count for own broadcast comes from playlist polls server-side
            const mine = data.sessions.find(s => s.roomId === sessionRef.current?.roomId);
            if (mine) setListenerCount(mine.listenerCount ?? 0);
        } catch (e) {
            console.error("Failed to load live sessions:", e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshSessions();
        const interval = setInterval(refreshSessions, 10000);
        return () => clearInterval(interval);
    }, [refreshSessions]);

    // Enumerate audio inputs for the device picker. Device *labels* are only
    // exposed once the user has granted mic permission at least once, so the
    // list may show generic names until the first Go Live unlocks them.
    const refreshInputDevices = useCallback(async () => {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const inputs = devices.filter(d => d.kind === "audioinput");
            setInputDevices(inputs);
            // Drop the selection if that device was unplugged
            setSelectedDeviceId(prev =>
                prev && inputs.some(d => d.deviceId === prev) ? prev : ""
            );
        } catch (e) {
            console.error("Failed to enumerate audio inputs:", e);
        }
    }, []);

    useEffect(() => {
        if (!canBroadcast) return;
        refreshInputDevices();
        const md = navigator.mediaDevices;
        md?.addEventListener?.("devicechange", refreshInputDevices);
        return () => md?.removeEventListener?.("devicechange", refreshInputDevices);
    }, [canBroadcast, refreshInputDevices]);

    const teardownBroadcast = useCallback(() => {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
            recorderRef.current.stop();
        }
        recorderRef.current = null;
        micStreamRef.current?.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
        sessionRef.current = null;
        setListenerCount(0);
    }, []);

    const teardownPlayback = useCallback(() => {
        hlsRef.current?.destroy();
        hlsRef.current = null;
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.removeAttribute("src");
            audioRef.current.load();
        }
    }, []);

    // Clean up when navigating away
    useEffect(() => () => {
        teardownBroadcast();
        teardownPlayback();
    }, [teardownBroadcast, teardownPlayback]);

    const handleGoLive = async () => {
        setError("");
        setIsStarting(true);
        try {
            const audioConstraints: MediaTrackConstraints = { ...AUDIO_CONSTRAINTS };
            if (selectedDeviceId) {
                audioConstraints.deviceId = { exact: selectedDeviceId };
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
            // Permission is now granted, so labels are available — refresh the list
            refreshInputDevices();
            const session = await API.startLive(title.trim() || "Live session");
            sessionRef.current = session;

            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus"
                : "audio/webm";
            const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128_000 });

            recorder.ondataavailable = async (event) => {
                if (event.data.size === 0 || !sessionRef.current) return;
                try {
                    await API.ingestLive(sessionRef.current.roomId, event.data);
                } catch (e: any) {
                    // 409: pipeline gone (e.g. admin stopped the session) — stop recording
                    if (e?.status === 409 || e?.status === 403) {
                        console.warn("Live pipeline ended, stopping broadcast");
                        handleStopLive();
                    } else {
                        console.error("Chunk upload failed (will keep trying):", e);
                    }
                }
            };

            recorder.start(CHUNK_MS);
            recorderRef.current = recorder;
            micStreamRef.current = stream;
            setIsBroadcasting(true);
            refreshSessions();
        } catch (e: any) {
            console.error("Failed to go live:", e);
            setError(e?.message || "Failed to start broadcasting");
            teardownBroadcast();
        } finally {
            setIsStarting(false);
        }
    };

    const handleStopLive = async () => {
        teardownBroadcast();
        setIsBroadcasting(false);
        try {
            await API.stopLive();
        } catch (e) {
            console.error("Failed to stop live session:", e);
        }
        refreshSessions();
    };

    const handleListen = (session: LiveSession) => {
        setError("");
        teardownPlayback();
        setIsConnecting(true);
        setListeningTo(session);

        const audio = audioRef.current;
        if (!audio) return;

        const src = API.getLiveStreamUrl(session.roomId);
        const onPlaying = () => setIsConnecting(false);
        audio.addEventListener("playing", onPlaying, { once: true });

        if (Hls.isSupported()) {
            const hls = new Hls({
                lowLatencyMode: true,
                liveSyncDurationCount: 3,
            });
            hls.on(Hls.Events.ERROR, (_event, data) => {
                if (data.fatal) {
                    console.error("HLS fatal error:", data);
                    setError("Stream interrupted. The broadcast may have ended.");
                    setIsConnecting(false);
                    teardownPlayback();
                    setListeningTo(null);
                }
            });
            hls.loadSource(src);
            hls.attachMedia(audio);
            hlsRef.current = hls;
        } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
            // Safari plays HLS natively
            audio.src = src;
        } else {
            setError("Your browser does not support HLS playback.");
            setIsConnecting(false);
            setListeningTo(null);
            return;
        }

        audio.play().catch(err => {
            console.error("Audio playback failed:", err);
            setError("Playback blocked by the browser. Press play on the audio control.");
        });
    };

    const handleLeave = () => {
        teardownPlayback();
        setListeningTo(null);
        setIsConnecting(false);
    };

    const formatStarted = (iso: string) => {
        try {
            return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch {
            return "";
        }
    };

    if (!enabled) {
        return (
            <div className="space-y-8 animate-fade-in">
                <PageHeader title="Live" subtitle="Live audio sessions" icon={Radio} iconColor="text-error" />
                <div className="alert alert-warning max-w-xl">
                    <Radio size={18} />
                    <span>Live streaming is disabled on this instance.</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in">
            <PageHeader
                title="Live"
                subtitle="Live audio sessions, streamed from this instance"
                icon={Radio}
                iconColor="text-error"
            />

            {error && (
                <div className="alert alert-error text-sm max-w-xl">
                    <span>{error}</span>
                </div>
            )}

            {/* Broadcaster panel */}
            {canBroadcast && (
                <div className="card bg-base-200 border border-base-content/5 shadow-level-1 max-w-xl">
                    <div className="card-body">
                        <h2 className="card-title flex items-center gap-2">
                            <Mic size={20} className={clsx(isBroadcasting && "text-error animate-pulse")} />
                            {isBroadcasting ? "You are live" : "Start a live session"}
                        </h2>

                        {isBroadcasting ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-sm opacity-70">
                                    <Users size={16} />
                                    <span>{listenerCount} listener{listenerCount === 1 ? "" : "s"} connected</span>
                                </div>
                                <button className="btn btn-error gap-2" onClick={handleStopLive}>
                                    <StopCircle size={18} /> End broadcast
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <p className="text-sm opacity-60">
                                    Audio is captured from your microphone / audio input, encoded on
                                    this server and streamed to listeners over HLS. One upload from
                                    you, unlimited listeners.
                                </p>
                                {inputDevices.length > 0 && (
                                    <label className="form-control w-full">
                                        <span className="label-text text-xs opacity-60 flex items-center gap-1.5 mb-1">
                                            <Mic size={12} /> Audio input
                                        </span>
                                        <select
                                            className="select select-bordered w-full"
                                            value={selectedDeviceId}
                                            onChange={e => setSelectedDeviceId(e.target.value)}
                                        >
                                            <option value="">System default</option>
                                            {inputDevices.map((d, i) => (
                                                <option key={d.deviceId || i} value={d.deviceId}>
                                                    {d.label || `Audio input ${i + 1}`}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                                <input
                                    type="text"
                                    className="input input-bordered w-full"
                                    placeholder="Session title (e.g. Friday night set)"
                                    value={title}
                                    maxLength={120}
                                    onChange={e => setTitle(e.target.value)}
                                />
                                <button
                                    className="btn btn-primary gap-2"
                                    onClick={handleGoLive}
                                    disabled={isStarting}
                                >
                                    {isStarting ? <Loader2 size={18} className="animate-spin" /> : <Radio size={18} />}
                                    Go Live
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Now listening banner */}
            {listeningTo && (
                <div className="card bg-primary/10 border border-primary/20 max-w-xl">
                    <div className="card-body py-4 flex-row items-center justify-between">
                        <div className="flex items-center gap-3">
                            {isConnecting
                                ? <Loader2 size={20} className="animate-spin text-primary" />
                                : <Headphones size={20} className="text-primary animate-pulse" />}
                            <div>
                                <p className="font-bold text-sm">{listeningTo.title}</p>
                                <p className="text-xs opacity-60">
                                    {isConnecting ? "Buffering stream..." : `Live by ${listeningTo.username}`}
                                </p>
                            </div>
                        </div>
                        <button className="btn btn-sm btn-ghost gap-2" onClick={handleLeave}>
                            <LogOut size={14} /> Leave
                        </button>
                    </div>
                </div>
            )}
            <audio ref={audioRef} autoPlay className="hidden" />

            {/* Active sessions */}
            <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Radio size={18} className="text-error" /> Active sessions
                </h3>

                {isLoading ? (
                    <div className="flex items-center gap-2 opacity-50 p-8">
                        <Loader2 className="animate-spin" size={20} />
                        <span className="text-sm font-bold">Loading sessions...</span>
                    </div>
                ) : sessions.length === 0 ? (
                    <div className="p-10 text-center opacity-40 border border-dashed border-base-content/10 rounded-2xl max-w-xl">
                        <Radio size={32} className="mx-auto mb-3" />
                        <p className="font-bold text-sm">Nobody is live right now</p>
                        <p className="text-xs mt-1">Check back later, or follow the community to know when artists go live.</p>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {sessions.map(session => {
                            const isMine = session.username === user?.username;
                            const isCurrent = listeningTo?.roomId === session.roomId;
                            return (
                                <div key={session.roomId} className="card bg-base-200 border border-base-content/5 shadow-level-1">
                                    <div className="card-body p-5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-error text-xs font-black uppercase tracking-wider">
                                                <span className="w-2 h-2 rounded-full bg-error animate-pulse" /> Live
                                            </div>
                                            <div className="flex items-center gap-1 text-xs opacity-50">
                                                <Users size={12} />
                                                {session.listenerCount ?? 0}
                                            </div>
                                        </div>
                                        <h4 className="font-bold text-base leading-tight">{session.title}</h4>
                                        <p className="text-xs opacity-60">
                                            by {session.username} · started {formatStarted(session.startedAt)}
                                        </p>
                                        {!isMine && (
                                            <button
                                                className={clsx("btn btn-sm gap-2 mt-3", isCurrent ? "btn-ghost" : "btn-primary")}
                                                onClick={() => isCurrent ? handleLeave() : handleListen(session)}
                                            >
                                                <Headphones size={14} />
                                                {isCurrent ? "Leave" : "Listen"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Live;
