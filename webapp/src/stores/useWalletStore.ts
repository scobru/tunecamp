import { create } from 'zustand';
import { ethers } from 'ethers';
import { deriveTunecampWallet, WalletService } from '../services/wallet';
import { ZenAuth } from '../services/zen';

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
        
        set({ isWalletLoading: true, error: null });
        try {
            // Need to get the authenticated user's SEA 'priv' key to derive the wallet.
            // ZenAuth doesn't expose SEA directly in the profile, but we can access `ZenAuth.user._.sea.priv`.
            
            // @ts-ignore
            const zenUser = ZenAuth.user;
            if (!zenUser || !zenUser._) {
                console.log("Zen user session not fully initialized. Skipping wallet derivation.");
                set({ isWalletLoading: false, isWalletReady: false });
                return;
            }

            const sea = zenUser._.sea;
            if (!sea || !sea.priv) {
                console.log("No SEA credentials found in Zen session. Wallet cannot be derived yet.");
                set({ isWalletLoading: false, isWalletReady: false });
                return;
            }

            console.log("🔐 Deriving wallet from Zen SEA credentials...");
            const wallet = await deriveTunecampWallet(sea);

            set({
                wallet,
                address: wallet.address,
                isWalletReady: true
            });

            // Fetch balances after initializing
            await get().refreshBalances();
        } catch (e: any) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.error("❌ Failed to initialize wallet:", e);
            set({ error: errorMsg || "Unknown derivation error", isWalletReady: false });
        } finally {
            set({ isWalletLoading: false });
        }
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

