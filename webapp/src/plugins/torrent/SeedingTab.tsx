import React, { useState, useEffect } from 'react';
import { Upload, Copy, Trash2 } from 'lucide-react';
import API from '../../services/api';
import { notify } from '../../utils/notify';
import { confirm } from '@/utils/confirm';

export const TorrentSeedingTab: React.FC = () => {
    const [seedFilePaths, setSeedFilePaths] = useState('');
    const [seedName, setSeedName] = useState('');
    const [seedArtist, setSeedArtist] = useState('');
    const [seedingResult, setSeedingResult] = useState<string | null>(null);
    const [seedLoading, setSeedLoading] = useState(false);

    const [torrents, setTorrents] = useState<any[]>([]);

    const fetchTorrents = async () => {
        try {
            const data = await API.getTorrents();
            setTorrents(data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchTorrents();
        const interval = setInterval(fetchTorrents, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleSeedFiles = async (e: React.FormEvent) => {
        e.preventDefault();
        const paths = seedFilePaths.split('\n').map(p => p.trim()).filter(Boolean);
        if (paths.length === 0 || !seedName) return;
        setSeedLoading(true);
        setSeedingResult(null);
        try {
            const res = await API.seedTorrent(paths, seedName, seedArtist || undefined);
            setSeedingResult(res.magnetUri);
            setSeedFilePaths('');
            setSeedName('');
            setSeedArtist('');
            notify.success("Started seeding file(s)");
            fetchTorrents();
        } catch (err: any) {
            notify.error(err, "Seeding failed");
        } finally {
            setSeedLoading(false);
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

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const seedingTorrents = torrents.filter((t: any) => t.status === 'seeding');

    return (
        <div className="space-y-8">
            {/* Seed form + explainer side by side */}
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
                            <label className="label pb-1"><span className="label-text font-bold text-xs">Artist</span></label>
                            <input
                                type="text"
                                className="input input-bordered w-full"
                                placeholder="Artist Name"
                                value={seedArtist}
                                onChange={e => setSeedArtist(e.target.value)}
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

            {/* Active seeds — full-width responsive grid */}
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
    );
};
