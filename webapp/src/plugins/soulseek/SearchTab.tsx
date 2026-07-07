import React, { useState } from 'react';
import { Search, Download, AlertCircle, Activity } from 'lucide-react';
import API from '../../../services/api';
import { notify } from '../../../utils/notify';

const getPathSegments = (pathStr: string) => {
    if (!pathStr) return { filename: 'Unknown File', folder: '' };
    const cleanPath = pathStr.replace(/\\/g, '/');
    const segments = cleanPath.split('/');
    const filename = segments[segments.length - 1] || 'Unknown File';
    const folder = segments.slice(0, -1).join(' \\ ');
    return { filename, folder };
};

export const SoulseekSearchTab: React.FC = () => {
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
            const data = await API.searchSoulseek(query);
            setResults(data);
        } catch (err: any) {
            console.error(`Search failed: ${err.message}`);
            setSearchError("Search service is currently limited.");
        } finally {
            setLoading(false);
        }
    };

    const handleSoulseekDownload = async (item: any) => {
        try {
            const res = await API.downloadSoulseek(item);
            notify.success(res.message);
        } catch (err: any) {
            notify.error(err, "Download failed");
        }
    };

    return (
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
    );
};
