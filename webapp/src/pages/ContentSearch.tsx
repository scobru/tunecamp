import React, { useState, useEffect } from 'react';
import { API } from '../services/api';
import { useAuthStore } from '../stores/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Activity, RefreshCw, Trash2, AlertCircle } from 'lucide-react';

export const ContentSearch: React.FC = () => {
    const [query, setQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'soulseek' | 'torrents' | 'downloads'>('soulseek');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [downloads, setDownloads] = useState<any[]>([]);
    const [torrents, setTorrents] = useState<any[]>([]);
    const [magnetUri, setMagnetUri] = useState('');
    const [searchError, setSearchError] = useState<string | null>(null);
    const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
    const navigate = useNavigate();

    useEffect(() => {
        if (!authLoading) {
            if (!isAuthenticated || !user?.isRootAdmin) {
                navigate('/');
            }
        }
    }, [authLoading, isAuthenticated, user, navigate]);

    const fetchDownloads = async () => {
        try {
            const data = await API.getSoulseekStatus();
            setDownloads(data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchTorrents = async () => {
        try {
            const data = await API.getTorrents();
            setTorrents(data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (activeTab === 'downloads') {
            fetchDownloads();
            const interval = setInterval(fetchDownloads, 5000);
            return () => clearInterval(interval);
        } else if (activeTab === 'torrents') {
            fetchTorrents();
            const interval = setInterval(fetchTorrents, 5000);
            return () => clearInterval(interval);
        }
    }, [activeTab]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query) return;

        setLoading(true);
        setResults([]);
        setSearchError(null);
        try {
            let data: any[];
            data = await API.searchSoulseek(query);
            setResults(data);
        } catch (err: any) {
            console.error(`Search failed: ${err.message}`);
            setSearchError("Search service is currently limited. Use manual links below.");
        } finally {
            setLoading(false);
        }
    };

    const handleAddTorrent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!magnetUri) return;

        setLoading(true);
        try {
            await API.addTorrent(magnetUri);
            setMagnetUri('');
            fetchTorrents();
        } catch (err: any) {
            console.error(`Failed to add torrent: ${err.message}`);
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteTorrent = async (infoHash: string) => {
        if (!confirm('Are you sure you want to remove this torrent?')) return;
        try {
            await API.deleteTorrent(infoHash);
            fetchTorrents();
        } catch (err: any) {
            console.error(`Failed to delete torrent: ${err.message}`);
        }
    };

    const handleSoulseekDownload = async (result: any) => {
        try {
            await API.downloadSoulseek(result);
            console.log('Download started');
            fetchDownloads();
        } catch (err: any) {
            console.error(`Failed to start download: ${err.message}`);
        }
    };

    const handleSyncSoulseek = async (id: number) => {
        try {
            await API.syncSoulseekDownload(id);
            console.log('Sync triggered');
            fetchDownloads();
        } catch (err: any) {
            console.error(`Failed to sync: ${err.message}`);
        }
    };

    const handleDeleteSoulseek = async (id: number) => {
        if (!confirm('Are you sure you want to remove this transfer record?')) return;
        try {
            await API.deleteSoulseekDownload(id);
            fetchDownloads();
        } catch (err: any) {
            console.error(`Failed to delete: ${err.message}`);
        }
    };

    const handleClearFailedSoulseek = async () => {
        if (!confirm('Are you sure you want to clear all failed transfers?')) return;
        try {
            await API.clearFailedSoulseekDownloads();
            fetchDownloads();
        } catch (err: any) {
            console.error(`Failed to clear failed: ${err.message}`);
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Content Search</h1>
                    <p className="text-base-content/60">Find and download music via decentralised protocols.</p>
                </div>
                {activeTab === 'downloads' && downloads.some(d => d.status === 'failed') && (
                    <button 
                        onClick={handleClearFailedSoulseek}
                        className="btn btn-error btn-outline btn-sm gap-2"
                    >
                        <Trash2 size={16} /> Clear All Failed
                    </button>
                )}
            </header>


            <div className="tabs tabs-boxed mb-6 p-1 bg-base-300">
                <button 
                    className={`tab flex-1 transition-all ${activeTab === 'soulseek' ? 'tab-active bg-primary text-primary-content shadow-lg' : ''}`}
                    onClick={() => setActiveTab('soulseek')}
                >
                    <Activity className="mr-2" size={16} /> Soulseek
                </button>
                <button 
                    className={`tab flex-1 transition-all ${activeTab === 'torrents' ? 'tab-active bg-primary text-primary-content shadow-lg' : ''}`}
                    onClick={() => setActiveTab('torrents')}
                >
                    <RefreshCw className="mr-2" size={16} /> WebTorrent
                </button>
                <button 
                    className={`tab flex-1 transition-all ${activeTab === 'downloads' ? 'tab-active bg-primary text-primary-content shadow-lg' : ''}`}
                    onClick={() => setActiveTab('downloads')}
                >
                    <Download className="mr-2" size={16} /> Transfers
                </button>
            </div>

            {activeTab === 'soulseek' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Search Column */}
                    <div className="lg:col-span-2">
                        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={18} />
                                <input 
                                    type="text" 
                                    placeholder={`Quick search Soulseek users...`}
                                    className="input input-bordered w-full pl-10"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary gap-2 min-w-[120px]" disabled={loading}>
                                {loading ? <span className="loading loading-spinner loading-xs"></span> : <Search size={18} />}
                                Search
                            </button>
                        </form>

                        {searchError && (
                            <div className="alert alert-warning mb-6 py-3 shadow-sm rounded-lg">
                                <AlertCircle size={18} />
                                <span className="text-sm font-medium">{searchError}</span>
                            </div>
                        )}

                        <div className="grid gap-3">
                            {results.length === 0 && !loading && !searchError && (
                                <div className="text-center py-20 bg-base-200/50 border border-dashed border-base-300 rounded-2xl">
                                    <div className="bg-base-300 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Search className="opacity-20" size={32} />
                                    </div>
                                    <p className="opacity-40 font-medium">Ready to search the network...</p>
                                </div>
                            )}

                            {results.map((res: any, i: number) => (
                                <div key={i} className="group card bg-base-200/50 hover:bg-base-200 border border-base-300/50 hover:border-primary/30 transition-all duration-200">
                                    <div className="card-body p-4 flex-row justify-between items-center overflow-hidden">
                                        <div className="flex-1 min-w-0 pr-4 overflow-hidden">
                                            <h3 className="font-bold truncate text-sm lg:text-base group-hover:text-primary transition-colors w-full" title={res.title || res.name || res.file}>
                                                {res.title || res.name || res.file}
                                            </h3>
                                            <div className="text-xs opacity-50 flex flex-wrap gap-x-4 gap-y-1 mt-1 font-medium truncate">
                                                <span className="flex items-center gap-1">User: {res.user}</span>
                                                <span className="flex items-center gap-1">{(res.size / 1024 / 1024).toFixed(2)} MB</span>
                                                <span className="flex items-center gap-1">{(res.speed / 1024).toFixed(0)} KB/s</span>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleSoulseekDownload(res)}
                                            className="btn btn-circle btn-sm btn-ghost hover:bg-primary hover:text-primary-content transition-all flex-shrink-0"
                                            title="Download"
                                        >
                                            <Download size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Side Actions Column */}
                    <div className="space-y-6">
                        <div className="card bg-primary/5 border border-primary/20 p-5">
                            <h3 className="text-sm font-bold text-primary mb-2 flex items-center gap-2">
                                <Activity size={16} /> Soulseek Protocol
                            </h3>
                            <p className="text-xs opacity-70 leading-relaxed">
                                Soulseek is a peer-to-peer network specifically for music. It is often more reliable than torrents for finding rare albums and lossless tracks.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'torrents' && (
                <div className="space-y-6">
                    <div className="card bg-base-200 border border-base-300 shadow-sm p-6">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <RefreshCw size={20} className="text-primary" /> Add New Torrent
                        </h2>
                        <form onSubmit={handleAddTorrent} className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="Paste magnet link here..."
                                className="input input-bordered flex-1"
                                value={magnetUri}
                                onChange={e => setMagnetUri(e.target.value)}
                            />
                            <button type="submit" className="btn btn-primary gap-2" disabled={loading || !magnetUri}>
                                {loading ? <span className="loading loading-spinner loading-xs"></span> : <Download size={18} />}
                                Add Torrent
                            </button>
                        </form>
                        <p className="text-xs opacity-50 mt-2">
                            Supports magnet links and info hashes. Files will be automatically imported into the library once completed.
                        </p>
                    </div>

                    <div className="overflow-x-auto bg-base-200/50 rounded-2xl border border-base-300 shadow-sm">
                        <table className="table table-zebra w-full">
                            <thead>
                                <tr className="bg-base-300/50 text-base-content/60">
                                    <th className="rounded-tl-2xl">Name</th>
                                    <th>Status</th>
                                    <th>Progress</th>
                                    <th>Speed</th>
                                    <th>Peers</th>
                                    <th className="text-right rounded-tr-2xl">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm">
                                {torrents.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="text-center py-20 opacity-40 font-medium">No active torrents.</td>
                                    </tr>
                                )}
                                {torrents.map((t: any) => (
                                    <tr key={t.info_hash} className="hover:bg-base-300/30 transition-colors">
                                        <td className="max-w-md">
                                            <div className="truncate font-semibold text-base-content" title={t.name}>
                                                {t.name || t.info_hash}
                                            </div>
                                            <div className="text-[10px] opacity-30 truncate">{t.info_hash}</div>
                                        </td>
                                        <td>
                                            <span className={`badge badge-sm px-3 h-6 font-bold uppercase tracking-tighter ${
                                                t.status === 'completed' ? 'badge-success text-success-content' : 
                                                t.status === 'failed' ? 'badge-error text-error-content' : 
                                                'badge-info text-info-content'
                                            }`}>
                                                {t.status}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <progress 
                                                    className={`progress w-24 ${t.status === 'completed' ? 'progress-success' : 'progress-primary'}`} 
                                                    value={t.progress * 100} 
                                                    max="100"
                                                ></progress>
                                                <span className="text-[10px] font-mono opacity-50">{(t.progress * 100).toFixed(1)}%</span>
                                            </div>
                                        </td>
                                        <td className="text-[10px] font-mono opacity-60">
                                            {t.downloadSpeed ? `${formatBytes(t.downloadSpeed)}/s` : '-'}
                                        </td>
                                        <td className="text-[10px] font-bold opacity-60">
                                            {t.numPeers || 0}
                                        </td>
                                        <td className="text-right">
                                            <button 
                                                onClick={() => handleDeleteTorrent(t.info_hash)}
                                                className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                                                title="Remove Torrent"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'downloads' && (
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
                            {downloads.map((dl: any) => (
                                <tr key={dl.id} className="hover:bg-base-300/30 transition-colors">
                                    <td className="max-w-[12rem] lg:max-w-md">
                                        <div className="truncate font-semibold text-base-content min-w-0" title={dl.filename}>
                                            {dl.filename}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`badge badge-sm px-3 h-6 font-bold uppercase tracking-tighter ${
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
                                            <span className="text-[10px] font-mono opacity-50">{(dl.progress * 100).toFixed(0)}%</span>
                                        </div>
                                    </td>
                                    <td className="text-[10px] uppercase opacity-40 font-bold">{new Date(dl.added_at).toLocaleDateString()}</td>
                                    <td className="text-right">
                                        <div className="flex justify-end gap-1">
                                            {dl.status === 'completed' && (
                                                <button 
                                                    onClick={() => handleSyncSoulseek(dl.id)}
                                                    className="btn btn-ghost btn-xs text-primary gap-1 font-bold"
                                                    title="Sync to Library"
                                                >
                                                    <RefreshCw size={14} /> Sync
                                                </button>
                                            )}
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
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ContentSearch;

