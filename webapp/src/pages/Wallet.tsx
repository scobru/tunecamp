import { useEffect, useState } from "react";
import { useWalletStore } from "../stores/useWalletStore";
import {
  Wallet as WalletIcon,
  ExternalLink,
  Copy,
  Check,
  LogOut,
  Shield,
  Eye,
  EyeOff,
} from "lucide-react";
import { ZenAuth } from "../services/zen";
import clsx from "clsx";
import { useOwnedNFTs } from "../hooks/useOwnedNFTs";
import { TokenRole } from "shogun-contracts-sdk";
import { openOnramp } from "../utils/onramp";

const Wallet = () => {
  const {
    wallet,
    address,
    balanceEth,
    balanceUsdc,
    isWalletReady,
    isWalletLoading,
    externalAddress,
    externalBalanceEth,
    externalBalanceUsdc,
    isExternalConnected,
    useExternalWallet,
    connectExternalWallet,
    disconnectExternalWallet,
    setUseExternalWallet,
    initWallet,
    refreshBalances,
    error,
  } = useWalletStore();

  const [copiedLocal, setCopiedLocal] = useState(false);
  const [copiedExternal, setCopiedExternal] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [copiedPriv, setCopiedPriv] = useState(false);
  const [copiedSEA, setCopiedSEA] = useState(false);

  const activeAddress = useExternalWallet && isExternalConnected ? externalAddress : address;
  const { ownedNFTs, loading: nftsLoading } = useOwnedNFTs(activeAddress);

  useEffect(() => {
    if (!isWalletReady && !isWalletLoading && !error) {
      initWallet();
    }
  }, [isWalletReady, isWalletLoading, initWallet, error]);

  useEffect(() => {
    refreshBalances();
  }, [isExternalConnected]);

  const handleCopy = (text: string, isLocal: boolean) => {
    navigator.clipboard.writeText(text);
    if (isLocal) {
      setCopiedLocal(true);
      setTimeout(() => setCopiedLocal(false), 2000);
    } else {
      setCopiedExternal(true);
      setTimeout(() => setCopiedExternal(false), 2000);
    }
  };

  const formatAddr = (addr: string | null) => {
    if (!addr) return "";
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-20 p-6 md:p-0">
      <div className="flex items-center gap-4 border-b border-base-content/5 pb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
          <WalletIcon size={32} className="text-white" />
        </div>
        <div>
          <h1 className="text-4xl font-black tracking-tight">Wallet</h1>
          <p className="opacity-60 text-lg">
            Manage your funds on Base Mainnet
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error shadow-lg">
          <div>
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Local Wallet Card */}
        <div
          className={clsx(
            "card bg-base-100/50 border shadow-xl transition-all",
            !useExternalWallet
              ? "border-primary/50 shadow-primary/10"
              : "border-base-content/5 opacity-80",
          )}
        >
          <div className="card-body">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="card-title text-2xl">TuneCamp Wallet</h2>
                <span className="text-xs opacity-60">
                  Auto-generated local wallet
                </span>
              </div>
              <div className="badge badge-primary badge-outline">Local</div>
            </div>

            {isWalletLoading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-base-content/5 rounded w-1/2"></div>
                <div className="h-4 bg-base-content/5 rounded w-full"></div>
              </div>
            ) : !isWalletReady ? (
              <div className="text-center py-8 opacity-50">
                Local wallet not ready
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="text-xs uppercase tracking-wider opacity-50 mb-1">
                    Balance
                  </div>
                  <div className="text-3xl font-bold font-mono text-primary flex items-baseline gap-2">
                    {parseFloat(balanceEth || "0").toFixed(4)}{" "}
                    <span className="text-base opacity-60">ETH</span>
                  </div>
                  {parseFloat(balanceUsdc || "0") > 0 && (
                    <div className="text-xl font-bold font-mono text-secondary flex items-baseline gap-2 mt-1">
                      {parseFloat(balanceUsdc || "0").toFixed(2)}{" "}
                      <span className="text-base opacity-60">USDC</span>
                    </div>
                  )}
                </div>

                <div className="bg-black/30 p-4 rounded-xl border border-base-content/5">
                  <div className="text-xs uppercase tracking-wider opacity-50 mb-2">
                    Address
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-mono text-sm opacity-80">
                      {formatAddr(address)}
                    </span>
                    <button
                      className="btn btn-sm btn-ghost btn-circle"
                      onClick={() => handleCopy(address || "", true)}
                      title="Copy Address"
                    >
                      {copiedLocal ? (
                        <Check size={16} className="text-success" />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="card-actions mt-4 flex gap-2">
                  <button
                    className={clsx(
                      "btn flex-1",
                      !useExternalWallet ? "btn-primary" : "btn-outline",
                    )}
                    onClick={() => setUseExternalWallet(false)}
                    disabled={!useExternalWallet && true}
                  >
                    {!useExternalWallet ? "Currently Active" : "Set as Default"}
                  </button>
                  <button
                    onClick={() => openOnramp(address || "", "ETH")}
                    className="btn btn-ghost border-base-content/10 hover:bg-primary/20"
                    title="Fund with Credit Card / Coinbase"
                  >
                    <span className="text-lg">💳</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* External Wallet Card */}
        <div
          className={clsx(
            "card bg-base-100/50 border shadow-xl transition-all",
            useExternalWallet
              ? "border-secondary/50 shadow-secondary/10"
              : "border-base-content/5 opacity-80",
          )}
        >
          <div className="card-body">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="card-title text-2xl">MetaMask</h2>
                <span className="text-xs opacity-60">
                  External browser wallet
                </span>
              </div>
              <div className="badge badge-secondary badge-outline border-secondary/30">
                External
              </div>
            </div>

            {!isExternalConnected ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center">
                  <ExternalLink size={24} className="text-secondary" />
                </div>
                <p className="text-center opacity-70">
                  Connect your external wallet to pay directly from MetaMask.
                </p>
                <button
                  className="btn btn-secondary mt-2 shadow-lg shadow-secondary/20"
                  onClick={connectExternalWallet}
                >
                  Connect MetaMask
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="text-xs uppercase tracking-wider opacity-50 mb-1">
                    Balance
                  </div>
                  <div className="text-3xl font-bold font-mono text-secondary flex items-baseline gap-2">
                    {parseFloat(externalBalanceEth || "0").toFixed(4)}{" "}
                    <span className="text-base opacity-60">ETH</span>
                  </div>
                  {parseFloat(externalBalanceUsdc || "0") > 0 && (
                    <div className="text-xl font-bold font-mono text-primary flex items-baseline gap-2 mt-1">
                      {parseFloat(externalBalanceUsdc || "0").toFixed(2)}{" "}
                      <span className="text-base opacity-60">USDC</span>
                    </div>
                  )}
                </div>

                <div className="bg-black/30 p-4 rounded-xl border border-base-content/5">
                  <div className="text-xs uppercase tracking-wider opacity-50 mb-2">
                    Address
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-mono text-sm opacity-80">
                      {formatAddr(externalAddress)}
                    </span>
                    <button
                      className="btn btn-sm btn-ghost btn-circle"
                      onClick={() => handleCopy(externalAddress || "", false)}
                      title="Copy Address"
                    >
                      {copiedExternal ? (
                        <Check size={16} className="text-success" />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="card-actions flex gap-2 mt-4">
                  <button
                    className={clsx(
                      "btn flex-1",
                      useExternalWallet ? "btn-secondary" : "btn-outline",
                    )}
                    onClick={() => setUseExternalWallet(true)}
                    disabled={useExternalWallet}
                  >
                    {useExternalWallet ? "Currently Active" : "Set as Default"}
                  </button>
                  <button
                    className="btn btn-ghost btn-square text-error hover:bg-error/20"
                    onClick={() => {
                      disconnectExternalWallet();
                      setUseExternalWallet(false);
                    }}
                    title="Disconnect"
                  >
                    <LogOut size={20} />
                  </button>
                </div>
              </div>
            )}
          </div>
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

      <div className="bg-base-200/50 rounded-2xl p-6 border border-base-content/5 space-y-6">
        <div>
          <h3 className="text-xl font-bold mb-2">How it works</h3>
          <p className="opacity-70 text-sm leading-relaxed max-w-2xl">
            TuneCamp automatically creates a highly secure local wallet for you
            using your account credentials, ensuring that your keys never leave
            your device. You can choose to fund this local wallet for seamless
            one-click purchases, or connect an external Web3 wallet like
            MetaMask to retain manual control over each transaction signature.
          </p>
        </div>

        <div className="border-t border-base-content/5 pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield size={20} className="text-primary" />
              <h3 className="text-xl font-bold">Security & Backup</h3>
            </div>
            <button
              className="btn btn-sm btn-ghost gap-2"
              onClick={() => setShowKeys(!showKeys)}
            >
              {showKeys ? <EyeOff size={16} /> : <Eye size={16} />}
              {showKeys ? "Hide Sensitive Keys" : "Reveal Sensitive Keys"}
            </button>
          </div>

          {showKeys ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="alert alert-warning text-xs py-2 bg-warning/10 border-warning/20 text-warning mb-4">
                <Shield size={14} />
                <span>
                  <strong>NEVER SHARE THESE KEYS.</strong> Anyone with your
                  private key or SEA pair can access your funds and account.
                </span>
              </div>

              {/* Ethereum Private Key */}
              <div className="bg-black/30 p-4 rounded-xl border border-base-content/5">
                <div className="text-xs uppercase tracking-wider opacity-50 mb-2 flex justify-between items-center">
                  <span>Integrated Wallet Private Key</span>
                  <span className="text-[10px] opacity-40">
                    Derived from Zen SEA
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="font-mono text-xs break-all opacity-80 select-all">
                    {wallet?.privateKey || "Loading..."}
                  </span>
                  <button
                    className="btn btn-sm btn-ghost btn-circle shrink-0"
                    onClick={() => {
                      if (!wallet?.privateKey) return;
                      navigator.clipboard.writeText(wallet.privateKey);
                      setCopiedPriv(true);
                      setTimeout(() => setCopiedPriv(false), 2000);
                    }}
                  >
                    {copiedPriv ? (
                      <Check size={16} className="text-success" />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>
              </div>

              {/* Zen SEA Pair */}
              <div className="bg-black/30 p-4 rounded-xl border border-base-content/5">
                <div className="text-xs uppercase tracking-wider opacity-50 mb-2 flex justify-between items-center">
                  <span>Zen SEA Pair (Account Export)</span>
                  <span className="text-[10px] opacity-40">JSON Format</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <pre className="font-mono text-[10px] break-all opacity-80 whitespace-pre-wrap flex-1 max-h-32 overflow-y-auto select-all">
                    {JSON.stringify((ZenAuth.user as any)._?.sea, null, 2)}
                  </pre>
                  <button
                    className="btn btn-sm btn-ghost btn-circle shrink-0"
                    onClick={() => {
                      const sea = (ZenAuth.user as any)._?.sea;
                      if (!sea) return;
                      navigator.clipboard.writeText(JSON.stringify(sea));
                      setCopiedSEA(true);
                      setTimeout(() => setCopiedSEA(false), 2000);
                    }}
                  >
                    {copiedSEA ? (
                      <Check size={16} className="text-success" />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm opacity-50 italic">
              Keys are hidden for your security. Click reveal to view or backup.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Wallet;
