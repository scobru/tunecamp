import { useState, useEffect } from 'react';
import { ShoppingBag, Crown, FileText, Video, Star, Download, CreditCard, Lock } from 'lucide-react';
import API from '../services/api';
import { useAuthStore } from '../stores/useAuthStore';
import { SubscriptionModal } from '../components/modals/SubscriptionModal';
import type { Asset } from '../types';

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

const AssetCard = ({ asset, hasSubscription, onBuy }: { asset: Asset; hasSubscription: boolean; onBuy: (asset: Asset) => void }) => {
    const Icon = TYPE_ICON[asset.type] || FileText;
    const isFreeWithSub = !!(asset.requires_subscription || asset.requiresSubscription);
    const isFree = !asset.price && !asset.price_usdc && !asset.priceUsdc && !isFreeWithSub;
    const isUnlocked = isFree || (isFreeWithSub && hasSubscription);

    const priceLabel = isFreeWithSub
        ? (hasSubscription ? 'Included' : 'Sub only')
        : (asset.price_usdc || asset.priceUsdc)
            ? `$${asset.price_usdc || asset.priceUsdc} USDC`
            : asset.price
                ? `${asset.price} ${asset.currency || 'ETH'}`
                : 'Free';

    const coverSrc = (asset.cover_path || asset.coverPath) ? `/api/assets/cover/${asset.id}` : null;

    const handleAction = () => {
        if (isUnlocked || isFree) {
            window.open(`/api/payments/download/asset/${asset.id}`, '_blank');
        } else {
            onBuy(asset);
        }
    };

    return (
        <div className="card bg-base-100 border border-base-content/5 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 overflow-hidden">
            {/* Cover */}
            <div className="aspect-video bg-gradient-to-br from-primary/10 to-base-200 relative overflow-hidden">
                {coverSrc ? (
                    <img src={coverSrc} alt={asset.title} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Icon size={36} className="opacity-20" />
                    </div>
                )}
                {isFreeWithSub && !hasSubscription && (
                    <div className="absolute top-2 right-2">
                        <span className="badge badge-sm badge-primary gap-1 shadow"><Crown size={10} /> Sub</span>
                    </div>
                )}
            </div>

            <div className="p-4 space-y-3">
                <div>
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-sm leading-tight">{asset.title}</h3>
                        <span className="badge badge-xs badge-ghost flex-shrink-0 gap-1">
                            <Icon size={9} />{TYPE_LABEL[asset.type] || asset.type}
                        </span>
                    </div>
                    {(asset.artist_name || asset.artistName) && (
                        <p className="text-xs opacity-50 mt-0.5">{asset.artist_name || asset.artistName}</p>
                    )}
                    {asset.description && (
                        <p className="text-xs opacity-60 mt-1 line-clamp-2">{asset.description}</p>
                    )}
                </div>

                <div className="flex items-center justify-between">
                    <span className={`font-bold text-sm ${isFree || isUnlocked ? 'text-success' : 'text-primary'}`}>
                        {priceLabel}
                    </span>
                    <button
                        className={`btn btn-xs rounded-full gap-1 ${isUnlocked || isFree ? 'btn-success' : 'btn-primary'}`}
                        onClick={handleAction}
                    >
                        {isUnlocked || isFree ? <Download size={11} /> : isFreeWithSub ? <Lock size={11} /> : <CreditCard size={11} />}
                        {isUnlocked || isFree ? 'Download' : isFreeWithSub ? 'Subscribe' : 'Buy'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const Store = () => {
    const { user } = useAuthStore();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'digital' | 'video' | 'membership'>('all');
    const [search, setSearch] = useState('');
    const [subscribed, setSubscribed] = useState(false);
    const hasSubscription = subscribed || !!(user as any)?.subscriptionStatus === true;

    useEffect(() => {
        const load = async () => {
            try {
                const data = await API.getPublicAssets();
                setAssets(data);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        load();

        // Check if redirected from subscription success
        const params = new URLSearchParams(window.location.search);
        if (params.get('subscribed') === '1') setSubscribed(true);
    }, []);

    const openSubscription = () => document.dispatchEvent(new CustomEvent('open-subscription-modal'));

    const handleBuy = (asset: Asset) => {
        const isFreeWithSub = !!(asset.requires_subscription || asset.requiresSubscription);
        if (isFreeWithSub) {
            openSubscription();
        } else {
            // Dispatch checkout event reusing CheckoutModal
            const checkoutItem = {
                id: String(asset.id),
                title: asset.title,
                artist: asset.artist_name || asset.artistName || '',
                price: asset.price,
                priceUsdc: asset.price_usdc || asset.priceUsdc,
                currency: asset.currency,
                _assetType: true,
            };
            document.dispatchEvent(new CustomEvent('open-checkout-modal', { detail: checkoutItem }));
        }
    };

    const filtered = assets.filter(a => {
        if (filter !== 'all' && a.type !== filter) return false;
        if (search && !a.title.toLowerCase().includes(search.toLowerCase()) &&
            !(a.artist_name || a.artistName || '').toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <ShoppingBag size={32} className="text-primary" /> Store
                </h1>
            </div>

            {/* Subscription banner */}
            {!subscribed && (
                <div className="card bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/20">
                    <div className="card-body py-5 flex-row items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <Crown size={22} className="text-primary" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">Monthly Subscription</h3>
                                <p className="text-sm opacity-60">$10/month · Unlock all content & membership assets</p>
                            </div>
                        </div>
                        <button className="btn btn-primary rounded-full gap-2 shadow-md" onClick={openSubscription}>
                            <Crown size={16} /> Subscribe — $10/mo
                        </button>
                    </div>
                </div>
            )}

            {subscribed && (
                <div className="alert alert-success rounded-2xl">
                    <Crown size={18} />
                    <span className="font-bold">Subscription active! All membership content is unlocked.</span>
                </div>
            )}

            {/* Filters */}
            <div className="flex gap-3 flex-wrap items-center">
                <div className="flex gap-1 bg-base-200 p-1 rounded-full">
                    {(['all', 'digital', 'video', 'membership'] as const).map(f => (
                        <button
                            key={f}
                            className={`btn btn-xs rounded-full capitalize ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setFilter(f)}
                        >
                            {f}
                        </button>
                    ))}
                </div>
                <input
                    type="text"
                    placeholder="Search assets..."
                    className="input input-sm input-bordered rounded-full flex-1 max-w-xs"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {/* Grid */}
            {loading ? (
                <div className="flex justify-center p-16"><span className="loading loading-spinner loading-lg" /></div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 opacity-30 space-y-3">
                    <ShoppingBag size={48} className="mx-auto" />
                    <p className="text-lg font-bold">{assets.length === 0 ? 'No assets available yet.' : 'No results.'}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filtered.map(asset => (
                        <AssetCard
                            key={asset.id}
                            asset={asset}
                            hasSubscription={hasSubscription}
                            onBuy={handleBuy}
                        />
                    ))}
                </div>
            )}

            <SubscriptionModal onSubscribed={() => setSubscribed(true)} />
        </div>
    );
};

export default Store;
