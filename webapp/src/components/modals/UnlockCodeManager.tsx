import { useState, useEffect } from 'react';
import API from '../../services/api';
import { Key, Plus, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import type { UnlockCode } from '../../types';

interface UnlockCodeManagerProps {
    releaseId: string | number;
    isOpen: boolean;
    onClose: () => void;
}

export const UnlockCodeManager = ({ releaseId, isOpen, onClose }: UnlockCodeManagerProps) => {
    const [codes, setCodes] = useState<UnlockCode[]>([]);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [count, setCount] = useState(1);

    const loadCodes = async () => {
        setLoading(true);
        try {
            const data = await API.getUnlockCodes(String(releaseId));
            setCodes(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && releaseId) {
            loadCodes();
        }
    }, [isOpen, releaseId]);

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        setGenerating(true);
        try {
            await API.createUnlockCodes(String(releaseId), count);
            loadCodes();
            setCount(1);
        } catch (e) {
            console.error(e);
            alert('Failed to generate codes');
        } finally {
            setGenerating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal modal-open">
            <div className="modal-box bg-base-100 border border-base-content/5 max-w-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <Key size={20} className="text-primary" /> Unlock Codes
                    </h3>
                    <button className="btn btn-sm btn-circle btn-ghost" onClick={onClose}>✕</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Generator Side */}
                    <div className="md:col-span-1 border-r border-base-content/5 pr-6 space-y-4">
                        <h4 className="text-sm font-bold opacity-70 uppercase tracking-wider">Generate Codes</h4>
                        <form onSubmit={handleGenerate} className="space-y-4">
                            <div className="form-control">
                                <label className="label text-xs">Number of codes</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    max="100" 
                                    value={count}
                                    onChange={e => setCount(parseInt(e.target.value))}
                                    className="input input-bordered w-full"
                                />
                            </div>
                            <button className="btn btn-primary w-full" disabled={generating}>
                                {generating ? <span className="loading loading-spinner loading-xs"></span> : <><Plus size={16}/> Create</>}
                            </button>
                        </form>
                    </div>

                    {/* List Side */}
                    <div className="md:col-span-2 space-y-4">
                        <div className="flex justify-between items-center">
                            <h4 className="text-sm font-bold opacity-70 uppercase tracking-wider">Active Codes</h4>
                            <button className="btn btn-ghost btn-xs gap-1" onClick={loadCodes} disabled={loading}>
                                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
                            </button>
                        </div>

                        <div className="max-h-64 overflow-y-auto rounded-lg bg-base-200/50 border border-base-content/5">
                            {codes.length === 0 ? (
                                <div className="p-8 text-center opacity-50 text-sm">
                                    No codes generated yet for this release.
                                </div>
                            ) : (
                                <table className="table table-xs w-full">
                                    <thead className="sticky top-0 bg-base-200">
                                        <tr>
                                            <th>Code</th>
                                            <th>Status</th>
                                            <th>Created</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {codes.map((code, i) => (
                                            <tr key={i} className="hover:bg-base-content/5">
                                                <td className="font-mono">{code.code || 'N/A'}</td>
                                                <td>
                                                    {(code.isRedeemed || code.isUsed || code.is_used === 1) ? (
                                                        <span className="flex items-center gap-1 text-success text-[10px] font-bold">
                                                            <CheckCircle size={10}/> USED
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 opacity-50 text-[10px] font-bold">
                                                            <XCircle size={10}/> UNUSED
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="opacity-50 text-[10px]">
                                                    {code.createdAt ? new Date(code.createdAt).toLocaleDateString() : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>

                <div className="modal-action">
                    <button className="btn" onClick={onClose}>Close</button>
                </div>
            </div>
            <div className="modal-backdrop" onClick={onClose}></div>
        </div>
    );
};

