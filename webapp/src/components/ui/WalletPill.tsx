import { useEffect } from "react";
import { useWalletStore } from "../../stores/useWalletStore";
import { Wallet } from "lucide-react";
import clsx from "clsx";
import { Link } from "react-router-dom";

export const WalletPill = () => {
  const {
    balanceEth,
    balanceUsdc,
    isConnected,
    tryReconnect,
    refreshBalances,
  } = useWalletStore();

  // Silently restore a previously-authorized connection on mount (no popup).
  useEffect(() => {
    tryReconnect();
  }, [tryReconnect]);

  // Periodically refresh balances while connected.
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      refreshBalances();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [isConnected, refreshBalances]);

  if (!isConnected) {
    return (
      <Link
        to="/wallet"
        className="flex mt-2 bg-base-300 rounded-full px-3 py-1 items-center gap-2 border border-base-content/10 opacity-70 hover:opacity-100 transition-all hover:scale-105 tooltip tooltip-right z-50 cursor-pointer"
        data-tip="Connect your wallet"
      >
        <Wallet size={12} className="text-base-content/50" />
        <span className="text-xs text-base-content/70">Connect Wallet</span>
      </Link>
    );
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
