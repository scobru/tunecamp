import { useState, useEffect } from "react";
import { confirm } from "@/utils/confirm";
import API from "../../services/api";
import { notify } from "../../utils/notify";
import {
    Database,
    Loader2,
    Activity,
    RefreshCw,
    Zap,
    Flame,
    Disc
} from "lucide-react";
import { AiAssistantBox } from "../ai/AiAssistantBox";

export const AdminMaintenancePanel = () => {
    const [isRescanning, setIsRescanning] = useState(false);
    const [isSyncingTags, setIsSyncingTags] = useState(false);
    const [isPrewarming, setIsPrewarming] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [runningTasks, setRunningTasks] = useState<any[]>([]);

    useEffect(() => {
        const fetchRunningTasks = async () => {
            try {
                const tasks = await API.getRunningTasks();
                setRunningTasks(tasks || []);
            } catch (e) {
                console.error("Failed to fetch running tasks:", e);
            }
        };

        fetchRunningTasks();
        const interval = setInterval(fetchRunningTasks, 2000);
        return () => clearInterval(interval);
    }, []);

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

    const handleSyncTags = async () => {
        if (!await confirm("This will write metadata from the database into the audio files tags. This process runs in the background. Continue?")) return;
        setIsSyncingTags(true);
        try {
            const res = await API.syncTagsToFiles();
            notify.success(res.message);
        } catch (e: any) {
            notify.error(e, "Tag sync failed");
        } finally {
            setIsSyncingTags(false);
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

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <Database className="text-primary" />
                    <div>
                        <h3 className="font-bold text-lg">Library Maintenance</h3>
                        <p className="text-xs opacity-60">
                            System maintenance actions & conversational AI metadata assistant
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        className="btn btn-sm btn-outline btn-secondary tooltip tooltip-bottom"
                        onClick={handleRescan}
                        disabled={isRescanning}
                        data-tip="Deep scan of the music directory to detect new files"
                    >
                        {isRescanning ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                        Rescan Library
                    </button>

                    <button
                        className="btn btn-sm btn-outline btn-primary tooltip tooltip-bottom"
                        onClick={handleSyncTags}
                        disabled={isSyncingTags}
                        data-tip="Write database metadata into audio file tags"
                    >
                        {isSyncingTags ? <Loader2 className="animate-spin" size={16} /> : <Disc size={16} />}
                        Sync Tags
                    </button>

                    <button
                        className="btn btn-sm btn-outline tooltip tooltip-bottom"
                        onClick={handlePrewarmCache}
                        disabled={isPrewarming}
                        data-tip="Pre-transcode all tracks in the background so first-play is instant"
                    >
                        {isPrewarming ? <Loader2 className="animate-spin" size={16} /> : <Flame size={16} />}
                        Pre-warm Cache
                    </button>

                    <button
                        className="btn btn-sm btn-outline btn-error tooltip tooltip-bottom"
                        onClick={handleOptimizeDB}
                        disabled={isOptimizing}
                        data-tip="Merge duplicate albums, remove orphan records"
                    >
                        {isOptimizing ? <Loader2 className="animate-spin" size={16} /> : <Database size={16} />}
                        Optimize DB
                    </button>
                </div>
            </div>

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

                            if (task.taskId === "library-rescan") {
                                title = "Library Rescan";
                                icon = <RefreshCw className="animate-spin text-secondary" size={16} />;
                                colorClass = "progress-secondary";
                            } else if (task.taskId === "tag-sync") {
                                title = "Writing Database Tags to Files";
                                icon = <Disc className="animate-spin text-info" size={16} />;
                                colorClass = "progress-info";
                            } else if (task.taskId === "prewarm-cache") {
                                title = "Pre-warming Transcode Cache";
                                icon = <Flame className="animate-pulse text-warning" size={16} />;
                                colorClass = "progress-warning";
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
                                        {hasProgress && <span className="font-bold opacity-80">{percent}%</span>}
                                    </div>
                                    {hasProgress ? (
                                        <progress
                                            className={`progress ${colorClass} w-full h-2 shadow-inner`}
                                            value={task.progress.current}
                                            max={task.progress.total}
                                        />
                                    ) : (
                                        <progress className={`progress ${colorClass} w-full h-2`} />
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

            <AiAssistantBox context={{ view: "maintenance" }} />
        </div>
    );
};
