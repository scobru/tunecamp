import { useState } from 'react';
import { Search, Download, Loader2, FileAudio, AlertCircle } from 'lucide-react';
import API from '../../services/api';
import { notify } from '../../utils/notify';

interface DownloadResult {
    id: string;
    title: string;
    artist?: string;
    filename: string;
    sizeBytes: number;
    bitrate?: number;
    source: string;
    meta?: any;
}

/** Generic search tab for any DownloadProvider — zero custom frontend needed. */
export const ExternalProviderSearchTab = ({ providerId }: { providerId: string }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<DownloadResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [downloading, setDownloading] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setIsSearching(true);
        setError(null);
        try {
            const data = await API.searchProvider(providerId, query.trim());
            setResults(data);
        } catch (err: any) {
            setError(err?.message || 'Search failed');
            setResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const handleDownload = async (result: DownloadResult) => {
        setDownloading(prev => new Set(prev).add(result.id));
        try {
            await API.downloadFromProvider(providerId, result);
            notify.success(`Download started: ${result.title}`);
        } catch (err: any) {
            notify.error(err, 'Download failed');
        } finally {
            setDownloading(prev => {
                const next = new Set(prev);
                next.delete(result.id);
                return next;
            });
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '—';
        const mb = bytes / (1024 * 1024);
        return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
    };

    return (
        <div className="space-y-4">
            {/* Search input */}
            <div className="join w-full">
                <input
                    type="text"
                    className="input input-bordered join-item flex-1"
                    placeholder="Search for music…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    disabled={isSearching}
                />
                <button
                    className="btn btn-primary join-item gap-2"
                    onClick={handleSearch}
                    disabled={isSearching || !query.trim()}
                >
                    {isSearching ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                    Search
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="alert alert-error">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                </div>
            )}

            {/* Results table */}
            {results.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-base-content/10">
                    <table className="table table-sm">
                        <thead>
                            <tr className="bg-base-200/50">
                                <th>Title</th>
                                <th>Artist</th>
                                <th>Filename</th>
                                <th className="text-right">Size</th>
                                <th className="text-right">Bitrate</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map(r => (
                                <tr key={r.id} className="hover">
                                    <td className="font-medium max-w-[200px] truncate">{r.title}</td>
                                    <td className="opacity-70 max-w-[150px] truncate">{r.artist || '—'}</td>
                                    <td className="text-xs opacity-50 max-w-[180px] truncate font-mono">{r.filename}</td>
                                    <td className="text-right text-xs opacity-60">{formatSize(r.sizeBytes)}</td>
                                    <td className="text-right text-xs opacity-60">{r.bitrate ? `${r.bitrate} kbps` : '—'}</td>
                                    <td className="text-right">
                                        <button
                                            className="btn btn-xs btn-ghost btn-circle"
                                            onClick={() => handleDownload(r)}
                                            disabled={downloading.has(r.id)}
                                            title="Download & add to library"
                                        >
                                            {downloading.has(r.id)
                                                ? <Loader2 className="animate-spin" size={14} />
                                                : <Download size={14} />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Empty state */}
            {!isSearching && results.length === 0 && !error && query && (
                <div className="text-center py-12 opacity-40">
                    <FileAudio size={48} className="mx-auto mb-3" />
                    <p>No results found</p>
                </div>
            )}
        </div>
    );
};
