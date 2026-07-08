
import { Download, Activity } from 'lucide-react';
import { pluginRegistry, type FrontendPlugin } from '../../core/plugins/registry';
import { SoulseekSearchTab } from './SearchTab';
import { SoulseekDownloadsTab } from './DownloadsTab';

const SoulseekConfigPanel = ({ settings, setSettings }: any) => (
    <div className="space-y-3 mt-4 border-t border-base-content/10 pt-4">
        <div className="form-control">
            <label className="label text-xs">Username</label>
            <input 
                type="text" 
                className="input input-sm input-bordered" 
                value={settings?.soulseek_username || ''} 
                onChange={e => setSettings({ ...settings, soulseek_username: e.target.value })} 
            />
        </div>
        <div className="form-control">
            <label className="label text-xs">Password</label>
            <input 
                type="password" 
                className="input input-sm input-bordered" 
                value={settings?.soulseek_password || ''} 
                onChange={e => setSettings({ ...settings, soulseek_password: e.target.value })} 
            />
        </div>
    </div>
);

export const soulseekPlugin: FrontendPlugin = {
    id: 'soulseek',
    name: 'Soulseek',
    icon: <Download className="text-accent" />,
    description: 'P2P music search and download service.',
    statusCheck: (status) => ({
        status: status?.soulseek?.connected ? 'online' : 'offline',
        details: status?.soulseek?.connected ? `Connected as ${status.soulseek.username}` : "Not connected"
    }),
    configPanel: SoulseekConfigPanel,
    searchTabs: [
        {
            id: 'soulseek',
            label: 'Soulseek',
            icon: <Activity className="mr-2" size={16} />,
            component: SoulseekSearchTab
        },
        {
            id: 'downloads',
            label: 'Transfers',
            icon: <Download className="mr-2" size={16} />,
            component: SoulseekDownloadsTab
        }
    ]
};

pluginRegistry.register(soulseekPlugin);
