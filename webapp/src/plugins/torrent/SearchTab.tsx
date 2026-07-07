import React, { useState, useEffect } from 'react';
import { Search, Download, ExternalLink, Globe, RefreshCw, Activity, Trash2, Copy } from 'lucide-react';
import API from '../../../services/api';
import { notify } from '../../../utils/notify';
import { confirm } from '@/utils/confirm';
import clsx from 'clsx';

const TORRENT_SEARCH_ENGINES = [
    { name: 'BTDigg', url: 'https://btdig.com/search?q={q}', note: 'DHT search — magnets directly' },
    { name: '1337x', url: 'https://1337x.to/search/{q}/1/', note: 'General tracker' },
    { name: 'Knaben', url: 'https://knaben.org/search/{q}/0/1/seeders', note: 'Meta-search aggregator' },
    { name: 'Solid Torrents', url: 'https://solidtorrents.to/search?q={q}', note: 'DHT + indexes' },
    { name: 'TPB proxy list', url: 'https://piratebayproxy.info/', note: 'Live ThePirateBay mirrors' },
];

const buildEngineUrl = (template: string, query: string) =>
    template.includes('{q}') ? template.replace('{q}', encodeURIComponent(query.trim())) : template;

export const TorrentSearchTab: React.FC = () => {
    const [query, setQuery] = useState('');
    const [magnetUri, setMagnetUri] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Knaben state
    const [knabenHits, setKnabenHits] = useState<any[]>([]);
    const [knabenTotal, setKnabenTotal] = useState(0);
    const [knabenPage, setKnabenPage] = useState(0);
    const [knabenLoading, setKnabenLoading] = useState(false);
    const [knabenError, setKnabenError] = useState<string | null>(null);

    // Torrents state
    const [torrents, setTorrents] = useState<any[]>([]);
    const [networkTorrents, setNetworkTorrents] = useState<any[]>([]);
    const [torrentSource, setTorrentSource] = useState<'mine' | 'network'>('mine');

    const fetchTorrents = async () => {
        try {
            const data = await API.getTorrents();
            setTorrents(data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchNetworkTorrents = async () => {
        try {
            const data = await API.getNetworkTracks();
            setNetworkTorrents((data || []).filter((t: any) => t.magnetUri));
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchTorrents();
        fetchNetworkTorrents();
        const interval = setInterval(() => {
            fetchTorrents();
            // Network torrents don't change as fast, maybe we don't need to poll them every 5s, but we will for now
        }, 5000);
        return () => clearInterval(interval);
    }, []);

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

    const handleAddTorrent = async (e: React.FormEvent | string) => {
        if (typeof e !== 'string') e.preventDefault();
        const magnet = typeof e === 'string' ? e : magnetUri;
        if (!magnet) return;

        setLoading(true);
        try {
            await API.addTorrent(magnet);
            notify.success("Torrent added successfully");
            setMagnetUri('');
            fetchTorrents();
        } catch (err: any) {
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
            console.error(`Failed to delete: ${err.message}`);
        }
    };

    const handlePurgeStuck = async () => {
        if (!await confirm('Remove all torrents that are errored or stuck on metadata?')) return;
        try {
            const result = await API.purgeStuckTorrents();
            fetchTorrents();
            notify.success(`Purged ${result.count} stuck torrent(s).`);
        } catch (err: any) {
            notify.error(err, "Purge failed");
        }
    };

    return (
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

                <form onSubmit={(e) => handleKnabenSearch(e, 0)} className="flex gap-2">
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
                                                onClick={() => handleAddTorrent(magnet)}
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

            {/* Torrents seeded on this instance or on connected TuneCamp instances */}
            <div className="card bg-base-200/50 border border-base-300 p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <Globe size={18} className="text-primary" /> Torrents from the Network
                    </h2>
                    <div className="join">
                        <button
                            className={clsx('btn btn-xs join-item', torrentSource === 'mine' ? 'btn-primary' : 'btn-ghost')}
                            onClick={() => setTorrentSource('mine')}
                        >
                            My Instance
                        </button>
                        <button
                            className={clsx('btn btn-xs join-item', torrentSource === 'network' ? 'btn-primary' : 'btn-ghost')}
                            onClick={() => setTorrentSource('network')}
                        >
                            Connected Instances
                        </button>
                    </div>
                </div>
                {(() => {
                    const q = query.trim().toLowerCase();
                    const matches = (...fields: (string | undefined)[]) =>
                        !q || fields.some(f => f?.toLowerCase().includes(q));

                    const rows = torrentSource === 'mine'
                        ? torrents
                            .filter((t: any) => t.status === 'seeding' && t.magnet_uri)
                            .filter((t: any) => matches(t.name))
                        : networkTorrents
                            .filter((t: any) => t.federation !== 'local')
                            .filter((t: any) => matches(t.title, t.artistName, t.releaseTitle));

                    if (rows.length === 0) {
                        return (
                            <div className="text-center py-8 text-sm opacity-50">
                                {torrentSource === 'mine'
                                    ? 'Nothing seeding on this instance yet.'
                                    : 'No torrents found on connected instances.'}
                            </div>
                        );
                    }

                    return (
                        <div className="divide-y divide-base-content/5 rounded-xl overflow-hidden border border-base-content/10">
                            {rows.map((t: any, i: number) => {
                                const label = torrentSource === 'mine' ? t.name : `${t.title} — ${t.artistName || 'Unknown Artist'}`;
                                const sub = torrentSource === 'mine' ? 'Seeding on this instance' : t.siteUrl;
                                const magnet = torrentSource === 'mine' ? t.magnet_uri : t.magnetUri;
                                return (
                                    <div key={t.infoHash ?? t.slug ?? i} className="flex items-center gap-3 px-4 py-3 bg-base-200/40 hover:bg-base-200 transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate" title={label}>{label}</div>
                                            <div className="text-[11px] opacity-50 truncate">{sub}</div>
                                        </div>
                                        <button
                                            className="btn btn-ghost btn-xs gap-1 shrink-0"
                                            onClick={() => {
                                                navigator.clipboard.writeText(magnet);
                                                notify.success('Magnet copied');
                                            }}
                                        >
                                            <Copy size={12} /> Copy
                                        </button>
                                        {torrentSource === 'network' && (
                                            <button
                                                className="btn btn-primary btn-xs gap-1 shrink-0"
                                                onClick={() => handleAddTorrent(magnet)}
                                            >
                                                <Download size={12} /> Add
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}
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
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
};
