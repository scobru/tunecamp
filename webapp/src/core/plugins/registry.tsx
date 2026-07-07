import React from 'react';
import type { SiteSettings } from '../../types';

export interface PluginConfigProps {
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

    // Inject tabs in ContentSearch (if applicable)
    searchTabs?: {
        id: string;
        label: string;
        icon: React.ReactNode;
        component: React.ComponentType<any>; // Tab content component
        colorClass?: string; // e.g., "bg-success text-success-content"
    }[];
    
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

    getSearchTabs(status?: any) {
        return this.getAll()
            .filter(p => p.searchTabs)
            .filter(p => {
                if (!status || !p.statusCheck) return true; // If no status provided, assume online
                const check = p.statusCheck(status, []); // We pass [] for plugins since frontend doesn't have the full backend plugins list here easily
                return check.status === 'online';
            })
            .flatMap(p => p.searchTabs!.map(tab => ({
                pluginId: p.id,
                ...tab
            })));
    }
}

export const pluginRegistry = new PluginRegistry();
