import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import API from '../../../services/api';
import { confirm } from '@/utils/confirm';

const getPathSegments = (pathStr: string) => {
    if (!pathStr) return { filename: 'Unknown File', folder: '' };
    const cleanPath = pathStr.replace(/\\/g, '/');
    const segments = cleanPath.split('/');
    const filename = segments[segments.length - 1] || 'Unknown File';
    const folder = segments.slice(0, -1).join(' \\ ');
    return { filename, folder };
};

export const SoulseekDownloadsTab: React.FC = () => {
    const [downloads, setDownloads] = useState<any[]>([]);

    const fetchDownloads = async () => {
        try {
            const data = await API.getSoulseekStatus();
            setDownloads(data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchDownloads();
        const interval = setInterval(fetchDownloads, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleDeleteSoulseek = async (id: number) => {
        if (!await confirm('Are you sure you want to remove this transfer record?')) return;
        try {
            await API.deleteSoulseekDownload(id);
            fetchDownloads();
        } catch (err: any) {
            console.error(`Failed to delete: ${err.message}`);
        }
    };

    const handleClearFailedSoulseek = async () => {
        if (!await confirm('Are you sure you want to clear all failed transfers?')) return;
        try {
            await API.clearFailedSoulseekDownloads();
            fetchDownloads();
        } catch (err: any) {
            console.error(`Failed to clear failed: ${err.message}`);
        }
    };

    return (
        <div className="space-y-4">
            {downloads.some(d => d.status === 'failed') && (
                <div className="flex justify-end mb-2">
                    <button 
                        onClick={handleClearFailedSoulseek}
                        className="btn btn-error btn-outline btn-sm gap-2"
                    >
                        <Trash2 size={16} /> Clear All Failed
                    </button>
                </div>
            )}
            <div className="overflow-x-auto bg-base-200/50 rounded-2xl border border-base-300 shadow-sm">
                <table className="table table-zebra w-full">
                    <thead>
                        <tr className="bg-base-300/50 text-base-content/60">
                            <th className="rounded-tl-2xl">File</th>
                            <th>Status</th>
                            <th>Progress</th>
                            <th>Added</th>
                            <th className="text-right rounded-tr-2xl">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm">
                        {downloads.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-center py-20 opacity-40 font-medium">No recent transfers.</td>
                            </tr>
                        )}
                        {downloads.map((dl: any) => {
                            const { filename, folder } = getPathSegments(dl.filename);
                            return (
                                <tr key={dl.id} className="hover:bg-base-300/30 transition-colors">
                                    <td className="max-w-[12rem] lg:max-w-md">
                                        <div className="truncate font-semibold text-base-content min-w-0" title={dl.filename}>
                                            {filename}
                                        </div>
                                        {folder && (
                                            <div className="text-xs opacity-40 font-mono truncate mt-0.5" title={dl.filename}>
                                                📁 {folder}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <span className={`badge badge-sm px-3 h-6 font-bold tracking-tighter ${
                                            dl.status === 'completed' ? 'badge-success text-success-content' : 
                                            dl.status === 'failed' ? 'badge-error text-error-content' : 
                                            'badge-info text-info-content'
                                        }`}>
                                            {dl.status}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <progress 
                                                className={`progress w-16 lg:w-24 ${dl.status === 'completed' ? 'progress-success' : 'progress-primary'}`} 
                                                value={dl.progress * 100} 
                                                max="100"
                                            ></progress>
                                            <span className="text-xs font-mono opacity-50">{(dl.progress * 100).toFixed(0)}%</span>
                                        </div>
                                    </td>
                                    <td className="text-xs opacity-40 font-bold">{new Date(dl.added_at).toLocaleDateString()}</td>
                                    <td className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <button 
                                                onClick={() => handleDeleteSoulseek(dl.id)}
                                                className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                                                title="Remove Transfer"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
