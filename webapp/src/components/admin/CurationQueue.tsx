import { useState, useEffect } from "react";
import API from "../../services/api";
import { CheckCircle, XCircle, Play, Info } from "lucide-react";

export const CurationQueue = () => {
    const [pendingReleases, setPendingReleases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const loadQueue = async () => {
        setLoading(true);
        try {
            const releases = await API.getAdminReleases({ mine: false, includeLibrary: true });
            setPendingReleases(releases.filter((r: any) => r.status === 'pending'));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadQueue();
        window.addEventListener("refresh-admin-releases", loadQueue);
        return () => window.removeEventListener("refresh-admin-releases", loadQueue);
    }, []);

    const handleApprove = async (id: number) => {
        if (!confirm("Are you sure you want to APPROVE this release?")) return;
        try {
            await API.approvePromotion(id);
            alert("Release approved!");
            loadQueue();
        } catch (e: any) {
            alert("Approval failed: " + e.message);
        }
    };

    const handleReject = async (id: number) => {
        const reason = prompt("Enter rejection reason (will be sent to artist):");
        if (reason === null) return;
        try {
            await API.rejectPromotion(id, reason);
            alert("Release rejected.");
            loadQueue();
        } catch (e: any) {
            alert("Rejection failed: " + e.message);
        }
    };

    if (loading) return <div className="p-8 text-center opacity-50">Loading curation queue...</div>;

    if (pendingReleases.length === 0) {
        return (
            <div className="p-20 text-center opacity-40 bg-base-200/20 rounded-3xl border border-dashed border-white/10">
                <Info size={48} className="mx-auto mb-4" />
                <p>Curation queue is empty. No releases pending approval.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold">Pending Approvals</h2>
            <div className="grid gap-4">
                {pendingReleases.map(r => (
                    <div key={r.id} className="card bg-base-200 border border-white/5 overflow-hidden">
                        <div className="flex flex-col md:flex-row items-center gap-6 p-4">
                            <div className="w-24 h-24 rounded-lg bg-neutral overflow-hidden flex-shrink-0">
                                {r.cover_path ? (
                                    <img 
                                        src={r.is_formal_release ? API.getReleaseCoverUrl(r.id) : API.getAlbumCoverUrl(r.id)} 
                                        alt="" 
                                        className="w-full h-full object-cover" 
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold opacity-20">TC</div>
                                )}
                            </div>
                            
                            <div className="flex-1 text-center md:text-left">
                                <h3 className="text-lg font-bold">{r.title}</h3>
                                <p className="text-sm opacity-60">Artist: <span className="text-primary">{r.artistName}</span></p>
                                <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
                                    <div className="badge badge-sm badge-outline">{r.type}</div>
                                    <div className="badge badge-sm badge-outline">{r.genre}</div>
                                    {r.is_formal_release ? (
                                        <div className="badge badge-sm badge-outline opacity-70">Release</div>
                                    ) : (
                                        <div className="badge badge-sm badge-ghost opacity-70">Library</div>
                                    )}
                                    {r.price > 0 && <div className="badge badge-sm badge-success">{r.price} {r.currency}</div>}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button 
                                    className="btn btn-circle btn-ghost" 
                                    title="Preview (Experimental)"
                                    onClick={() => alert("Preview coming soon. Check files in library.")}
                                >
                                    <Play size={20} />
                                </button>
                                <button 
                                    className="btn btn-success gap-2"
                                    onClick={() => handleApprove(r.id)}
                                >
                                    <CheckCircle size={18} /> Approve
                                </button>
                                <button 
                                    className="btn btn-error btn-outline gap-2"
                                    onClick={() => handleReject(r.id)}
                                >
                                    <XCircle size={18} /> Reject
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
