import { confirm } from '@/utils/confirm';
import { useState, useEffect } from 'react';
import { Music2, Trash2, Download, UploadCloud } from 'lucide-react';
import API from '../../services/api';
import { notify } from '../../utils/notify';
import { UploadSampleModal } from '../modals/UploadSampleModal';
import type { Sample } from '../../types';

export const AdminSamplesList = ({ mine = false }: { mine?: boolean }) => {
    const [samples, setSamples] = useState<Sample[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            setSamples(await API.getSamples({ mine }));
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

    const filtered = samples.filter(s => s.title.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <Music2 size={20} className="text-primary" />
                    <h2 className="text-lg font-bold">{mine ? 'My Samples' : 'Samples'}</h2>
                    <span className="badge badge-sm badge-ghost">{samples.length}</span>
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

            {loading ? (
                <div className="flex justify-center p-12"><span className="loading loading-spinner loading-md" /></div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 opacity-40 space-y-2">
                    <Music2 size={40} className="mx-auto" />
                    <p className="font-medium">{samples.length === 0 ? 'No samples yet. Upload your first one!' : 'No results for your search.'}</p>
                </div>
            ) : (
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
