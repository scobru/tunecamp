/**
 * Utility to handle Coinbase Onramp session creation and redirection.
 */
export async function openCoinbaseOnramp(address: string, asset: string = "ETH", amount?: number) {
  try {
    // 1. Check if the server is configured for Coinbase CDP
    const configRes = await fetch("/api/payments/onramp-config");
    const configData = await configRes.json();

    if (configData.configured) {
      // 2. Server is configured, create a session
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
    console.error("Error opening Coinbase Onramp:", error);
    // Ultimate fallback
    const legacyUrl = `https://buy.coinbase.com/buy?address=${address}&network=base&asset=${asset}`;
    window.open(legacyUrl, "_blank", "noopener,noreferrer");
  }
}

