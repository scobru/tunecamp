import { useState, useEffect } from 'react';
import { PackagePlus, ShoppingBag, Pencil, FileText, Video, Star } from 'lucide-react';
import API from '../../services/api';
import { AdminAssetModal } from '../modals/AdminAssetModal';
import type { Asset } from '../../types';

const TYPE_ICON: Record<string, any> = {
    digital: FileText,
    video: Video,
    membership: Star,
};

const TYPE_LABEL: Record<string, string> = {
    digital: 'Digital',
    video: 'Video',
    membership: 'Membership',
};

export const AdminAssetsList = () => {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const data = await API.getAdminAssets();
            setAssets(data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        load();
        const handler = () => load();
        window.addEventListener('refresh-assets', handler);
        return () => window.removeEventListener('refresh-assets', handler);
    }, []);

    const openNew = () => document.dispatchEvent(new CustomEvent('open-admin-asset-modal', { detail: null }));
    const openEdit = (asset: Asset) => document.dispatchEvent(new CustomEvent('open-admin-asset-modal', { detail: asset }));

    const filtered = assets.filter(a =>
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        (a.artist_name || a.artistName || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <ShoppingBag size={20} className="text-primary" />
                    <h2 className="text-lg font-bold">Store Assets</h2>
                    <span className="badge badge-sm badge-ghost">{assets.length}</span>
                </div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Search..."
                        className="input input-sm input-bordered rounded-full w-48"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <button className="btn btn-sm btn-primary rounded-full gap-1.5" onClick={openNew}>
                        <PackagePlus size={14} /> New Asset
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-12"><span className="loading loading-spinner loading-md" /></div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 opacity-40 space-y-2">
                    <ShoppingBag size={40} className="mx-auto" />
                    <p className="font-medium">{assets.length === 0 ? 'No assets yet. Create your first one!' : 'No results for your search.'}</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="table table-sm w-full">
                        <thead>
                            <tr className="text-xs opacity-50">
                                <th>Asset</th>
                                <th>Type</th>
                                <th>Artist</th>
                                <th>Price</th>
                                <th>Visibility</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(asset => {
                                const Icon = TYPE_ICON[asset.type] || FileText;
                                const artistName = asset.artist_name || asset.artistName;
                                let priceLabel = 'Free';
                                if (asset.price_usdc || asset.priceUsdc) {
                                    priceLabel = `$${asset.price_usdc || asset.priceUsdc} USDC`;
                                } else if (asset.price) {
                                    priceLabel = `${asset.price} ${asset.currency || 'ETH'}`;
                                }

                                return (
                                    <tr key={asset.id} className="hover cursor-pointer" onClick={() => openEdit(asset)}>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                                    {asset.cover_path || asset.coverPath ? (
                                                        <img src={`/api/assets/cover/${asset.id}`} alt="" className="w-full h-full object-cover rounded-lg" />
                                                    ) : (
                                                        <Icon size={16} className="text-primary" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-sm">{asset.title}</div>
                                                    {(asset.requires_subscription || asset.requiresSubscription) && (
                                                        <span className="text-xs text-primary font-bold">FREE w/ subscription</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="badge badge-xs badge-ghost gap-1">
                                                <Icon size={10} />
                                                {TYPE_LABEL[asset.type] || asset.type}
                                            </span>
                                        </td>
                                        <td><span className="text-sm opacity-70">{artistName || '—'}</span></td>
                                        <td><span className="text-sm font-mono">{priceLabel}</span></td>
                                        <td>
                                            <span className={`badge badge-xs ${asset.visibility === 'public' ? 'badge-success' : asset.visibility === 'unlisted' ? 'badge-warning' : 'badge-ghost'}`}>
                                                {asset.visibility}
                                            </span>
                                        </td>
                                        <td>
                                            <button className="btn btn-xs btn-ghost rounded-full" onClick={e => { e.stopPropagation(); openEdit(asset); }}>
                                                <Pencil size={12} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <AdminAssetModal onSaved={() => { load(); window.dispatchEvent(new CustomEvent('refresh-assets')); }} />
        </div>
    );
};
