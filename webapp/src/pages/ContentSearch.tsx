import { confirm } from '@/utils/confirm';
import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { useAuthStore } from '../stores/useAuthStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Activity, RefreshCw, Trash2, AlertCircle, Globe, Play, Pause, Upload, Copy, ExternalLink } from 'lucide-react';
import { notify } from '../utils/notify';
import clsx from 'clsx';
import type { Track } from '../types';

/**
 * Public torrent search engines opened in a new tab.
 *
 * In-app torrent search was removed: the server resolved magnets by reaching
 * ThePirateBay/apibay, which is blocked at the ISP level in many regions
 * (e.g. Italy/AGCOM), so the search silently returned zero results. Instead we
 * link out to working indexes; the user copies a magnet and pastes it into the
 * "Add magnet" field below, which downloads via WebTorrent independently of any
 * blocked host.
 *
 * `{q}` is replaced with the URL-encoded query. Entries without `{q}` just open
 * their landing page (useful for proxy-list aggregators whose mirrors rotate).
 */
const TORRENT_SEARCH_ENGINES: { name: string; url: string; note: string }[] = [
    { name: 'BTDigg', url: 'https://btdig.com/search?q={q}', note: 'DHT search — magnets directly' },
    { name: '1337x', url: 'https://1337x.to/search/{q}/1/', note: 'General tracker' },
    { name: 'Knaben', url: 'https://knaben.org/search/{q}/0/1/seeders', note: 'Meta-search aggregator' },
    { name: 'Solid Torrents', url: 'https://solidtorrents.to/search?q={q}', note: 'DHT + indexes' },
    { name: 'TPB proxy list', url: 'https://piratebayproxy.info/', note: 'Live ThePirateBay mirrors' },
];

const buildEngineUrl = (template: string, query: string): string =>
    template.includes('{q}')
        ? template.replace('{q}', encodeURIComponent(query.trim()))
        : template;

const getPathSegments = (pathStr: string) => {
    if (!pathStr) return { filename: 'Unknown File', folder: '' };
    const cleanPath = pathStr.replace(/\\/g, '/');
    const segments = cleanPath.split('/');
    const filename = segments[segments.length - 1] || 'Unknown File';
    const folder = segments.slice(0, -1).join(' \\ ');
    return { filename, folder };
};

const ContentSearch: React.FC = () => {
    const [query, setQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'soulseek' | 'torrents' | 'seeding' | 'streaming' | 'downloads'>('soulseek');
    const [results, setResults] = useState<any[]>([]);
    const [streamingResults, setStreamingResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [downloads, setDownloads] = useState<any[]>([]);
    const [torrents, setTorrents] = useState<any[]>([]);
    const [magnetUri, setMagnetUri] = useState('');
    const [searchError, setSearchError] = useState<string | null>(null);
    const [seedFilePaths, setSeedFilePaths] = useState('');
    const [seedName, setSeedName] = useState('');
    const [seedingResult, setSeedingResult] = useState<string | null>(null);
    const [seedLoading, setSeedLoading] = useState(false);
    const [knabenHits, setKnabenHits] = useState<any[]>([]);
    const [knabenTotal, setKnabenTotal] = useState(0);
    const [knabenPage, setKnabenPage] = useState(0);
    const [knabenLoading, setKnabenLoading] = useState(false);
    const [knabenError, setKnabenError] = useState<string | null>(null);
    const { user, isAuthenticated, isLoading: authLoading, role } = useAuthStore();
    const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayerStore();
    const navigate = useNavigate();

    useEffect(() => {
        if (!authLoading) {
            const isManager = role === 'admin' || role === 'root_admin';
            if (!isAuthenticated || !isManager) {
                navigate('/');
            }
        }
    }, [authLoading, isAuthenticated, user, role, navigate]);

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

    const handleKnabenSearch = async (e?: React.FormEvent, page = 0) => {
        e?.preventDefault();
        if (!query.trim()) return;
        setKnabenLoading(true);
        setKnabenError(null);
        if (page === 0) setKnabenHits([]);
        try {
            const data = await API.searchTorrents(query.trim(), page);
            const hits = data?.hits ?? data?.results ?? [];
            setKnabenHits(page === 0 ? hits : (prev: any[]) => [...prev, ...hits]);
            setKnabenTotal(data?.total ?? hits.length);
            setKnabenPage(page);
        } catch (err: any) {
            setKnabenError(err?.message ?? "Search failed");
        } finally {
            setKnabenLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'downloads') {
            fetchDownloads();
            const interval = setInterval(fetchDownloads, 5000);
            return () => clearInterval(interval);
        } else if (activeTab === 'torrents' || activeTab === 'seeding') {
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
        setStreamingResults([]);
        setSearchError(null);
        try {
            if (activeTab === 'soulseek') {
                const data = await API.searchSoulseek(query);
                setResults(data);
            } else if (activeTab === 'streaming') {
                const data = await API.globalSearch(query);
                setStreamingResults([
                    ...(data.streaming || []),
                    ...(data.external || [])
                ]);
            }
        } catch (err: any) {
            console.error(`Search failed: ${err.message}`);
            setSearchError("Search service is currently limited.");
        } finally {
            setLoading(false);
        }
    };

    const handlePlayStreaming = (item: any) => {
        const trackId = `ext:${item.source}:${item.id || item.originalId}`;
        const isCurrent = currentTrack?.id === trackId;

        if (isCurrent) {
            togglePlay();
        } else {
            const virtualTrack: Track = {
                id: trackId,
                title: item.title,
                artistName: item.artist,
                artistId: 0,
                albumId: 0,
                duration: item.duration || 0,
                path: '',
                filename: '',
                playCount: 0,
                streamUrl: item.streamUrl || item.url,
                coverUrl: item.thumbnail || item.coverUrl,
                external_id: trackId
            };
            playTrack(virtualTrack);
        }
    };

    const handleRipStreaming = async (item: any) => {
        setLoading(true);
        try {
            // 1. Ensure track is in database with external ID
            const trackId = `ext:${item.source}:${item.id || item.originalId}`;
            const metadata = {
                title: item.title,
                artist: item.artist,
                coverUrl: item.coverUrl || item.thumbnail,
                duration: item.duration,
                url: item.url
            };
            const starRes = await API.starTrack(trackId, metadata);
            const dbTrackId = starRes.trackId;

            if (!dbTrackId) throw new Error("Failed to create local record for track");

            // 2. Localize it
            await API.localizeTrack(dbTrackId);
            notify.success(`Localization started for "${item.title}". It will appear in your library soon.`);
        } catch (err: any) {
            console.error(`Failed to rip track: ${err.message}`);
            notify.error(err, "Rip failed");
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
            notify.success("Torrent added successfully");
            setMagnetUri('');
            fetchTorrents();
        } catch (err: any) {
            console.error(`Failed to add torrent: ${err.message}`);
            notify.error(err, "Failed to add torrent");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteTorrent = async (infoHash: string) => {
        if (!await confirm('Are you sure you want to remove this torrent?')) return;
        try {
            await API.deleteTorrent(infoHash);
            fetchTorrents();
        } catch (err: any) {
            console.error(`Failed to delete torrent: ${err.message}`);
        }
    };

    const handleSeedFiles = async (e: React.FormEvent) => {
        e.preventDefault();
        const paths = seedFilePaths.split('\n').map(p => p.trim()).filter(Boolean);
        if (paths.length === 0 || !seedName) return;
        setSeedLoading(true);
        setSeedingResult(null);
        try {
            const res = await API.seedTorrent(paths, seedName);
            setSeedingResult(res.magnetUri);
            setSeedFilePaths('');
            setSeedName('');
            notify.success("Started seeding file(s)");
            fetchTorrents();
        } catch (err: any) {
            notify.error(err, "Seeding failed");
        } finally {
            setSeedLoading(false);
        }
    };

    const handlePurgeStuck = async () => {
        if (!await confirm('Remove all torrents that are errored or stuck on metadata?')) return;
        try {
            const result = await API.purgeStuckTorrents();
            fetchTorrents();
            notify.success(`Purged ${result.count} stuck torrent(s).`);
        } catch (err: any) {
            console.error(`Failed to purge torrents: ${err.message}`);
            notify.error(err, "Purge failed");
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

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const seedingTorrents = torrents.filter((t: any) => t.status === 'seeding');

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
                    className={`tab flex-1 transition-all ${activeTab === 'soulseek' ? 'tab-active bg-primary text-primary-content shadow-level-1' : ''}`}
                    onClick={() => setActiveTab('soulseek')}
                >
                    <Activity className="mr-2" size={16} /> Soulseek
                </button>
                <button 
                    className={`tab flex-1 transition-all ${activeTab === 'torrents' ? 'tab-active bg-primary text-primary-content shadow-level-1' : ''}`}
                    onClick={() => setActiveTab('torrents')}
                >
                    <RefreshCw className="mr-2" size={16} /> WebTorrent
                </button>
                <button
                    className={`tab flex-1 transition-all ${activeTab === 'seeding' ? 'tab-active bg-success text-success-content shadow-level-1' : ''}`}
                    onClick={() => setActiveTab('seeding')}
                >
                    <Upload className="mr-2" size={16} /> Seeding
                </button>
                <button
                    className={`tab flex-1 transition-all ${activeTab === 'streaming' ? 'tab-active bg-primary text-primary-content shadow-level-1' : ''}`}
                    onClick={() => setActiveTab('streaming')}
                >
                    <Globe className="mr-2" size={16} /> Streaming
                </button>
                <button 
                    className={`tab flex-1 transition-all ${activeTab === 'downloads' ? 'tab-active bg-primary text-primary-content shadow-level-1' : ''}`}
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
                             {results.map((res: any, i: number) => {
                                const fullPath = res.title || res.name || res.file || '';
                                const { filename, folder } = getPathSegments(fullPath);
                                return (
                                    <div key={i} className="group card bg-base-200/50 hover:bg-base-200 border border-base-300/50 hover:border-primary/30 transition-all duration-200">
                                        <div className="card-body p-4 flex-row justify-between items-center overflow-hidden">
                                            <div className="flex-1 min-w-0 pr-4 overflow-hidden">
                                                <h3 className="font-bold truncate text-sm lg:text-base text-base-content group-hover:text-primary transition-colors w-full" title={fullPath}>
                                                    {filename}
                                                </h3>
                                                {folder && (
                                                    <div className="text-[11px] opacity-45 font-mono mt-1 w-full truncate flex items-center gap-1" title={fullPath}>
                                                        <span className="flex-shrink-0">📁</span>
                                                        <span className="truncate">{folder}</span>
                                                    </div>
                                                )}
                                                <div className="text-[11px] opacity-75 flex flex-wrap gap-2 mt-2.5 font-medium">
                                                    <span className="bg-base-300/60 px-2 py-0.5 rounded text-xs text-base-content/80 flex items-center gap-1">
                                                        <span>👤</span> {res.user}
                                                    </span>
                                                    <span className="bg-base-300/60 px-2 py-0.5 rounded text-xs text-base-content/80 flex items-center gap-1">
                                                        <span>💾</span> {(res.size / 1024 / 1024).toFixed(2)} MB
                                                    </span>
                                                    <span className="bg-base-300/60 px-2 py-0.5 rounded text-xs text-base-content/80 flex items-center gap-1">
                                                        <span>⚡</span> {(res.speed / 1024).toFixed(0)} KB/s
                                                    </span>
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
                                );
                            })}
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

            {activeTab === 'seeding' && (
                <div className="space-y-8">
                    {/* Seed form + explainer side by side; the active seeds get the full width below */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="card bg-base-200 border border-base-300 shadow-sm p-6">
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <Upload size={20} className="text-success" /> Seed Files
                            </h2>
                            <form onSubmit={handleSeedFiles} className="space-y-4">
                                <div>
                                    <label className="label pb-1"><span className="label-text font-bold text-xs">Torrent Name</span></label>
                                    <input
                                        type="text"
                                        className="input input-bordered w-full"
                                        placeholder="My Album Title"
                                        value={seedName}
                                        onChange={e => setSeedName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="label pb-1"><span className="label-text font-bold text-xs">File Paths (one per line)</span></label>
                                    <textarea
                                        className="textarea textarea-bordered w-full font-mono text-xs h-40 leading-relaxed"
                                        placeholder={"/music/Artist/Album/01 - Track.flac\n/music/Artist/Album/02 - Track.flac"}
                                        value={seedFilePaths}
                                        onChange={e => setSeedFilePaths(e.target.value)}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="btn btn-success gap-2 w-full"
                                    disabled={seedLoading || !seedFilePaths.trim() || !seedName.trim()}
                                >
                                    {seedLoading ? <span className="loading loading-spinner loading-xs"></span> : <Upload size={18} />}
                                    Start Seeding
                                </button>
                            </form>
                            {seedingResult && (
                                <div className="mt-4 alert alert-success gap-3 items-start">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-xs mb-1">Seeding started — share this magnet:</p>
                                        <code className="text-xs font-mono break-all">{seedingResult}</code>
                                    </div>
                                    <button
                                        className="btn btn-ghost btn-xs flex-shrink-0"
                                        onClick={() => navigator.clipboard.writeText(seedingResult!)}
                                    >
                                        <Copy size={12} /> Copy
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="card bg-primary/5 border border-primary/20 p-5 h-fit">
                            <h3 className="text-sm font-bold text-primary mb-2 flex items-center gap-2">
                                <Upload size={16} /> How seeding works
                            </h3>
                            <p className="text-xs opacity-70 leading-relaxed">
                                Enter the absolute server-side file paths and a torrent name. The server will create a torrent and start seeding immediately via WebTorrent. Share the generated magnet URI so others can download from you.
                            </p>
                        </div>
                    </div>

                    {/* Active seeds — full-width responsive grid that scales as seeds grow */}
                    <section className="space-y-4">
                        <div className="flex items-center justify-between border-b border-base-content/10 pb-3">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <Upload size={18} className="text-success" /> Active Seeds
                                {seedingTorrents.length > 0 && (
                                    <span className="badge badge-sm badge-neutral">{seedingTorrents.length}</span>
                                )}
                            </h2>
                        </div>
                        {seedingTorrents.length === 0 ? (
                            <div className="text-center py-16 bg-base-200/40 border border-dashed border-base-300 rounded-2xl">
                                <Upload className="opacity-20 mx-auto mb-3" size={28} />
                                <p className="opacity-40 text-sm font-medium">No active seeds. Start seeding files above.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                {seedingTorrents.map((t: any) => (
                                    <div key={t.infoHash || t.info_hash} className="card bg-base-200/50 border border-base-300/50 hover:border-success/30 transition-colors p-4 space-y-2">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-bold truncate" title={t.name}>{t.name || t.infoHash || t.info_hash}</div>
                                                <div className="text-xs opacity-40 font-mono truncate">{t.infoHash || t.info_hash}</div>
                                            </div>
                                            <div className="flex gap-1 flex-shrink-0">
                                                <button
                                                    onClick={() => navigator.clipboard.writeText(t.magnet_uri || '')}
                                                    className="btn btn-ghost btn-xs text-success p-0 h-auto min-h-0"
                                                    title="Copy magnet URI"
                                                >
                                                    <Copy size={12} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteTorrent(t.infoHash || t.info_hash)}
                                                    className="btn btn-ghost btn-xs text-error p-0 h-auto min-h-0"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center text-xs font-bold gap-2">
                                            <span className="text-success">seeding</span>
                                            <span className="opacity-40 normal-case">
                                                {(t.numPeers ?? 0)} peer{(t.numPeers ?? 0) === 1 ? '' : 's'}
                                                {t.uploadSpeed ? ` · ↑ ${formatBytes(t.uploadSpeed)}/s` : ''}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            )}

            {activeTab === 'streaming' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Search Column */}
                    <div className="lg:col-span-2">
                        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={18} />
                                <input 
                                    type="text" 
                                    placeholder={`Search YouTube, SoundCloud, Bandcamp...`}
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

                        <div className="grid gap-3">
                            {streamingResults.length === 0 && !loading && (
                                <div className="text-center py-20 bg-base-200/50 border border-dashed border-base-300 rounded-2xl">
                                    <div className="bg-base-300 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Globe className="opacity-20" size={32} />
                                    </div>
                                    <p className="opacity-40 font-medium">Search providers to localize tracks...</p>
                                </div>
                            )}

                            {streamingResults.map((res: any, i: number) => (
                                <div key={i} className="group card bg-base-200/50 hover:bg-base-200 border border-base-300/50 hover:border-primary/30 transition-all duration-200">
                                    <div className="card-body p-4 flex-row justify-between items-center overflow-hidden">
                                        <div className="flex gap-3 items-center flex-1 min-w-0 overflow-hidden pr-4">
                                            <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-base-300 flex items-center justify-center">
                                                {res.thumbnail || res.coverUrl ? (
                                                    <img src={res.thumbnail || res.coverUrl} alt="" className="w-full h-full object-cover" />
                                                ) : <Activity size={16} className="opacity-20" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-bold truncate text-sm lg:text-base group-hover:text-primary transition-colors" title={res.title}>
                                                    {res.title}
                                                </h3>
                                                <div className="text-xs opacity-50 truncate font-medium">
                                                    {res.artist} • <span className="font-bold text-primary">{res.source || res.provider}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            <button 
                                                onClick={() => handlePlayStreaming(res)}
                                                className={clsx(
                                                    "btn btn-circle btn-sm",
                                                    currentTrack?.id === `ext:${res.source}:${res.id || res.originalId}` && isPlaying 
                                                        ? "btn-primary" 
                                                        : "btn-ghost hover:bg-primary/20"
                                                )}
                                                title="Preview"
                                            >
                                                {currentTrack?.id === `ext:${res.source}:${res.id || res.originalId}` && isPlaying 
                                                    ? <Pause size={16} /> 
                                                    : <Play size={16} className="ml-0.5" />
                                                }
                                            </button>
                                            <button 
                                                onClick={() => handleRipStreaming(res)}
                                                className="btn btn-primary btn-sm gap-2"
                                                disabled={loading}
                                            >
                                                <Download size={14} />
                                                Rip
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="card bg-primary/5 border border-primary/20 p-5">
                            <h3 className="text-sm font-bold text-primary mb-2 flex items-center gap-2">
                                <Download size={16} /> Track Localization
                            </h3>
                            <p className="text-xs opacity-70 leading-relaxed">
                                Use this tab to search for tracks on streaming providers and "localize" them. This will download the audio and add it to your permanent library (Santuario).
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'torrents' && (
                <div className="space-y-8">
                    {/* Knaben in-app search */}
                    <div className="card bg-base-200/50 border border-base-300 p-5 space-y-4">
                        <div>
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <Search size={18} className="text-primary" /> Search Torrents
                            </h2>
                            <p className="text-xs opacity-60 mt-1 leading-relaxed">
                                Powered by <span className="font-semibold">Knaben</span> aggregator. Results are sorted by seeders — click Add to start the download.
                            </p>
                        </div>

                        <form onSubmit={handleKnabenSearch} className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={18} />
                                <input
                                    type="text"
                                    placeholder="Artist, album, release… (e.g. pink floyd dark side)"
                                    className="input input-bordered w-full pl-10"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary gap-2 min-w-[100px]" disabled={knabenLoading || !query.trim()}>
                                {knabenLoading ? <span className="loading loading-spinner loading-xs" /> : <Search size={16} />}
                                Search
                            </button>
                        </form>

                        {knabenError && (
                            <div className="alert alert-error text-sm py-2">{knabenError}</div>
                        )}

                        {knabenHits.length > 0 && (
                            <div className="space-y-2">
                                <div className="text-xs opacity-50 pb-1">{knabenTotal} result{knabenTotal !== 1 ? 's' : ''} — showing {knabenHits.length}</div>
                                <div className="divide-y divide-base-content/5 rounded-xl overflow-hidden border border-base-content/10">
                                    {knabenHits.map((hit: any, i: number) => {
                                        const magnet = hit.magnet ?? hit.magnetUri ?? hit.magnet_uri ?? '';
                                        const seeders = hit.seeders ?? hit.seeds ?? 0;
                                        const size = hit.size ?? hit.fileSize ?? 0;
                                        const sizeFmt = size > 0
                                            ? size / 1024 / 1024 < 1000
                                                ? `${(size / 1024 / 1024).toFixed(0)} MB`
                                                : `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
                                            : '';
                                        return (
                                            <div key={hit.id ?? hit.info_hash ?? i} className="flex items-center gap-3 px-4 py-3 bg-base-200/40 hover:bg-base-200 transition-colors">
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium truncate" title={hit.title ?? hit.name}>{hit.title ?? hit.name}</div>
                                                    <div className="flex items-center gap-3 mt-0.5 text-[11px] opacity-50">
                                                        {sizeFmt && <span>{sizeFmt}</span>}
                                                        <span className="text-success font-semibold">{seeders}S</span>
                                                        {(hit.leechers ?? hit.peers) != null && <span>{hit.leechers ?? hit.peers}L</span>}
                                                        {hit.indexer && <span>{hit.indexer}</span>}
                                                    </div>
                                                </div>
                                                {magnet ? (
                                                    <button
                                                        className="btn btn-primary btn-xs gap-1 shrink-0"
                                                        onClick={async () => {
                                                            try {
                                                                await API.addTorrent(magnet);
                                                                notify.success("Torrent added");
                                                                fetchTorrents();
                                                            } catch (err: any) {
                                                                notify.error(err, "Failed to add torrent");
                                                            }
                                                        }}
                                                    >
                                                        <Download size={12} /> Add
                                                    </button>
                                                ) : (
                                                    <a
                                                        href={`https://knaben.org/search/${encodeURIComponent(hit.title ?? hit.name ?? '')}/0/1/seeders`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="btn btn-ghost btn-xs gap-1 shrink-0"
                                                    >
                                                        <ExternalLink size={12} /> Open
                                                    </a>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                {knabenHits.length < knabenTotal && (
                                    <button
                                        className="btn btn-ghost btn-sm w-full"
                                        disabled={knabenLoading}
                                        onClick={() => handleKnabenSearch(undefined, knabenPage + 1)}
                                    >
                                        {knabenLoading ? <span className="loading loading-spinner loading-xs" /> : 'Load more'}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Fallback: external engines */}
                        <details className="text-xs opacity-60">
                            <summary className="cursor-pointer hover:opacity-100 transition-opacity">External engines (fallback)</summary>
                            <div className="pt-2 flex flex-wrap gap-2">
                                {TORRENT_SEARCH_ENGINES.map((engine) => (
                                    <a
                                        key={engine.name}
                                        href={buildEngineUrl(engine.url, query)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="badge badge-outline hover:badge-primary transition-colors gap-1"
                                    >
                                        {engine.name} <ExternalLink size={10} />
                                    </a>
                                ))}
                            </div>
                        </details>
                    </div>

                    {/* Add a magnet manually — compact inline bar */}
                    <form onSubmit={handleAddTorrent} className="flex gap-2 items-center">
                        <div className="relative flex-1">
                            <RefreshCw className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={16} />
                            <input
                                type="text"
                                placeholder="Or paste a magnet link to add it directly…"
                                className="input input-bordered w-full pl-10"
                                value={magnetUri}
                                onChange={e => setMagnetUri(e.target.value)}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary btn-outline gap-2 min-w-[120px]" disabled={loading || !magnetUri}>
                            {loading ? <span className="loading loading-spinner loading-xs"></span> : <Download size={18} />}
                            Add
                        </button>
                    </form>

                    {/* Active torrents — full-width responsive grid that scales as downloads grow */}
                    <section className="space-y-4">
                        <div className="flex items-center justify-between border-b border-base-content/10 pb-3">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <Activity size={18} className="text-primary" /> Active Torrents
                                {torrents.length > 0 && (
                                    <span className="badge badge-sm badge-neutral">{torrents.length}</span>
                                )}
                            </h2>
                            {torrents.some((t: any) => t.status === 'metadata' || t.status === 'error' || t.status === 'failed') && (
                                <button
                                    onClick={handlePurgeStuck}
                                    className="btn btn-ghost btn-xs text-error gap-1 normal-case"
                                    title="Remove all errored or stuck-on-metadata torrents"
                                >
                                    <Trash2 size={12} /> Purge Stuck
                                </button>
                            )}
                        </div>
                        {torrents.length === 0 ? (
                            <div className="text-center py-16 bg-base-200/40 border border-dashed border-base-300 rounded-2xl">
                                <Activity className="opacity-20 mx-auto mb-3" size={28} />
                                <p className="opacity-40 text-sm font-medium">No active downloads. Search or paste a magnet above.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                {torrents.map((t: any) => {
                                    const isMetadata = t.status === 'metadata' || t.ready === false;
                                    const isStuck = isMetadata && (t.numPeers ?? 0) === 0;
                                    const displayName = t.name && t.name !== 'Fetching metadata...' ? t.name : (isStuck ? 'Stuck — no peers found' : (isMetadata ? 'Fetching metadata…' : (t.infoHash || t.info_hash)));
                                    return (
                                        <div key={t.infoHash || t.info_hash} className="card bg-base-200/50 border border-base-300/50 hover:border-primary/30 transition-colors p-4 space-y-2">
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-bold truncate" title={t.name || t.infoHash || t.info_hash}>{displayName}</div>
                                                    <div className="text-xs opacity-40 font-mono truncate">{t.infoHash || t.info_hash}</div>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteTorrent(t.infoHash || t.info_hash)}
                                                    className="btn btn-ghost btn-xs text-error p-0 h-auto min-h-0"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <progress
                                                    className={`progress h-1.5 flex-1 ${t.status === 'completed' ? 'progress-success' : isStuck ? 'progress-error' : 'progress-primary'}`}
                                                    value={t.progress * 100}
                                                    max="100"
                                                ></progress>
                                                <span className="text-xs font-mono opacity-50">{(t.progress * 100).toFixed(0)}%</span>
                                            </div>
                                            <div className="flex justify-between items-center text-xs font-bold gap-2">
                                                <span className={clsx(
                                                    t.status === 'completed' ? 'text-success' :
                                                    t.status === 'seeding' ? 'text-success' :
                                                    t.status === 'failed' || t.status === 'error' ? 'text-error' :
                                                    isStuck ? 'text-error' :
                                                    'text-info'
                                                )}>
                                                    {isStuck ? 'Stuck' : t.status}
                                                </span>
                                                <span className="opacity-40 normal-case">
                                                    {(t.numPeers ?? 0)} peer{(t.numPeers ?? 0) === 1 ? '' : 's'}
                                                    {t.status === 'seeding' && t.uploadSpeed ? ` · ↑ ${formatBytes(t.uploadSpeed)}/s` : ''}
                                                    {t.status !== 'seeding' && t.downloadSpeed ? ` · ↓ ${formatBytes(t.downloadSpeed)}/s` : ''}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
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
            )}
        </div>
    );
};

export default ContentSearch;
