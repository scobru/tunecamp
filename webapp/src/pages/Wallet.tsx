import { useEffect, useState } from "react";
import { useWalletStore } from "../stores/useWalletStore";
import {
  Wallet as WalletIcon,
  ExternalLink,
  Copy,
  Check,
  LogOut,
} from "lucide-react";
import clsx from '@/utils/clsx';
import { useOwnedNFTs } from "../hooks/useOwnedNFTs";
import { TokenRole } from "shogun-contracts-sdk";

const Wallet = () => {
  const {
    address,
    balanceEth,
    balanceUsdc,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    tryReconnect,
    refreshBalances,
    error,
  } = useWalletStore();

  const [copied, setCopied] = useState(false);

  const { ownedNFTs, loading: nftsLoading } = useOwnedNFTs(address);

  // Silently restore a previously-authorized connection on mount (no popup).
  useEffect(() => {
    tryReconnect();
  }, [tryReconnect]);

  useEffect(() => {
    if (isConnected) refreshBalances();
  }, [isConnected, refreshBalances]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatAddr = (addr: string | null) => {
    if (!addr) return "";
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-24 p-6 md:px-0 md:pt-0 md:pb-16">
      <div className="flex items-center gap-4 border-b border-base-content/5 pb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-level-1 shadow-primary/20">
          <WalletIcon size={32} className="text-white" />
        </div>
        <div>
          <h1 className="text-4xl font-black tracking-tight">Wallet</h1>
          <p className="opacity-60 text-lg">
            Connect your wallet to pay on Base Mainnet
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error shadow-level-1">
          <div>
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="card bg-base-100/50 border border-secondary/50 shadow-level-1 shadow-secondary/10 transition-all">
        <div className="card-body">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="card-title text-2xl">External Wallet</h2>
              <span className="text-xs opacity-60">
                Your own browser wallet (e.g. MetaMask)
              </span>
            </div>
            <div className="badge badge-secondary badge-outline border-secondary/30">
              External
            </div>
          </div>

          {!isConnected ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center">
                <ExternalLink size={24} className="text-secondary" />
              </div>
              <p className="text-center opacity-70">
                Connect your wallet to pay directly. TuneCamp never holds your
                keys — every transaction is signed by you.
              </p>
              <button
                className="btn btn-secondary mt-2 shadow-level-1 shadow-secondary/20"
                onClick={connect}
                disabled={isConnecting}
              >
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="text-xs tracking-normal opacity-50 mb-1">
                  Balance
                </div>
                <div className="text-3xl font-bold font-mono text-secondary flex items-baseline gap-2">
                  {parseFloat(balanceEth || "0").toFixed(4)}{" "}
                  <span className="text-base opacity-60">ETH</span>
                </div>
                {parseFloat(balanceUsdc || "0") > 0 && (
                  <div className="text-xl font-bold font-mono text-primary flex items-baseline gap-2 mt-1">
                    {parseFloat(balanceUsdc || "0").toFixed(2)}{" "}
                    <span className="text-base opacity-60">USDC</span>
                  </div>
                )}
              </div>

              <div className="bg-black/30 p-4 rounded-xl border border-base-content/5">
                <div className="text-xs tracking-normal opacity-50 mb-2">
                  Address
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="font-mono text-sm opacity-80">
                    {formatAddr(address)}
                  </span>
                  <button
                    className="btn btn-sm btn-ghost btn-circle"
                    onClick={() => handleCopy(address || "")}
                    title="Copy Address"
                  >
                    {copied ? (
                      <Check size={16} className="text-success" />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>
              </div>

              <div className="card-actions flex gap-2 mt-4">
                <button
                  className="btn btn-ghost btn-square text-error hover:bg-error/20"
                  onClick={disconnect}
                  title="Disconnect"
                >
                  <LogOut size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-base-200/50 rounded-2xl p-6 border border-base-content/5 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
             <span className="text-xl">🖼️</span>
          </div>
          <h3 className="text-xl font-bold">My TuneCamp NFTs</h3>
        </div>

        {nftsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="aspect-square bg-base-content/5 rounded-xl"></div>
            ))}
          </div>
        ) : ownedNFTs.length === 0 ? (
          <div className="text-center py-8 opacity-50 bg-black/20 rounded-xl">
             No TuneCamp NFTs found in this wallet. Play and purchase tracks to build your collection!
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
             {ownedNFTs.map((nft, idx) => (
               <div key={`${nft.trackId}-${nft.role}-${idx}`} className="group relative bg-black/40 rounded-xl overflow-hidden border border-base-content/5 hover:border-primary/50 transition-colors">
                  <div className="aspect-square bg-base-content/5 relative">
                     {nft.coverUrl ? (
                         <img src={nft.coverUrl} alt={nft.title} className="w-full h-full object-cover" />
                     ) : (
                         <div className="w-full h-full flex items-center justify-center bg-base-300">🎵</div>
                     )}
                     <div className="absolute top-2 right-2">
                         <span className={clsx(
                             "badge badge-sm font-bold shadow-lg",
                             nft.role === TokenRole.OWNERSHIP ? "badge-secondary" : "badge-primary"
                         )}>
                             {nft.role === TokenRole.OWNERSHIP ? "Mstr" : "Licn."}
                             {nft.balance > 1 && ` x${nft.balance}`}
                         </span>
                     </div>
                  </div>
                  <div className="p-3">
                     <div className="font-bold text-sm truncate" title={nft.title}>{nft.title}</div>
                     <div className="text-xs opacity-60 truncate" title={nft.artistName}>{nft.artistName}</div>
                  </div>
               </div>
             ))}
          </div>
        )}
      </div>

      <div className="bg-base-200/50 rounded-2xl p-6 border border-base-content/5">
        <h3 className="text-xl font-bold mb-2">How it works</h3>
        <p className="opacity-70 text-sm leading-relaxed max-w-2xl">
          TuneCamp connects to your own Web3 wallet (such as MetaMask) to handle
          payments on Base Mainnet. Your private keys never leave your wallet,
          and you confirm and sign every transaction yourself.
        </p>
      </div>
    </div>
  );
};

export default Wallet;
