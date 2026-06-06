import { create } from 'zustand';
import { ethers } from 'ethers';
import { deriveTunecampWallet, WalletService } from '../services/wallet';

interface WalletState {
    wallet: ethers.Wallet | null;
    address: string | null;
    balanceEth: string | null;
    balanceUsdc: string | null;
    isWalletReady: boolean;
    isWalletLoading: boolean;
    error: string | null;

    // External Wallet (MetaMask)
    externalProvider: ethers.BrowserProvider | null;
    externalWallet: ethers.JsonRpcSigner | null;
    externalAddress: string | null;
    externalBalanceEth: string | null;
    externalBalanceUsdc: string | null;
    isExternalConnected: boolean;
    useExternalWallet: boolean;

    initWallet: () => Promise<void>;
    refreshBalances: () => Promise<void>;
    clearWallet: () => void;

    // External Wallet actions
    connectExternalWallet: () => Promise<void>;
    disconnectExternalWallet: () => void;
    setUseExternalWallet: (use: boolean) => void;
}

let ethListenersAttached = false;

export const useWalletStore = create<WalletState>((set, get) => ({
    wallet: null,
    address: null,
    balanceEth: null,
    balanceUsdc: null,
    isWalletReady: false,
    isWalletLoading: false,
    error: null,

    externalProvider: null,
    externalWallet: null,
    externalAddress: null,
    externalBalanceEth: null,
    externalBalanceUsdc: null,
    isExternalConnected: false,
    useExternalWallet: false,

    initWallet: async () => {
        if (get().isWalletLoading) return;
        
        // Zen-based wallet derivation has been removed; use external wallet (MetaMask) instead.
        set({ isWalletLoading: false, isWalletReady: false });
    },

    refreshBalances: async () => {
        const { wallet, address, externalAddress, externalProvider } = get();

        try {
            // Local Wallet Balances
            if (wallet && address) {
                // Get ETH Balance
                const ethBalanceWei = await WalletService.provider.getBalance(address);
                const balanceEth = ethers.formatEther(ethBalanceWei);

                // Get USDC Balance
                const usdcBalanceWei = await WalletService.getUsdcBalance(address);
                const balanceUsdc = ethers.formatUnits(usdcBalanceWei, 6);

                set({ balanceEth, balanceUsdc });
            }

            // External Wallet Balances
            if (externalProvider && externalAddress) {
                const ethBalanceWei = await externalProvider.getBalance(externalAddress);
                const externalBalanceEth = ethers.formatEther(ethBalanceWei);

                // For external, we use the same WalletService helper
                const usdcBalanceWei = await WalletService.getUsdcBalance(externalAddress);
                const externalBalanceUsdc = ethers.formatUnits(usdcBalanceWei, 6);

                set({ externalBalanceEth, externalBalanceUsdc });
            }
        } catch (e: any) {
            console.error("Failed to fetch balances:", e);
        }
    },

    clearWallet: () => {
        set({
            wallet: null,
            address: null,
            balanceEth: null,
            balanceUsdc: null,
            isWalletReady: false,
            error: null
        });
    },

    connectExternalWallet: async () => {
        const eth = (window as any).ethereum;
        if (typeof eth === 'undefined') {
            set({ error: "MetaMask is not installed" });
            return;
        }

        try {
            const provider = new ethers.BrowserProvider(eth);
            await provider.send("eth_requestAccounts", []);
            const signer = await provider.getSigner();
            const address = await signer.getAddress();

            set({
                externalProvider: provider,
                externalWallet: signer,
                externalAddress: address,
                isExternalConnected: true,
                useExternalWallet: true,
                error: null
            });

            await get().refreshBalances();

            // Setup listeners once
            if (!ethListenersAttached && eth.on) {
                eth.on('accountsChanged', (accounts: string[]) => {
                    if (accounts.length === 0) {
                        get().disconnectExternalWallet();
                    } else {
                        get().connectExternalWallet();
                    }
                });
                eth.on('chainChanged', () => {
                    window.location.reload();
                });
                ethListenersAttached = true;
            }
        } catch (e: any) {
            console.error("Failed to connect external wallet:", e);
            set({ error: e.message });
        }
    },

    disconnectExternalWallet: () => {
        set({
            externalProvider: null,
            externalWallet: null,
            externalAddress: null,
            externalBalanceEth: null,
            externalBalanceUsdc: null,
            isExternalConnected: false,
            useExternalWallet: false
        });
    },

    setUseExternalWallet: (use: boolean) => {
        set({ useExternalWallet: use });
    }
}));

