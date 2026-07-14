import { confirm } from '@/utils/confirm';
import { useState, useEffect, useRef } from "react";
import API from "../../services/api";
import { useConfigStore } from "../../stores/useConfigStore";
import { notify } from "../../utils/notify";
import { Search, Database, Wand2, Loader2, AlertCircle, CheckCircle2, Activity, User, Disc, Cpu, Shield, RefreshCw, Zap, Flame } from "lucide-react";

import { MetadataMatchModal } from "../MetadataMatchModal";
import { ArtistMetadataPickerModal } from "../modals/ArtistMetadataPickerModal";

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
    const [isPrewarming, setIsPrewarming] = useState(false);
    // Header system ops get their own flags so triggering one doesn't put a
    // spinner on every other button that shares `isProcessing`.
    const [isRescanning, setIsRescanning] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [results, setResults] = useState<{ success: number, failed: number, skipped: number } | null>(null);
    const [auditStatus, setAuditStatus] = useState<any | null>(null);
    const [runningTasks, setRunningTasks] = useState<any[]>([]);
    const prevRunningIdsRef = useRef<string[]>([]);

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

    useEffect(() => {
        let interval: any;
        if (auditStatus?.isScanning) {
            interval = setInterval(async () => {
                try {
                    const status = await API.getAuditStatus() as any;
                    setAuditStatus(status);
                    if (!status.isScanning) {
                        clearInterval(interval);
                        if (mode === 'tracks') loadTracks();
                    }
                } catch (e) {
                    console.error("Failed to fetch audit status:", e);
                }
            }, 2000);
        }
        return () => clearInterval(interval);
    }, [auditStatus?.isScanning]);

    useEffect(() => {
        // Initial check
        API.getAuditStatus().then(setAuditStatus).catch(() => {});
    }, []);

    useEffect(() => {
        const fetchRunningTasks = async () => {
            try {
                const tasks = await API.getRunningTasks();
                const currentTasks = tasks || [];
                setRunningTasks(currentTasks);
                
                const currentIds = currentTasks.map((t: any) => t.taskId);
                const prevIds = prevRunningIdsRef.current;
                
                // If any task was running but is no longer running, refresh UI lists
                const finished = prevIds.filter(id => !currentIds.includes(id));
                if (finished.length > 0) {
                    if (mode === 'tracks') loadTracks();
                    else if (mode === 'artists') loadArtists();
                    else loadAlbums();
                }
                
                prevRunningIdsRef.current = currentIds;
            } catch (e) {
                console.error("Failed to fetch running tasks:", e);
            }
        };

        fetchRunningTasks();
        const interval = setInterval(fetchRunningTasks, 2000);
        return () => clearInterval(interval);
    }, [mode]);

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
        if (!await confirm(`Are you sure you want to attempt autofill for ${ids.length} tracks?`)) return;

        setIsProcessing(true);
        try {
            const res = await API.autofillMetadata(ids, ['genre', 'year', 'cover', 'artist', 'album']);
            setResults(res);
            loadTracks(); // Refresh list
        } catch (e: any) {
            notify.error(e, "Autofill failed");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAIAutofill = async (ids: number[]) => {
        if (ids.length === 0) return;
        if (!await confirm(`Are you sure you want to attempt AI Magic Autofill for ${ids.length} tracks? This will use your OpenRouter credits.`)) return;

        setIsAIProcessing(true);
        try {
            const res = await API.aiAutofillMetadata(ids, false);
            setResults(res);
            loadTracks(); // Refresh list
        } catch (e: any) {
            notify.error(e, "AI Autofill failed");
        } finally {
            setIsAIProcessing(false);
        }
    };

    const handleArtistAutofill = async (ids: number[]) => {
        if (ids.length === 0) return;
        if (!await confirm(`Are you sure you want to attempt autofill for ${ids.length} artists?`)) return;

        setIsProcessing(true);
        try {
            const res = await API.autofillArtistMetadata(ids);
            setResults(res);
            loadArtists(); // Refresh list
        } catch (e: any) {
            notify.error(e, "Artist Autofill failed");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAlbumAutofill = async (ids: number[]) => {
        if (ids.length === 0) return;
        if (!await confirm(`Are you sure you want to attempt autofill for ${ids.length} albums?`)) return;

        setIsProcessing(true);
        try {
            const res = await API.autofillAlbumMetadata(ids, ['genre', 'year', 'cover', 'description', 'artist']);
            setResults(res);
            loadAlbums(); // Refresh list
        } catch (e: any) {
            notify.error(e, "Album Autofill failed");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAIAlbumAutofill = async (ids: number[]) => {
        if (ids.length === 0) return;
        if (!await confirm(`Are you sure you want to attempt AI Magic Autofill for ${ids.length} albums? This will use your OpenRouter credits.`)) return;

        setIsAIProcessing(true);
        try {
            const res = await API.aiAutofillAlbumMetadata(ids);
            setResults(res);
            loadAlbums(); // Refresh list
        } catch (e: any) {
            notify.error(e, "AI Album Autofill failed");
        } finally {
            setIsAIProcessing(false);
        }
    };

    const handleRepairArtistLinks = async (artistId: number) => {
        if (!await confirm("This will attempt to relink orphaned tracks and albums to this artist by matching names. Continue?")) return;
        setIsProcessing(true);
        try {
            const res = await API.repairArtistLinks(artistId);
            notify.success(`Repair complete! Fixed ${res.tracks} tracks and ${res.albums} albums.`);
            loadArtists();
        } catch (e: any) {
            notify.error(e, "Repair failed");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleStartAudit = async (forceRepair = false, useAI = false) => {
        if (!await confirm(`This will audit your entire library metadata. It might take a while. Continue?`)) return;
        try {
            await API.startLibraryAudit({ forceRepair, useAI });
            const status = await API.getAuditStatus();
            setAuditStatus(status);
        } catch (e: any) {
            notify.error(e, "Failed to start audit");
        }
    };

    const handleStopAudit = async () => {
        try {
            await API.stopLibraryAudit();
            const status = await API.getAuditStatus();
            setAuditStatus(status);
        } catch (e: any) {
            notify.error(e, "Failed to stop audit");
        }
    };

    const handleOptimizeDB = async () => {
        if (!await confirm("This will merge duplicate albums (same artist + title), remove orphaned albums and artists. Continue?")) return;
        setIsOptimizing(true);
        try {
            const res = await API.pruneOrphans();
            notify.success(res.message);
        } catch (e: any) {
            notify.error(e, "Optimization failed");
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleSyncTags = async () => {
        if (!await confirm("This will write metadata from the database into the audio files tags. This process runs in the background. Continue?")) return;
        setIsProcessing(true);
        try {
            const res = await API.syncTagsToFiles();
            notify.success(res.message);
        } catch (e: any) {
            notify.error(e, "Tag sync failed");
        } finally {
            setIsProcessing(false);
        }
    };

    const handlePrewarmCache = async () => {
        if (!await confirm("Pre-warm the transcode cache for all tracks that need it? This runs in the background and may take a while.")) return;
        setIsPrewarming(true);
        try {
            const res = await API.prewarmCache();
            notify.success(res.message);
        } catch (e: any) {
            notify.error(e, "Pre-warm failed");
        } finally {
            setIsPrewarming(false);
        }
    };

    const handleRescan = async () => {
        if (!await confirm("Trigger a full library rescan? This deep scan finds new files and updates existing metadata.")) return;
        setIsRescanning(true);
        try {
            await API.triggerRescan();
            notify.success("Full library rescan triggered in background.");
        } catch (e: any) {
            notify.error(e, "Rescan failed");
        } finally {
            setIsRescanning(false);
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
                    <button
                        className="btn btn-sm btn-outline btn-secondary tooltip tooltip-bottom"
                        onClick={handleRescan}
                        disabled={isRescanning}
                        data-tip="Deep scan of the music directory to detect new files"
                    >
                        {isRescanning ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
                        Rescan Library
                    </button>

                    <button
                        className="btn btn-sm btn-ghost tooltip tooltip-bottom"
                        onClick={mode === 'tracks' ? loadTracks : mode === 'artists' ? loadArtists : loadAlbums}
                        disabled={isLoading}
                        data-tip="Reload the table below (no filesystem scan)"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                        Refresh List
                    </button>

                    <button
                        className="btn btn-sm btn-outline tooltip tooltip-bottom"
                        onClick={handlePrewarmCache}
                        disabled={isPrewarming}
                        data-tip="Pre-transcode all tracks in the background so first-play is instant"
                    >
                        {isPrewarming ? <Loader2 className="animate-spin" size={18} /> : <Flame size={18} />}
                        Pre-warm Cache
                    </button>

                    <button
                        className="btn btn-sm btn-outline btn-error tooltip tooltip-bottom"
                        onClick={handleOptimizeDB}
                        disabled={isOptimizing}
                        data-tip="Merge duplicate albums, remove orphan records"
                    >
                        {isOptimizing ? <Loader2 className="animate-spin" size={18} /> : <Database size={18} />}
                        Optimize DB
                    </button>
                </div>
            </div>

            {!hasAI && (
                <div className="alert alert-warning shadow-sm border border-warning/20 text-sm py-2">
                    <Cpu size={16} className="text-warning" />
                    <span>AI Features are disabled. Configure an <strong>OpenRouter API Key</strong> in Settings to enable Magic Autofill.</span>
                </div>
            )}

            {results && (
                <div className="alert alert-success shadow-sm border border-success/20">
                    <CheckCircle2 />
                    <div className="text-sm">
                        Maintenance Finished. Success: {results.success}, Failed: {results.failed}, Skipped: {results.skipped}
                    </div>
                </div>
            )}

            {/* Running Background Tasks */}
            {runningTasks && runningTasks.length > 0 && (
                <div className="bg-base-300/40 border border-primary/20 rounded-xl p-4 space-y-3 shadow-md backdrop-blur-md">
                    <div className="flex items-center gap-2 border-b border-base-content/5 pb-2">
                        <Activity className="text-primary animate-pulse" size={18} />
                        <h4 className="font-bold text-sm tracking-normal">Active Background Processes</h4>
                        <span className="badge badge-primary badge-sm animate-pulse ml-auto">{runningTasks.length} running</span>
                    </div>
                    <div className="grid gap-3">
                        {runningTasks.map(task => {
                            let title = "Background Operation";
                            let icon = <Loader2 className="animate-spin text-primary" size={16} />;
                            let colorClass = "progress-primary";

                            if (task.taskId === 'library-rescan') {
                                title = "Library Rescan";
                                icon = <RefreshCw className="animate-spin text-secondary" size={16} />;
                                colorClass = "progress-secondary";
                            } else if (task.taskId === 'library-audit') {
                                title = "Library Audit & Repair";
                                icon = <Cpu className="animate-pulse text-accent" size={16} />;
                                colorClass = "progress-accent";
                            } else if (task.taskId === 'tag-sync') {
                                title = "Writing Database Tags to Files";
                                icon = <Disc className="animate-spin text-info" size={16} />;
                                colorClass = "progress-info";
                            }

                            const hasProgress = task.progress && task.progress.total > 0;
                            const percent = hasProgress ? Math.round((task.progress.current / task.progress.total) * 100) : 0;
                            const progressMsg = task.progress?.message || "Running task in background...";

                            return (
                                <div key={task.taskId} className="bg-base-200/50 rounded-lg p-3 border border-base-content/5 space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold flex items-center gap-2">
                                            {icon}
                                            {title}
                                        </span>
                                        {hasProgress && (
                                            <span className="font-bold opacity-80">{percent}%</span>
                                        )}
                                    </div>
                                    {hasProgress ? (
                                        <progress 
                                            className={`progress ${colorClass} w-full h-2 shadow-inner`} 
                                            value={task.progress.current} 
                                            max={task.progress.total}
                                        ></progress>
                                    ) : (
                                        // No value = indeterminate progress bar
                                        <progress className={`progress ${colorClass} w-full h-2`}></progress>
                                    )}
                                    <div className="text-xs opacity-60 flex justify-between">
                                        <span>{progressMsg}</span>
                                        <span>Started {new Date(task.startedAt).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* CONTEXTUAL COMPARTMENTS */}
            {mode === 'tracks' && (
                <div className="space-y-6">
                    <div className="bg-base-300/30 border border-base-content/10 rounded-xl p-4 space-y-4">
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <div className="bg-primary/20 p-2 rounded-lg">
                                    <Activity className="text-primary" />
                                </div>
                                <div>
                                    <h4 className="font-bold">Library Auto-Tagger & Audit</h4>
                                    <p className="text-xs opacity-60 max-w-md">
                                        Background service that reconciles all library metadata against online sources.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {auditStatus?.isScanning ? (
                                    <button className="btn btn-sm btn-error" onClick={handleStopAudit}>
                                        Stop Audit
                                    </button>
                                ) : (
                                    <>
                                        <button className="btn btn-sm btn-primary" onClick={() => handleStartAudit(false, false)}>
                                            Start Audit
                                        </button>
                                        <button className="btn btn-sm btn-outline btn-secondary" onClick={() => handleStartAudit(true, hasAI)} disabled={!hasAI}>
                                            <Wand2 size={14} /> Repair & AI
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {auditStatus?.isScanning && (
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs">
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="animate-spin" size={12} />
                                        Processing Library... ({auditStatus.processedTracks} / {auditStatus.totalTracks})
                                    </span>
                                    <span className="opacity-60">{Math.round((auditStatus.processedTracks / auditStatus.totalTracks) * 100)}%</span>
                                </div>
                                <progress 
                                    className="progress progress-primary w-full h-2" 
                                    value={auditStatus.processedTracks} 
                                    max={auditStatus.totalTracks}
                                ></progress>
                                <div className="flex gap-4 text-xs font-bold tracking-normal opacity-60">
                                    <span className="text-success">Verified: {auditStatus.verifiedCount}</span>
                                    <span className="text-secondary">Repaired: {auditStatus.repairedCount}</span>
                                    <span className="text-error">Failed: {auditStatus.failedCount}</span>
                                </div>
                                {auditStatus.lastResult && (
                                    <div className="text-xs italic opacity-40 border-t border-base-content/5 pt-1">
                                        Last: {auditStatus.lastResult.artist} - {auditStatus.lastResult.title} ({auditStatus.lastResult.status})
                                    </div>
                                )}
                            </div>
                        )}

                        {!auditStatus?.isScanning && auditStatus?.processedTracks > 0 && (
                            <div className="text-xs bg-success/10 text-success p-2 rounded-lg border border-success/20 flex items-center gap-2">
                                <CheckCircle2 size={14} />
                                Last audit finished: {auditStatus.repairedCount} tracks repaired, {auditStatus.verifiedCount} verified.
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
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
                            <option value="external">External / Streaming</option>
                        </select>

                        <div className="divider divider-horizontal mx-0"></div>

                        <div className="flex gap-1 items-center bg-base-300/50 p-1 rounded-lg">
                            <button 
                                className="btn btn-sm btn-primary"
                                disabled={selectedIds.length === 0 || isProcessing || isAIProcessing}
                                onClick={() => handleAutofill(selectedIds)}
                            >
                                {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                                Autofill ({selectedIds.length})
                            </button>
                            <button
                                className="btn btn-sm btn-outline btn-primary tooltip tooltip-top"
                                onClick={handleSyncTags}
                                disabled={isProcessing}
                                data-tip="Sync to files"
                            >
                                <Disc size={18} />
                                Sync
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
                        </div>

                    </div>
                </div>
            )}

            {mode === 'albums' && (
                <div className="flex flex-col gap-4">
                    <div className="alert alert-info shadow-sm bg-primary/10 border-primary/20">
                        <Disc className="text-primary" />
                        <div>
                            <h3 className="font-bold">Album Metadata Cleanup</h3>
                            <div className="text-xs opacity-70">
                                Scan your library for albums with missing covers or info.
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
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

                        <div className="divider divider-horizontal mx-0"></div>

                        <div className="flex gap-1 items-center bg-base-300/50 p-1 rounded-lg">
                            <button 
                                className="btn btn-sm btn-primary"
                                disabled={selectedIds.length === 0 || isProcessing || isAIProcessing}
                                onClick={() => handleAlbumAutofill(selectedIds)}
                            >
                                {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                                Autofill ({selectedIds.length})
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
                        </div>
                    </div>
                </div>
            )}

            {mode === 'artists' && (
                <div className="flex flex-col gap-4">
                    <div className="alert alert-info shadow-sm bg-primary/10 border-primary/20">
                        <User className="text-primary" />
                        <div>
                            <h3 className="font-bold">Artist Profile Enrichment</h3>
                            <div className="text-xs opacity-70">
                                Missing photos or bios? Use external providers to find high-quality imagery.
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
                        <div className="flex gap-1 items-center bg-base-300/50 p-1 rounded-lg">
                            <button 
                                className="btn btn-sm btn-primary"
                                disabled={selectedIds.length === 0 || isProcessing}
                                onClick={() => handleArtistAutofill(selectedIds)}
                            >
                                {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                                Autofill ({selectedIds.length})
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                        <div className="flex justify-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
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
                                            {mode === 'artists' && (
                                                <button 
                                                    className="btn btn-xs btn-ghost text-primary tooltip tooltip-left"
                                                    data-tip="Repair Artist Links"
                                                    onClick={() => handleRepairArtistLinks(item.id)}
                                                    disabled={isProcessing}
                                                >
                                                    <Shield size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {pickerTrack && (
                <MetadataMatchModal 
                    item={pickerTrack}
                    type="track"
                    onClose={() => setPickerTrack(null)}
                    onMatched={() => {
                        loadTracks();
                        setPickerTrack(null);
                    }}
                />
            )}

            <ArtistMetadataPickerModal
                artist={pickerArtist}
                isOpen={!!pickerArtist}
                onClose={() => setPickerArtist(null)}
                onApplied={loadArtists}
            />

            {pickerAlbum && (
                <MetadataMatchModal
                    item={pickerAlbum}
                    type="album"
                    onClose={() => setPickerAlbum(null)}
                    onMatched={() => {
                        loadAlbums();
                        setPickerAlbum(null);
                    }}
                />
            )}
        </div>
    );
};

