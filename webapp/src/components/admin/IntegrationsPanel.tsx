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
  Save,
  Puzzle
} from "lucide-react";
import { useConfigStore } from "../../stores/useConfigStore";
import { useAuthStore } from "../../stores/useAuthStore";
import API from "../../services/api";
import { notify } from "../../utils/notify";
import clsx from "clsx";
import { pluginRegistry } from "../../core/plugins";
import type { SiteSettings } from "../../types";

interface PluginInfo {
    id: string;
    name: string;
    version: string;
    description: string;
    enabled: boolean;
    service: string;
    types: string[];
    isExternal: boolean;
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
        notify.error(e, "Action failed");
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
        notify.success(res.message);
        fetchStatus();
    } catch (e: any) {
        console.error("Upload failed:", e);
        notify.error(e, "Upload failed");
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
        notify.error(e, "Auth failed");
    } finally {
        setIsProcessing(null);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      await API.updateSettings(settings);
      notify.success("API settings saved successfully.");
      await loadData();
    } catch (e: any) {
      console.error(e);
      notify.error(e, "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const services = pluginRegistry.getAll();

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
          const plugin = plugins.find(p => p.id === service.id);
          const isEnabled = plugin ? plugin.enabled : true;
          const statusInfo = service.statusCheck ? service.statusCheck(status, plugins) : { status: isEnabled ? 'online' : 'offline', details: isEnabled ? 'Enabled' : 'Disabled' };

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
                        statusInfo.status === 'online' ? "bg-success shadow-success/40" : "bg-error shadow-error/40"
                    )} />
                  </div>
                </div>

                <div className="space-y-1">
                    <h4 className="font-bold text-lg flex items-center gap-2 justify-between">
                        <span className="flex items-center gap-2">
                          {service.name}
                          {plugin && <span className="text-xs opacity-30 font-mono">v{plugin.version}</span>}
                        </span>
                        {service.configPanel && isRootAdmin && (
                          <button
                            className="btn btn-xs btn-ghost btn-circle tooltip tooltip-left"
                            onClick={() => setExpandedConfig(expandedConfig === service.id ? null : service.id)}
                            data-tip="Configure APIs"
                          >
                            <Settings size={14} className={expandedConfig === service.id ? "text-primary" : ""} />
                          </button>
                        )}
                    </h4>
                    <p className="text-xs opacity-60 leading-relaxed h-8 line-clamp-2">{service.description}</p>

                    {service.customAction && isRootAdmin && (
                        <button
                            className="btn btn-xs btn-outline btn-primary mt-3 gap-2"
                            onClick={service.customAction.onClick}
                            disabled={isProcessing === service.id}
                        >
                            {isProcessing === service.id ? <Loader2 className="animate-spin" size={14} /> : (service.customAction.icon || service.icon)}
                            {service.customAction.label}
                        </button>
                    )}
                </div>

                {expandedConfig === service.id && service.configPanel && (
                  <div className="mt-2 animate-in fade-in slide-in-from-top-2">
                    <service.configPanel settings={settings!} setSettings={setSettings} />
                  </div>
                )}

                <div className={clsx(
                    "mt-4 text-[10px] font-mono p-2.5 rounded-lg border flex items-center justify-between gap-2 transition-colors",
                    statusInfo.status === 'online'
                        ? "bg-success/5 border-success/10 text-success"
                        : "bg-error/5 border-error/10 text-error/80"
                )}>
                  <div className="flex items-center gap-2 overflow-hidden">
                      {statusInfo.status === 'online' ? <CheckCircle2 size={12} className="shrink-0" /> : <AlertCircle size={12} className="shrink-0" />}
                      <span className="truncate">{statusInfo.details}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* External plugins loaded from the plugins/ directory */}
      {(() => {
        const external = plugins.filter(p => p.isExternal);
        if (external.length === 0) return null;
        return (
          <div className="space-y-4">
            <h4 className="font-semibold text-sm opacity-50 uppercase tracking-widest flex items-center gap-2">
              <Puzzle size={14} /> External Plugins
            </h4>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {external.map(plugin => (
                <div key={plugin.id} className={clsx(
                  "card card-m3 border transition-all duration-300",
                  plugin.enabled ? "bg-base-200/50 border-base-content/5" : "bg-base-300/30 border-base-content/10 grayscale opacity-60"
                )}>
                  <div className="card-body p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-3 bg-base-100 rounded-xl shadow-sm">
                        <Puzzle className="text-accent" size={20} />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="form-control">
                          <label className="label cursor-pointer p-0 gap-2">
                            {isProcessing === plugin.id ? (
                              <Loader2 className="animate-spin opacity-50" size={18} />
                            ) : (
                              <input
                                type="checkbox"
                                className="toggle toggle-primary toggle-sm"
                                checked={plugin.enabled}
                                onChange={() => handleToggle(plugin.id, plugin.enabled)}
                              />
                            )}
                          </label>
                        </div>
                        <div className={clsx(
                          "w-2.5 h-2.5 rounded-full",
                          plugin.enabled ? "bg-success" : "bg-base-content/20"
                        )} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-lg flex items-center gap-2">
                        {plugin.name}
                        <span className="text-xs opacity-30 font-mono">v{plugin.version}</span>
                      </h4>
                      <p className="text-xs opacity-60 leading-relaxed line-clamp-2">
                        {plugin.description || `External ${plugin.types.join('+')} provider`}
                      </p>
                    </div>
                    <div className="mt-4 text-[10px] font-mono p-2.5 rounded-lg border bg-base-content/5 border-base-content/10 text-base-content/50 flex items-center gap-2">
                      <span className="opacity-60">type:</span> {plugin.types.join(' · ')}
                      <span className="ml-auto opacity-40">{plugin.id}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
