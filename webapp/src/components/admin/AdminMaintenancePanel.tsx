import { useState, useEffect } from "react";
import API from "../../services/api";
import { Search, Database, Wand2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { MetadataPickerModal } from "../modals/MetadataPickerModal";

export const AdminMaintenancePanel = () => {
    const [filter, setFilter] = useState<'genre' | 'year' | 'cover' | 'album'>('genre');
    const [tracks, setTracks] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [results, setResults] = useState<{ success: number, failed: number, skipped: number } | null>(null);
    
    const [pickerTrack, setPickerTrack] = useState<any | null>(null);

    useEffect(() => {
        loadTracks();
    }, [filter]);

    const loadTracks = async () => {
        setIsLoading(true);
        try {
            const data = await API.getMaintenanceMissing(filter);
            setTracks(data);
            setSelectedIds([]);
            setResults(null);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === tracks.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(tracks.map(t => t.id));
        }
    };

    const handleAutofill = async (ids: number[]) => {
        if (ids.length === 0) return;
        if (!confirm(`Are you sure you want to attempt autofill for ${ids.length} tracks?`)) return;

        setIsProcessing(true);
        try {
            const res = await API.autofillMetadata(ids, ['genre', 'year', 'cover']);
            setResults(res);
            loadTracks(); // Refresh list
        } catch (e: any) {
            alert("Autofill failed: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <Database className="text-primary" />
                    <h3 className="font-bold text-lg">Metadata Maintenance</h3>
                </div>
                
                <div className="flex gap-2">
                    <select 
                        className="select select-bordered select-sm"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as any)}
                    >
                        <option value="album">Missing Album</option>
                        <option value="genre">Missing Genre</option>
                        <option value="year">Missing Year</option>
                        <option value="cover">Missing Cover</option>
                    </select>
                    
                    <button 
                        className="btn btn-sm btn-ghost"
                        onClick={loadTracks}
                        disabled={isLoading}
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                        Scan
                    </button>
                </div>
            </div>

            {results && (
                <div className="alert alert-success shadow-lg border border-success/20">
                    <CheckCircle2 />
                    <div>
                        <h3 className="font-bold">Maintenance Finished</h3>
                        <div className="text-xs opacity-80">
                            Success: {results.success} | Failed: {results.failed} | Skipped: {results.skipped}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex gap-2 items-center">
                <button 
                    className="btn btn-sm btn-primary"
                    disabled={selectedIds.length === 0 || isProcessing}
                    onClick={() => handleAutofill(selectedIds)}
                >
                    {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                    Autofill Selected ({selectedIds.length})
                </button>
                
                <button 
                    className="btn btn-sm btn-outline"
                    disabled={tracks.length === 0 || isProcessing}
                    onClick={() => handleAutofill(tracks.map(t => t.id))}
                >
                    Autofill All ({tracks.length})
                </button>
            </div>

            <div className="overflow-x-auto bg-base-200 rounded-box border border-base-content/5">
                <table className="table table-zebra table-sm">
                    <thead>
                        <tr>
                            <th>
                                <input 
                                    type="checkbox" 
                                    className="checkbox checkbox-xs" 
                                    checked={tracks.length > 0 && selectedIds.length === tracks.length}
                                    onChange={toggleSelectAll}
                                />
                            </th>
                            <th>Track</th>
                            <th>Artist</th>
                            <th>Album</th>
                            <th>Current</th>
                            <th className="text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={6} className="text-center py-12">
                                    <Loader2 className="animate-spin mx-auto opacity-50" size={32} />
                                    <p className="mt-2 opacity-50">Scanning library...</p>
                                </td>
                            </tr>
                        ) : tracks.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="text-center py-12 opacity-50">
                                    <AlertCircle className="mx-auto mb-2" size={32} />
                                    No tracks found with missing {filter}.
                                </td>
                            </tr>
                        ) : (
                            tracks.map(t => (
                                <tr key={t.id} className="hover:bg-base-100 group">
                                    <td>
                                        <input 
                                            type="checkbox" 
                                            className="checkbox checkbox-xs" 
                                            checked={selectedIds.includes(t.id)}
                                            onChange={() => toggleSelect(t.id)}
                                        />
                                    </td>
                                    <td className="font-medium">{t.title}</td>
                                    <td>{t.artist_name}</td>
                                    <td className="opacity-70">{t.album_title}</td>
                                    <td>
                                        <div className="badge badge-outline badge-xs opacity-50 italic">
                                            {filter === 'genre' ? (t.genre || 'empty') : filter === 'year' ? (t.year || '0') : 'missing'}
                                        </div>
                                    </td>
                                    <td className="text-right">
                                        <button 
                                            className="btn btn-xs btn-ghost opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => setPickerTrack(t)}
                                        >
                                            <Wand2 size={12} /> Match
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <MetadataPickerModal 
                track={pickerTrack}
                isOpen={!!pickerTrack}
                onClose={() => setPickerTrack(null)}
                onApplied={() => {
                    loadTracks();
                    setPickerTrack(null);
                }}
            />
        </div>
    );
};

