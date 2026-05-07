import { ethers } from 'ethers';

// Base Mainnet RPC configuration
const BASE_RPC_URL = (window as any).TUNECAMP_CONFIG?.rpcUrl || import.meta.env.VITE_TUNECAMP_RPC_URL || 'https://base.llamarpc.com';

const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);

/**
 * Derives a deterministic 32-byte private key from a ZEN identity.
 * Replaces the obsolete SEA-based wallet derivation.
 */
async function deriveZenWallet(priv: string, account = 0): Promise<string> {
  const text = String(priv) + (account ? String(account) : '');
  
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return "0x" + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Fallback if needed (though unlikely in a browser app)
    throw new Error("WebCrypto (crypto.subtle) is required for wallet derivation.");
  }
}

/**
 * Derives an Ethereum wallet from the user's Zen ZEN pair.
 *
 * @param pair The full ZEN pair (must have `priv` field).
 * @param account Optional account index for multiple wallets (default: 0).
 * @returns The instantiated ethers Wallet connected to Base Mainnet.
 */
export async function deriveTunecampWallet(pair: { priv: string, [key: string]: any }, account = 0): Promise<ethers.Wallet> {
  if (!pair || !pair.priv) throw new Error("Missing ZEN pair.priv");

  const privateKey = await deriveZenWallet(pair.priv, account);

  // Connect wallet to provider
  const wallet = new ethers.Wallet(privateKey, provider);

  return wallet;
}

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

