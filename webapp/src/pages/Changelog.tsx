import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import API from "../services/api";
import { renderMarkdown } from "../utils/markdown";
import { sanitizeHtml } from "../utils/sanitize";

const Changelog = () => {
  const [changelog, setChangelog] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    API.getChangelog()
      .then((res) => {
        setChangelog(res.changelog);
        setLoading(false);
      })
      .catch((e) => {
        console.error("Failed to fetch changelog", e);
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (error || !changelog) {
    return (
      <div className="p-8 text-center opacity-60">
        Failed to load the changelog. Please try again later.
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 animate-fade-in max-w-3xl mx-auto space-y-8">
      <div className="text-center space-y-4 mb-8">
        <div className="inline-flex p-3 rounded-full bg-primary/10 text-primary mb-2">
          <Sparkles size={32} />
        </div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          What's New
        </h1>
        <p className="text-base-content/60 text-sm max-w-md mx-auto">
          Explore the latest features, improvements, and bug fixes added to TuneCamp.
        </p>
      </div>

      <article
        className="prose prose-invert max-w-none leading-relaxed opacity-95
                   prose-headings:font-bold
                   prose-h2:border-b prose-h2:border-base-content/10 prose-h2:pb-3 prose-h2:mt-10
                   prose-h3:text-secondary prose-h3:mt-6
                   prose-ul:list-disc prose-ul:pl-6 prose-li:my-1"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMarkdown(changelog)) }}
      />
    </div>
  );
};

export default Changelog;
