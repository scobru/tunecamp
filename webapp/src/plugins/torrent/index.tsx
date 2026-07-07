import React from 'react';
import { Download, RefreshCw, Upload } from 'lucide-react';
import { pluginRegistry, type FrontendPlugin } from '../../core/plugins/registry';

export const torrentPlugin: FrontendPlugin = {
    id: 'torrent',
    name: 'BitTorrent',
    icon: <Download className="text-success" />,
    description: 'Download music via magnet links (WebTorrent). Enable only for content you own the rights to.',
    statusCheck: (_, plugins) => {
        const enabled = plugins.find(p => p.id === 'torrent')?.enabled;
        return {
            status: enabled ? 'online' : 'offline',
            details: enabled ? "Enabled — use only for content you own" : "Disabled (default)"
        };
    },
    searchTabs: [
        {
            id: 'torrents',
            label: 'WebTorrent',
            icon: <RefreshCw className="mr-2" size={16} />,
            component: () => null
        },
        {
            id: 'seeding',
            label: 'Seeding',
            icon: <Upload className="mr-2" size={16} />,
            colorClass: 'bg-success text-success-content',
            component: () => null
        }
    ]
};

pluginRegistry.register(torrentPlugin);
