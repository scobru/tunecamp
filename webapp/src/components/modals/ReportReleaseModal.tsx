import { useState, useEffect, useRef } from "react";
import API from "../../services/api";
import { Flag, X, AlertTriangle } from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import { notify } from "../../utils/notify";

interface ReportReleaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  releaseId: number;
  releaseTitle: string;
}

export const ReportReleaseModal = ({
  isOpen,
  onClose,
  releaseId,
  releaseTitle,
}: ReportReleaseModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { isAuthenticated } = useAuthStore();

  const [reason, setReason] = useState("Copyright Infringement");
  const [details, setDetails] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      setReason("Copyright Infringement");
      setDetails("");
      setName("");
      setEmail("");
      setError("");
      setSuccess(false);
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;

    setLoading(true);
    setError("");

    try {
      await API.reportRelease(
        releaseId,
        reason,
        details || null,
        isAuthenticated ? null : name || null,
        isAuthenticated ? null : email || null
      );
      setSuccess(true);
      notify.success("Report submitted successfully.");
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to submit report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement, Event>) => {
    e.preventDefault();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-bottom sm:modal-middle"
      onClose={handleCancel}
    >
      <div className="modal-box bg-base-200 border border-base-content/10 shadow-xl max-w-md w-full mx-auto relative p-6">
        <button
          type="button"
          onClick={onClose}
          className="btn btn-sm btn-circle btn-ghost absolute right-4 top-4 text-base-content/70 hover:text-base-content"
        >
          <X size={18} />
        </button>

        <h3 className="font-bold text-lg text-base-content font-sans mb-2 flex items-center gap-2">
          <Flag size={20} className="text-warning" /> Report Release
        </h3>

        <p className="text-sm text-base-content/75 font-sans mb-4">
          You are reporting the release <strong className="text-base-content font-semibold">"{releaseTitle}"</strong> for moderation.
        </p>

        {success ? (
          <div className="py-4 text-center">
            <div className="text-success text-lg font-bold mb-2">Thank you!</div>
            <p className="text-sm text-base-content/80">
              Your report has been submitted to the site administrator for review.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 font-sans text-left">
            <div className="form-control w-full">
              <label className="label py-1">
                <span className="label-text text-sm font-semibold text-base-content/85">Reason for Report</span>
              </label>
              <select
                className="select select-bordered w-full bg-base-100 border-base-content/20 text-sm focus:outline-none"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              >
                <option value="Copyright Infringement">Copyright Infringement</option>
                <option value="Inappropriate Content">Inappropriate Content</option>
                <option value="Spam or Abuse">Spam or Abuse</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {!isAuthenticated && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-control w-full">
                  <label className="label py-1">
                    <span className="label-text text-sm font-semibold text-base-content/85">Your Name (Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="John Doe"
                    className="input input-bordered w-full bg-base-100 border-base-content/20 text-sm focus:outline-none"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="form-control w-full">
                  <label className="label py-1">
                    <span className="label-text text-sm font-semibold text-base-content/85">Your Email (Optional)</span>
                  </label>
                  <input
                    type="email"
                    placeholder="john@example.com"
                    className="input input-bordered w-full bg-base-100 border-base-content/20 text-sm focus:outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            <div className="form-control w-full">
              <label className="label py-1">
                <span className="label-text text-sm font-semibold text-base-content/85">Additional Details</span>
              </label>
              <textarea
                placeholder="Please describe the issue in detail..."
                className="textarea textarea-bordered w-full bg-base-100 border-base-content/20 text-sm h-24 focus:outline-none"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="text-error text-sm flex items-center gap-1.5 mt-2 bg-error/10 p-2.5 rounded border border-error/20">
                <AlertTriangle size={16} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="modal-action flex justify-end gap-3 pt-2 mt-4">
              <button
                type="button"
                className="btn btn-ghost border border-base-content/10 hover:bg-base-300 font-sans text-sm"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary font-sans text-sm shadow-sm"
                disabled={loading}
              >
                {loading ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  "Submit Report"
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      <form method="dialog" className="modal-backdrop bg-black/60 backdrop-blur-xs">
        <button onClick={(e) => { e.preventDefault(); onClose(); }}>close</button>
      </form>
    </dialog>
  );
};
