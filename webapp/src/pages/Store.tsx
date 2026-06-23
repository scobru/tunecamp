import { useState, useEffect } from 'react';
import { ShoppingBag, Crown, FileText, Video, Star, Download, CreditCard, Lock, Eye } from 'lucide-react';
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

export const AssetViewerModal = ({ asset, onClose }: { asset: Asset | null; onClose: () => void }) => {
    // Download URLs are async now: they carry a short-lived download token
    const [inlineUrl, setInlineUrl] = useState<string | null>(null);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!asset) return;
        let cancelled = false;
        Promise.all([
            API.getAssetDownloadUrl(asset.id, true),
            API.getAssetDownloadUrl(asset.id, false)
        ]).then(([inline, download]) => {
            if (cancelled) return;
            setInlineUrl(inline);
            setDownloadUrl(download);
        });
        return () => { cancelled = true; };
    }, [asset?.id]);

    if (!asset || !inlineUrl || !downloadUrl) return null;

    // Check type / file extension
    const isVideo = asset.type === 'video' || asset.mime_type?.startsWith('video/') || asset.file_path?.endsWith('.mp4') || asset.file_path?.endsWith('.webm') || asset.file_path?.endsWith('.mov');
    const isPdf = asset.mime_type === 'application/pdf' || asset.file_path?.endsWith('.pdf');
    const isImage = asset.mime_type?.startsWith('image/') || asset.file_path?.endsWith('.png') || asset.file_path?.endsWith('.jpg') || asset.file_path?.endsWith('.jpeg') || asset.file_path?.endsWith('.gif') || asset.file_path?.endsWith('.webp');

    return (
        <dialog className="modal modal-open">
            <div className="modal-box bg-base-100 border border-base-content/5 w-11/12 max-w-4xl rounded-2xl shadow-level-1 p-6 relative">
                <button 
                    className="btn btn-sm btn-circle btn-ghost absolute right-4 top-4 rounded-full"
                    onClick={onClose}
                >
                    ✕
                </button>

                <h3 className="font-bold text-xl mb-4 text-prominent">{asset.title}</h3>
                
                <div className="bg-neutral/5 rounded-xl border border-base-content/5 overflow-hidden flex items-center justify-center p-2 min-h-[300px]">
                    {isVideo ? (
                        <video controls src={inlineUrl} className="w-full max-h-[70vh] rounded-lg shadow-sm" autoPlay />
                    ) : isPdf ? (
                        <iframe src={inlineUrl} className="w-full h-[65vh] rounded-lg border-0" title={asset.title} />
                    ) : isImage ? (
                        <img src={inlineUrl} alt={asset.title} className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm" />
                    ) : (
                        <div className="text-center py-12 space-y-4">
                            <FileText size={48} className="mx-auto opacity-30" />
                            <p className="text-sm opacity-60 font-medium">This file type ({asset.mime_type || 'digital'}) cannot be previewed directly in the browser.</p>
                            <a 
                                href={downloadUrl} 
                                className="btn btn-primary rounded-full gap-2"
                                download
                            >
                                <Download size={16} /> Download File
                            </a>
                        </div>
                    )}
                </div>

                <div className="modal-action flex items-center justify-between border-t border-base-content/5 pt-4 mt-4">
                    <p className="text-xs opacity-50 truncate max-w-md">
                        {asset.description || 'No description provided.'}
                    </p>
                    <div className="flex gap-2">
                        <button className="btn btn-sm btn-ghost rounded-full" onClick={onClose}>Close</button>
                        {(isVideo || isPdf || isImage) && (
                            <a 
                                href={downloadUrl} 
                                className="btn btn-sm btn-success rounded-full gap-1"
                                download
                            >
                                <Download size={14} /> Download
                            </a>
                        )}
                    </div>
                </div>
            </div>
            <div className="modal-backdrop bg-black/40" onClick={onClose}></div>
        </dialog>
    );
};

export const AssetCard = ({ asset, hasSubscription, onBuy, onPreview }: { asset: Asset; hasSubscription: boolean; onBuy: (asset: Asset) => void; onPreview: (asset: Asset) => void }) => {
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
            API.getAssetDownloadUrl(asset.id, false).then(url => window.open(url, '_blank'));
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

                <div className="flex items-center justify-between gap-1.5">
                    <span className={`font-bold text-sm ${isFree || isUnlocked ? 'text-success' : 'text-primary'}`}>
                        {priceLabel}
                    </span>
                    <div className="flex gap-1.5">
                        {(isUnlocked || isFree) && (
                            <button
                                className="btn btn-xs btn-outline btn-success rounded-full gap-1"
                                onClick={() => onPreview(asset)}
                            >
                                <Eye size={11} /> Preview
                            </button>
                        )}
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
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [enabled, setEnabled] = useState(true);
    const [priceUsd, setPriceUsd] = useState(10);
    const hasSubscription = subscribed || !!(user as any)?.subscriptionStatus === true;

    useEffect(() => {
        const load = async () => {
            try {
                const [s, data] = await Promise.all([
                    API.getSiteSettings(),
                    API.getPublicAssets()
                ]);
                if (s.hideStore === true || s.hideStore === "true") {
                    setEnabled(false);
                }
                const p = parseFloat(s.membershipMonthlyPrice as any);
                if (!isNaN(p) && p > 0) setPriceUsd(p);
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
            window.dispatchEvent(new CustomEvent('open-checkout-modal', { detail: { track: checkoutItem } }));
        }
    };

    const filtered = assets.filter(a => {
        if (filter !== 'all' && a.type !== filter) return false;
        if (search && !a.title.toLowerCase().includes(search.toLowerCase()) &&
            !(a.artist_name || a.artistName || '').toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    if (!enabled) {
        return (
            <div className="space-y-8 animate-fade-in">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <ShoppingBag size={32} className="text-primary" /> Store
                    </h1>
                </div>
                <div className="alert alert-warning max-w-xl shadow-level-1 rounded-xl">
                    <ShoppingBag size={18} />
                    <span>The store is disabled on this instance.</span>
                </div>
            </div>
        );
    }

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
                                <p className="text-sm opacity-60">${priceUsd}/month · Unlock all content & membership assets</p>
                            </div>
                        </div>
                        <button className="btn btn-primary rounded-full gap-2 shadow-md" onClick={openSubscription}>
                            <Crown size={16} /> Subscribe — ${priceUsd}/mo
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
                            onPreview={setPreviewAsset}
                        />
                    ))}
                </div>
            )}

            <SubscriptionModal onSubscribed={() => setSubscribed(true)} />
            {previewAsset && <AssetViewerModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />}
        </div>
    );
};

export default Store;
