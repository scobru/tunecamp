import { useState, useEffect, useRef } from 'react';
import { Music2, Download, Search as SearchIcon, Play, Pause } from 'lucide-react';
import API from '../services/api';
import type { Sample } from '../types';
import { Waveform } from '../components/player/Waveform';

const LICENSE_LABEL: Record<string, string> = {
    cc0: 'CC0',
    'cc-by': 'CC BY',
    'cc-by-sa': 'CC BY-SA',
    'royalty-free': 'Royalty-Free',
};

const SampleCard = ({ sample, isPlaying, progress, onHoverStart, onHoverEnd, onToggle }: {
    sample: Sample;
    isPlaying: boolean;
    progress: number;
    onHoverStart: () => void;
    onHoverEnd: () => void;
    onToggle: () => void;
}) => {
    return (
        <div className="card bg-base-100 border border-base-content/5 shadow-sm hover:shadow-lg hover:border-primary/30 transition-all hover:-translate-y-0.5 overflow-hidden">
            <div
                onMouseEnter={onHoverStart}
                onMouseLeave={onHoverEnd}
                onClick={onToggle}
                className="h-28 w-full bg-gradient-to-br from-primary/15 via-base-300 to-base-200 relative overflow-hidden flex items-center justify-center group cursor-pointer"
            >
                <div className="absolute inset-4">
                    <Waveform
                        data={API.getSampleWaveformUrl(sample.id)}
                        progress={progress}
                        colorPlayed="#22c55e"
                        colorRemaining="rgba(255,255,255,0.22)"
                    />
                </div>
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors pointer-events-none">
                    <span
                        className={`btn btn-circle btn-primary btn-sm shadow-lg scale-90 group-hover:scale-100 transition-all ${isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                        {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                    </span>
                </span>
            </div>

            <div className="p-4 space-y-3">
                <div>
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-sm leading-tight">{sample.title}</h3>
                        <span className="badge badge-xs badge-ghost flex-shrink-0">{LICENSE_LABEL[sample.license] || sample.license}</span>
                    </div>
                    <p className="text-xs opacity-50 mt-0.5">{sample.artistName || 'Unknown Artist'}</p>
                    <p className="text-xs opacity-60 mt-1">
                        {[sample.bpm ? `${sample.bpm} BPM` : null, sample.musicalKey].filter(Boolean).join(' · ')}
                    </p>
                </div>

                <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xs opacity-40">{sample.downloadCount} downloads</span>
                    <a
                        href={API.getSampleDownloadUrl(sample.id)}
                        onClick={e => e.stopPropagation()}
                        className="btn btn-xs btn-success rounded-full gap-1"
                    >
                        <Download size={11} /> Download
                    </a>
                </div>
            </div>
        </div>
    );
};

const Samples = () => {
    const [samples, setSamples] = useState<Sample[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [playingId, setPlayingId] = useState<number | null>(null);
    const [progress, setProgress] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Module gating (hideSamples) is enforced by ModuleGuard on the route.
    useEffect(() => {
        API.getSamples({}).then(setSamples).catch(console.error).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        const audio = audioRef.current ?? (audioRef.current = new Audio());
        const onTime = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
        const onEnd = () => { setPlayingId(null); setProgress(0); };
        audio.addEventListener('timeupdate', onTime);
        audio.addEventListener('ended', onEnd);
        return () => {
            audio.removeEventListener('timeupdate', onTime);
            audio.removeEventListener('ended', onEnd);
            audio.pause();
        };
    }, []);

    const play = (sample: Sample) => {
        const audio = audioRef.current!;
        audio.src = API.getSampleDownloadUrl(sample.id);
        audio.currentTime = 0;
        audio.play();
        setPlayingId(sample.id);
        setProgress(0);
    };

    const stop = () => {
        audioRef.current?.pause();
        setPlayingId(null);
        setProgress(0);
    };

    const togglePlay = (sample: Sample) => (playingId === sample.id ? stop() : play(sample));

    const filtered = samples.filter(s => {
        if (!search) return true;
        const q = search.toLowerCase();
        return s.title.toLowerCase().includes(q) || (s.artistName || '').toLowerCase().includes(q) || s.tags.some(t => t.toLowerCase().includes(q));
    });

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <Music2 size={32} className="text-primary" /> Samples
                </h1>
            </div>

            <div className="flex gap-3 flex-wrap items-center">
                <div className="relative flex-1 max-w-xs">
                    <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                    <input
                        type="text"
                        placeholder="Search samples..."
                        className="input input-sm input-bordered rounded-full w-full pl-8"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-16"><span className="loading loading-spinner loading-lg" /></div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 opacity-30 space-y-3">
                    <Music2 size={48} className="mx-auto" />
                    <p className="text-lg font-bold">{samples.length === 0 ? 'No samples available yet.' : 'No results.'}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filtered.map(sample => (
                        <SampleCard
                            key={sample.id}
                            sample={sample}
                            isPlaying={playingId === sample.id}
                            progress={playingId === sample.id ? progress : 0}
                            onHoverStart={() => play(sample)}
                            onHoverEnd={stop}
                            onToggle={() => togglePlay(sample)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default Samples;
