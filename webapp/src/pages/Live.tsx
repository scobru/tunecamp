import { useState, useEffect, useRef, useCallback } from "react";
import { joinRoom } from "trystero/nostr";
import type { Room } from "trystero/nostr";
import { Radio, Mic, Users, Headphones, StopCircle, Loader2, LogOut } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuthStore } from "../stores/useAuthStore";
import API from "../services/api";
import type { LiveSession } from "../types";
import clsx from "clsx";

// Shared Trystero namespace: peers only meet when they join the same roomId,
// which is generated server-side per session.
const APP_ID = "tunecamp-live-v1";

// Music-friendly capture: browsers default to voice processing which mangles music.
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 2,
};

const Live = () => {
    const { isAuthenticated, role, user } = useAuthStore();
    const canBroadcast = isAuthenticated && (
        role === "admin" || role === "root_admin" || role === "super_user" || !!user?.artistId
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
    const [isSimulated, setIsSimulated] = useState(false);

    // Listening state
    const [listeningTo, setListeningTo] = useState<LiveSession | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);

    const roomRef = useRef<Room | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    const refreshSessions = useCallback(async () => {
        try {
            const data = await API.getLiveSessions();
            setEnabled(data.enabled);
            setSessions(data.sessions);
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

    const teardownRoom = useCallback(() => {
        roomRef.current?.leave();
        roomRef.current = null;
        micStreamRef.current?.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
        }
        setIsSimulated(false);
        if (audioRef.current) {
            audioRef.current.srcObject = null;
        }
        setListenerCount(0);
    }, []);

    // Leave the room when navigating away
    useEffect(() => teardownRoom, [teardownRoom]);

    const handleGoLive = async () => {
        setError("");
        setIsStarting(true);
        setIsSimulated(false);
        let stream: MediaStream;
        try {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
            } catch (mediaError: any) {
                console.warn("Microphone access failed, falling back to simulated silent stream:", mediaError);
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioContextClass) {
                    const ctx = new AudioContextClass();
                    const dest = ctx.createMediaStreamDestination();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    gain.gain.value = 0; // complete silence
                    osc.connect(gain);
                    gain.connect(dest);
                    osc.start();
                    stream = dest.stream;
                    audioContextRef.current = ctx;
                    setIsSimulated(true);
                } else {
                    throw mediaError;
                }
            }

            const session = await API.startLive(title.trim() || "Live session");

            const room = joinRoom({ appId: APP_ID }, session.roomId);
            // Streams are pushed per-peer on join: addStream to "all" only
            // reaches peers already connected, and at start there are none.
            room.onPeerJoin = peerId => {
                room.addStream(stream, { target: peerId });
                setListenerCount(c => c + 1);
            };
            room.onPeerLeave = () => setListenerCount(c => Math.max(0, c - 1));

            roomRef.current = room;
            micStreamRef.current = stream;
            setIsBroadcasting(true);
            refreshSessions();
        } catch (e: any) {
            console.error("Failed to go live:", e);
            setError(e?.message || "Failed to start broadcasting");
            teardownRoom();
        } finally {
            setIsStarting(false);
        }
    };

    const handleStopLive = async () => {
        teardownRoom();
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
        // Leave any previous room first
        teardownRoom();
        setIsConnecting(true);
        setListeningTo(session);

        const room = joinRoom({ appId: APP_ID }, session.roomId);
        room.onPeerStream = stream => {
            if (audioRef.current) {
                audioRef.current.srcObject = stream;
                audioRef.current.play().catch(err => {
                    console.error("Audio playback failed:", err);
                    setError("Playback blocked by the browser. Press play on the audio control.");
                });
            }
            setIsConnecting(false);
        };
        roomRef.current = room;
    };

    const handleLeave = () => {
        teardownRoom();
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
                subtitle="Peer-to-peer audio sessions, straight from the artist's browser"
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
                                {isSimulated && (
                                    <div className="alert alert-warning text-xs p-3 rounded-xl flex items-start gap-2">
                                        <Radio size={16} className="shrink-0 mt-0.5 text-warning-content" />
                                        <span>
                                            <strong>Demo Mode:</strong> Microphone access was denied or unavailable.
                                            Streaming a simulated silent stream so you can still test WebRTC connectivity.
                                        </span>
                                    </div>
                                )}
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
                                    Audio is captured from your microphone / audio input and streamed
                                    directly to listeners over WebRTC. No data passes through the server.
                                </p>
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
                                    {isConnecting ? "Connecting to peer..." : `Live by ${listeningTo.username}`}
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
                                        <div className="flex items-center gap-2 text-error text-xs font-black uppercase tracking-wider">
                                            <span className="w-2 h-2 rounded-full bg-error animate-pulse" /> Live
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
