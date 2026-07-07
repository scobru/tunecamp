
import { Youtube, Globe } from 'lucide-react';
import { pluginRegistry } from '../../core/plugins/registry';

pluginRegistry.register({
    id: 'youtube', name: 'YouTube', icon: <Youtube className="text-[#FF0000]" />,
    description: 'Resilient streaming via yt-dlp with fallbacks.',
    statusCheck: (status) => ({ status: status?.youtube?.online ? 'online' : 'offline', details: status?.youtube?.online ? "Service reachable" : "Service unreachable" }),
    customAction: {
        label: 'Upload Cookies',
        onClick: () => document.getElementById('youtube-cookie-input')?.click()
    },
    searchTabs: [{
        id: 'streaming',
        label: 'Streaming',
        icon: <Globe className="mr-2" size={16} />,
        component: () => null
    }]
});
