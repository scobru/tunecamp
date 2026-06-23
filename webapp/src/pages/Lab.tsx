import { useNavigate } from 'react-router-dom';
import { FlaskConical, Github, ExternalLink, Mic, Music2, Piano, AudioWaveform, Zap } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { LAB_APPS, CATEGORY_LABELS, CATEGORY_COLORS, type LabApp } from '../data/labApps';

const CATEGORY_ICONS: Record<LabApp['category'], React.ComponentType<{ size?: number; className?: string }>> = {
  recording: Mic,
  synthesis: AudioWaveform,
  composition: Piano,
  effects: Zap,
  other: Music2,
};

const Lab = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <PageHeader
        title="Lab"
        subtitle="Experimental audio tools — built by the community, running in your browser"
        icon={FlaskConical}
        iconColor="text-secondary"
        gradientFrom="from-secondary/20"
        gradientTo="to-secondary/5"
      />

      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {LAB_APPS.map((app) => {
            const CategoryIcon = CATEGORY_ICONS[app.category];
            return (
              <div
                key={app.id}
                className="card bg-base-200 border border-base-content/5 hover:border-secondary/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-level-2 group"
              >
                <div className="card-body p-6 flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-secondary/20 to-secondary/5 border border-base-content/5">
                      <CategoryIcon size={24} className="text-secondary" />
                    </div>
                    <span className={`badge badge-sm font-bold ${CATEGORY_COLORS[app.category]}`}>
                      {CATEGORY_LABELS[app.category]}
                    </span>
                  </div>

                  <div className="flex-1 space-y-2">
                    <h3 className="text-lg font-black tracking-tight">{app.name}</h3>
                    <p className="text-sm opacity-60 leading-relaxed">{app.description}</p>
                  </div>

                  {app.permissions.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {app.permissions.map((p) => (
                        <span key={p} className="badge badge-xs badge-outline opacity-50">
                          {p}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t border-base-content/5">
                    <button
                      className="btn btn-secondary btn-sm flex-1"
                      onClick={() => navigate(`/lab/${app.id}`)}
                    >
                      <ExternalLink size={14} />
                      Open
                    </button>
                    <a
                      href={app.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm btn-square opacity-50 hover:opacity-100"
                      title="View source on GitHub"
                    >
                      <Github size={16} />
                    </a>
                  </div>

                  <p className="text-xs opacity-30 text-right -mt-2">by {app.author}</p>
                </div>
              </div>
            );
          })}

          {/* Empty slot - invite developers */}
          <div className="card bg-base-200/30 border border-dashed border-base-content/10 hover:border-secondary/20 transition-all duration-300">
            <div className="card-body p-6 flex flex-col items-center justify-center text-center gap-3 min-h-[200px]">
              <div className="p-3 rounded-2xl bg-base-content/5">
                <FlaskConical size={24} className="opacity-20" />
              </div>
              <p className="text-sm font-bold opacity-30">More coming soon</p>
              <p className="text-xs opacity-20">Built something cool? Submit it to the lab.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Lab;
