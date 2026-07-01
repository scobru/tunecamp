import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { KeyRound, CheckCircle2 } from "lucide-react";
import API from "../services/api";

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      await API.resetPassword(token, newPassword);
      setDone(true);
      setTimeout(() => navigate("/"), 2000);
    } catch (err: any) {
      setError(err?.message ?? "Reset failed. The link may be invalid or expired.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="max-w-sm mx-auto p-12 text-center opacity-70">
        <p>Missing reset token. Use the link from your reset email.</p>
        <Link to="/" className="link link-primary">Back home</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-sm mx-auto p-12 text-center animate-fade-in">
        <CheckCircle2 size={48} className="mx-auto mb-4 text-success" />
        <h2 className="text-xl font-bold mb-2">Password reset</h2>
        <p className="opacity-70">You can now log in with your new password. Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto p-6 md:p-12 animate-fade-in">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <KeyRound size={24} /> Reset Password
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="form-control">
          <label className="label" htmlFor="newPassword">
            <span className="label-text">New Password</span>
          </label>
          <input
            id="newPassword"
            type="password"
            className="input input-bordered w-full"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>
        <div className="form-control">
          <label className="label" htmlFor="confirmPassword">
            <span className="label-text">Confirm Password</span>
          </label>
          <input
            id="confirmPassword"
            type="password"
            className="input input-bordered w-full"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        {error && <div className="text-error text-sm text-center">{error}</div>}

        <button type="submit" className="btn btn-primary w-full" disabled={isLoading}>
          {isLoading ? <span className="loading loading-spinner loading-sm" /> : "Reset Password"}
        </button>
      </form>
    </div>
  );
};

export default ResetPassword;
