import { Youtube } from 'lucide-react';
import { pluginRegistry, type FrontendPlugin } from '../../core/plugins/registry';

export const youtubePlugin: FrontendPlugin = {
    id: 'youtube',
    name: 'YouTube & Streaming',
    icon: <Youtube className="text-error" />,
    description: 'Search and rip audio from YouTube, SoundCloud, Bandcamp, and other platforms using yt-dlp',
    statusCheck: (status, plugins) => {
        // Callers may not have the backend plugins list (only the health
        // status); fall back to the youtube health probe in that case.
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
    }
};

pluginRegistry.register(youtubePlugin);
