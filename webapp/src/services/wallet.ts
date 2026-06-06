import { ethers } from 'ethers';

// Base Mainnet RPC configuration
const BASE_RPC_URL = (window as any).TUNECAMP_CONFIG?.rpcUrl || import.meta.env.VITE_TUNECAMP_RPC_URL || 'https://base.llamarpc.com';

const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);

export const WalletService = {
  provider,
  getChainId: async (): Promise<number> => {
    try {
      const network = await provider.getNetwork();
      return Number(network.chainId);
    } catch (e) {
      console.warn("Failed to get connected network, defaulting to Base Mainnet.", e);
      return 8453;
    }
  },
  getUsdcBalance: async (address: string): Promise<bigint> => {
    const USDC_ADDRESS = import.meta.env.VITE_TUNECAMP_CURRENCY_CONTRACT || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Configured or Base Mainnet USDC
    const abi = ["function balanceOf(address) view returns (uint256)"];
    const contract = new ethers.Contract(USDC_ADDRESS, abi, provider);
    try {
      return await contract.balanceOf(address);
    } catch (e) {
      console.error("USDC Balance Fetch Error:", e);
      return BigInt(0);
    }
  }
};

