import { useState, useEffect } from 'react';
import { HardDrive, RefreshCw, Database, Server } from 'lucide-react';
import API from '../../services/api';
import type { InstanceStorage } from '../../types';
import { notify } from '../../utils/notify';

const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
};

const getProgressClass = (pct: number) => {
    if (pct >= 90) return 'progress-error';
    if (pct >= 70) return 'progress-warning';
    return 'progress-success';
};

const renderUserRow = (u: InstanceStorage['byUser'][0]) => {
    const pct = u.quota > 0 ? Math.min(100, Math.round((u.used / u.quota) * 100)) : 0;
    return (
        <tr key={u.id} className="hover:bg-base-content/5">
            <td className="text-xs font-bold truncate max-w-[160px]">{u.username}</td>
            <td className="text-xs opacity-60">{u.role}</td>
            <td className="text-right text-xs">{u.trackCount}</td>
            <td className="text-right text-xs">{formatBytes(u.used)}</td>
            <td className="text-right text-xs opacity-70">{u.quota > 0 ? formatBytes(u.quota) : '∞'}</td>
            <td>
                {u.quota > 0 ? (
                    <progress className={`progress w-full ${getProgressClass(pct)}`} value={pct} max={100} />
                ) : (
                    <span className="text-xs opacity-30">unlimited</span>
                )}
            </td>
        </tr>
    );
};

export const StoragePanel = () => {
    const [instance, setInstance] = useState<InstanceStorage | null>(null);
    const [recomputing, setRecomputing] = useState(false);

    useEffect(() => {
        loadInstance();
    }, []);

    const loadInstance = async () => {
        try {
            setInstance(await API.getStorageOverview());
        } catch (e) {
            console.error(e);
        }
    };

    const handleRecompute = async () => {
        setRecomputing(true);
        try {
            const res = await API.recomputeStorage();
            setInstance(res.overview);
            notify.success(`Storage recomputed: ${res.updated} tracks updated, ${res.missing} files missing.`);
        } catch (e: any) {
            console.error(e);
            notify.error(e, "Recompute failed");
        } finally {
            setRecomputing(false);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-2"><Server /> Instance Storage</h2>
                        <p className="opacity-70 text-sm">Disk space used by this instance across all users and tracks.</p>
                    </div>
                    <button className="btn btn-outline btn-sm gap-1" onClick={handleRecompute} disabled={recomputing}>
                        <RefreshCw size={14} className={recomputing ? 'animate-spin' : ''} />
                        {recomputing ? 'Recomputing…' : 'Recompute'}
                    </button>
                </div>

                {instance ? (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-4">
                            <div className="stat bg-base-200/50 rounded-box border border-base-content/5">
                                <div className="stat-figure text-accent"><HardDrive size={20} /></div>
                                <div className="stat-title opacity-60 text-xs">Disk Used (real)</div>
                                <div className="stat-value text-accent text-2xl">{formatBytes(instance.diskUsed)}</div>
                            </div>
                            <div className="stat bg-base-200/50 rounded-box border border-base-content/5">
                                <div className="stat-figure text-info"><Database size={20} /></div>
                                <div className="stat-title opacity-60 text-xs">Tracked in DB</div>
                                <div className="stat-value text-info text-2xl">{formatBytes(instance.dbTotal)}</div>
                                <div className="stat-desc">{instance.trackCount} tracks</div>
                            </div>
                            <div className="stat bg-base-200/50 rounded-box border border-base-content/5">
                                <div className="stat-title opacity-60 text-xs">Quota Allocated</div>
                                <div className="stat-value text-2xl">{formatBytes(instance.quotaAllocated)}</div>
                                <div className="stat-desc">across users with a limit</div>
                            </div>
                            <div className="stat bg-base-200/50 rounded-box border border-base-content/5">
                                <div className="stat-title opacity-60 text-xs">Untracked on Disk</div>
                                <div className="stat-value text-2xl">{formatBytes(Math.max(0, instance.diskUsed - instance.dbTotal))}</div>
                                <div className="stat-desc">covers, caches, orphans</div>
                            </div>
                        </div>

                        {instance.dbTotal === 0 && instance.trackCount > 0 && (
                            <div className="alert alert-warning mt-3 text-sm">
                                <span>Tracks report 0 bytes in the DB. Click <b>Recompute</b> to backfill file sizes from disk.</span>
                            </div>
                        )}

                        <div className="mt-4 bg-base-200/50 rounded-box border border-base-content/5 overflow-hidden">
                            <table className="table table-compact w-full">
                                <thead className="bg-base-300">
                                    <tr>
                                        <th>User</th>
                                        <th>Role</th>
                                        <th className="text-right">Tracks</th>
                                        <th className="text-right">Used</th>
                                        <th className="text-right">Quota</th>
                                        <th className="w-32">Usage</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {instance.byUser.map(renderUserRow)}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <div className="p-6 text-center opacity-40 italic text-sm">Loading storage overview…</div>
                )}
            </div>
        </div>
    );
};
