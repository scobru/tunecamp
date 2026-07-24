import { confirm } from '@/utils/confirm';
import { useState, useEffect } from "react";
import API from "../../services/api";
import { CheckCircle, XCircle, Info, Music2 } from "lucide-react";
import { notify } from "../../utils/notify";
import type { Sample } from "../../types";

export const SamplesCurationQueue = () => {
    const [pendingSamples, setPendingSamples] = useState<Sample[]>([]);
    const [loading, setLoading] = useState(true);

    const loadQueue = async () => {
        setLoading(true);
        try {
            setPendingSamples(await API.getPendingSamples());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadQueue();
        window.addEventListener("refresh-samples", loadQueue);
        return () => window.removeEventListener("refresh-samples", loadQueue);
    }, []);

    const handleApprove = async (id: number) => {
        if (!await confirm("Are you sure you want to APPROVE this sample?")) return;
        try {
            await API.approveSample(id);
            notify.success("Sample approved!");
            loadQueue();
        } catch (e: any) {
            notify.error(e, "Approval failed");
        }
    };

    const handleReject = async (id: number) => {
        const reason = prompt("Enter rejection reason (will be sent to artist):");
        if (reason === null) return;
        try {
            await API.rejectSample(id, reason);
            notify.success("Sample rejected.");
            loadQueue();
        } catch (e: any) {
            notify.error(e, "Rejection failed");
        }
    };

    if (loading) return <div className="p-8 text-center opacity-50">Loading curation queue...</div>;

    if (pendingSamples.length === 0) {
        return (
            <div className="p-20 text-center opacity-40 bg-base-200/20 rounded-3xl border border-dashed border-base-content/10">
                <Info size={48} className="mx-auto mb-4" />
                <p>Sample curation queue is empty. No samples pending approval.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold">Pending Sample Approvals</h2>
            <div className="grid gap-4">
                {pendingSamples.map(s => (
                    <div key={s.id} className="card bg-base-200 border border-base-content/5 overflow-hidden">
                        <div className="flex flex-col md:flex-row items-center gap-6 p-4">
                            <div className="w-24 h-24 rounded-lg bg-neutral overflow-hidden flex-shrink-0 flex items-center justify-center">
                                <Music2 size={32} className="opacity-30" />
                            </div>

                            <div className="flex-1 text-center md:text-left">
                                <h3 className="text-lg font-bold">{s.title}</h3>
                                {s.artistName && <p className="text-sm opacity-60">Artist: <span className="text-primary">{s.artistName}</span></p>}
                                <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
                                    {s.bpm && <div className="badge badge-sm badge-outline">{s.bpm} BPM</div>}
                                    {s.musicalKey && <div className="badge badge-sm badge-outline">{s.musicalKey}</div>}
                                    <div className="badge badge-sm badge-outline">{s.license.toUpperCase()}</div>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <audio controls preload="none" src={API.getSampleDownloadUrl(s.id)} className="h-9 max-w-[180px]" />
                                <button className="btn btn-success gap-2" onClick={() => handleApprove(s.id)}>
                                    <CheckCircle size={18} /> Approve
                                </button>
                                <button className="btn btn-error btn-outline gap-2" onClick={() => handleReject(s.id)}>
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
