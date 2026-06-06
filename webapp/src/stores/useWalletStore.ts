import { create } from 'zustand';
import { ethers } from 'ethers';
import { WalletService } from '../services/wallet';

interface WalletState {
    provider: ethers.BrowserProvider | null;
    signer: ethers.JsonRpcSigner | null;
    address: string | null;
    balanceEth: string | null;
    balanceUsdc: string | null;
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;

    connect: () => Promise<void>;
    tryReconnect: () => Promise<void>;
    disconnect: () => void;
    refreshBalances: () => Promise<void>;
    clearWallet: () => void;
}

let ethListenersAttached = false;

/**
 * Wallet store backed exclusively by an external Web3 wallet (e.g. MetaMask).
 * The legacy derived/local wallet has been removed — TuneCamp no longer holds
 * any private keys; every signature is performed by the user's own wallet.
 */
export const useWalletStore = create<WalletState>((set, get) => ({
    provider: null,
    signer: null,
    address: null,
    balanceEth: null,
    balanceUsdc: null,
    isConnected: false,
    isConnecting: false,
    error: null,

    connect: async () => {
        if (get().isConnecting) return;

        const eth = (window as any).ethereum;
        if (typeof eth === 'undefined') {
            set({ error: 'No Web3 wallet detected. Please install MetaMask.' });
            return;
        }

        set({ isConnecting: true, error: null });
        try {
            const provider = new ethers.BrowserProvider(eth);
            await provider.send('eth_requestAccounts', []);
            const signer = await provider.getSigner();
            const address = await signer.getAddress();

            set({
                provider,
                signer,
                address,
                isConnected: true,
                error: null,
            });

            await get().refreshBalances();

            // Attach account/chain change listeners once.
            if (!ethListenersAttached && eth.on) {
                eth.on('accountsChanged', (accounts: string[]) => {
                    if (accounts.length === 0) {
                        get().disconnect();
                    } else {
                        get().connect();
                    }
                });
                eth.on('chainChanged', () => {
                    window.location.reload();
                });
                ethListenersAttached = true;
            }
        } catch (e: any) {
            console.error('Failed to connect external wallet:', e);
            set({ error: e.message || 'Failed to connect wallet' });
        } finally {
            set({ isConnecting: false });
        }
    },

    /**
     * Silently restore a previously-authorized wallet connection without
     * triggering a wallet popup. Safe to call on mount.
     */
    tryReconnect: async () => {
        if (get().isConnected || get().isConnecting) return;
        const eth = (window as any).ethereum;
        if (typeof eth === 'undefined') return;
        try {
            const accounts: string[] = await eth.request({ method: 'eth_accounts' });
            if (accounts && accounts.length > 0) {
                // Already authorized — connect() won't prompt the user.
                await get().connect();
            }
        } catch {
            /* ignore — user simply isn't connected yet */
        }
    },

    refreshBalances: async () => {
        const { provider, address } = get();
        if (!provider || !address) return;

        try {
            const ethBalanceWei = await provider.getBalance(address);
            const balanceEth = ethers.formatEther(ethBalanceWei);

            const usdcBalanceWei = await WalletService.getUsdcBalance(address);
            const balanceUsdc = ethers.formatUnits(usdcBalanceWei, 6);

            set({ balanceEth, balanceUsdc });
        } catch (e: any) {
            console.error('Failed to fetch balances:', e);
        }
    },

    disconnect: () => {
        set({
            provider: null,
            signer: null,
            address: null,
            balanceEth: null,
            balanceUsdc: null,
            isConnected: false,
            error: null,
        });
    },

    // Kept for backwards compatibility with the auth store's logout flow.
    clearWallet: () => {
        get().disconnect();
    },
}));
