import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Github, Maximize2, AlertTriangle } from 'lucide-react';
import type { LabAppRecord } from '../types';
import API from '../services/api';

const LabApp = () => {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<LabAppRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.getLabApps()
      .then((apps) => {
        const found = apps.find((a) => String(a.id) === appId);
        setApp(found ?? null);
      })
      .catch(() => setApp(null))
      .finally(() => setLoading(false));
  }, [appId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="loading loading-spinner loading-md opacity-40" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <AlertTriangle size={48} className="opacity-30" />
        <h2 className="text-2xl font-black">App not found</h2>
        <p className="opacity-50">No lab app with id <code>{appId}</code></p>
        <button className="btn btn-primary" onClick={() => navigate('/lab')}>
          Back to Lab
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col animate-fade-in" style={{ height: 'calc(100vh - 10rem)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-base-content/10 bg-base-200 flex-shrink-0">
        <button
          className="btn btn-ghost btn-sm gap-2"
          onClick={() => navigate('/lab')}
        >
          <ArrowLeft size={16} />
          Lab
        </button>

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-black truncate">{app.name}</h2>
          {app.author && (
            <p className="text-xs opacity-40 hidden sm:block truncate">by {app.author}</p>
          )}
        </div>

        {app.permissions.length > 0 && (
          <div className="hidden md:flex items-center gap-1">
            {app.permissions.map((p) => (
              <span key={p} className="badge badge-xs badge-outline opacity-40">
                {p}
              </span>
            ))}
          </div>
        )}

        {app.sourceUrl && (
          <a
            href={app.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm btn-square opacity-50 hover:opacity-100"
            title="View source on GitHub"
          >
            <Github size={16} />
          </a>
        )}

        <a
          href={app.src}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm btn-square opacity-50 hover:opacity-100"
          title="Open in new tab"
        >
          <Maximize2 size={16} />
        </a>
      </div>

      {/* iFrame */}
      <iframe
        src={app.src}
        title={app.name}
        className="flex-1 w-full border-none bg-base-100"
        sandbox={app.sandbox.join(' ')}
        allow={app.allow.join('; ')}
        loading="lazy"
      />
    </div>
  );
};

export default LabApp;
