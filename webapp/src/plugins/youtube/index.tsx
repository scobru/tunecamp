import { Youtube, Globe } from 'lucide-react';
import { pluginRegistry, type FrontendPlugin } from '../../core/plugins/registry';
import { StreamingSearchTab } from './SearchTab';

export const youtubePlugin: FrontendPlugin = {
    id: 'youtube',
    name: 'YouTube & Streaming',
    icon: <Youtube className="text-error" />,
    description: 'Search and rip audio from YouTube, SoundCloud, Bandcamp, and other platforms using yt-dlp',
    statusCheck: (status, plugins) => {
        // ContentSearch calls statusCheck without the backend plugins list
        // (it only has the health status); fall back to the youtube health
        // probe there so the Streaming tab doesn't silently disappear.
        const entry = plugins.find(p => p.id === 'youtube');
        const enabled = entry ? !!entry.enabled : status?.youtube?.online !== false;
        return {
            status: enabled ? 'online' : 'offline',
            details: enabled ? "Enabled — ready to download streams" : "Disabled"
        };
    },
    customAction: {
        label: 'Upload Cookies',
        onClick: () => document.getElementById('youtube-cookie-input')?.click()
    },
    searchTabs: [
        {
            id: 'streaming',
            label: 'Streaming',
            icon: <Globe className="mr-2" size={16} />,
            component: StreamingSearchTab
        }
    ]
};

pluginRegistry.register(youtubePlugin);
