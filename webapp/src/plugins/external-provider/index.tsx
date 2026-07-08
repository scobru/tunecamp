import React from 'react';
import { Puzzle } from 'lucide-react';
import { pluginRegistry } from '../../core/plugins/registry';
import { ExternalProviderSearchTab } from './ExternalProviderSearchTab';
import API from '../../services/api';

/**
 * Auto-registers a search tab for every external DownloadProvider.
 *
 * Fetches the plugin list once, filters for external download-type providers,
 * and registers a FrontendPlugin per provider. ContentSearch picks them up
 * via pluginRegistry.getSearchTabs() — the community plugin author writes
 * zero frontend code.
 */
let registered = false;

// ponytail: one-shot fetch, no state machine, no polling
(async () => {
    if (registered) return;
    registered = true;

    try {
        const plugins = await API.getPlugins();
        const externalDownloads = plugins.filter(
            (p: any) => p.isExternal && p.enabled && p.types?.includes('download')
        );

        for (const plugin of externalDownloads) {
            // Skip if already registered (e.g. Soulseek has its own dedicated tab)
            if (pluginRegistry.get(plugin.id)) continue;

            pluginRegistry.register({
                id: plugin.id,
                name: plugin.name,
                icon: <Puzzle size={18} />,
                description: plugin.description || `External download provider`,
                searchTabs: [{
                    id: `provider-${plugin.id}`,
                    label: plugin.name,
                    icon: <Puzzle size={16} />,
                    component: () => <ExternalProviderSearchTab providerId={plugin.id} />,
                    colorClass: 'bg-accent text-accent-content',
                }],
            });
        }
    } catch {
        // Silent fail — plugins endpoint requires admin, non-admins won't see tabs
    }
})();
