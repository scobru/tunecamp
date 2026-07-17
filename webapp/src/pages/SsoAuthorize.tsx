import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";

/**
 * Landing point for tunecamp-sso's /auth/start redirect
 * (?client_id=&redirect_uri=&state=). Signs an assertion for the logged-in
 * user's actor and forwards the browser to redirect_uri.
 */
const SsoAuthorize = () => {
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading } = useAuthStore();
  const [error, setError] = useState("");

  const redirectUri = searchParams.get("redirect_uri") || "";
  const state = searchParams.get("state") || "";

  useEffect(() => {
    if (isLoading || !isAuthenticated || !redirectUri || !state) return;
    API.ssoAuthorize(redirectUri, state)
      .then((res) => {
        window.location.href = res.redirectUrl;
      })
      .catch((err: any) => setError(err?.message ?? "Failed to sign in"));
  }, [isLoading, isAuthenticated, redirectUri, state]);

  if (!redirectUri || !state) {
    return (
      <div className="max-w-sm mx-auto p-12 text-center opacity-70">
        <p>Missing redirect_uri or state.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-sm mx-auto p-12 text-center">
        <p className="text-error">{error}</p>
      </div>
    );
  }

  if (!isLoading && !isAuthenticated) {
    return (
      <div className="max-w-sm mx-auto p-12 text-center opacity-70">
        <p>Log in to this instance, then reopen this link to finish signing in.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <span className="loading loading-spinner loading-lg text-primary"></span>
    </div>
  );
};

export default SsoAuthorize;
