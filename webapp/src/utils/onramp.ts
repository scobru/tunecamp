/**
 * Utility to handle Onramp session creation and redirection.
 * Supports Stripe Crypto Onramp and MoonPay.
 */
export async function openOnramp(address: string, asset: string = "ETH", amount?: number) {
  try {
    // 1. Get onramp configuration from server
    const configRes = await fetch("/api/payments/onramp-config");
    const configData = await configRes.json();

    const provider = configData.provider || "stripe";

    if (provider === "moonpay") {
      const apiKey = configData.moonpayApiKey || "pk_live_R09fW7vR16035v8P9b9Z9v9";
      
      // MoonPay uses specific codes for assets on different networks
      const assetCode = asset.toLowerCase() === 'usdc' ? 'usdc_base' : 'eth_base';
      
      const params = new URLSearchParams({
        apiKey,
        currencyCode: assetCode,
        walletAddress: address,
        network: 'base',
        colorCode: '#9b6dff', // TuneCamp Primary Violet
        theme: 'dark',
        redirectURL: window.location.href
      });

      if (amount) {
        params.append('baseCurrencyAmount', amount.toString());
        params.append('baseCurrencyCode', 'usd');
        params.append('lockAmount', 'true');
      }

      const moonpayUrl = `https://buy.moonpay.com/?${params.toString()}`;
      window.open(moonpayUrl, "_blank", "noopener,noreferrer");
      return;
    }

    // Default to Stripe logic
    if (configData.configured && provider === "stripe") {
      // 2. Server is configured for Stripe Onramp, create a session
      const sessionRes = await fetch("/api/payments/onramp-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, asset, amount }),
      });

      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        if (sessionData.client_secret) {
          // Stripe Onramp can be embedded or hosted. For simplicity and maximum compatibility,
          // we use the hosted flow by redirecting to a standalone page or using the SDK to mount it.
          // The SDK is loaded in index.html.
          
          const stripeOnramp = (window as any).StripeOnramp && (window as any).StripeOnramp(configData.stripePublishableKey || "");
          
          if (stripeOnramp) {
             const onrampSession = stripeOnramp.createSession({
               clientSecret: sessionData.client_secret,
             });
             onrampSession.mount("#onramp-mount-point"); // Note: This requires a container in the UI
             
             // If we don't want to manage a container, we can use the hosted URL if Stripe provides one,
             // but usually Stripe Onramp is meant to be embedded.
             // As a robust fallback, if mounting isn't desired here, we can use the SDK's hosted approach if available.
             
             // For TuneCamp, let's trigger a custom event that the UI can listen to to show an onramp modal/overlay
             window.dispatchEvent(new CustomEvent("stripe-onramp-ready", { 
               detail: { clientSecret: sessionData.client_secret } 
             }));
             return;
          }
        }
      }
    }

    // 3. Fallback to a generic buy URL if everything else fails
    const fallbackUrl = `https://bridge.base.org/`;
    window.open(fallbackUrl, "_blank", "noopener,noreferrer");
    
  } catch (error) {
    console.error("Error opening Onramp:", error);
    const fallbackUrl = `https://bridge.base.org/`;
    window.open(fallbackUrl, "_blank", "noopener,noreferrer");
  }
}
