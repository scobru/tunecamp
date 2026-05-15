import { useState, useEffect } from "react";
import { 
  Activity, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  Globe,
  MessageSquare,
  Search,
  Cpu,
  Download,
  CreditCard,
  Loader2,
  Youtube,
} from "lucide-react";
import { useConfigStore } from "../../stores/useConfigStore";
import API from "../../services/api";
import clsx from "clsx";

interface PluginInfo {
    id: string;
    name: string;
    version: string;
    description: string;
    enabled: boolean;
    service: string;
}

export const IntegrationsPanel = () => {
  const { status, fetchStatus, isLoading: isStatusLoading } = useConfigStore();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [isPluginsLoading, setIsPluginsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    setRefreshing(true);
    await Promise.all([
        fetchStatus(),
        loadPlugins()
    ]);
    setRefreshing(false);
  };

  const loadPlugins = async () => {
    setIsPluginsLoading(true);
    try {
        const data = await API.getPlugins();
        setPlugins(data);
    } catch (e) {
        console.error("Failed to load plugins:", e);
    } finally {
        setIsPluginsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggle = async (pluginId: string, currentStatus: boolean) => {
    setIsProcessing(pluginId);
    try {
        await API.togglePlugin(pluginId, !currentStatus);
        setPlugins(prev => prev.map(p => 
            p.id === pluginId ? { ...p, enabled: !currentStatus } : p
        ));
    } catch (e: any) {
        console.error("Failed to toggle plugin:", e);
        alert("Action failed: " + e.message);
    } finally {
        setIsProcessing(null);
    }
  };

  const handleYouTubeAuth = async () => {
    if (!confirm("This will open a Puppeteer browser window on the server to perform YouTube login. You must have access to the server's desktop to complete the login. Continue?")) return;
    try {
        const res = await API.triggerYouTubeAuth();
        alert(res.message);
    } catch (e: any) {
        alert("Failed to trigger YouTube auth: " + e.message);
    }
  };

  const services = [
    {
      id: "soulseek",
      name: "Soulseek",
      icon: <Download className="text-accent" />,
      status: status?.soulseek.connected ? 'online' : 'offline',
      details: status?.soulseek.connected ? `Connected as ${status.soulseek.username}` : "Not connected",
      description: "P2P music search and download service.",
      pluginId: "soulseek"
    },
    {
      id: "telegram",
      name: "Telegram Bot",
      icon: <MessageSquare className="text-primary" />,
      status: status?.telegram.active ? 'online' : 'offline',
      details: status?.telegram.active ? "Bot is online" : "Bot is offline or not configured",
      description: "Remote control and notifications via Telegram.",
      pluginId: "telegram"
    },
    {
      id: "itunes",
      name: "iTunes API",
      icon: <Search className="text-info" />,
      status: status?.itunes.online ? 'online' : 'offline',
      details: status?.itunes.online ? "Service reachable" : "Service unreachable",
      description: "High-resolution covers and metadata search.",
      pluginId: "itunes"
    },
    {
      id: "musicbrainz",
      name: "MusicBrainz",
      icon: <Globe className="text-secondary" />,
      status: status?.musicbrainz.online ? 'online' : 'offline',
      details: status?.musicbrainz.online ? "Service reachable" : "Service unreachable",
      description: "Open encyclopedia for music metadata.",
      pluginId: "musicbrainz"
    },
    {
        id: "openrouter",
        name: "AI (OpenRouter)",
        icon: <Cpu className="text-warning" />,
        status: status?.openrouter.configured ? 'online' : 'offline',
        details: status?.openrouter.configured ? `Active: ${status.openrouter.model}` : "API Key missing",
        description: "AI-powered metadata enrichment and suggestions.",
        pluginId: "openrouter"
      },
    {
      id: "discogs",
      name: "Discogs",
      icon: <Activity className="text-base-content" />,
      status: status?.discogs.configured ? 'online' : 'offline',
      details: status?.discogs.configured ? "Token configured" : "Token missing",
      description: "Vinyl-focused metadata and marketplace data.",
      pluginId: "discogs"
    },
    {
      id: "stripe",
      name: "Stripe",
      icon: <CreditCard className="text-[#635BFF]" />,
      status: status?.stripe?.configured ? 'online' : 'offline',
      details: status?.stripe?.configured ? (status.stripe.webhookConfigured ? "Ready (Live Webhooks)" : "Keys Set (No Webhook)") : "Not Configured",
      description: "Credit card processing and checkout sessions.",
      pluginId: "stripe"
    },
    {
      id: "moonpay",
      name: "MoonPay",
      icon: <CreditCard className="text-[#a042ff]" />,
      status: status?.moonpay?.configured ? 'online' : 'offline',
      details: status?.moonpay?.configured ? "API Key configured" : "API Key missing",
      description: "Credit card to crypto on-ramp provider.",
      pluginId: "moonpay"
    },
    {
      id: "gdrive",
      name: "Google Drive",
      icon: <Globe className="text-blue-500" />,
      status: status?.gdrive?.configured && status?.gdrive?.active ? 'online' : 'offline',
      details: status?.gdrive?.configured ? (status.gdrive.active ? "Integration active" : "Service disabled") : "Client ID/Secret missing",
      description: "Cloud storage for track localization and backup.",
      pluginId: "gdrive"
    },
    {
      id: "deezer",
      name: "Deezer",
      icon: <Globe className="text-[#EF5466]" />,
      status: status?.deezer?.online ? 'online' : 'offline',
      details: status?.deezer?.online ? "Service reachable" : "Service unreachable",
      description: "External playlist import and metadata.",
      pluginId: "deezer"
    },
    {
      id: "youtube",
      name: "YouTube",
      icon: <Youtube className="text-[#FF0000]" />,
      status: status?.youtube?.online ? 'online' : 'offline',
      details: status?.youtube?.online ? "Service reachable" : "Service unreachable",
      description: "Resilient streaming via yt-dlp with fallbacks.",
      pluginId: "youtube"
    },
    {
      id: "bandcamp",
      name: "Bandcamp",
      icon: <Globe className="text-[#629aa9]" />,
      status: status?.bandcamp?.online ? 'online' : 'offline',
      details: status?.bandcamp?.online ? "Service reachable" : "Service unreachable",
      description: "Metadata fetching and high-quality streaming support via scraping.",
      pluginId: "bandcamp"
    },
    {
      id: "lastfm",
      name: "Last.fm",
      icon: <Activity className="text-[#D51007]" />,
      status: status?.lastfm?.configured ? 'online' : 'offline',
      details: status?.lastfm?.configured ? "Scrobbling active" : "Not configured",
      description: "Music scrobbling and recommendations.",
      pluginId: "lastfm"
    },
    {
      id: "listenbrainz",
      name: "ListenBrainz",
      icon: <Activity className="text-[#EB743B]" />,
      status: status?.listenbrainz?.configured ? 'online' : 'offline',
      details: status?.listenbrainz?.configured ? "Scrobbling active" : "Not configured",
      description: "Open source music scrobbling service.",
      pluginId: "listenbrainz"
    },
    {
      id: "spotify",
      name: "Spotify",
      icon: <Globe className="text-[#1DB954]" />,
      status: status?.spotify?.online ? 'online' : 'offline',
      details: status?.spotify?.online ? "Service reachable" : "Service unreachable",
      description: "Metadata and playlist import from Spotify.",
      pluginId: "spotify"
    },
    {
      id: "soundcloud",
      name: "SoundCloud",
      icon: <Globe className="text-[#FF3300]" />,
      status: status?.soundcloud?.online ? 'online' : 'offline',
      details: status?.soundcloud?.online ? "Service reachable" : "Service unreachable",
      description: "Streaming and metadata from SoundCloud.",
      pluginId: "soundcloud"
    }
  ];

  if ((isStatusLoading || isPluginsLoading) && !status && plugins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-24 gap-4 opacity-50">
        <RefreshCw className="animate-spin text-primary" size={48} />
        <p className="font-bold">Initializing Integrations...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-bold text-xl flex items-center gap-2">
            <Activity className="text-primary" /> Service Integrations
          </h3>
          <p className="text-sm opacity-60">Monitor health and manage external provider modules.</p>
        </div>
        <button 
          className={clsx("btn btn-circle btn-ghost", refreshing && "loading")}
          onClick={loadData}
          disabled={refreshing}
        >
          {!refreshing && <RefreshCw size={20} />}
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => {
          const plugin = plugins.find(p => p.id === service.pluginId);
          const isEnabled = plugin ? plugin.enabled : true; // Some might not be plugins
          
          return (
            <div key={service.id} className={clsx(
                "card card-m3 border transition-all duration-300",
                isEnabled ? "bg-base-200/50 border-base-content/5" : "bg-base-300/30 border-base-content/10 grayscale opacity-60"
            )}>
              <div className="card-body p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-base-100 rounded-xl shadow-sm">
                    {service.icon}
                  </div>
                  <div className="flex items-center gap-3">
                    {plugin && (
                        <div className="form-control">
                            <label className="label cursor-pointer p-0 gap-2">
                                {isProcessing === plugin.id ? (
                                    <Loader2 className="animate-spin opacity-50" size={18} />
                                ) : (
                                    <input 
                                        type="checkbox" 
                                        className="toggle toggle-primary toggle-sm" 
                                        checked={isEnabled}
                                        onChange={() => handleToggle(plugin.id, isEnabled)}
                                    />
                                )}
                            </label>
                        </div>
                    )}
                    <div className={clsx(
                        "w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)]",
                        service.status === 'online' ? "bg-success shadow-success/40" : "bg-error shadow-error/40"
                    )} />
                  </div>
                </div>

                <div className="space-y-1">
                    <h4 className="font-bold text-lg flex items-center gap-2">
                        {service.name}
                        {plugin && <span className="text-[10px] opacity-30 font-mono">v{plugin.version}</span>}
                    </h4>
                    <p className="text-xs opacity-60 leading-relaxed h-8 line-clamp-2">{service.description}</p>
                </div>

                <div className={clsx(
                    "mt-4 text-[10px] font-mono p-2.5 rounded-lg border flex items-center justify-between gap-2 transition-colors",
                    service.status === 'online' 
                        ? "bg-success/5 border-success/10 text-success" 
                        : "bg-error/5 border-error/10 text-error/80"
                )}>
                  <div className="flex items-center gap-2 overflow-hidden">
                      {service.status === 'online' ? <CheckCircle2 size={12} className="shrink-0" /> : <AlertCircle size={12} className="shrink-0" />}
                      <span className="truncate">{service.details}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
