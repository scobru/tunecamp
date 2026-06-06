import { useEffect, useState } from "react";
import { useWalletStore } from "../../stores/useWalletStore";
import { Wallet, Loader2, CheckCircle2, Download } from "lucide-react";
import { ethers } from "ethers";
import { TokenRole, DEPLOYMENTS } from "shogun-contracts-sdk";



const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)"
];
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Track type matching minimum required for checkout
interface CheckoutTrack {
  id: string;
  title: string;
  artist: string;
  priceEth?: string;
  priceUsdc?: number | string;
  price_usdc?: number | string;
  price?: number;
  currency?: "ETH" | "USD" | "USDC";
  albumId?: number | string;
  album_id?: number | string;
  walletAddress?: string;
  use_nft?: boolean;
  useNft?: boolean;
}

export const CheckoutModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [track, setTrack] = useState<CheckoutTrack | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [unlockCode, setUnlockCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const [isLoadingRate, setIsLoadingRate] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"ETH" | "USDC">("ETH");
  const [stableBalance, setStableBalance] = useState<string>("0");
  const [paymentType, setPaymentType] = useState<"crypto" | "fiat">("crypto");

  const [hasStripe, setHasStripe] = useState(false);

  useEffect(() => {
    fetch("/api/payments/onramp-config")
      .then(res => res.json())
      .then(data => {
        if (data.stripeCheckout) setHasStripe(true);
      })
      .catch(err => console.error("Failed to fetch payment config", err));
  }, []);

  const {
    signer,
    balanceEth,
    isConnected,
    connect,
  } = useWalletStore();

  useEffect(() => {
    const handleOpen = async (e: any) => {
      try {
        console.log("Opening checkout modal for track:", e.detail?.track);
        const t = e.detail?.track as CheckoutTrack;
        if (!t) {
          console.error("No track data provided to checkout modal");
          return;
        }

        // Sanitize track ID (remove tr_ prefix if present)
        const sanitizedTrack = {
          ...t,
          id: String(t.id).replace("tr_", "")
        };

        setTrack(sanitizedTrack);
        setIsOpen(true);
        setTxHash(null);
        setUnlockCode(null);
        setError(null);
        setIsProcessing(false);
        setPaymentMethod("ETH");
        setStableBalance("0");

        if (sanitizedTrack.currency === "USD") {
          setIsLoadingRate(true);
          try {
            const res = await fetch("/api/payments/rate/USD");
            const data = await res.json();
            if (data.rate) setUsdRate(data.rate);
          } catch (fetchErr) {
            console.error("Failed to fetch USD rate", fetchErr);
          } finally {
            setIsLoadingRate(false);
          }
        } else {
          setUsdRate(null);
        }
      } catch (err) {
        console.error("Error in handleOpen checkout modal:", err);
      }
    };
    window.addEventListener("open-checkout-modal", handleOpen);

    // Handle Stripe return success
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("stripe_success") === "true") {
       // Ideally we'd show the success state here. 
       // For now, let's just clear the params and maybe the user can check their downloads.
       // In a full implementation, we'd verify the session/order and show the Download button.
    }

    return () => window.removeEventListener("open-checkout-modal", handleOpen);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    setTrack(null);
    setTimeout(() => {
      setTxHash(null);
      setUnlockCode(null);
      setError(null);
    }, 300);
  };

  const handleDownload = () => {
    if (!track || !unlockCode) return;
    window.open(
      `/api/payments/download/${track.id}?code=${unlockCode}`,
      "_blank",
    );
    handleClose();
  };

  const handleStripeCheckout = async () => {
    if (!track) return;
    setIsProcessing(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/stripe/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: track.id,
          type: "track",
          albumId: (track as any).albumId,
          successUrl: window.location.origin + "/#/purchases?stripe_success=true",
          cancelUrl: window.location.href,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to create Stripe session");
      }
    } catch (err: any) {
      setError(err.message);
      setIsProcessing(false);
    }
  };



    
  const handleCryptoCheckout = async () => {
    if (!activeSigner || !track) return;

    setIsProcessing(true);
    setError(null);

    const checkoutAddr = (window as any).TUNECAMP_CONFIG?.web3_checkout_address;
    
    try {
      let receipt: any;
      let feeReceipt: any;
      let finalPriceEth = track.priceEth;
      
      const useNft = track.use_nft !== undefined ? track.use_nft : (track.useNft !== undefined ? track.useNft : true);
      const isDirectPayment = useNft === false;
      const artistWallet = track.walletAddress || (window as any).TUNECAMP_CONFIG?.ownerAddress;

      if (paymentMethod === "USDC") {
        const tokenSymbol = "USDC";
        const tokenAddress = BASE_USDC_ADDRESS;
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, activeSigner);

        if (!checkoutAddr) throw new Error("No smart contract store connected for USDC checkout.");

        const network = await activeSigner.provider!.getNetwork();
        const chainId = String(network.chainId);
        const abi = (DEPLOYMENTS as any)[chainId]?.["TuneCampFactory#TuneCampCheckout"]?.abi || 
                    (DEPLOYMENTS as any)["84532"]?.["TuneCampFactory#TuneCampCheckout"]?.abi || 
                    (DEPLOYMENTS as any)["8453"]?.["TuneCampFactory#TuneCampCheckout"]?.abi;
        
        if (!abi) throw new Error("TuneCampCheckout ABI not found in SDK");
        const checkout = new ethers.Contract(checkoutAddr, abi, activeSigner);
        
        const role = TokenRole?.LICENSE || 0;
        const trackIdBigInt = BigInt(track.id);

        // FETCH ON-CHAIN USDC PRICE
        setError("Fetching on-chain price...");
        const contractPriceUSDC = await checkout.priceUSDC(trackIdBigInt, role);
        if (contractPriceUSDC === 0n) {
          throw new Error(`On-chain price for this track is not set (USDC). Please contact the artist.`);
        }
        const stableAmount = contractPriceUSDC;

        if (isDirectPayment) {
          if (!artistWallet) throw new Error(`Artist wallet address is not configured for direct ${tokenSymbol} payments.`);
          
          const adminFeePct = Number((window as any).TUNECAMP_CONFIG?.adminFeePercentage || 0);
          const adminTreasury = (window as any).TUNECAMP_CONFIG?.adminTreasuryAddress;
          
          if (adminFeePct > 0 && adminTreasury) {
            const adminAmount = (stableAmount * BigInt(Math.floor(adminFeePct * 10))) / 1000n;
            const artistAmount = stableAmount - adminAmount;
            
            setError(`Sending ${ethers.formatUnits(adminAmount, 6)} ${tokenSymbol} fee to Label...`);
            const txAdmin = await tokenContract.transfer(adminTreasury, adminAmount);
            feeReceipt = await txAdmin.wait();
            
            setError(`Sending remaining ${ethers.formatUnits(artistAmount, 6)} ${tokenSymbol} to Artist...`);
            const txArtist = await tokenContract.transfer(artistWallet, artistAmount);
            receipt = await txArtist.wait();
          } else {
            setError(`Executing direct ${tokenSymbol} transfer... Please confirm in your wallet.`);
            const tx = await tokenContract.transfer(artistWallet, stableAmount);
            receipt = await tx.wait();
          }
        } else {
          // USDC + SMART CONTRACT flow
          const ownerAddr = await activeSigner.getAddress();
          const allowance = await tokenContract.allowance(ownerAddr, checkoutAddr);

          if (allowance < stableAmount) {
            setError("Approving USDC... Please confirm in your wallet.");
            const txApprove = await tokenContract.approve(checkoutAddr, stableAmount);
            await txApprove.wait();
          }

          setError("Purchasing... Please confirm in your wallet.");
          const tx = await checkout.purchaseWithUSDC(trackIdBigInt, role, 1);
          receipt = await tx.wait();
        }
      } else {
        // ETH PURCHASE FLOW
        if (!isDirectPayment && checkoutAddr && checkoutAddr !== "" && checkoutAddr !== "null") {
          const network = await activeSigner.provider!.getNetwork();
          const chainId = String(network.chainId);
          const abi = (DEPLOYMENTS as any)[chainId]?.["TuneCampFactory#TuneCampCheckout"]?.abi || (DEPLOYMENTS as any)["84532"]?.["TuneCampFactory#TuneCampCheckout"]?.abi || (DEPLOYMENTS as any)["8453"]?.["TuneCampFactory#TuneCampCheckout"]?.abi;
          if (!abi) throw new Error("TuneCampCheckout ABI not found in SDK");

          const checkout = new ethers.Contract(checkoutAddr, abi, activeSigner);
          const trackIdBigInt = BigInt(track.id);
          const role = TokenRole?.LICENSE || 0;
          
          // FETCH ON-CHAIN ETH PRICE
          setError("Fetching on-chain price...");
          const contractPriceETH = await checkout.priceETH(trackIdBigInt, role);
          if (contractPriceETH === 0n) {
            throw new Error("On-chain price for this track is not set (ETH). Please contact the artist.");
          }
          
          const value = contractPriceETH;
          setError(`Purchasing for ${ethers.formatEther(value)} ETH... Please confirm in your wallet.`);
          const tx = await checkout.purchaseWithETH(trackIdBigInt, role, 1, { value });
          receipt = await tx.wait();
        } else {
          // Direct ETH Transfer (using estimation since there is no contract)
          if (track.currency === "USD" && track.price) {
            if (!usdRate) throw new Error("Could not determine ETH price for USD amount.");
            finalPriceEth = (track.price / usdRate).toFixed(6);
          }
          if (!finalPriceEth || parseFloat(finalPriceEth) <= 0) throw new Error("Invalid price.");
          const value = ethers.parseEther(finalPriceEth);

          if (!artistWallet) {
            throw new Error("No recipient address configured for this track. Contact the artist system admin.");
          }

          const adminFeePct = Number((window as any).TUNECAMP_CONFIG?.adminFeePercentage || 0);
          const adminTreasury = (window as any).TUNECAMP_CONFIG?.adminTreasuryAddress;

          if (adminFeePct > 0 && adminTreasury) {
            // Split ETH
            const adminAmount = (value * BigInt(Math.floor(adminFeePct * 10))) / 1000n;
            const artistAmount = value - adminAmount;

            setError(`Sending fee to Label (${adminFeePct}%)...`);
            const txAdmin = await activeSigner.sendTransaction({ to: adminTreasury, value: adminAmount });
            feeReceipt = await txAdmin.wait();

            setError(`Sending ${ethers.formatEther(artistAmount)} ETH to artist...`);
            const txArtist = await activeSigner.sendTransaction({ to: artistWallet, value: artistAmount });
            receipt = await txArtist.wait();
          } else {
            setError(`Sending ${finalPriceEth} ETH to artist... Please confirm in your wallet.`);
            const tx = await activeSigner.sendTransaction({ to: artistWallet, value });
            receipt = await tx.wait();
          }
        }
      } // End ETH/USDC/USDT toggle

      if (!receipt || receipt.status === 0) {
        throw new Error("Transaction failed on-chain.");
      }

      let code: string | undefined;
      try {
        const verifyRes = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            txHash: receipt.hash,
            feeTxHash: feeReceipt?.hash,
            trackId: track.id,
          }),
        });
        const verifyData = await verifyRes.json();
        if (verifyData.success && verifyData.code) {
          code = verifyData.code;
          setUnlockCode(code ?? null);
        }
      } catch (verifyErr) {
        console.warn("Payment verification failed, purchase still recorded:", verifyErr);
      }

      setTxHash(receipt.hash);
    } catch (err: any) {
      console.error("Purchase failed:", err);
      setError(err.message || "Transaction failed");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen || !track) return null;

  let displayPriceEth = track.priceEth || "0";
  if (track.currency === "USD" && track.price && usdRate) {
    displayPriceEth = (track.price / usdRate).toFixed(6);
  } else if (!track.priceEth && track.price) {
    displayPriceEth = String(track.price);
  }

  const activeBalance = balanceEth;
  
  let currentStablePrice = 0;
  if (paymentMethod === "USDC") {
    currentStablePrice = Number(track.priceUsdc || track.price_usdc || 0);
  }
  // Fallback to USD price
  if (currentStablePrice <= 0 && track.currency === "USD" && track.price) {
    currentStablePrice = track.price;
  }

  const hasEnoughBalance = paymentMethod === "ETH" 
    ? parseFloat(activeBalance || "0") >= parseFloat(displayPriceEth)
    : parseFloat(stableBalance || "0") >= currentStablePrice;
    
  const activeWalletLabel = "your wallet";
  const activeSigner = signer;

  const showUsdc = Number(track.priceUsdc || track.price_usdc || 0) > 0 || (track.currency === "USD" && track.price);

  return (
    <div
      className={`modal ${isOpen ? "modal-open" : ""} bg-black/60 backdrop-blur-sm`}
    >
      <div className="modal-box bg-base-100/80 backdrop-blur-2xl border border-base-content/10 shadow-[0_0_40px_rgba(var(--color-primary),0.15)] rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-accent"></div>
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/20 blur-[80px] rounded-full pointer-events-none"></div>

        <div className="relative z-10 flex flex-col items-center text-center">
          {txHash ? (
            <>
              <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center mb-6 text-success animate-bounce">
                <CheckCircle2 size={40} />
              </div>
              <h3 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-base-content to-base-content/70 mb-2">
                Purchase Successful!
              </h3>
              <p className="text-base-content/60 mb-6 font-medium">
                "{track.title}" by {track.artist} has been added to your
                collection.
              </p>
              <div className="bg-black/40 rounded-xl p-4 w-full mb-8 border border-base-content/5 break-all text-left">
                <span className="text-xs text-base-content/40 uppercase tracking-wider block mb-1">
                  Transaction Hash
                </span>
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary hover:underline font-mono"
                >
                  {txHash}
                </a>
              </div>
              {unlockCode ? (
                <button
                  className="btn btn-primary btn-lg w-full rounded-2xl gap-2"
                  onClick={handleDownload}
                >
                  <Download size={20} />
                  Download Track
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-lg w-full rounded-2xl"
                  onClick={handleClose}
                >
                  Start Listening
                </button>
              )}
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-6 shadow-xl shadow-primary/20 transform rotate-3">
                <Wallet size={32} className="text-white transform -rotate-3" />
              </div>

               <h3 className="text-2xl font-bold mb-2">Unlock Track</h3>
              <p className="text-base-content/70 mb-6 max-w-sm">
                Support <strong className="text-base-content">{track.artist}</strong>{" "}
                directly. Choose your preferred payment method.
              </p>

              {hasStripe && (
                <div className="flex bg-base-200/50 p-1 rounded-2xl w-full mb-6 border border-base-content/5">
                  <button 
                    className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${paymentType === 'crypto' ? 'bg-primary text-white shadow-lg' : 'text-base-content/50 hover:text-base-content'}`}
                    onClick={() => setPaymentType('crypto')}
                  >
                    Crypto
                  </button>
                  <button 
                    className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${paymentType === 'fiat' ? 'bg-primary text-white shadow-lg' : 'text-base-content/50 hover:text-base-content'}`}
                    onClick={() => setPaymentType('fiat')}
                  >
                    Card
                  </button>
                </div>
              )}

              <div className="w-full bg-black/40 rounded-2xl p-5 mb-2 border border-base-content/5">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-base-content/60">Item</span>
                  <span className="font-semibold">{track.title}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-base-content/60">Price</span>
                  <div className="flex flex-col text-right">
                    <span className="text-xl font-bold text-primary">
                      {track.currency === "USD" && track.price
                        ? `$${track.price.toFixed(2)}`
                        : `${displayPriceEth} ETH`}
                    </span>
                    {track.currency === "USD" && usdRate && (
                      <span className="text-xs opacity-50">
                        ≈ {displayPriceEth} ETH
                      </span>
                    )}
                    {isLoadingRate && (
                      <span className="text-xs opacity-50 italic">
                        Calculating ETH...
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {paymentType === 'crypto' ? (
                <>
                  <div className="flex justify-between items-center mb-6 text-sm opacity-70 w-full px-1 mt-4">
                    <span>Paying with:</span>
                    <span className="font-semibold text-prominent">
                      {activeWalletLabel}
                    </span>
                  </div>


              {showUsdc && (
                <div className="flex bg-base-300 rounded-lg p-1 w-full mb-6 relative z-20">
                  <button 
                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${paymentMethod === "ETH" ? "bg-primary text-white shadow" : "text-base-content/50 hover:text-white"}`}
                    onClick={() => { setPaymentMethod("ETH"); setError(null); }}
                  >
                    ETH
                  </button>
                  <button 
                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${paymentMethod === "USDC" ? "bg-[#2775CA] text-white shadow" : "text-base-content/50 hover:text-white"}`}
                    onClick={async () => {
                      setPaymentMethod("USDC");
                      setError(null);
                      if (activeSigner) {
                        try {
                          const usdcContract = new ethers.Contract(BASE_USDC_ADDRESS, ERC20_ABI, activeSigner as any);
                          const addr = await activeSigner.getAddress();
                          const bal = await usdcContract.balanceOf(addr);
                          setStableBalance(ethers.formatUnits(bal, 6));
                        } catch (e) {
                          console.warn("Failed to fetch USDC balance", e);
                        }
                      }
                    }}
                  >
                    USDC
                  </button>
                </div>
              )}

              {isConnected && !hasEnoughBalance && !txHash && paymentMethod === "ETH" && (
                <div className="w-full mb-4">
                  <p className="text-error text-sm p-3 bg-error/5 rounded-xl border border-error/10 text-left">
                    Insufficient ETH balance in {activeWalletLabel}. Please fund your wallet to complete the purchase.
                  </p>
                </div>
              )}

              {isConnected && !hasEnoughBalance && !txHash && paymentMethod === "USDC" && (
                <div className="w-full mb-4">
                  <p className="text-error text-sm p-3 bg-error/5 rounded-xl border border-error/10 text-left">
                    Insufficient {paymentMethod} balance in {activeWalletLabel}. You have {stableBalance} {paymentMethod}. Please fund your wallet to complete the purchase.
                  </p>
                </div>
              )}

              {error && (
                <p className="text-error text-sm mb-4 bg-error/10 p-3 rounded-xl border border-error/20 w-full text-left">
                  {error}
                </p>
              )}

              {!isConnected ? (
                <button
                  className="btn btn-primary btn-block rounded-xl h-14 gap-3 shadow-lg shadow-primary/20 mt-4"
                  onClick={connect}
                  disabled={isProcessing}
                >
                  <Wallet size={20} />
                  Connect Wallet
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-block rounded-xl h-14 gap-3 shadow-lg shadow-primary/20 mt-4"
                  onClick={handleCryptoCheckout}
                  disabled={isProcessing || !hasEnoughBalance}
                >
                  {isProcessing ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      <Wallet size={20} />
                      {hasEnoughBalance ? "Unlock Track" : "Insufficient Balance"}
                    </>
                  )}
                </button>
              )}

              <button
                className="btn btn-ghost btn-block rounded-xl mt-2"
                onClick={handleClose}
                disabled={isProcessing}
              >
                Cancel
              </button>

              </>
              ) : (
                <div className="w-full space-y-3 mt-6">
                  {error && (
                    <p className="text-error text-sm mb-4 bg-error/10 p-3 rounded-xl border border-error/20 w-full text-left">
                      {error}
                    </p>
                  )}
                  <button
                    className="btn btn-primary btn-block rounded-xl h-14 gap-3 shadow-lg shadow-primary/20"
                    onClick={handleStripeCheckout}
                    disabled={isProcessing}
                  >
                    {isProcessing ? <Loader2 className="animate-spin" size={20} /> : "💳 Pay with Credit Card"}
                  </button>


                  
                  <button
                    className="btn btn-ghost btn-block rounded-xl mt-4"
                    onClick={handleClose}
                    disabled={isProcessing}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <label
        className="modal-backdrop"
        onClick={!isProcessing ? handleClose : undefined}
      >
        Close
      </label>
    </div>
  );
};

