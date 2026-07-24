import { useState, useEffect } from 'react';
import { Music2, Download, Search as SearchIcon } from 'lucide-react';
import API from '../services/api';
import type { Sample } from '../types';

const LICENSE_LABEL: Record<string, string> = {
    cc0: 'CC0',
    'cc-by': 'CC BY',
    'cc-by-sa': 'CC BY-SA',
    'royalty-free': 'Royalty-Free',
};

const SampleCard = ({ sample }: { sample: Sample }) => {
    return (
        <div className="card bg-base-100 border border-base-content/5 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 overflow-hidden">
            <div className="aspect-video bg-gradient-to-br from-primary/10 to-base-200 relative overflow-hidden flex items-center justify-center">
                <Music2 size={36} className="opacity-20" />
            </div>

            <div className="p-4 space-y-3">
                <div>
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-sm leading-tight">{sample.title}</h3>
                        <span className="badge badge-xs badge-ghost flex-shrink-0">{LICENSE_LABEL[sample.license] || sample.license}</span>
                    </div>
                    {sample.artistName && <p className="text-xs opacity-50 mt-0.5">{sample.artistName}</p>}
                    <p className="text-xs opacity-60 mt-1">
                        {[sample.bpm ? `${sample.bpm} BPM` : null, sample.musicalKey].filter(Boolean).join(' · ')}
                    </p>
                </div>

                <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xs opacity-40">{sample.downloadCount} downloads</span>
                    <a
                        href={API.getSampleDownloadUrl(sample.id)}
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

    // Module gating (hideSamples) is enforced by ModuleGuard on the route.
    useEffect(() => {
        API.getSamples({}).then(setSamples).catch(console.error).finally(() => setLoading(false));
    }, []);

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
                    {filtered.map(sample => <SampleCard key={sample.id} sample={sample} />)}
                </div>
            )}
        </div>
    );
};

export default Samples;
