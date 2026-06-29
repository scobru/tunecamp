import { describe, test, expect, beforeEach, vi } from 'vitest';
import { useWalletStore } from '../useWalletStore';
import { WalletService } from '../../services/wallet';
import { ethers } from 'ethers';

// Mock WalletService
vi.mock('../../services/wallet', () => ({
    WalletService: {
        getUsdcBalance: vi.fn(),
    },
}));

const { mockBrowserProviderMock } = vi.hoisted(() => ({
    mockBrowserProviderMock: vi.fn()
}));

// Mock ethers
vi.mock('ethers', () => ({
    ethers: {
        BrowserProvider: class {
            constructor(...args: any[]) {
                return mockBrowserProviderMock(...args);
            }
        },
        formatEther: vi.fn(),
        formatUnits: vi.fn(),
    },
}));

describe('useWalletStore', () => {
    let mockEth: any;
    let mockProvider: any;
    let mockSigner: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockEth = {
            request: vi.fn(),
            on: vi.fn(),
        };
        (window as any).ethereum = mockEth;

        mockSigner = {
            getAddress: vi.fn().mockResolvedValue('0x123'),
        };

        mockProvider = {
            send: vi.fn(),
            getSigner: vi.fn().mockResolvedValue(mockSigner),
            getBalance: vi.fn().mockResolvedValue(1000000000000000000n), // 1 ETH in Wei
        };
        mockBrowserProviderMock.mockReturnValue(mockProvider);

        useWalletStore.setState({
            provider: null,
            signer: null,
            address: null,
            balanceEth: null,
            balanceUsdc: null,
            isConnected: false,
            isConnecting: false,
            error: null,
            balance: 0,
            currency: 'USD',
        });
    });

    test('initial state', () => {
        const state = useWalletStore.getState();
        expect(state.provider).toBeNull();
        expect(state.signer).toBeNull();
        expect(state.address).toBeNull();
        expect(state.balanceEth).toBeNull();
        expect(state.balanceUsdc).toBeNull();
        expect(state.isConnected).toBe(false);
        expect(state.isConnecting).toBe(false);
        expect(state.error).toBeNull();
        expect(state.balance).toBe(0);
        expect(state.currency).toBe('USD');
    });

    test('setBalance updates the balance', () => {
        const store = useWalletStore.getState();
        store.setBalance(100);

        const state = useWalletStore.getState();
        expect(state.balance).toBe(100);
        expect(state.currency).toBe('USD');
    });

    test('setBalance handles negative values', () => {
        const store = useWalletStore.getState();
        store.setBalance(-50);

        const state = useWalletStore.getState();
        expect(state.balance).toBe(-50);
        expect(state.currency).toBe('USD');
    });

    test('disconnect clears wallet state', () => {
        useWalletStore.setState({
            provider: {} as any,
            signer: {} as any,
            address: '0x123',
            balanceEth: '1.0',
            balanceUsdc: '10.0',
            isConnected: true,
            error: 'some error',
        });

        const store = useWalletStore.getState();
        store.disconnect();

        const state = useWalletStore.getState();
        expect(state.provider).toBeNull();
        expect(state.signer).toBeNull();
        expect(state.address).toBeNull();
        expect(state.balanceEth).toBeNull();
        expect(state.balanceUsdc).toBeNull();
        expect(state.isConnected).toBe(false);
        expect(state.error).toBeNull();
    });

    test('clearWallet acts as alias for disconnect', () => {
        useWalletStore.setState({
            address: '0x123',
            isConnected: true,
        });

        const store = useWalletStore.getState();
        store.clearWallet();

        const state = useWalletStore.getState();
        expect(state.address).toBeNull();
        expect(state.isConnected).toBe(false);
    });

    test('connect sets error if window.ethereum is not present', async () => {
        delete (window as any).ethereum;

        const store = useWalletStore.getState();
        await store.connect();

        const state = useWalletStore.getState();
        expect(state.error).toBe('No Web3 wallet detected. Please install MetaMask.');
        expect(state.isConnected).toBe(false);
    });

    test('connect handles successful wallet connection', async () => {
        vi.mocked(ethers.formatEther).mockReturnValue('1.0');
        vi.mocked(WalletService.getUsdcBalance).mockResolvedValue(10000000n);
        vi.mocked(ethers.formatUnits).mockReturnValue('10.0');

        const store = useWalletStore.getState();
        await store.connect();

        expect(mockBrowserProviderMock).toHaveBeenCalledWith(mockEth);
        expect(mockProvider.send).toHaveBeenCalledWith('eth_requestAccounts', []);

        const state = useWalletStore.getState();
        expect(state.isConnected).toBe(true);
        expect(state.address).toBe('0x123');
        expect(state.provider).toBe(mockProvider);
        expect(state.signer).toBe(mockSigner);
        expect(state.balanceEth).toBe('1.0');
        expect(state.balanceUsdc).toBe('10.0');
        expect(state.error).toBeNull();
        expect(mockEth.on).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
        expect(mockEth.on).toHaveBeenCalledWith('chainChanged', expect.any(Function));
    });

    test('connect prevents concurrent connections', async () => {
        useWalletStore.setState({ isConnecting: true });

        const store = useWalletStore.getState();
        await store.connect();

        expect(mockBrowserProviderMock).not.toHaveBeenCalled();
    });

    test('connect handles connection errors', async () => {
        mockProvider.send.mockRejectedValue(new Error('User rejected connection'));

        const store = useWalletStore.getState();
        await store.connect();

        const state = useWalletStore.getState();
        expect(state.isConnected).toBe(false);
        expect(state.error).toBe('User rejected connection');
        expect(state.isConnecting).toBe(false);
    });

    test('tryReconnect does nothing if already connected or connecting', async () => {
        useWalletStore.setState({ isConnected: true });

        const store = useWalletStore.getState();
        await store.tryReconnect();

        expect(mockEth.request).not.toHaveBeenCalled();
    });

    test('tryReconnect silently connects if authorized accounts exist', async () => {
        mockEth.request.mockResolvedValue(['0x123']);

        vi.mocked(ethers.formatEther).mockReturnValue('1.0');
        vi.mocked(WalletService.getUsdcBalance).mockResolvedValue(10000000n);
        vi.mocked(ethers.formatUnits).mockReturnValue('10.0');

        const store = useWalletStore.getState();
        await store.tryReconnect();

        expect(mockEth.request).toHaveBeenCalledWith({ method: 'eth_accounts' });
        expect(mockProvider.send).toHaveBeenCalledWith('eth_requestAccounts', []);

        const state = useWalletStore.getState();
        expect(state.isConnected).toBe(true);
        expect(state.address).toBe('0x123');
    });

    test('tryReconnect does not connect if no accounts returned', async () => {
        mockEth.request.mockResolvedValue([]);

        const store = useWalletStore.getState();
        await store.tryReconnect();

        expect(mockProvider.send).not.toHaveBeenCalled();
    });

    test('refreshBalances updates ETH and USDC balances', async () => {
        useWalletStore.setState({
            provider: mockProvider,
            address: '0x123',
        });

        mockProvider.getBalance.mockResolvedValue(2000000000000000000n); // 2 ETH
        vi.mocked(ethers.formatEther).mockReturnValue('2.0');

        vi.mocked(WalletService.getUsdcBalance).mockResolvedValue(50000000n);
        vi.mocked(ethers.formatUnits).mockReturnValue('50.0');

        const store = useWalletStore.getState();
        await store.refreshBalances();

        const state = useWalletStore.getState();
        expect(mockProvider.getBalance).toHaveBeenCalledWith('0x123');
        expect(WalletService.getUsdcBalance).toHaveBeenCalledWith('0x123');
        expect(state.balanceEth).toBe('2.0');
        expect(state.balanceUsdc).toBe('50.0');
    });

    test('refreshBalances skips if no provider or address', async () => {
        useWalletStore.setState({ provider: null, address: '0x123' });

        const store = useWalletStore.getState();
        await store.refreshBalances();

        expect(mockProvider.getBalance).not.toHaveBeenCalled();
        expect(WalletService.getUsdcBalance).not.toHaveBeenCalled();
    });
});
