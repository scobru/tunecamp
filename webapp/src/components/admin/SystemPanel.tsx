import { useState, useEffect, useRef } from 'react';
import { Cpu, MemoryStick, Activity, Database, Clock, RefreshCw, Server, Loader } from 'lucide-react';
import API from '../../services/api';
import type { SystemResources } from '../../types';

const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatUptime = (sec: number): string => {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
};

const POLL_MS = 5000;
const HISTORY = 60; // ~5 min of samples at 5s

// Tiny inline sparkline — no chart lib. Reveals a leak by its slope.
const Sparkline = ({ data, color }: { data: number[]; color: string }) => {
    if (data.length < 2) return <div className="h-10" />;
    const max = Math.max(...data), min = Math.min(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${28 - ((v - min) / range) * 26}`).join(' ');
    return (
        <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-full h-10">
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
    );
};

export const SystemPanel = () => {
    const [res, setRes] = useState<SystemResources | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cpuPct, setCpuPct] = useState<number | null>(null);
    const [heapHistory, setHeapHistory] = useState<number[]>([]);
    const [rssHistory, setRssHistory] = useState<number[]>([]);
    const prev = useRef<SystemResources | null>(null);

    const load = async () => {
        try {
            const data = await API.getSystemResources();
            // Process CPU% across all cores, derived from cumulative cpuUsage deltas.
            if (prev.current) {
                const dCpu = (data.process.cpuUsage.user + data.process.cpuUsage.system)
                    - (prev.current.process.cpuUsage.user + prev.current.process.cpuUsage.system); // microseconds
                const dWall = (data.timestamp - prev.current.timestamp) * 1000; // ms -> microseconds
                if (dWall > 0) setCpuPct(Math.max(0, Math.min(100, (dCpu / (dWall * data.system.cpus)) * 100)));
            }
            prev.current = data;
            setRes(data);
            setError(null);
            setHeapHistory(h => [...h, data.process.memory.heapUsed].slice(-HISTORY));
            setRssHistory(h => [...h, data.process.memory.rss].slice(-HISTORY));
        } catch (e: any) {
            setError(e?.message || 'Failed to load resources');
        }
    };

    useEffect(() => {
        load();
        const id = setInterval(load, POLL_MS);
        return () => clearInterval(id);
    }, []);

    if (error && !res) return <div className="alert alert-error text-sm">{error}</div>;
    if (!res) return <div className="p-12 text-center opacity-40 italic text-sm"><Loader className="animate-spin inline mr-2" size={16} />Loading system metrics…</div>;

    const mem = res.process.memory;
    const usedMem = res.system.totalmem - res.system.freemem;
    const memPct = Math.round((usedMem / res.system.totalmem) * 100);
    // Leak hint: heap growth across the visible window.
    const heapDelta = heapHistory.length > 1 ? heapHistory[heapHistory.length - 1] - heapHistory[0] : 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2"><Server /> System Resources</h2>
                    <p className="opacity-70 text-sm">Live process & host metrics, polled every {POLL_MS / 1000}s. Watch the heap trend to catch leaks.</p>
                </div>
                <div className="flex items-center gap-2 text-xs opacity-50">
                    <RefreshCw size={12} className="animate-spin" style={{ animationDuration: '3s' }} /> live
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="stat bg-base-200/50 rounded-box border border-base-content/5">
                    <div className="stat-figure text-primary"><Cpu size={20} /></div>
                    <div className="stat-title opacity-60 text-xs">Process CPU</div>
                    <div className="stat-value text-primary text-2xl">{cpuPct === null ? '…' : `${cpuPct.toFixed(1)}%`}</div>
                    <div className="stat-desc">load {res.system.loadavg.map(l => l.toFixed(2)).join(' / ')} · {res.system.cpus} cores</div>
                </div>
                <div className="stat bg-base-200/50 rounded-box border border-base-content/5">
                    <div className="stat-figure text-secondary"><MemoryStick size={20} /></div>
                    <div className="stat-title opacity-60 text-xs">Heap Used</div>
                    <div className="stat-value text-secondary text-2xl">{formatBytes(mem.heapUsed)}</div>
                    <div className="stat-desc">of {formatBytes(mem.heapTotal)} heap</div>
                </div>
                <div className="stat bg-base-200/50 rounded-box border border-base-content/5">
                    <div className="stat-figure text-accent"><Activity size={20} /></div>
                    <div className="stat-title opacity-60 text-xs">RSS (total process)</div>
                    <div className="stat-value text-accent text-2xl">{formatBytes(mem.rss)}</div>
                    <div className="stat-desc">external {formatBytes(mem.external)}</div>
                </div>
                <div className="stat bg-base-200/50 rounded-box border border-base-content/5">
                    <div className="stat-figure"><Clock size={20} /></div>
                    <div className="stat-title opacity-60 text-xs">Process Uptime</div>
                    <div className="stat-value text-2xl">{formatUptime(res.process.uptime)}</div>
                    <div className="stat-desc">node {res.process.nodeVersion} · pid {res.process.pid}</div>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div className="bg-base-200/50 rounded-box border border-base-content/5 p-4">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold opacity-60">Heap Used trend</span>
                        <span className={`text-xs font-mono ${heapDelta > 0 ? 'text-warning' : 'text-success'}`}>
                            {heapDelta >= 0 ? '+' : ''}{formatBytes(heapDelta)} over window
                        </span>
                    </div>
                    <Sparkline data={heapHistory} color="var(--fallback-s,oklch(var(--s)))" />
                    <p className="text-[11px] opacity-40 mt-1">A steadily climbing line that never drops after GC = likely leak.</p>
                </div>
                <div className="bg-base-200/50 rounded-box border border-base-content/5 p-4">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold opacity-60">RSS trend</span>
                        <span className="text-xs font-mono opacity-60">{formatBytes(mem.rss)}</span>
                    </div>
                    <Sparkline data={rssHistory} color="var(--fallback-a,oklch(var(--a)))" />
                    <p className="text-[11px] opacity-40 mt-1">Resident memory the OS sees — what triggers OOM kills (exit 137).</p>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="stat bg-base-200/50 rounded-box border border-base-content/5">
                    <div className="stat-figure"><MemoryStick size={20} /></div>
                    <div className="stat-title opacity-60 text-xs">Host RAM</div>
                    <div className="stat-value text-2xl">{formatBytes(usedMem)}</div>
                    <div className="stat-desc">of {formatBytes(res.system.totalmem)} ({memPct}% used)</div>
                    <progress className={`progress mt-2 ${memPct >= 90 ? 'progress-error' : memPct >= 70 ? 'progress-warning' : 'progress-success'}`} value={memPct} max={100} />
                </div>
                <div className="stat bg-base-200/50 rounded-box border border-base-content/5">
                    <div className="stat-figure text-info"><Database size={20} /></div>
                    <div className="stat-title opacity-60 text-xs">SQLite DB file</div>
                    <div className="stat-value text-info text-2xl">{formatBytes(res.db.size)}</div>
                    <div className="stat-desc truncate max-w-[240px]" title={res.db.path || ''}>{res.db.path || 'n/a'} · host up {formatUptime(res.system.uptime)}</div>
                </div>
            </div>

            <div>
                <h3 className="text-sm font-bold opacity-60 mb-2 flex items-center gap-2"><Activity size={14} /> Background tasks running ({res.tasks.length})</h3>
                {res.tasks.length === 0 ? (
                    <div className="p-4 bg-base-200/50 rounded-box border border-base-content/5 text-center opacity-40 italic text-sm">No background tasks running.</div>
                ) : (
                    <div className="bg-base-200/50 rounded-box border border-base-content/5 overflow-hidden">
                        <table className="table table-compact w-full">
                            <thead className="bg-base-300"><tr><th>Task</th><th>Started</th><th>Progress</th></tr></thead>
                            <tbody>
                                {res.tasks.map(t => (
                                    <tr key={t.taskId}>
                                        <td className="text-xs font-bold">{t.taskId}</td>
                                        <td className="text-xs opacity-60">{new Date(t.startedAt).toLocaleTimeString()}</td>
                                        <td className="text-xs">
                                            {t.progress ? (
                                                <span>{t.progress.current}/{t.progress.total} {t.progress.message ? `– ${t.progress.message}` : ''}</span>
                                            ) : <span className="opacity-40">running…</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
