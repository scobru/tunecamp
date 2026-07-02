import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Scale, ShieldCheck } from "lucide-react";
import API from "../services/api";
import type { LegalPages } from "../types";
import { renderMarkdown } from "../utils/markdown";
import { sanitizeHtml } from "../utils/sanitize";

/**
 * Public legal pages served at /terms and /privacy. Content comes from
 * GET /api/catalog/legal: the operator's custom Markdown when set, otherwise
 * the built-in per-instance template.
 */
const Legal = () => {
  const { pathname } = useLocation();
  const kind: "terms" | "privacy" = pathname.startsWith("/privacy") ? "privacy" : "terms";
  const [pages, setPages] = useState<LegalPages | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    API.getLegalPages().then(setPages).catch((e) => {
      console.error("Failed to fetch legal pages", e);
      setError(true);
    });
  }, []);

  if (error) {
    return (
      <div className="p-8 text-center opacity-60">
        Failed to load this page. Please try again later.
      </div>
    );
  }

  if (!pages) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  const content = kind === "terms" ? pages.terms : pages.privacy;

  return (
    <div className="p-4 lg:p-8 animate-fade-in max-w-3xl mx-auto space-y-6">
      <div role="tablist" className="tabs tabs-boxed w-fit">
        <Link
          role="tab"
          to="/terms"
          className={`tab gap-2 ${kind === "terms" ? "tab-active" : ""}`}
        >
          <Scale size={16} /> Terms of Service
        </Link>
        <Link
          role="tab"
          to="/privacy"
          className={`tab gap-2 ${kind === "privacy" ? "tab-active" : ""}`}
        >
          <ShieldCheck size={16} /> Privacy Policy
        </Link>
      </div>

      <article
        className="prose prose-invert max-w-none leading-relaxed opacity-95"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMarkdown(content)) }}
      />
    </div>
  );
};

export default Legal;
