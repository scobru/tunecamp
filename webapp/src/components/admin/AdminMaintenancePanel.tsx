import { useState, useEffect } from "react";
import API from "../../services/api";
import { useConfigStore } from "../../stores/useConfigStore";
import { Search, Database, Wand2, Loader2, AlertCircle, CheckCircle2, Activity, User, Disc, Cpu, Fingerprint, Share2 } from "lucide-react";
import { MetadataPickerModal } from "../modals/MetadataPickerModal";
import { ArtistMetadataPickerModal } from "../modals/ArtistMetadataPickerModal";
import { AlbumMetadataPickerModal } from "../modals/AlbumMetadataPickerModal";

export const AdminMaintenancePanel = () => {
    const [mode, setMode] = useState<'tracks' | 'artists' | 'albums'>('tracks');
    const [filter, setFilter] = useState<'genre' | 'year' | 'cover' | 'album' | 'description' | 'artist'>('genre');
    const [tracks, setTracks] = useState<any[]>([]);
    const [artists, setArtists] = useState<any[]>([]);
    const [albums, setAlbums] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isAIProcessing, setIsAIProcessing] = useState(false);
    const [results, setResults] = useState<{ success: number, failed: number, skipped: number } | null>(null);

    const [pickerTrack, setPickerTrack] = useState<any | null>(null);
    const [pickerArtist, setPickerArtist] = useState<any | null>(null);
    const [pickerAlbum, setPickerAlbum] = useState<any | null>(null);

    const hasAI = useConfigStore(state => state.isConfigured("openrouter"));
    const fetchStatus = useConfigStore(state => state.fetchStatus);
    const status = useConfigStore(state => state.status);

    useEffect(() => {
        if (!status) {
            fetchStatus();
        }
    }, [status, fetchStatus]);

    useEffect(() => {
        if (mode === 'tracks') {
            loadTracks();
        } else if (mode === 'artists') {
            loadArtists();
        } else {
            loadAlbums();
        }
    }, [filter, mode]);

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

    const loadArtists = async () => {
        setIsLoading(true);
        try {
            const data = await API.getArtistsMissingPhotos();
            setArtists(data);
            setSelectedIds([]);
            setResults(null);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const loadAlbums = async () => {
        setIsLoading(true);
        try {
            const data = await API.getAlbumsMissingMetadata(filter as any);
            setAlbums(data);
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
        const list = mode === 'tracks' ? tracks : mode === 'artists' ? artists : albums;
        if (selectedIds.length === list.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(list.map(t => t.id));
        }
    };

    const handleAutofill = async (ids: number[]) => {
        if (ids.length === 0) return;
        if (!confirm(`Are you sure you want to attempt autofill for ${ids.length} tracks?`)) return;

        setIsProcessing(true);
        try {
            const res = await API.autofillMetadata(ids, ['genre', 'year', 'cover', 'artist', 'album']);
            setResults(res);
            loadTracks(); // Refresh list
        } catch (e: any) {
            alert("Autofill failed: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAIAutofill = async (ids: number[]) => {
        if (ids.length === 0) return;
        if (!confirm(`Are you sure you want to attempt AI Magic Autofill for ${ids.length} tracks? This will use your OpenRouter credits.`)) return;

        setIsAIProcessing(true);
        try {
            const res = await API.aiAutofillMetadata(ids, false);
            setResults(res);
            loadTracks(); // Refresh list
        } catch (e: any) {
            alert("AI Autofill failed: " + e.message);
        } finally {
            setIsAIProcessing(false);
        }
    };

    const handleAlbumAutofill = async (ids: number[]) => {
        if (ids.length === 0) return;
        if (!confirm(`Are you sure you want to attempt autofill for ${ids.length} albums?`)) return;

        setIsProcessing(true);
        try {
            const res = await API.autofillAlbumMetadata(ids, ['genre', 'year', 'cover', 'description', 'artist']);
            setResults(res);
            loadAlbums(); // Refresh list
        } catch (e: any) {
            alert("Album Autofill failed: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAIAlbumAutofill = async (ids: number[]) => {
        if (ids.length === 0) return;
        if (!confirm(`Are you sure you want to attempt AI Magic Autofill for ${ids.length} albums? This will use your OpenRouter credits.`)) return;

        setIsAIProcessing(true);
        try {
            const res = await API.aiAutofillAlbumMetadata(ids);
            setResults(res);
            loadAlbums(); // Refresh list
        } catch (e: any) {
            alert("AI Album Autofill failed: " + e.message);
        } finally {
            setIsAIProcessing(false);
        }
    };

    const handleFingerprintLookup = async (trackId: number) => {
        setIsProcessing(true);
        try {
            const metadata = await API.fingerprintLookup(trackId);
            if (metadata) {
                if (confirm(`✨ Community Match Found!\n\nTitle: ${metadata.title}\nArtist: ${metadata.artist}\nAlbum: ${metadata.album}\n\nApply this metadata?`)) {
                    await API.applyTrackMetadata(trackId, {
                        genre: metadata.genre,
                        year: metadata.year,
                        albumTitle: metadata.album
                    });
                    loadTracks();
                }
            }
        } catch (e: any) {
            alert(e.status === 404 ? "No community match found for this audio signature." : "Fingerprint lookup failed: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleShareFingerprint = async (trackId: number) => {
        setIsProcessing(true);
        try {
            await API.shareFingerprint(trackId);
            alert("🚀 Track shared with the community registry!");
        } catch (e: any) {
            alert("Sharing failed: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBulkFingerprintMatch = async (ids: number[]) => {
        if (ids.length === 0) return;
        setIsProcessing(true);
        let foundCount = 0;
        try {
            for (const id of ids) {
                try {
                    const metadata = await API.fingerprintLookup(id);
                    if (metadata) {
                        await API.applyTrackMetadata(id, {
                            genre: metadata.genre,
                            year: metadata.year,
                            albumTitle: metadata.album
                        });
                        foundCount++;
                    }
                } catch (e) {
                    // Silently continue for bulk
                }
            }
            alert(`✅ Community Match Processed!\n\nFound and applied metadata for ${foundCount} tracks.`);
            loadTracks();
        } finally {
            setIsProcessing(false);
        }
    };

    const handleScanAllFingerprints = async () => {
        if (!confirm("Start mass fingerprint scan for the entire library? This will process tracks without fingerprints in the background.")) return;
        setIsProcessing(true);
        try {
            const res = await API.scanAllFingerprints();
            alert(res.message);
        } catch (e: any) {
            alert("Scan failed: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConsolidate = async () => {
        if (!confirm("Are you sure you want to consolidate the database? This will permanently remove empty albums, releases, and artists with no tracks.")) return;
        setIsProcessing(true);
        try {
            await API.consolidateDatabase();
            alert("Database consolidated successfully!");
            if (mode === 'artists') loadArtists();
            else if (mode === 'albums') loadAlbums();
            else loadTracks();
        } catch (e: any) {
            alert("Consolidation failed: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                        <Database className="text-primary" />
                        <h3 className="font-bold text-lg">Metadata Maintenance</h3>
                    </div>
                    <div className="tabs tabs-boxed bg-base-300 w-fit mt-2">
                        <button 
                            className={`tab tab-sm ${mode === 'tracks' ? 'tab-active' : ''}`}
                            onClick={() => setMode('tracks')}
                        >
                            Tracks
                        </button>
                        <button 
                            className={`tab tab-sm ${mode === 'artists' ? 'tab-active' : ''}`}
                            onClick={() => {
                                setMode('artists');
                                setFilter('cover' as any); // Default for artists
                            }}
                        >
                            Artists
                        </button>
                        <button 
                            className={`tab tab-sm ${mode === 'albums' ? 'tab-active' : ''}`}
                            onClick={() => {
                                setMode('albums');
                                setFilter('cover');
                            }}
                        >
                            Albums
                        </button>
                    </div>
                </div>
                
                <div className="flex gap-2">
                    {mode === 'tracks' && (
                        <select 
                            className="select select-bordered select-sm"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value as any)}
                        >
                            <option value="artist">Missing Artist</option>
                            <option value="album">Missing Album</option>
                            <option value="genre">Missing Genre</option>
                            <option value="year">Missing Year</option>
                            <option value="cover">Missing Cover</option>
                        </select>
                    )}
                    
                    {mode === 'albums' && (
                        <select 
                            className="select select-bordered select-sm"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value as any)}
                        >
                            <option value="artist">Missing Artist</option>
                            <option value="cover">Missing Cover</option>
                            <option value="genre">Missing Genre</option>
                            <option value="year">Missing Year</option>
                            <option value="description">Missing Description</option>
                        </select>
                    )}
                    
                    <button 
                        className="btn btn-sm btn-ghost"
                        onClick={mode === 'tracks' ? loadTracks : mode === 'artists' ? loadArtists : loadAlbums}
                        disabled={isLoading}
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                        Scan
                    </button>

                    <div className="divider divider-horizontal mx-0"></div>

                    <button 
                        className="btn btn-sm btn-outline btn-primary"
                        onClick={handleScanAllFingerprints}
                        disabled={isProcessing}
                        title="Generate fingerprints and identify all tracks"
                    >
                        {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Fingerprint size={18} />}
                        Identify All
                    </button>

                    <button 
                        className="btn btn-sm btn-outline btn-error"
                        onClick={handleConsolidate}
                        disabled={isProcessing}
                    >
                        {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Database size={18} />}
                        Consolidate DB
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

            {!hasAI && (
                <div className="alert alert-warning shadow-sm border border-warning/20 text-sm py-2">
                    <Cpu size={16} className="text-warning" />
                    <span>AI Features are disabled. Configure an <strong>OpenRouter API Key</strong> in Settings to enable Magic Autofill.</span>
                </div>
            )}

            {mode === 'tracks' ? (
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex gap-1 items-center bg-base-300/50 p-1 rounded-lg">
                        <button 
                            className="btn btn-sm btn-primary"
                            disabled={selectedIds.length === 0 || isProcessing || isAIProcessing}
                            onClick={() => handleAutofill(selectedIds)}
                        >
                            {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                            Autofill Selected ({selectedIds.length})
                        </button>
                        
                        <button 
                            className="btn btn-sm btn-outline"
                            disabled={tracks.length === 0 || isProcessing || isAIProcessing}
                            onClick={() => handleAutofill(tracks.map(t => t.id))}
                        >
                            All
                        </button>
                    </div>

                    <div className="flex gap-1 items-center bg-secondary/10 p-1 rounded-lg border border-secondary/20">
                        <button 
                            className="btn btn-sm btn-secondary"
                            disabled={selectedIds.length === 0 || isProcessing || isAIProcessing || !hasAI}
                            onClick={() => handleAIAutofill(selectedIds)}
                        >
                            {isAIProcessing ? <Loader2 className="animate-spin" size={18} /> : <Activity size={18} />}
                            AI Magic Autofill ({selectedIds.length})
                        </button>
                        
                        <button 
                            className="btn btn-sm btn-outline btn-secondary"
                            disabled={tracks.length === 0 || isProcessing || isAIProcessing || !hasAI}
                            onClick={() => handleAIAutofill(tracks.map(t => t.id))}
                        >
                            All
                        </button>
                    </div>

                    <div className="flex gap-1 items-center bg-primary/10 p-1 rounded-lg border border-primary/20">
                        <button 
                            className="btn btn-sm btn-primary"
                            disabled={selectedIds.length === 0 || isProcessing || isAIProcessing}
                            onClick={() => handleBulkFingerprintMatch(selectedIds)}
                        >
                            <Fingerprint size={18} />
                            Community Match ({selectedIds.length})
                        </button>
                    </div>
                </div>
            ) : mode === 'albums' ? (
                <div className="flex flex-col gap-4">
                    <div className="alert alert-info shadow-sm bg-primary/10 border-primary/20">
                        <Disc className="text-primary" />
                        <div>
                            <h3 className="font-bold">Album Metadata Cleanup</h3>
                            <div className="text-xs opacity-70">
                                Scan your library for albums with missing covers or info. Match them with global databases to fix artwork and genres.
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
                        <div className="flex gap-1 items-center bg-base-300/50 p-1 rounded-lg">
                            <button 
                                className="btn btn-sm btn-primary"
                                disabled={selectedIds.length === 0 || isProcessing || isAIProcessing}
                                onClick={() => handleAlbumAutofill(selectedIds)}
                            >
                                {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                                Autofill Selected ({selectedIds.length})
                            </button>
                            
                            <button 
                                className="btn btn-sm btn-outline"
                                disabled={albums.length === 0 || isProcessing || isAIProcessing}
                                onClick={() => handleAlbumAutofill(albums.map(t => t.id))}
                            >
                                All
                            </button>
                        </div>

                        <div className="flex gap-1 items-center bg-secondary/10 p-1 rounded-lg border border-secondary/20">
                            <button 
                                className="btn btn-sm btn-secondary"
                                disabled={selectedIds.length === 0 || isProcessing || isAIProcessing || !hasAI}
                                onClick={() => handleAIAlbumAutofill(selectedIds)}
                            >
                                {isAIProcessing ? <Loader2 className="animate-spin" size={18} /> : <Activity size={18} />}
                                AI Magic Autofill ({selectedIds.length})
                            </button>
                            
                            <button 
                                className="btn btn-sm btn-outline btn-secondary"
                                disabled={albums.length === 0 || isProcessing || isAIProcessing || !hasAI}
                                onClick={() => handleAIAlbumAutofill(albums.map(t => t.id))}
                            >
                                All
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="alert alert-info shadow-sm bg-primary/10 border-primary/20">
                    <User className="text-primary" />
                    <div>
                        <h3 className="font-bold">Artist Profile Enrichment</h3>
                        <div className="text-xs opacity-70">
                            Missing photos? Click "Enrich" to use AI and external providers to find high-quality imagery and bios.
                        </div>
                    </div>
                </div>
            ) }

            <div className="overflow-x-auto bg-base-200 rounded-box border border-base-content/5">
                <table className="table table-zebra table-sm">
                    <thead>
                        {mode === 'tracks' ? (
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
                        ) : mode === 'albums' ? (
                            <tr>
                                <th>
                                    <input 
                                        type="checkbox" 
                                        className="checkbox checkbox-xs" 
                                        checked={albums.length > 0 && selectedIds.length === albums.length}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th>Album</th>
                                <th>Artist</th>
                                <th>Status</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        ) : (
                            <tr>
                                <th>
                                    <input 
                                        type="checkbox" 
                                        className="checkbox checkbox-xs" 
                                        checked={artists.length > 0 && selectedIds.length === artists.length}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th>Artist</th>
                                <th>Slug</th>
                                <th>Bio Status</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={6} className="text-center py-12">
                                    <Loader2 className="animate-spin mx-auto opacity-50" size={32} />
                                    <p className="mt-2 opacity-50">Scanning {mode}...</p>
                                </td>
                            </tr>
                        ) : (mode === 'tracks' ? tracks : mode === 'artists' ? artists : albums).length === 0 ? (
                            <tr>
                                <td colSpan={6} className="text-center py-12 opacity-50">
                                    <AlertCircle className="mx-auto mb-2" size={32} />
                                    No {mode} found {mode === 'tracks' ? `with missing ${filter}` : mode === 'albums' ? `with missing ${filter}` : 'missing photos'}.
                                </td>
                            </tr>
                        ) : (
                            (mode === 'tracks' ? tracks : mode === 'artists' ? artists : albums).map((item: any) => (
                                <tr key={item.id} className="hover:bg-base-100 group">
                                    <td>
                                        <input 
                                            type="checkbox" 
                                            className="checkbox checkbox-xs" 
                                            checked={selectedIds.includes(item.id)}
                                            onChange={() => toggleSelect(item.id)}
                                        />
                                    </td>
                                    {mode === 'tracks' ? (
                                        <>
                                            <td className="font-medium">{item.title}</td>
                                            <td className={!item.artist_name || item.artist_name === 'Unknown Artist' ? 'text-error/70 italic' : ''}>
                                                {item.artist_name || 'Unknown Artist'}
                                            </td>
                                            <td className="opacity-70">{item.album_title}</td>
                                            <td>
                                                <div className="badge badge-outline badge-xs opacity-50 italic">
                                                    {filter === 'genre' ? (item.genre || 'empty') : filter === 'year' ? (item.year || '0') : 'missing'}
                                                </div>
                                            </td>
                                        </>
                                    ) : mode === 'albums' ? (
                                        <>
                                            <td className="font-medium">{item.title}</td>
                                            <td>{item.artist_name || 'Unknown Artist'}</td>
                                            <td>
                                                <div className="badge badge-outline badge-xs opacity-50 italic">
                                                    {filter === 'genre' ? (item.genre || 'empty') : filter === 'year' ? (item.year || '0') : filter === 'description' ? (item.description ? 'present' : 'empty') : 'missing cover'}
                                                </div>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="font-medium">{item.name}</td>
                                            <td className="opacity-70">{item.slug}</td>
                                            <td>
                                                <div className={`badge badge-xs ${item.bio ? 'badge-success/20 text-success' : 'badge-ghost opacity-50'}`}>
                                                    {item.bio ? 'Bio Present' : 'No Bio'}
                                                </div>
                                            </td>
                                        </>
                                    )}
                                    <td className="text-right">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                className="btn btn-xs btn-ghost text-primary"
                                                title="Community Match"
                                                onClick={() => handleFingerprintLookup(item.id)}
                                            >
                                                <Fingerprint size={12} />
                                            </button>
                                            <button 
                                                className="btn btn-xs btn-ghost text-secondary"
                                                title="Share with Community"
                                                onClick={() => handleShareFingerprint(item.id)}
                                            >
                                                <Share2 size={12} />
                                            </button>
                                            <button 
                                                className="btn btn-xs btn-ghost"
                                                onClick={() => {
                                                    if (mode === 'tracks') setPickerTrack(item);
                                                    else if (mode === 'artists') setPickerArtist(item);
                                                    else setPickerAlbum(item);
                                                }}
                                            >
                                                <Wand2 size={12} /> {mode === 'tracks' ? 'Match' : mode === 'albums' ? 'Match' : 'Enrich'}
                                            </button>
                                        </div>
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
                onApplied={loadTracks}
            />

            <ArtistMetadataPickerModal
                artist={pickerArtist}
                isOpen={!!pickerArtist}
                onClose={() => setPickerArtist(null)}
                onApplied={loadArtists}
            />

            <AlbumMetadataPickerModal
                album={pickerAlbum}
                isOpen={!!pickerAlbum}
                onClose={() => setPickerAlbum(null)}
                onApplied={loadAlbums}
            />
        </div>
    );
};

