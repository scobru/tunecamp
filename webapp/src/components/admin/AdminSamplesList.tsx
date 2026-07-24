import { confirm } from '@/utils/confirm';
import { useState, useEffect, useRef } from 'react';
import { Music2, Trash2, Download, UploadCloud, Package, ImagePlus } from 'lucide-react';
import API from '../../services/api';
import { notify } from '../../utils/notify';
import { UploadSampleModal } from '../modals/UploadSampleModal';
import type { Sample, SamplePack } from '../../types';

const PackRow = ({ pack, onCoverChange, onDelete }: {
    pack: SamplePack;
    onCoverChange: (file: File) => void;
    onDelete: () => void;
}) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    return (
        <div className="flex items-center gap-3 p-2 rounded-lg bg-base-200/50 hover:bg-base-200 transition-colors">
            <button
                className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 group"
                onClick={() => fileInputRef.current?.click()}
                title="Change cover"
            >
                <img src={API.getSamplePackCoverUrl(pack.id)} alt={pack.title} className="w-full h-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/50 transition-colors">
                    <ImagePlus size={14} className="text-white opacity-0 group-hover:opacity-100" />
                </span>
            </button>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) onCoverChange(f); e.target.value = ''; }}
            />
            <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{pack.title}</div>
                <div className="text-xs opacity-50">{pack.sampleCount} sample{pack.sampleCount === 1 ? '' : 's'} · <span className="badge badge-xs badge-ghost">{pack.license.toUpperCase()}</span></div>
            </div>
            <button className="btn btn-xs btn-ghost rounded-full text-error" onClick={onDelete} title="Delete pack">
                <Trash2 size={12} />
            </button>
        </div>
    );
};

export const AdminSamplesList = ({ mine = false }: { mine?: boolean }) => {
    const [samples, setSamples] = useState<Sample[]>([]);
    const [packs, setPacks] = useState<SamplePack[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const [s, p] = await Promise.all([API.getSamples({ mine }), API.getSamplePacks({ mine })]);
            setSamples(s);
            setPacks(p);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        load();
        window.addEventListener('refresh-samples', load);
        return () => window.removeEventListener('refresh-samples', load);
    }, [mine]);

    const handleDelete = async (id: number) => {
        if (!await confirm('Delete this sample? This cannot be undone.')) return;
        try {
            await API.deleteSample(id);
            notify.success('Sample deleted.');
            load();
        } catch (e: any) {
            notify.error(e, 'Delete failed');
        }
    };

    const handleDeletePack = async (id: number) => {
        if (!await confirm('Delete this sample pack and all its files? This cannot be undone.')) return;
        try {
            await API.deleteSamplePack(id);
            notify.success('Pack deleted.');
            load();
        } catch (e: any) {
            notify.error(e, 'Delete failed');
        }
    };

    const handlePackCoverChange = async (id: number, file: File) => {
        try {
            await API.uploadSamplePackCover(id, file);
            notify.success('Cover updated.');
            load();
        } catch (e: any) {
            notify.error(e, 'Cover upload failed');
        }
    };

    const looseSamples = samples.filter(s => s.packId === null);
    const filtered = looseSamples.filter(s => s.title.toLowerCase().includes(search.toLowerCase()));
    const filteredPacks = packs.filter(p => p.title.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <Music2 size={20} className="text-primary" />
                    <h2 className="text-lg font-bold">{mine ? 'My Samples' : 'Samples'}</h2>
                    <span className="badge badge-sm badge-ghost">{looseSamples.length + packs.length}</span>
                </div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Search..."
                        className="input input-sm input-bordered rounded-full w-48"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <button
                        className="btn btn-sm btn-primary rounded-full gap-1.5"
                        onClick={() => document.dispatchEvent(new CustomEvent('open-upload-sample-modal'))}
                    >
                        <UploadCloud size={14} /> Upload
                    </button>
                </div>
            </div>

            {!loading && filteredPacks.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold opacity-50 uppercase tracking-wide">
                        <Package size={12} /> Sample Packs
                    </div>
                    <div className="space-y-1.5">
                        {filteredPacks.map(pack => (
                            <PackRow
                                key={pack.id}
                                pack={pack}
                                onCoverChange={file => handlePackCoverChange(pack.id, file)}
                                onDelete={() => handleDeletePack(pack.id)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center p-12"><span className="loading loading-spinner loading-md" /></div>
            ) : filtered.length === 0 && filteredPacks.length === 0 ? (
                <div className="text-center py-16 opacity-40 space-y-2">
                    <Music2 size={40} className="mx-auto" />
                    <p className="font-medium">{samples.length === 0 && packs.length === 0 ? 'No samples yet. Upload your first one!' : 'No results for your search.'}</p>
                </div>
            ) : filtered.length === 0 ? null : (
                <div className="overflow-x-auto">
                    <table className="table table-sm w-full">
                        <thead>
                            <tr className="text-xs opacity-50">
                                <th>Sample</th>
                                <th>BPM / Key</th>
                                <th>License</th>
                                <th>Status</th>
                                <th>Downloads</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(sample => (
                                <tr key={sample.id} className="hover">
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                                <Music2 size={16} className="text-primary" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-sm">{sample.title}</div>
                                                {sample.artistName && <div className="text-xs opacity-50">{sample.artistName}</div>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="text-sm opacity-70">{[sample.bpm && `${sample.bpm} BPM`, sample.musicalKey].filter(Boolean).join(' · ') || '—'}</td>
                                    <td><span className="badge badge-xs badge-ghost">{sample.license.toUpperCase()}</span></td>
                                    <td>
                                        <span className={`badge badge-xs ${sample.status === 'approved' ? 'badge-success' : sample.status === 'rejected' ? 'badge-error' : 'badge-warning'}`}>
                                            {sample.status}
                                        </span>
                                    </td>
                                    <td className="text-sm font-mono">{sample.downloadCount}</td>
                                    <td>
                                        <div className="flex gap-1 justify-end">
                                            <a
                                                href={API.getSampleDownloadUrl(sample.id)}
                                                className="btn btn-xs btn-ghost rounded-full"
                                                title="Download"
                                            >
                                                <Download size={12} />
                                            </a>
                                            <button className="btn btn-xs btn-ghost rounded-full text-error" onClick={() => handleDelete(sample.id)} title="Delete">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <UploadSampleModal onUploadComplete={() => { load(); window.dispatchEvent(new CustomEvent('refresh-samples')); }} />
        </div>
    );
};
