import { confirm } from '@/utils/confirm';
import { useState, useEffect } from 'react';
import { HardDrive, Cloud, Plus, Trash2, Folder, Music, RefreshCw, Database, Server } from 'lucide-react';
import API from '../../services/api';
import type { StorageAccount, GoogleDriveFile, InstanceStorage } from '../../types';
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
    const [accounts, setAccounts] = useState<StorageAccount[]>([]);
    const [files, setFiles] = useState<GoogleDriveFile[]>([]);
    const [currentFolder, setCurrentFolder] = useState<string>('root');
    const [history, setHistory] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState<string | null>(null);
    const [importingAll, setImportingAll] = useState(false);
    const [instance, setInstance] = useState<InstanceStorage | null>(null);
    const [recomputing, setRecomputing] = useState(false);

    useEffect(() => {
        loadAccounts();
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

    const loadAccounts = async () => {
        try {
            const data = await API.getGDriveAccounts();
            setAccounts(data);
            if (data.length > 0) {
                loadFiles('root');
            }
        } catch (e) {
            console.error(e);
        }
    };

    const loadFiles = async (folderId: string) => {
        setLoading(true);
        try {
            const data = await API.getGDriveFiles(folderId);
            setFiles(data);
            setCurrentFolder(folderId);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = async () => {
        try {
            const { url } = await API.getGDriveAuthUrl();
            window.open(url, '_blank', 'width=600,height=600');
            
            // Poll for completion or show a "Done" button
            if (await confirm("Click OK after you have finished the Google authorization in the new window.")) {
                loadAccounts();
            }
        } catch (e) {
            console.error(e);
            notify.error(e, "Failed to get auth URL");
        }
    };

    const handleDisconnect = async (id: number) => {
        if (!await confirm("Are you sure you want to disconnect this account?")) return;
        try {
            await API.deleteGDriveAccount(id);
            loadAccounts();
            setFiles([]);
        } catch (e) {
            console.error(e);
        }
    };

    const handleNavigate = (folderId: string) => {
        setHistory([...history, currentFolder]);
        loadFiles(folderId);
    };

    const handleBack = () => {
        const prev = history.pop();
        if (prev) {
            setHistory([...history]);
            loadFiles(prev);
        }
    };

    const handleImport = async (file: GoogleDriveFile) => {
        setImporting(file.id);
        try {
            await API.importGDriveFile(file.id);
            notify.success(`Imported "${file.name}" successfully!`);
        } catch (e: any) {
            console.error(e);
            notify.error(e, "Import failed");
        } finally {
            setImporting(null);
        }
    };

    const handleImportAllRecursive = async () => {
        if (!await confirm("Are you sure you want to recursively import all WAV/MP3 files from this folder and all its subfolders? This might take a few moments.")) return;
        
        setImportingAll(true);
        try {
            const res = await API.importGDriveFolderRecursive(currentFolder);
            notify.success(res.message || `Successfully imported all files!`);
            loadFiles(currentFolder);
        } catch (e: any) {
            console.error(e);
            notify.error(e, "Recursive import failed");
        } finally {
            setImportingAll(false);
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

            <div className="border-t border-base-content/10 pt-8">
                <h2 className="text-2xl font-bold flex items-center gap-2"><Cloud /> Cloud Storage</h2>
                <p className="opacity-70 text-sm">Connect external storage to stream music without using server space.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-1 space-y-4">
                    <h3 className="text-sm font-bold opacity-50">Connected Accounts</h3>
                    {accounts.length === 0 ? (
                        <div className="p-6 bg-base-200 rounded-box text-center border border-dashed border-base-content/20">
                            <Cloud className="mx-auto opacity-20 mb-2" size={32} />
                            <p className="text-sm opacity-60 mb-4">No accounts connected</p>
                            <button className="btn btn-primary btn-sm btn-block" onClick={handleConnect}>
                                <Plus size={16} /> Connect GDrive
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {accounts.map(acc => (
                                <div key={acc.id} className="flex items-center justify-between p-3 bg-base-200 rounded-box border border-base-content/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                            <HardDrive size={16} className="text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-xs font-bold truncate">{acc.account_email}</div>
                                            <div className="text-xs opacity-50">{acc.provider}</div>
                                        </div>
                                    </div>
                                    <button 
                                        className="btn btn-ghost btn-xs text-error tooltip tooltip-left" 
                                        onClick={() => handleDisconnect(acc.id)}
                                        data-tip="Disconnect Account"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                            <button className="btn btn-outline btn-sm btn-block" onClick={handleConnect}>
                                <Plus size={16} /> Add Account
                            </button>
                        </div>
                    )}
                </div>

                <div className="md:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h3 className="text-sm font-bold opacity-50">File Browser</h3>
                            {accounts.length > 0 && files.length > 0 && (
                                <button 
                                    className="btn btn-xs btn-primary gap-1"
                                    onClick={handleImportAllRecursive}
                                    disabled={importingAll}
                                >
                                    {importingAll ? "Importing All..." : "Import All Recursively"}
                                </button>
                            )}
                        </div>
                        {history.length > 0 && (
                            <button className="btn btn-ghost btn-xs" onClick={handleBack}>
                                ← Back
                            </button>
                        )}
                    </div>

                    <div className="bg-base-200 rounded-box border border-base-content/5 overflow-hidden min-h-[300px]">
                        <div className="max-h-[500px] overflow-y-auto">
                            {loading ? (
                                <div className="p-12 text-center opacity-50">
                                    <RefreshCw className="animate-spin mx-auto mb-2" />
                                    Loading files...
                                </div>
                            ) : accounts.length === 0 ? (
                                <div className="p-12 text-center opacity-30 italic">Connect an account to browse files</div>
                            ) : files.length === 0 ? (
                                <div className="p-12 text-center opacity-30 italic">This folder is empty</div>
                            ) : (
                                <table className="table table-compact w-full">
                                    <thead className="sticky top-0 bg-base-300 z-10">
                                        <tr>
                                            <th>Name</th>
                                            <th>Type</th>
                                            <th className="text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {files.map(file => (
                                            <tr key={file.id} className="hover:bg-base-content/5">
                                                <td className="max-w-[200px] truncate">
                                                    <div className="flex items-center gap-2">
                                                        {file.mimeType === 'application/vnd.google-apps.folder' ? (
                                                            <Folder size={16} className="text-warning" />
                                                        ) : (
                                                            <Music size={16} className="text-info" />
                                                        )}
                                                        <span className="text-xs truncate">{file.name}</span>
                                                    </div>
                                                </td>
                                                <td className="text-xs opacity-50 truncate">{file.mimeType.split('.').pop()?.split('/').pop()}</td>
                                                <td className="text-right">
                                                    {file.mimeType === 'application/vnd.google-apps.folder' ? (
                                                        <button className="btn btn-ghost btn-xs" onClick={() => handleNavigate(file.id)}>
                                                            Open
                                                        </button>
                                                    ) : file.mimeType.startsWith('audio/') ? (
                                                        <button 
                                                            className={`btn btn-xs ${file.isImported ? 'btn-success btn-outline' : 'btn-primary'}`} 
                                                            onClick={() => handleImport(file)}
                                                            disabled={importing === file.id || file.isImported}
                                                        >
                                                            {importing === file.id ? '...' : file.isImported ? 'Imported' : 'Import'}
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs opacity-30">N/A</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
