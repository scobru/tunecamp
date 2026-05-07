/**
 * Utility to handle Onramp session creation and redirection.
 * Supports Coinbase and MoonPay.
 */
export async function openOnramp(address: string, asset: string = "ETH", amount?: number) {
  try {
    // 1. Get onramp configuration from server
    const configRes = await fetch("/api/payments/onramp-config");
    const configData = await configRes.json();

    const provider = configData.provider || "coinbase";

    if (provider === "moonpay") {
      const apiKey = configData.moonpayApiKey || "pk_live_R09fW7vR16035v8P9b9Z9v9"; // Fallback to a default or leave empty
      const currency = asset.toLowerCase();
      const moonpayUrl = `https://buy.moonpay.com/?apiKey=${apiKey}&currencyCode=${currency}&walletAddress=${address}${amount ? `&baseCurrencyAmount=${amount}` : ""}&network=base`;
      window.open(moonpayUrl, "_blank", "noopener,noreferrer");
      return;
    }

    // Default to Coinbase logic
    if (configData.configured) {
      // 2. Server is configured for CDP, create a session
      const sessionRes = await fetch("/api/payments/onramp-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, asset, amount }),
      });

      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        if (sessionData.session?.onrampUrl) {
          window.open(sessionData.session.onrampUrl, "_blank", "noopener,noreferrer");
          return;
        }
      }
      
      console.warn("Failed to create Coinbase Onramp session, falling back to legacy URL.");
    }

    // 3. Fallback to legacy URL if not configured or session creation failed
    const legacyUrl = `https://buy.coinbase.com/buy?address=${address}&network=base&asset=${asset}`;
    window.open(legacyUrl, "_blank", "noopener,noreferrer");
    
  } catch (error) {
    console.error("Error opening Onramp:", error);
    // Ultimate fallback to Coinbase legacy
    const legacyUrl = `https://buy.coinbase.com/buy?address=${address}&network=base&asset=${asset}`;
    window.open(legacyUrl, "_blank", "noopener,noreferrer");
  }
}

// Keep the old name for compatibility if needed, but deprecate it internally
export const openCoinbaseOnramp = openOnramp;

