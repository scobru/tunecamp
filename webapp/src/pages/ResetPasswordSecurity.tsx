import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import API from "../services/api";

const ResetPasswordSecurity = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<"username" | "questions" | "done">("username");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleFetchQuestions = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const res = await API.getSecurityQuestions(username);
      setQ1(res.q1);
      setQ2(res.q2);
      setStep("questions");
    } catch (err: any) {
      setError(err?.message ?? "User not found or no security questions set.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await API.resetPasswordSecurity(username, a1, a2, newPassword);
      setStep("done");
      setTimeout(() => navigate("/"), 2000);
    } catch (err: any) {
      setError(err?.message ?? "Reset failed. Incorrect answers.");
    } finally {
      setIsLoading(false);
    }
  };

  if (step === "done") {
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
        <ShieldCheck size={24} /> Security Recovery
      </h2>

      {step === "username" ? (
        <form onSubmit={handleFetchQuestions} className="space-y-4">
          <p className="text-sm opacity-70">Enter your username to fetch your security questions.</p>
          <div className="form-control">
            <label className="label" htmlFor="username">
              <span className="label-text">Username</span>
            </label>
            <input
              id="username"
              type="text"
              className="input input-bordered w-full"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          {error && <div className="text-error text-sm text-center">{error}</div>}
          <button type="submit" className="btn btn-primary w-full" disabled={isLoading}>
            {isLoading ? <span className="loading loading-spinner loading-sm" /> : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-bold">{q1}</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={a1}
              onChange={(e) => setA1(e.target.value)}
              required
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-bold">{q2}</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={a2}
              onChange={(e) => setA2(e.target.value)}
              required
            />
          </div>
          <div className="form-control mt-4">
            <label className="label">
              <span className="label-text">New Password</span>
            </label>
            <input
              type="password"
              className="input input-bordered w-full"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          {error && <div className="text-error text-sm text-center">{error}</div>}
          <button type="submit" className="btn btn-primary w-full" disabled={isLoading}>
            {isLoading ? <span className="loading loading-spinner loading-sm" /> : "Reset Password"}
          </button>
        </form>
      )}

      <div className="mt-6 text-center">
        <Link to="/" className="link link-hover text-sm opacity-70">Back home</Link>
      </div>
    </div>
  );
};

export default ResetPasswordSecurity;
