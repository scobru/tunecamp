import { confirm } from '@/utils/confirm';
import { useState, useEffect } from "react";
import API from "../../services/api";
import { Flag, Trash2, Check, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { notify } from "../../utils/notify";
import type { Report } from "../../types";

export const AdminReportsPanel = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDetails, setSelectedDetails] = useState<string | null>(null);

  const loadReports = async () => {
    try {
      setLoading(true);
      const data = await API.getReports();
      setReports(data);
    } catch (e: any) {
      console.error(e);
      notify.error(e, "Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleDismiss = async (id: number) => {
    if (!await confirm("Are you sure you want to dismiss this report? The reported release will remain active.")) return;
    try {
      await API.deleteReport(id);
      notify.success("Report dismissed successfully");
      loadReports();
    } catch (e: any) {
      notify.error(e, "Failed to dismiss report");
    }
  };

  const handleDeleteRelease = async (releaseId: number, releaseTitle: string) => {
    if (!await confirm(`Are you sure you want to permanently delete the release "${releaseTitle}"? This will delete all its files, tracks, and metadata. This action cannot be undone.`)) return;
    try {
      await API.deleteRelease(String(releaseId));
      notify.success(`Release "${releaseTitle}" deleted successfully`);
      loadReports(); // Since Cascade is set, the reports for this release are gone.
    } catch (e: any) {
      notify.error(e, "Failed to delete release");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="card bg-base-200/50 border border-base-content/5 p-12 text-center">
        <Flag className="mx-auto text-base-content/30 mb-3" size={48} />
        <h3 className="font-bold text-lg">No Active Reports</h3>
        <p className="text-sm opacity-65 mt-1">There are currently no copyright or policy reports pending review.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 font-sans">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h3 className="font-bold text-lg">Moderation Reports</h3>
          <p className="text-xs opacity-60">Review policy and copyright infringement reports submitted by users.</p>
        </div>
        <div className="text-xs opacity-50 font-mono">
          {reports.length} pending {reports.length === 1 ? 'report' : 'reports'}
        </div>
      </div>

      <div className="overflow-x-auto w-full">
        <table className="table table-zebra w-full border border-base-content/5 rounded-box overflow-hidden">
          <thead>
            <tr className="bg-base-200/80">
              <th>Date</th>
              <th>Release / Artist</th>
              <th>Reporter</th>
              <th>Reason</th>
              <th>Details</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id} className="hover">
                <td className="text-xs font-mono opacity-85">
                  {new Date(report.created_at).toLocaleDateString()} <br />
                  <span className="opacity-50 text-[10px]">
                    {new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </td>
                <td>
                  <div className="font-semibold text-sm">
                    {report.release_slug ? (
                      <Link 
                        to={`/releases/${report.release_slug}`} 
                        className="text-primary hover:underline"
                        target="_blank"
                      >
                        {report.release_title}
                      </Link>
                    ) : (
                      report.release_title
                    )}
                  </div>
                  <div className="text-xs opacity-60">
                    {report.artist_name || "Unknown Artist"}
                  </div>
                </td>
                <td className="text-sm">
                  {report.reporter_name ? (
                    <div>
                      <span className="font-medium">{report.reporter_name}</span>
                      {report.reporter_email && (
                        <div className="text-xs opacity-60 font-mono">{report.reporter_email}</div>
                      )}
                    </div>
                  ) : report.reporter_id ? (
                    <span className="badge badge-sm badge-outline">Registered User</span>
                  ) : (
                    <span className="text-base-content/40 italic">Anonymous</span>
                  )}
                </td>
                <td>
                  <span className="badge badge-sm badge-warning/20 text-warning border-warning/30 font-bold font-sans">
                    {report.reason}
                  </span>
                </td>
                <td className="max-w-[200px] truncate">
                  {report.details ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs truncate" title={report.details}>
                        {report.details}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedDetails(report.details)}
                        className="btn btn-ghost btn-xs btn-circle text-primary"
                        title="View Full Details"
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs opacity-40 italic">No details</span>
                  )}
                </td>
                <td className="text-right">
                  <div className="flex gap-2 justify-end">
                    <button
                      className="btn btn-xs btn-success gap-1 text-success-content"
                      onClick={() => handleDismiss(report.id)}
                      title="Dismiss Report"
                    >
                      <Check size={14} /> Dismiss
                    </button>
                    <button
                      className="btn btn-xs btn-error gap-1 text-error-content"
                      onClick={() => handleDeleteRelease(report.release_id, report.release_title || "")}
                      title="Delete Reported Release"
                    >
                      <Trash2 size={14} /> Delete Release
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Details View Modal */}
      {selectedDetails && (
        <dialog className="modal modal-open">
          <div className="modal-box bg-base-200 border border-base-content/10 shadow-xl max-w-md w-full">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Flag size={20} className="text-warning" /> Report Details
            </h3>
            <p className="text-sm bg-base-100 p-4 rounded-lg border border-base-content/5 font-sans whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
              {selectedDetails}
            </p>
            <div className="modal-action">
              <button 
                className="btn btn-sm btn-ghost border border-base-content/10 hover:bg-base-300 font-sans"
                onClick={() => setSelectedDetails(null)}
              >
                Close
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop bg-black/40 backdrop-blur-xs">
            <button onClick={() => setSelectedDetails(null)}>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
};
