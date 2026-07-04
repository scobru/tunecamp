import { useEffect, useState } from "react";
import { Shovel, Search, Play, Plus, X, Trash2, Loader2, Activity, ExternalLink } from "lucide-react";
import { useDigStore } from "../stores/useDigStore";
import { usePlayerStore } from "../stores/usePlayerStore";
import { detectBpmFromUrl } from "../utils/bpm";
import type { Track, DigStrategy, RankedRelease } from "../types";

const STRATEGIES: { id: DigStrategy; label: string; hint: string }[] = [
    { id: "fast", label: "Fast", hint: "~15 collectors" },
    { id: "balanced", label: "Balanced", hint: "~50 collectors" },
    { id: "deep", label: "Deep", hint: "~150 collectors" },
];

const isBandcampUrl = (s: string) => /bandcamp\.com\/(album|track)\//i.test(s.trim());
const proxied = (previewUrl: string) => `/api/proxy/stream?url=${encodeURIComponent(previewUrl)}`;

export default function Dig() {
    const {
        query, setQuery, search, searchResults, isSearching,
        strategy, setStrategy, runDig, digResult, isDigging, digError,
        sessions, currentSessionId, crate, history,
        loadSessions, createSession, deleteSession, selectSession,
        addToCrate, removeFromCrate, loadHistory,
    } = useDigStore();

    const { playTrack } = usePlayerStore();
    const [bpms, setBpms] = useState<Record<string, number | "loading">>({});
    const [newSessionName, setNewSessionName] = useState("");

    // Module gating (hideDig) is enforced by ModuleGuard on the route.
    useEffect(() => {
        loadSessions();
        loadHistory();
    }, []);

    const playPreview = (r: { url: string; title: string; artist: string; coverUrl: string; previewUrl: string | null }) => {
        if (!r.previewUrl) return;
        const track = {
            id: `dig:${r.url}`,
            title: r.title,
            artistName: r.artist,
            artist_name: r.artist,
            albumId: "",
            artistId: "",
            duration: 0,
            path: "",
            filename: "",
            playCount: 0,
            streamUrl: proxied(r.previewUrl),
            coverUrl: r.coverUrl,
            coverImage: r.coverUrl,
        } as unknown as Track;
        playTrack(track, [track]);
    };

    const detectBpm = async (previewUrl: string | null) => {
        if (!previewUrl) return;
        setBpms((b) => ({ ...b, [previewUrl]: "loading" }));
        const bpm = await detectBpmFromUrl(proxied(previewUrl));
        setBpms((b) => ({ ...b, [previewUrl]: bpm ?? 0 }));
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const q = query.trim();
        if (!q) return;
        if (isBandcampUrl(q)) runDig(q);
        else search(q);
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            <header className="mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <Shovel className="text-primary" /> Dig
                </h1>
                <p className="text-base-content/60 mt-1">
                    Discover music through the ears of real Bandcamp collectors. Search a release or paste a Bandcamp
                    URL, then dig into who else owns it and what they collect.
                </p>
            </header>

            <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2 mb-4">
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search artists / releases, or paste a Bandcamp album/track URL…"
                    className="input input-bordered rounded-full flex-1"
                />
                <button type="submit" className="btn btn-primary rounded-full gap-2" disabled={isSearching || isDigging}>
                    {isSearching || isDigging ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />}
                    {isBandcampUrl(query) ? "Dig" : "Search"}
                </button>
            </form>

            <div className="flex items-center gap-2 mb-6">
                <span className="text-xs uppercase tracking-wider text-base-content/40 font-bold">Strategy</span>
                <div className="join">
                    {STRATEGIES.map((s) => (
                        <button
                            key={s.id}
                            onClick={() => setStrategy(s.id)}
                            title={s.hint}
                            className={`btn btn-sm join-item ${strategy === s.id ? "btn-primary" : "btn-ghost border border-base-content/10"}`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
                <span className="text-xs text-base-content/40">{STRATEGIES.find((s) => s.id === strategy)?.hint}</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main column */}
                <div className="lg:col-span-2 space-y-6">
                    {digError && <div className="alert alert-error text-sm">{digError}</div>}

                    {isDigging && (
                        <div className="flex items-center gap-3 text-base-content/60 py-10 justify-center">
                            <Loader2 className="animate-spin" /> Digging through collectors… this can take a while on deeper strategies.
                        </div>
                    )}

                    {/* Dig results */}
                    {!isDigging && digResult && (
                        <section>
                            <div className="flex items-center gap-3 mb-3">
                                {digResult.seed.coverUrl && (
                                    <img src={digResult.seed.coverUrl} alt="" className="w-12 h-12 rounded object-cover" />
                                )}
                                <div>
                                    <div className="text-sm text-base-content/50">
                                        Diggers of <span className="font-semibold text-base-content">{digResult.seed.title}</span> — {digResult.seed.artist}
                                    </div>
                                    <div className="text-xs text-base-content/40">
                                        {digResult.collectorsSampled} collectors sampled · {digResult.results.length} releases found
                                    </div>
                                </div>
                            </div>
                            <ResultGrid
                                items={digResult.results}
                                bpms={bpms}
                                onPlay={playPreview}
                                onAdd={addToCrate}
                                onBpm={detectBpm}
                            />
                        </section>
                    )}

                    {/* Search results */}
                    {!isDigging && !digResult && searchResults.length > 0 && (
                        <section>
                            <h2 className="text-lg font-bold mb-3">Pick a release to dig from</h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {searchResults.map((r) => (
                                    <button
                                        key={r.id}
                                        onClick={() => runDig(r.url)}
                                        className="text-left bg-base-200 hover:bg-base-300 rounded-xl p-2 transition group"
                                    >
                                        <div className="aspect-square rounded-lg overflow-hidden bg-base-300 mb-2">
                                            {r.coverUrl && <img src={r.coverUrl} alt="" className="w-full h-full object-cover" />}
                                        </div>
                                        <div className="font-semibold text-sm truncate">{r.title}</div>
                                        <div className="text-xs text-base-content/50 truncate">{r.artist}</div>
                                        <div className="text-xs text-primary mt-1 opacity-0 group-hover:opacity-100 flex items-center gap-1">
                                            <Shovel className="w-3 h-3" /> Dig this
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}

                    {!isDigging && !digResult && searchResults.length === 0 && (
                        <div className="text-center text-base-content/40 py-16">
                            <Shovel className="w-10 h-10 mx-auto mb-3 opacity-40" />
                            Start digging — search above or paste a Bandcamp URL.
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <aside className="space-y-6">
                    {/* Crate */}
                    <div className="bg-base-200 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold">Crate</h3>
                            <select
                                className="select select-xs select-bordered max-w-[8rem]"
                                value={currentSessionId ?? ""}
                                onChange={(e) => e.target.value && selectSession(Number(e.target.value))}
                            >
                                {sessions.length === 0 && <option value="">No sessions</option>}
                                {sessions.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex gap-1 mb-3">
                            <input
                                value={newSessionName}
                                onChange={(e) => setNewSessionName(e.target.value)}
                                placeholder="New session…"
                                className="input input-xs input-bordered flex-1"
                            />
                            <button
                                className="btn btn-xs btn-primary"
                                onClick={() => { if (newSessionName.trim()) { createSession(newSessionName.trim()); setNewSessionName(""); } }}
                            >
                                <Plus className="w-3 h-3" />
                            </button>
                            {currentSessionId && (
                                <button className="btn btn-xs btn-ghost" title="Delete session" onClick={() => deleteSession(currentSessionId)}>
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            )}
                        </div>

                        {crate.length === 0 ? (
                            <p className="text-xs text-base-content/40">Saved tracks appear here.</p>
                        ) : (
                            <ul className="space-y-2">
                                {crate.map((c) => (
                                    <li key={c.id} className="flex items-center gap-2">
                                        {c.cover_url && <img src={c.cover_url} alt="" className="w-8 h-8 rounded object-cover" />}
                                        <div className="min-w-0 flex-1">
                                            <div className="text-xs font-medium truncate">{c.title}</div>
                                            <div className="text-[11px] text-base-content/50 truncate">{c.artist}</div>
                                        </div>
                                        {c.preview_url && (
                                            <button
                                                className="btn btn-ghost btn-xs btn-circle"
                                                onClick={() => playPreview({ url: c.source_url, title: c.title || "", artist: c.artist || "", coverUrl: c.cover_url || "", previewUrl: c.preview_url })}
                                            >
                                                <Play className="w-3 h-3" />
                                            </button>
                                        )}
                                        <button className="btn btn-ghost btn-xs btn-circle" onClick={() => removeFromCrate(c.id)}>
                                            <X className="w-3 h-3" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* History */}
                    <div className="bg-base-200 rounded-xl p-4">
                        <h3 className="font-bold mb-3">Recent searches</h3>
                        {history.length === 0 ? (
                            <p className="text-xs text-base-content/40">Your search history shows here.</p>
                        ) : (
                            <ul className="space-y-1">
                                {history.map((h) => (
                                    <li key={h.id}>
                                        <button
                                            className="text-xs text-base-content/70 hover:text-primary truncate w-full text-left"
                                            onClick={() => { setQuery(h.query); search(h.query); }}
                                        >
                                            {h.query}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}

function ResultGrid({
    items, bpms, onPlay, onAdd, onBpm,
}: {
    items: RankedRelease[];
    bpms: Record<string, number | "loading">;
    onPlay: (r: RankedRelease) => void;
    onAdd: (r: RankedRelease) => void;
    onBpm: (previewUrl: string | null) => void;
}) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {items.map((r) => {
                const bpm = r.previewUrl ? bpms[r.previewUrl] : undefined;
                return (
                    <div key={r.tralbumId} className="flex gap-3 bg-base-200 rounded-xl p-3">
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-base-300 shrink-0 relative">
                            {r.coverUrl && <img src={r.coverUrl} alt="" className="w-full h-full object-cover" />}
                            {r.previewUrl && (
                                <button
                                    onClick={() => onPlay(r)}
                                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition"
                                >
                                    <Play className="w-6 h-6 text-white" />
                                </button>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="font-semibold text-sm truncate">{r.title}</div>
                            <div className="text-xs text-base-content/50 truncate">{r.artist}</div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="badge badge-sm badge-primary" title="Owned by this many sampled collectors">
                                    {r.score} diggers
                                </span>
                                {r.alsoCollectedCount > 0 && (
                                    <span className="text-[11px] text-base-content/40">{r.alsoCollectedCount} collected</span>
                                )}
                            </div>
                            <div className="flex items-center gap-1 mt-2">
                                <button className="btn btn-xs btn-ghost gap-1" onClick={() => onAdd(r)} title="Add to crate">
                                    <Plus className="w-3 h-3" /> Crate
                                </button>
                                {r.previewUrl && (
                                    <button className="btn btn-xs btn-ghost gap-1" onClick={() => onBpm(r.previewUrl)} title="Detect BPM">
                                        <Activity className="w-3 h-3" />
                                        {bpm === "loading" ? "…" : bpm ? `${bpm} BPM` : "BPM"}
                                    </button>
                                )}
                                <a className="btn btn-xs btn-ghost btn-circle" href={r.url} target="_blank" rel="noreferrer" title="Open on Bandcamp">
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
