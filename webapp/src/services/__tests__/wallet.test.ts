import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletService } from '../wallet';
import { ethers } from 'ethers';

// We need to mock ethers correctly since it uses class instances
vi.mock('ethers', () => {
  const getNetworkMock = vi.fn();
  const balanceOfMock = vi.fn();

  class MockJsonRpcProvider {
    getNetwork = getNetworkMock;
  }

  class MockContract {
    balanceOf = balanceOfMock;
  }

  return {
    ethers: {
      JsonRpcProvider: MockJsonRpcProvider,
      Contract: MockContract,
    },
  };
});

describe('WalletService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear console mocks
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('has a provider instance', () => {
    expect(WalletService.provider).toBeDefined();
  });

  describe('getChainId', () => {
    it('returns the chainId when successful', async () => {
      const getNetworkMock = WalletService.provider.getNetwork as any;
      getNetworkMock.mockResolvedValue({ chainId: 12345n });

      const chainId = await WalletService.getChainId();
      expect(chainId).toBe(12345);
      expect(getNetworkMock).toHaveBeenCalled();
    });

    it('returns default Base Mainnet chainId (8453) and logs warning on error', async () => {
      const getNetworkMock = WalletService.provider.getNetwork as any;
      const error = new Error('Network error');
      getNetworkMock.mockRejectedValue(error);

      const chainId = await WalletService.getChainId();
      expect(chainId).toBe(8453);
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to get connected network, defaulting to Base Mainnet.',
        error
      );
    });
  });

  describe('getUsdcBalance', () => {
    it('returns the balance when successful', async () => {
      // Need to get the mocked contract somehow, or we can just mock the Contract constructor
      // Since the mock is instantiated inside the function, we can just grab the proto mock
      const balanceOfMock = new ethers.Contract('0x', [], {}).balanceOf as any;
      balanceOfMock.mockResolvedValue(100n);

      const balance = await WalletService.getUsdcBalance('0x123');
      expect(balance).toBe(100n);
      expect(balanceOfMock).toHaveBeenCalledWith('0x123');
    });

    it('returns 0n and logs error on failure', async () => {
      const error = new Error('Contract error');
      const balanceOfMock = new ethers.Contract('0x', [], {}).balanceOf as any;
      balanceOfMock.mockRejectedValue(error);

      const balance = await WalletService.getUsdcBalance('0x123');
      expect(balance).toBe(0n);
      expect(console.error).toHaveBeenCalledWith('USDC Balance Fetch Error:', error);
    });
  });
});
