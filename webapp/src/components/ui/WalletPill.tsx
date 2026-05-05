import { useEffect } from "react";
import { useWalletStore } from "../../stores/useWalletStore";
import { Wallet } from "lucide-react";
import clsx from "clsx";
import { Link } from "react-router-dom";

export const WalletPill = () => {
  const {
    balanceEth,
    balanceUsdc,
    isWalletReady,
    isWalletLoading,
    initWallet,
    refreshBalances,
    error,
  } = useWalletStore();

  // Re-initialize wallet when the component mounts if not ready
  useEffect(() => {
    if (!isWalletReady && !isWalletLoading && !error) {
      initWallet();
    }
  }, [isWalletReady, isWalletLoading, initWallet, error]);

  // Periodically refresh balances
  useEffect(() => {
    if (!isWalletReady) return;

    const interval = setInterval(() => {
      refreshBalances();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [isWalletReady, refreshBalances]);

  if (isWalletLoading) {
    return (
      <div className="flex bg-base-300 rounded-full px-3 py-1 items-center gap-2 animate-pulse mt-2 ring ring-primary/20">
        <Wallet size={14} className="text-base-content/50" />
        <span className="text-xs text-base-content/50">Loading...</span>
      </div>
    );
  }

  if (!isWalletReady) {
    return null;
  }

  // Format ETH balance slightly (e.g. 0.005)
  // Format USDC appropriately
  const ethNum = parseFloat(balanceEth || "0");
  const usdcNum = parseFloat(balanceUsdc || "0");

  // "Glow" effect if there's any balance, otherwise dim
  const hasFunds = ethNum > 0 || usdcNum > 0;

  return (
    <Link
      to="/wallet"
      className={clsx(
        "flex mt-2 bg-gradient-to-r from-base-300 to-base-200 rounded-full px-3 py-1 items-center justify-between gap-3 tooltip tooltip-right z-50 transition-all hover:scale-105",
        hasFunds
          ? "ring ring-primary/40 shadow-[0_0_10px_rgba(var(--color-primary),0.3)]"
          : "border border-base-content/10 opacity-70 cursor-pointer",
      )}
      data-tip="Your TuneCamp Wallet"
    >
      <div className="flex items-center gap-1.5 text-xs text-white/80 font-medium">
        <Wallet
          size={12}
          className={hasFunds ? "text-primary" : "text-base-content/50"}
        />
        {usdcNum > 0 ? (
          <span className="text-secondary">{usdcNum.toFixed(2)} USDC</span>
        ) : (
          <span>{ethNum.toFixed(4)} ETH</span>
        )}
      </div>
    </Link>
  );
};

