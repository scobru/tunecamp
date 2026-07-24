import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Music2, Download, Play, Pause, ArrowLeft } from 'lucide-react';
import API from '../services/api';
import type { Sample, SamplePack } from '../types';
import { Waveform } from '../components/player/Waveform';

const LICENSE_LABEL: Record<string, string> = {
    cc0: 'CC0',
    'cc-by': 'CC BY',
    'cc-by-sa': 'CC BY-SA',
    'royalty-free': 'Royalty-Free',
};

const SampleRow = ({ sample, isPlaying, progress, onToggle }: {
    sample: Sample;
    isPlaying: boolean;
    progress: number;
    onToggle: () => void;
}) => (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-base-100 border border-base-content/5 hover:border-primary/30 transition-all">
        <button onClick={onToggle} className="btn btn-circle btn-sm btn-primary flex-shrink-0">
            {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
        </button>
        <div className="w-24 h-10 flex-shrink-0">
            <Waveform
                data={API.getSampleWaveformUrl(sample.id)}
                progress={progress}
                colorPlayed="#22c55e"
                colorRemaining="rgba(255,255,255,0.22)"
            />
        </div>
        <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate">{sample.title}</p>
            <p className="text-xs opacity-60">{[sample.bpm ? `${sample.bpm} BPM` : null, sample.musicalKey].filter(Boolean).join(' · ')}</p>
        </div>
        <a href={API.getSampleDownloadUrl(sample.id)} onClick={e => e.stopPropagation()} className="btn btn-xs btn-success rounded-full gap-1 flex-shrink-0">
            <Download size={11} /> Download
        </a>
    </div>
);

const SamplePackDetail = () => {
    const { id } = useParams();
    const [pack, setPack] = useState<SamplePack | null>(null);
    const [loading, setLoading] = useState(true);
    const [playingId, setPlayingId] = useState<number | null>(null);
    const [progress, setProgress] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (!id) return;
        API.getSamplePack(parseInt(id, 10)).then(setPack).catch(console.error).finally(() => setLoading(false));
    }, [id]);

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

    const togglePlay = (sample: Sample) => {
        const audio = audioRef.current!;
        if (playingId === sample.id) {
            audio.pause();
            setPlayingId(null);
            setProgress(0);
            return;
        }
        audio.src = API.getSampleDownloadUrl(sample.id);
        audio.currentTime = 0;
        audio.play();
        setPlayingId(sample.id);
        setProgress(0);
    };

    if (loading) return <div className="flex justify-center p-16"><span className="loading loading-spinner loading-lg" /></div>;
    if (!pack) return <div className="text-center py-20 opacity-30">Pack not found.</div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <Link to="/samples" className="btn btn-ghost btn-sm gap-2"><ArrowLeft size={14} /> Back to Samples</Link>

            <div className="flex items-start gap-4">
                <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0">
                    <img src={API.getSamplePackCoverUrl(pack.id)} alt={pack.title} className="w-full h-full object-cover" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold">{pack.title}</h1>
                    <p className="opacity-60">{pack.artistName || 'Unknown Artist'} · {pack.sampleCount} sample{pack.sampleCount === 1 ? '' : 's'}</p>
                    <span className="badge badge-sm badge-ghost mt-1">{LICENSE_LABEL[pack.license] || pack.license}</span>
                    {pack.description && <p className="text-sm opacity-70 mt-2 max-w-xl">{pack.description}</p>}
                </div>
            </div>

            <div className="space-y-2">
                {(pack.samples ?? []).map(sample => (
                    <SampleRow
                        key={sample.id}
                        sample={sample}
                        isPlaying={playingId === sample.id}
                        progress={playingId === sample.id ? progress : 0}
                        onToggle={() => togglePlay(sample)}
                    />
                ))}
                {(pack.samples ?? []).length === 0 && (
                    <div className="text-center py-12 opacity-30"><Music2 size={32} className="mx-auto mb-2" />No samples in this pack.</div>
                )}
            </div>
        </div>
    );
};

export default SamplePackDetail;
