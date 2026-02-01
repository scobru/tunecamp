import { useState, useEffect } from 'react';
import API from '../services/api';
import { Globe, Server, Music, ExternalLink } from 'lucide-react';
import { GleamUtils } from '../utils/gleam';
import type { NetworkSite, NetworkTrack } from '../types';

export const Network = () => {
    const [sites, setSites] = useState<NetworkSite[]>([]);
    const [tracks, setTracks] = useState<NetworkTrack[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [sitesData, tracksData] = await Promise.all([
                    API.getNetworkSites(),
                    API.getNetworkTracks()
                ]);
                setSites(sitesData);
                setTracks(tracksData);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    if (loading) return <div className="p-8 text-center opacity-50">Scanning network...</div>;

    return (
        <div className="space-y-8 animate-fade-in">
            <header className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <Globe size={32} className="text-blue-400"/> Network
                </h1>
                <p className="opacity-60 max-w-2xl">
                    Discover content from other TuneCamp instances in the federated network.
                </p>
            </header>

            {/* Sites */}
            <section>
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Server size={20}/> 
                    Discovered Instances <span className="badge badge-neutral">{sites.length}</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sites.map((site, i) => (
                        <div key={i} className="card bg-base-200 border border-white/5 hover:border-blue-400/50 transition-colors">
                            <div className="card-body p-4">
                                <h3 className="font-bold flex items-center gap-2">
                                    {site.name} 
                                    <a href={site.url} target="_blank" rel="noopener noreferrer" className="btn btn-xs btn-ghost btn-square">
                                        <ExternalLink size={12}/>
                                    </a>
                                </h3>
                                <p className="text-xs opacity-60 line-clamp-2">{site.description || site.url}</p>
                                <div className="flex gap-2 mt-2 text-xs font-mono opacity-50">
                                    <span>v{site.version}</span>
                                    <span>•</span>
                                    <span>{GleamUtils.formatTimeAgo(new Date(site.lastSeen).getTime())}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Recent Remote Tracks */}
            <section>
                 <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Music size={20}/> 
                    Recent Network Activity
                </h2>
                 <div className="overflow-x-auto">
                    <table className="table table-sm">
                        <thead>
                            <tr>
                                <th>Track</th>
                                <th>Artist</th>
                                <th>Instance</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {tracks.map((item, i) => (
                                <tr key={i} className="hover:bg-white/5">
                                    <td className="font-bold">{item.track.title}</td>
                                    <td>{item.track.artistName}</td>
                                    <td>
                                        <div className="badge badge-outline gap-1">
                                            <Globe size={10}/> {item.siteName}
                                        </div>
                                    </td>
                                    <td className="text-right">
                                         <a href={item.siteUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs">
                                            Visit
                                         </a>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
            </section>
        </div>
    );
};

export default Network;
