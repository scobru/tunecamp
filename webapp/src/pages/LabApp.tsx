import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Github, Maximize2, AlertTriangle } from 'lucide-react';
import { LAB_APPS } from '../data/labApps';

const LabApp = () => {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const app = LAB_APPS.find((a) => a.id === appId);

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
    <div className="flex flex-col animate-fade-in" style={{ height: 'calc(100vh - 4rem)' }}>
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
          <p className="text-xs opacity-40 hidden sm:block truncate">by {app.author}</p>
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

        <a
          href={app.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm btn-square opacity-50 hover:opacity-100"
          title="View source on GitHub"
        >
          <Github size={16} />
        </a>

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
