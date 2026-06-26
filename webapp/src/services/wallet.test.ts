import { vi, describe, test, expect, beforeEach } from 'vitest';
import { ethers } from 'ethers';

const { mockGetNetwork } = vi.hoisted(() => {
    return {
        mockGetNetwork: vi.fn(),
    };
});

vi.mock('ethers', () => {
    return {
        ethers: {
            JsonRpcProvider: class {
                constructor() {}
                getNetwork = mockGetNetwork;
            },
            Contract: class {
                constructor() {}
                balanceOf = vi.fn();
            }
        }
    };
});

import { WalletService } from './wallet';

describe('WalletService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clear console.warn to keep test output clean
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    describe('getChainId', () => {
        test('returns chainId on success', async () => {
            const mockNetwork = { chainId: 1n };
            mockGetNetwork.mockResolvedValue(mockNetwork as any);

            const chainId = await WalletService.getChainId();
            expect(chainId).toBe(1);
        });

        test('returns default chainId 8453 on error', async () => {
            const error = new Error('Network error');
            mockGetNetwork.mockRejectedValue(error);

            const chainId = await WalletService.getChainId();

            expect(chainId).toBe(8453);
            expect(console.warn).toHaveBeenCalledWith(
                "Failed to get connected network, defaulting to Base Mainnet.",
                error
            );
        });
    });
});
