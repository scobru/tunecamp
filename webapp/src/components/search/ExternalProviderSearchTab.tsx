import React, { useState } from 'react';
import { Search, Download, AlertCircle, Puzzle } from 'lucide-react';
import API from '../../services/api';
import { notify } from '../../utils/notify';

/**
 * Generic Content Search tab for external (community) download plugins.
 * They ship no frontend code: this one component drives any provider that
 * implements the backend DownloadProvider contract, via the generic
 * /api/search/content/provider/:id routes.
 */
export const ExternalProviderSearchTab: React.FC<{ providerId: string; providerName: string }> = ({ providerId, providerName }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query) return;

        setLoading(true);
        setResults([]);
        setSearchError(null);
        try {
            const data = await API.searchExternalProvider(providerId, query);
            setResults(data);
        } catch (err: any) {
            console.error(`Search failed: ${err.message}`);
            setSearchError(err?.message || 'Search failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async (item: any) => {
        try {
            const res = await API.downloadExternalProvider(providerId, item);
            notify.success(res.message || 'Download started — the file will appear in the library when it completes');
        } catch (err: any) {
            notify.error(err, 'Download failed');
        }
    };

    return (
        <div>
            <form onSubmit={handleSearch} className="flex gap-2 mb-8">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" size={18} />
                    <input
                        type="text"
                        placeholder={`Search ${providerName}...`}
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
                            <Puzzle className="opacity-20" size={32} />
                        </div>
                        <p className="opacity-40 font-medium">Search {providerName} for music...</p>
                    </div>
                )}
                {results.map((res: any, i: number) => (
                    <div key={res.id || i} className="group card bg-base-200/50 hover:bg-base-200 border border-base-300/50 hover:border-primary/30 transition-all duration-200">
                        <div className="card-body p-4 flex-row justify-between items-center overflow-hidden">
                            <div className="flex-1 min-w-0 pr-4 overflow-hidden">
                                <h3 className="font-bold truncate text-sm lg:text-base text-base-content group-hover:text-primary transition-colors w-full" title={res.filename}>
                                    {res.title || res.filename}
                                </h3>
                                {res.artist && (
                                    <div className="text-[11px] opacity-45 mt-1 w-full truncate">{res.artist}</div>
                                )}
                                <div className="text-[11px] opacity-75 flex flex-wrap gap-2 mt-2.5 font-medium">
                                    {res.sizeBytes > 0 && (
                                        <span className="bg-base-300/60 px-2 py-0.5 rounded text-xs text-base-content/80">
                                            💾 {(res.sizeBytes / 1024 / 1024).toFixed(2)} MB
                                        </span>
                                    )}
                                    {res.bitrate && (
                                        <span className="bg-base-300/60 px-2 py-0.5 rounded text-xs text-base-content/80">
                                            🎵 {res.bitrate} kbps
                                        </span>
                                    )}
                                    <span className="bg-base-300/60 px-2 py-0.5 rounded text-xs text-base-content/80">
                                        {res.source || providerId}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => handleDownload(res)}
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
    );
};
