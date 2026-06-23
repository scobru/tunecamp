import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Radio, Volume2, VolumeX, Users } from "lucide-react";
import API from "../services/api";

interface RadioStatus {
    active: boolean;
    name: string;
    currentTrack?: { id: number; title: string; artist_name?: string; duration?: number } | null;
    listenerCount: number;
    hlsUrl: string;
    startedAt?: string;
}

export default function RadioPage() {
    const audioRef = useRef<HTMLAudioElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [status, setStatus] = useState<RadioStatus | null>(null);
    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [volume, setVolume] = useState(0.8);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchStatus();
        pollRef.current = setInterval(fetchStatus, 10000);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
            destroyHls();
        };
    }, []);

    const fetchStatus = async () => {
        try {
            const s = await API.getRadioStatus();
            setStatus(s);
            if (!s.active && playing) {
                setPlaying(false);
                destroyHls();
            }
        } catch {}
    };

    const destroyHls = () => {
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
    };

    const tune = async () => {
        if (!status?.active || !audioRef.current) return;
        setError(null);

        const hlsUrl = status.hlsUrl;
        const audio = audioRef.current;
        audio.volume = volume;
        audio.muted = muted;

        destroyHls();

        if (Hls.isSupported()) {
            const hls = new Hls({ lowLatencyMode: false });
            hls.on(Hls.Events.ERROR, (_evt, data) => {
                if (data.fatal) {
                    setError("Stream error — the radio may have stopped.");
                    setPlaying(false);
                }
            });
            hls.loadSource(hlsUrl);
            hls.attachMedia(audio);
            hls.once(Hls.Events.MANIFEST_PARSED, () => {
                audio.play().then(() => setPlaying(true)).catch(() => setError("Could not start playback"));
            });
            hlsRef.current = hls;
        } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
            audio.src = hlsUrl;
            audio.play().then(() => setPlaying(true)).catch(() => setError("Could not start playback"));
        } else {
            setError("HLS not supported in this browser");
        }
    };

    const stop = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = "";
        }
        destroyHls();
        setPlaying(false);
    };

    const toggleMute = () => {
        const next = !muted;
        setMuted(next);
        if (audioRef.current) audioRef.current.muted = next;
    };

    const handleVolume = (v: number) => {
        setVolume(v);
        if (audioRef.current) audioRef.current.volume = v;
    };

    const coverUrl = status?.currentTrack?.id
        ? `/api/tracks/${status.currentTrack.id}/cover`
        : null;

    return (
        <div className="max-w-lg mx-auto py-12 space-y-8 animate-fade-in">
            <div className="flex items-center gap-3">
                <Radio size={28} className="text-primary" />
                <h1 className="text-2xl font-bold">Radio</h1>
                {status?.active && (
                    <span className="badge badge-error gap-1 animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-white inline-block" />
                        ON AIR
                    </span>
                )}
            </div>

            {!status?.active && (
                <div className="text-center py-16 opacity-50 space-y-3">
                    <Radio size={48} className="mx-auto" />
                    <p className="text-lg">No radio broadcast is currently active.</p>
                    <p className="text-sm">Check back later or ask your admin to start one.</p>
                </div>
            )}

            {status?.active && (
                <div className="bg-base-200/60 rounded-2xl border border-base-content/10 shadow-xl p-6 space-y-6">
                    {/* Station name */}
                    <div className="text-center space-y-1">
                        <p className="text-xs opacity-50 uppercase tracking-widest">Now Broadcasting</p>
                        <h2 className="text-xl font-bold text-primary">{status.name}</h2>
                    </div>

                    {/* Cover art */}
                    <div className="w-48 h-48 mx-auto rounded-xl overflow-hidden bg-base-300 shadow-lg">
                        {coverUrl ? (
                            <img
                                src={coverUrl}
                                alt="cover"
                                className="w-full h-full object-cover"
                                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center opacity-30">
                                <Radio size={64} />
                            </div>
                        )}
                    </div>

                    {/* Current track */}
                    {status.currentTrack && (
                        <div className="text-center space-y-0.5">
                            <p className="font-semibold">{status.currentTrack.title}</p>
                            {status.currentTrack.artist_name && (
                                <p className="text-sm opacity-60">{status.currentTrack.artist_name}</p>
                            )}
                        </div>
                    )}

                    {/* Listener count */}
                    <div className="flex justify-center items-center gap-1.5 text-xs opacity-50">
                        <Users size={13} />
                        <span>{status.listenerCount} listener{status.listenerCount !== 1 ? "s" : ""}</span>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col items-center gap-4">
                        {!playing ? (
                            <button
                                className="btn btn-primary btn-lg rounded-full w-20 h-20"
                                onClick={tune}
                            >
                                <Radio size={30} />
                            </button>
                        ) : (
                            <button
                                className="btn btn-error btn-lg rounded-full w-20 h-20"
                                onClick={stop}
                            >
                                <span className="w-6 h-6 bg-white rounded-sm inline-block" />
                            </button>
                        )}

                        {playing && (
                            <div className="flex items-center gap-3 w-full max-w-xs">
                                <button className="btn btn-ghost btn-sm btn-circle" onClick={toggleMute}>
                                    {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                </button>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={volume}
                                    onChange={e => handleVolume(Number(e.target.value))}
                                    className="range range-primary range-xs flex-1"
                                />
                            </div>
                        )}
                    </div>

                    {error && <p className="text-error text-sm text-center">{error}</p>}
                </div>
            )}

            {status?.active && (
                <div className="text-center text-xs opacity-40 space-y-1">
                    <p>Also available via:</p>
                    <p><a href="/api/radio/stream.m3u" className="link" download="radio.m3u">M3U playlist</a> · <a href="/api/radio/feed.rss" className="link" target="_blank">RSS feed</a></p>
                </div>
            )}

            <audio ref={audioRef} className="hidden" />
        </div>
    );
}
