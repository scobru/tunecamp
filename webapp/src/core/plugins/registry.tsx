import React from 'react';
import type { SiteSettings } from '../../types';

interface PluginConfigProps {
    settings: SiteSettings;
    setSettings: (settings: SiteSettings) => void;
}

export interface FrontendPlugin {
    id: string; // Must match backend plugin/service ID
    name: string;
    icon: React.ReactNode;
    description: string;
    
    // Maps to backend status field checks (online/offline)
    statusCheck?: (backendStatus: any, backendPlugins: any[]) => {
        status: 'online' | 'offline';
        details: string;
    };

    // Inject form fields in IntegrationsPanel
    configPanel?: React.ComponentType<PluginConfigProps>;
    
    // Custom actions for IntegrationsPanel (e.g., Auth, Upload Cookies)
    customAction?: {
        label: string;
        icon?: React.ReactNode;
        onClick: () => void;
    };
}

class PluginRegistry {
    private plugins = new Map<string, FrontendPlugin>();
    
    register(plugin: FrontendPlugin) {
        if (this.plugins.has(plugin.id)) {
            console.warn(`[PluginRegistry] Plugin ${plugin.id} is already registered. Overwriting.`);
        }
        this.plugins.set(plugin.id, plugin);
    }
    
    get(id: string): FrontendPlugin | undefined {
        return this.plugins.get(id);
    }

    getAll(): FrontendPlugin[] {
        return Array.from(this.plugins.values());
    }

}

export const pluginRegistry = new PluginRegistry();
