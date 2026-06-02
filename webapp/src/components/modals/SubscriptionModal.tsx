import { useState, useRef, useEffect } from 'react';
import { Crown, CreditCard, Wallet, CheckCircle2, Loader2 } from 'lucide-react';
import { useWalletStore } from '../../stores/useWalletStore';
import { useAuthStore } from '../../stores/useAuthStore';
import API from '../../services/api';
import { ethers } from 'ethers';

const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ERC20_ABI = [
    'function transfer(address to, uint256 amount) external returns (bool)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address owner) view returns (uint256)',
];
const SUBSCRIPTION_PRICE_USDC = 10; // $10/month

export const SubscriptionModal = ({ onSubscribed }: { onSubscribed?: () => void }) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const { user } = useAuthStore();
    const { wallet, address, isWalletReady, useExternalWallet, externalAddress, isExternalConnected } = useWalletStore();

    const [tab, setTab] = useState<'crypto' | 'card'>('crypto');
    const [paymentMethod, setPaymentMethod] = useState<'ETH' | 'USDC'>('USDC');
    const [isProcessing, setIsProcessing] = useState(false);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [hasStripe, setHasStripe] = useState(false);
    const [treasuryAddress, setTreasuryAddress] = useState<string | null>(null);
    const [usdRate, setUsdRate] = useState<number | null>(null);

    const activeAddress = useExternalWallet && isExternalConnected ? externalAddress : address;

    useEffect(() => {
        const handleOpen = () => {
            setTxHash(null); setError(''); setIsProcessing(false);
            dialogRef.current?.showModal();
        };
        document.addEventListener('open-subscription-modal', handleOpen);
        return () => document.removeEventListener('open-subscription-modal', handleOpen);
    }, []);

    useEffect(() => {
        API.getOnrampConfig?.().then((cfg: any) => {
            setHasStripe(!!cfg?.stripeCheckout);
        }).catch(() => {});

        API.getSiteSettings?.().then((s: any) => {
            if (s?.adminTreasuryAddress) setTreasuryAddress(s.adminTreasuryAddress);
            else if (s?.walletAddress) setTreasuryAddress(s.walletAddress);
        }).catch(() => {});

        fetch('/api/payments/rate/USD').then(r => r.json()).then(d => setUsdRate(d.rate || null)).catch(() => {});
    }, []);

    const handleCryptoPayment = async () => {
        if (!isWalletReady && !isExternalConnected) { setError('Connect wallet first'); return; }
        if (!treasuryAddress) { setError('Treasury address not configured'); return; }
        setIsProcessing(true); setError('');

        try {
            let provider: ethers.BrowserProvider | ethers.JsonRpcProvider;
            let signer: ethers.Signer;

            if (useExternalWallet && isExternalConnected && (window as any).ethereum) {
                provider = new ethers.BrowserProvider((window as any).ethereum);
                signer = await provider.getSigner();
            } else if (wallet) {
                provider = new ethers.JsonRpcProvider(process.env.TUNECAMP_RPC_URL || 'https://mainnet.base.org');
                signer = new ethers.Wallet(wallet.privateKey || '', provider);
            } else {
                throw new Error('No wallet available');
            }

            let hash: string;

            if (paymentMethod === 'USDC') {
                const usdc = new ethers.Contract(BASE_USDC_ADDRESS, ERC20_ABI, signer);
                const decimals = await usdc.decimals();
                const amount = ethers.parseUnits(String(SUBSCRIPTION_PRICE_USDC), decimals);
                const tx = await usdc.transfer(treasuryAddress, amount);
                hash = tx.hash;
                setTxHash(hash);
                await tx.wait();
            } else {
                if (!usdRate) throw new Error('ETH rate unavailable');
                const ethAmount = SUBSCRIPTION_PRICE_USDC / usdRate;
                const tx = await signer.sendTransaction({
                    to: treasuryAddress,
                    value: ethers.parseEther(ethAmount.toFixed(8)),
                });
                hash = tx.hash;
                setTxHash(hash);
                await tx.wait();
            }

            const result: any = await API.verifySubscription(hash);
            if (result?.success) {
                onSubscribed?.();
                setTimeout(() => dialogRef.current?.close(), 2000);
            } else {
                setError('Verification failed. Contact support with your tx hash.');
            }
        } catch (e: any) {
            setError(e.message || 'Transaction failed');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleStripePayment = async () => {
        if (!user) { setError('Login required'); return; }
        setIsProcessing(true); setError('');
        try {
            const result: any = await API.createSubscriptionSession(
                `${window.location.origin}/store?subscribed=1`,
                `${window.location.origin}/store`,
                undefined
            );
            if (result?.url) window.location.href = result.url;
            else throw new Error('Failed to create checkout session');
        } catch (e: any) {
            setError(e.message || 'Stripe error');
            setIsProcessing(false);
        }
    };

    return (
        <dialog id="subscription-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-base-content/5 w-11/12 max-w-md rounded-2xl shadow-2xl p-6">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-4 top-4 rounded-full">✕</button>
                </form>

                <div className="text-center mb-6">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                        <Crown size={28} className="text-primary" />
                    </div>
                    <h3 className="font-bold text-xl tracking-tight">Monthly Subscription</h3>
                    <p className="text-sm opacity-60 mt-1">Full access to all content & digital assets</p>
                    <div className="text-3xl font-black text-primary mt-3">$10<span className="text-base font-normal opacity-60">/month</span></div>
                </div>

                {txHash ? (
                    <div className="text-center space-y-4 py-4">
                        <CheckCircle2 size={48} className="text-success mx-auto" />
                        <p className="font-bold text-success">Subscription Activated!</p>
                        <p className="text-xs opacity-50 font-mono break-all">{txHash}</p>
                    </div>
                ) : (
                    <>
                        {/* Tab selector */}
                        <div role="tablist" className="tabs tabs-boxed mb-5 bg-base-200">
                            <a role="tab" className={`tab gap-2 ${tab === 'crypto' ? 'tab-active' : ''}`} onClick={() => setTab('crypto')}>
                                <Wallet size={14} /> Crypto
                            </a>
                            {hasStripe && (
                                <a role="tab" className={`tab gap-2 ${tab === 'card' ? 'tab-active' : ''}`} onClick={() => setTab('card')}>
                                    <CreditCard size={14} /> Card
                                </a>
                            )}
                        </div>

                        {tab === 'crypto' && (
                            <div className="space-y-4">
                                <div className="flex gap-2">
                                    {(['USDC', 'ETH'] as const).map(m => (
                                        <button
                                            key={m}
                                            type="button"
                                            className={`btn btn-sm flex-1 rounded-full ${paymentMethod === m ? 'btn-primary' : 'btn-ghost border border-base-content/20'}`}
                                            onClick={() => setPaymentMethod(m)}
                                        >
                                            {m === 'USDC' ? `10 USDC` : usdRate ? `~${(SUBSCRIPTION_PRICE_USDC / usdRate).toFixed(5)} ETH` : 'ETH'}
                                        </button>
                                    ))}
                                </div>

                                {activeAddress && (
                                    <div className="bg-base-200/50 rounded-xl p-3 text-xs font-mono opacity-60 truncate">
                                        {activeAddress}
                                    </div>
                                )}

                                {error && <p className="text-error text-xs font-bold bg-error/5 p-3 rounded-xl">{error}</p>}

                                <button
                                    className="btn btn-primary w-full rounded-full gap-2"
                                    onClick={handleCryptoPayment}
                                    disabled={isProcessing || !isWalletReady && !isExternalConnected}
                                >
                                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                                    {isProcessing ? 'Processing...' : 'Pay with Crypto'}
                                </button>
                            </div>
                        )}

                        {tab === 'card' && hasStripe && (
                            <div className="space-y-4">
                                <p className="text-sm opacity-60 text-center">You'll be redirected to Stripe to complete the payment securely.</p>
                                {error && <p className="text-error text-xs font-bold bg-error/5 p-3 rounded-xl">{error}</p>}
                                <button
                                    className="btn btn-primary w-full rounded-full gap-2"
                                    onClick={handleStripePayment}
                                    disabled={isProcessing}
                                >
                                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                                    {isProcessing ? 'Redirecting...' : 'Pay $10 with Card'}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
            <form method="dialog" className="modal-backdrop"><button>close</button></form>
        </dialog>
    );
};
