import { useState, useEffect } from "react";
import API from "../../services/api";
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  RefreshCw,
  Globe,
  MessageSquare,
  Search,
  Cpu,
  Download,
  CreditCard
} from "lucide-react";

interface HealthStatus {
  soulseek: { connected: boolean; username: string | null; error?: string };
  itunes: { online: boolean };
  musicbrainz: { online: boolean };
  discogs: { configured: boolean };
  telegram: { active: boolean };
  openrouter: { configured: boolean; model: string };
  stripe: { configured: boolean; webhookConfigured: boolean };
  paypal: { configured: boolean; environment: string };
  moonpay: { configured: boolean };
  gdrive: { configured: boolean; active: boolean };
}

export const APIStatusPanel = () => {
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = async () => {
    setRefreshing(true);
    try {
      const data = await API.getAPIHealth();
      setStatus(data);
    } catch (e) {
      console.error("Failed to fetch API health:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const StatusIcon = ({ active, loading }: { active?: boolean; loading?: boolean }) => {
    if (loading) return <RefreshCw className="animate-spin text-base-content/30" size={20} />;
    if (active) return <CheckCircle2 className="text-success" size={20} />;
    return <XCircle className="text-error" size={20} />;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4 opacity-50">
        <RefreshCw className="animate-spin text-primary" size={32} />
        <p>Checking API connectivity...</p>
      </div>
    );
  }

  const items = [
    {
      id: "soulseek",
      name: "Soulseek",
      icon: <Download className="text-accent" />,
      active: status?.soulseek.connected,
      details: status?.soulseek.connected ? `Connected as ${status.soulseek.username}` : "Not connected",
      description: "P2P music search and download service."
    },
    {
      id: "telegram",
      name: "Telegram Bot",
      icon: <MessageSquare className="text-primary" />,
      active: status?.telegram.active,
      details: status?.telegram.active ? "Bot is online" : "Bot is offline or not configured",
      description: "Remote control and notifications via Telegram."
    },
    {
      id: "itunes",
      name: "iTunes API",
      icon: <Search className="text-info" />,
      active: status?.itunes.online,
      details: status?.itunes.online ? "Service reachable" : "Service unreachable",
      description: "High-resolution covers and metadata search."
    },
    {
      id: "musicbrainz",
      name: "MusicBrainz",
      icon: <Globe className="text-secondary" />,
      active: status?.musicbrainz.online,
      details: status?.musicbrainz.online ? "Service reachable" : "Service unreachable",
      description: "Open encyclopedia for music metadata."
    },
    {
        id: "openrouter",
        name: "AI (OpenRouter)",
        icon: <Cpu className="text-warning" />,
        active: status?.openrouter.configured,
        details: status?.openrouter.configured ? `Active: ${status.openrouter.model}` : "API Key missing",
        description: "AI-powered metadata enrichment and suggestions."
      },
    {
      id: "discogs",
      name: "Discogs",
      icon: <Activity className="text-base-content" />,
      active: status?.discogs.configured,
      details: status?.discogs.configured ? "Token configured" : "Token missing",
      description: "Vinyl-focused metadata and marketplace data."
    },
    {
      id: "stripe",
      name: "Stripe",
      icon: <CreditCard className="text-[#635BFF]" />,
      active: status?.stripe?.configured,
      details: status?.stripe?.configured ? (status.stripe.webhookConfigured ? "Ready (Live Webhooks)" : "Keys Set (No Webhook)") : "Not Configured",
      description: "Credit card processing and checkout sessions."
    },
    {
      id: "moonpay",
      name: "MoonPay",
      icon: <CreditCard className="text-[#a042ff]" />,
      active: status?.moonpay?.configured,
      details: status?.moonpay?.configured ? "API Key configured" : "API Key missing",
      description: "Credit card to crypto on-ramp provider."
    },
    {
      id: "gdrive",
      name: "Google Drive",
      icon: <Globe className="text-blue-500" />,
      active: status?.gdrive?.configured,
      details: status?.gdrive?.configured ? (status.gdrive.active ? "Integration active" : "Service disabled") : "Client ID/Secret missing",
      description: "Cloud storage for track localization and backup."
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Activity className="text-primary" /> API Connectivity Dashboard
          </h3>
          <p className="text-sm opacity-60">Monitor the health of external integrations and third-party services.</p>
        </div>
        <button 
          className={`btn btn-circle btn-ghost ${refreshing ? 'loading' : ''}`}
          onClick={fetchStatus}
          disabled={refreshing}
        >
          {!refreshing && <RefreshCw size={20} />}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="card card-m3 bg-base-200/50 border border-base-content/5">
            <div className="card-body p-5">
              <div className="flex justify-between items-start mb-2">
                <div className="p-2 bg-base-100 rounded-lg shadow-sm">
                  {item.icon}
                </div>
                <StatusIcon active={item.active} loading={refreshing} />
              </div>
              <h4 className="font-bold text-base">{item.name}</h4>
              <p className="text-xs opacity-60 mb-3">{item.description}</p>
              <div className={`text-xs font-mono p-2 rounded bg-base-300/50 flex items-center gap-2 ${item.active ? 'text-success' : 'text-error/70'}`}>
                {item.active ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                {item.details}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!status?.soulseek.connected && (
        <div className="alert alert-warning shadow-m3-1 text-sm">
          <AlertCircle size={20} />
          <div>
            <h3 className="font-bold">Soulseek is offline</h3>
            <div className="text-xs">Check your SLSK_USER and SLSK_PASS in .env or the Settings tab.</div>
          </div>
        </div>
      )}
    </div>
  );
};
