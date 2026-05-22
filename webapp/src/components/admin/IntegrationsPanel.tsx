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
  Settings,
  Save
} from "lucide-react";
import { useConfigStore } from "../../stores/useConfigStore";
import { useAuthStore } from "../../stores/useAuthStore";
import API from "../../services/api";
import clsx from "clsx";
import type { SiteSettings } from "../../types";

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
  const { role, user } = useAuthStore();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [isPluginsLoading, setIsPluginsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedConfig, setExpandedConfig] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isRootAdmin = role === 'root_admin' || user?.isRootAdmin;

  const loadData = async () => {
    setRefreshing(true);
    await Promise.all([
        fetchStatus(),
        loadPlugins(),
        API.getAdminSettings().then(setSettings).catch(console.error)
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

  const handleYouTubeCookieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing('youtube');
    try {
        const res = await API.uploadYouTubeCookies(file);
        alert(res.message);
        fetchStatus();
    } catch (e: any) {
        console.error("Upload failed:", e);
        alert("Upload failed: " + e.message);
    } finally {
        setIsProcessing(null);
    }
  };

  const handleAuth = async (serviceId: string) => {
    if (serviceId === 'youtube') {
        document.getElementById('youtube-cookie-input')?.click();
        return;
    }
    
    setIsProcessing(serviceId);
    try {
        // Other auth logic if any
    } catch (e: any) {
        console.error("Auth failed:", e);
        alert("Auth failed: " + e.message);
    } finally {
        setIsProcessing(null);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await API.updateSettings(settings);
      alert("API settings saved successfully.");
      await loadData();
    } catch (e: any) {
      console.error(e);
      alert("Failed to save settings: " + e.message);
    } finally {
      setIsSaving(false);
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
      pluginId: "soulseek",
      hasConfig: true,
      renderConfig: () => (
        <div className="space-y-3 mt-4 border-t border-base-content/10 pt-4">
          <div className="form-control">
            <label className="label text-xs">Username</label>
            <input type="text" className="input input-sm input-bordered" value={settings?.soulseek_username || ''} onChange={e => setSettings({ ...settings!, soulseek_username: e.target.value })} />
          </div>
          <div className="form-control">
            <label className="label text-xs">Password</label>
            <input type="password" className="input input-sm input-bordered" value={settings?.soulseek_password || ''} onChange={e => setSettings({ ...settings!, soulseek_password: e.target.value })} />
          </div>
        </div>
      )
    },
    {
      id: "telegram",
      name: "Telegram Bot",
      icon: <MessageSquare className="text-primary" />,
      status: status?.telegram.active ? 'online' : 'offline',
      details: status?.telegram.active ? "Bot is online" : "Bot is offline or not configured",
      description: "Remote control and notifications via Telegram.",
      pluginId: "telegram",
      hasConfig: true,
      renderConfig: () => (
        <div className="space-y-3 mt-4 border-t border-base-content/10 pt-4">
          <div className="form-control">
            <label className="label text-xs">Bot Token</label>
            <input type="password" className="input input-sm input-bordered" value={settings?.telegram_bot_token || ''} onChange={e => setSettings({ ...settings!, telegram_bot_token: e.target.value })} />
          </div>
          <div className="form-control">
            <label className="label text-xs">Allowed Channels (Comma separated)</label>
            <input type="text" className="input input-sm input-bordered" value={settings?.telegram_allowed_channels || ''} onChange={e => setSettings({ ...settings!, telegram_allowed_channels: e.target.value })} />
          </div>
        </div>
      )
    },
    {
      id: "linda",
      name: "Linda Bridge",
      icon: <Globe className="text-purple-400" />,
      status: settings?.linda_bot_enabled ? 'online' : 'offline',
      details: settings?.linda_bot_enabled ? "Integration Enabled" : "Integration Disabled",
      description: "Linda Decentralized Bridge integration.",
      pluginId: "linda",
      hasConfig: true,
      renderConfig: () => (
        <div className="space-y-3 mt-4 border-t border-base-content/10 pt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="toggle toggle-sm toggle-primary" checked={settings?.linda_bot_enabled === true || settings?.linda_bot_enabled === "true" as any} onChange={e => setSettings({ ...settings!, linda_bot_enabled: e.target.checked })} />
            <span className="text-sm">Enable Linda Bot</span>
          </label>
          <div className="form-control">
            <label className="label text-xs">Invite Link</label>
            <input type="text" className="input input-sm input-bordered" value={settings?.linda_invite_link || ''} onChange={e => setSettings({ ...settings!, linda_invite_link: e.target.value })} />
          </div>
          <div className="form-control">
            <label className="label text-xs">Bot Public Key (Read Only)</label>
            <input type="text" className="input input-sm input-bordered bg-base-300" readOnly value={settings?.linda_bot_pubkey || 'Not initialized'} />
          </div>
        </div>
      )
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
      pluginId: "openrouter",
      hasConfig: true,
      renderConfig: () => (
        <div className="space-y-3 mt-4 border-t border-base-content/10 pt-4">
          <div className="form-control">
            <label className="label text-xs">API Key</label>
            <input type="password" className="input input-sm input-bordered" value={settings?.openrouter_api_key || ''} onChange={e => setSettings({ ...settings!, openrouter_api_key: e.target.value })} />
          </div>
          <div className="form-control">
            <label className="label text-xs">Model Selection</label>
            <select className="select select-sm select-bordered" value={settings?.openrouter_model || ''} onChange={e => setSettings({ ...settings!, openrouter_model: e.target.value })}>
              <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
              <option value="anthropic/claude-3-haiku">Claude 3 Haiku</option>
              <option value="openai/gpt-4o">GPT-4o</option>
              <option value="openai/gpt-4o-mini">GPT-4o-Mini</option>
            </select>
          </div>
        </div>
      )
    },
    {
      id: "discogs",
      name: "Discogs",
      icon: <Activity className="text-base-content" />,
      status: status?.discogs.configured ? 'online' : 'offline',
      details: status?.discogs.configured ? "Token configured" : "Token missing",
      description: "Vinyl-focused metadata and marketplace data.",
      pluginId: "discogs",
      hasConfig: true,
      renderConfig: () => (
        <div className="space-y-3 mt-4 border-t border-base-content/10 pt-4">
          <div className="form-control">
            <label className="label text-xs">Personal Access Token</label>
            <input type="password" className="input input-sm input-bordered" value={settings?.discogs_token || ''} onChange={e => setSettings({ ...settings!, discogs_token: e.target.value })} />
          </div>
        </div>
      )
    },
    {
      id: "stripe",
      name: "Stripe",
      icon: <CreditCard className="text-[#635BFF]" />,
      status: status?.stripe?.configured ? 'online' : 'offline',
      details: status?.stripe?.configured ? (status.stripe.webhookConfigured ? "Ready (Live Webhooks)" : "Keys Set (No Webhook)") : "Not Configured",
      description: "Credit card processing and checkout sessions.",
      pluginId: "stripe",
      hasConfig: true,
      renderConfig: () => (
        <div className="space-y-3 mt-4 border-t border-base-content/10 pt-4">
          <div className="form-control">
            <label className="label text-xs">Secret Key</label>
            <input type="password" className="input input-sm input-bordered" value={settings?.stripe_secret_key || ''} onChange={e => setSettings({ ...settings!, stripe_secret_key: e.target.value })} />
          </div>
          <div className="form-control">
            <label className="label text-xs">Webhook Secret</label>
            <input type="password" className="input input-sm input-bordered" value={settings?.stripe_webhook_secret || ''} onChange={e => setSettings({ ...settings!, stripe_webhook_secret: e.target.value })} />
          </div>
        </div>
      )
    },
    {
      id: "moonpay",
      name: "MoonPay",
      icon: <CreditCard className="text-[#a042ff]" />,
      status: status?.moonpay?.configured ? 'online' : 'offline',
      details: status?.moonpay?.configured ? "API Key configured" : "API Key missing",
      description: "Credit card to crypto on-ramp provider.",
      pluginId: "moonpay",
      hasConfig: true,
      renderConfig: () => (
        <div className="space-y-3 mt-4 border-t border-base-content/10 pt-4">
          <div className="form-control">
            <label className="label text-xs">MoonPay Secret Key</label>
            <input type="password" className="input input-sm input-bordered" value={settings?.moonpay_api_key || ''} onChange={e => setSettings({ ...settings!, moonpay_api_key: e.target.value })} />
          </div>
        </div>
      )
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
      pluginId: "youtube-playlists",
      onAuth: () => handleAuth('youtube')
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
      <input 
        type="file" 
        id="youtube-cookie-input" 
        className="hidden" 
        accept=".txt"
        onChange={handleYouTubeCookieUpload}
      />
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-bold text-xl flex items-center gap-2">
            <Activity className="text-primary" /> Service & API Integrations
          </h3>
          <p className="text-sm opacity-60">Manage API keys and monitor health of external provider modules.</p>
        </div>
        <div className="flex gap-2">
          <button 
            className={clsx("btn btn-primary gap-2", isSaving && "loading")}
            onClick={handleSaveSettings}
            disabled={isSaving || !settings}
          >
            {!isSaving && <Save size={18} />} Save Configurations
          </button>
          <button 
            className={clsx("btn btn-circle btn-ghost", refreshing && "loading")}
            onClick={loadData}
            disabled={refreshing}
          >
            {!refreshing && <RefreshCw size={20} />}
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => {
          const plugin = plugins.find(p => p.id === service.pluginId);
          const isEnabled = plugin ? plugin.enabled : true;
          
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
                    <h4 className="font-bold text-lg flex items-center gap-2 justify-between">
                        <span className="flex items-center gap-2">
                          {service.name}
                          {plugin && <span className="text-[10px] opacity-30 font-mono">v{plugin.version}</span>}
                        </span>
                        {service.hasConfig && isRootAdmin && (
                          <button 
                            className="btn btn-xs btn-ghost btn-circle"
                            onClick={() => setExpandedConfig(expandedConfig === service.id ? null : service.id)}
                            title="Configure APIs"
                          >
                            <Settings size={14} className={expandedConfig === service.id ? "text-primary" : ""} />
                          </button>
                        )}
                    </h4>
                    <p className="text-xs opacity-60 leading-relaxed h-8 line-clamp-2">{service.description}</p>
                    
                    {(service as any).onAuth && isRootAdmin && (
                        <button 
                            className="btn btn-xs btn-outline btn-primary mt-3 gap-2"
                            onClick={(service as any).onAuth}
                            disabled={isProcessing === service.id}
                        >
                            {isProcessing === service.id ? <Loader2 className="animate-spin" size={14} /> : service.icon}
                            {service.id === 'youtube' ? 'Upload Cookies' : 'Authenticate'}
                        </button>
                    )}
                </div>

                {expandedConfig === service.id && service.renderConfig && (
                  <div className="mt-2 animate-in fade-in slide-in-from-top-2">
                    {service.renderConfig()}
                  </div>
                )}

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
