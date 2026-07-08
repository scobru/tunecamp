import { Download, Upload, Server } from 'lucide-react';
import { pluginRegistry, type FrontendPlugin } from '../../core/plugins/registry';
import { TorrentSearchTab } from './SearchTab';
import { TorrentSeedingTab } from './SeedingTab';

const TorrentConfigPanel = ({ settings, setSettings }: any) => {
    return (
        <div className="space-y-3 mt-4 border-t border-base-content/10 pt-4">
            <div className="form-control">
                <label className="label cursor-pointer justify-start gap-4">
                    <input 
                        type="checkbox" 
                        className="toggle toggle-primary"
                        checked={settings.torrentEnabled !== false}
                        onChange={e => setSettings({ ...settings, torrentEnabled: e.target.checked })}
                    />
                    <span className="label-text">Enable Torrent / DHT network</span>
                </label>
            </div>
        </div>
    );
};

export const torrentPlugin: FrontendPlugin = {
    id: 'torrent',
    name: 'Torrent Network',
    icon: <Server className="text-primary" size={24} />,
    description: 'Decentralised P2P downloads and seeding via WebTorrent',
    
    statusCheck: (status) => {
        if (!status.torrent) return { status: 'offline', details: 'Not configured' };
        
        if (status.torrent.connected) {
            const peers = status.torrent.totalPeers || 0;
            return { 
                status: 'online', 
                details: `Connected (${peers} peers)` 
            };
        }
        return { status: 'offline', details: 'Disconnected' };
    },

    configPanel: TorrentConfigPanel,

    searchTabs: [
        {
            id: 'torrents',
            label: 'Torrents',
            icon: <Download className="mr-2" size={16} />,
            component: TorrentSearchTab
        },
        {
            id: 'seeding',
            label: 'Seeding',
            icon: <Upload className="mr-2" size={16} />,
            component: TorrentSeedingTab,
            colorClass: 'bg-success text-success-content'
        }
    ]
};

pluginRegistry.register(torrentPlugin);
