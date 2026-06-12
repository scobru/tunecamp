# Payments & Monetization

TuneCamp supports a hybrid payment system combining traditional Fiat (via Stripe) and Web3 (Base Network) to provide a seamless monetization experience for artists.

## 1. Hybrid Payment Flows

### Stripe Checkout (Fiat)
- **Purpose**: Allows users to buy tracks or albums using credit/debit cards.
- **Route**: `POST /api/payments/stripe/create-session`
- **Mechanism**:
  1. Frontend requests a session for an `itemId` and `type` (track/album).
  2. Backend calculates the price (converting ETH to USD if necessary via `price.ts`).
  3. A Stripe Checkout session is created and the URL is returned to the client.
  4. Upon successful payment, Stripe sends a webhook to `/api/payments/stripe/webhook`.
  5. Backend generates an **Unlock Code** and stores it in the database.

### Crypto Onramp (Stripe & MoonPay)
- **Purpose**: Enables users to buy USDC directly on the Base network to use for Web3 purchases.
- **Providers**: TuneCamp supports both **Stripe Onramp** and **MoonPay**.
- **Route**: `GET /api/payments/onramp-config`
- **Mechanism**:
  - The server checks which providers are configured via API keys.
  - For **Stripe**, it creates a session via `POST /api/payments/onramp-session`.
  - For **MoonPay**, it provides the API key to the frontend to initialize the MoonPay SDK or widget.
  - The preferred provider can be toggled in the Admin Settings (`onramp_provider`).

### Web3 On-chain Verification
- **Purpose**: Unlocks content based on direct blockchain transactions.
- **Route**: `POST /api/payments/verify`
- **Supported Methods**:
  - **Direct ETH**: Sending ETH directly to the artist's wallet.
  - **Direct USDC**: Sending USDC (ERC-20) to the artist's wallet.
  - **Checkout Contract**: Calling the `purchaseWithETH` or `purchaseWithUSDC` methods on the `TuneCampCheckout` smart contract.
- **Mechanism**: Backend fetches the transaction and receipt from the Base RPC, parses the transaction data (using `ethers.js`), and verifies the recipient and amount.

## 2. Unlock Codes

When a payment is verified (either via Stripe Webhook or On-chain Verify), the system generates a unique 10-character alphanumeric code.
- **Storage**: `database.createUnlockCode(code, releaseId, trackId)`
- **Download**: Users can download the track via `GET /api/payments/download/:trackId?code=XXXXX`.

## 3. Revenue Splits & Fees

TuneCamp implements a universal fee split mechanism that applies to **all payment methods**, ensuring the platform remains sustainable regardless of how the user pays.

- **Platform Policy**: By default, the platform takes a percentage of every sale (e.g., 15%).
- **Web3 Payments (On-chain)**: The split is enforced directly by the `TuneCampCheckout` smart contract. Funds are distributed instantly: the artist's share goes to their wallet, and the platform's share goes to the `adminTreasuryAddress`.
- **Stripe Payments (Fiat)**: The user pays the full amount via credit card. The platform receives the funds in its Stripe account. The split is then managed via the platform's financial logic (e.g., Stripe Connect payouts or internal accounting), with the artist's share being credited to their balance or paid out periodically.
- **Direct Verification**: Even for direct txHash verification, the backend checks if the appropriate "Label Fee" has been sent to the treasury before generating an unlock code.

## 3.1 What an artist actually keeps (honest cost breakdown)

TuneCamp's pitch is "no platform middleman fees", not "100% of revenue". Here is where the money actually goes on a €10 sale:

| Cost | Who charges it | Typical amount | Notes |
|------|----------------|----------------|-------|
| Instance fee | The TuneCamp instance you publish on | 0–15% | Default split is 85/15. **If you self-host your own instance, this is 0%** — you are the platform. Pro artists on third-party instances keep 100% of the split. |
| Card processing | Stripe | ~2.9% + €0.30 | Unavoidable for fiat payments anywhere. TuneCamp adds nothing on top. |
| Network gas | Base (Ethereum L2) | a few cents | Only for on-chain (ETH/USDC/NFT) purchases. Paid by the buyer. |
| Hosting | Your VPS provider | ~€5–15/month | Fixed cost, independent of sales volume. |

**Example** — €10 album sold via Stripe on your own self-hosted instance: €10 − €0.59 Stripe ≈ **€9.41 to you (~94%)**. The same sale on Bandcamp: 10% revenue share + ~5% payment processing ≈ **€8.50**. The difference compounds with volume, but be honest with yourself about the fixed hosting cost: below roughly €10–20/month in sales, a hosted platform may net you more.

**On-chain payments: near-zero fees, with caveats.** A buyer who already holds USDC on Base pays only gas (cents), and you receive ~100% — the best case of any payment path, beating Stripe's ~94%. Two caveats keep it from being the default recommendation: (1) buyers *without* crypto who use the onramp (MoonPay/Stripe Onramp) pay ~1–4.5% conversion fees plus extra UX friction, often worse than a plain card checkout; (2) you receive USDC/ETH, so cashing out to EUR has its own exchange/withdrawal costs, and holding ETH carries price risk until you convert (USDC largely avoids this). The instance fee split (85/15 default) applies on-chain too — it is enforced by the `TuneCampCheckout` contract itself.

## 4. Configuration

Required Environment Variables:
- `STRIPE_SECRET_KEY`: Stripe API secret.
- `STRIPE_WEBHOOK_SECRET`: Secret for verifying webhook signatures.
- `TUNECAMP_RPC_URL`: RPC endpoint for Base Network (e.g., Alchemy or Base public RPC).
- `TUNECAMP_OWNER_ADDRESS`: Default address for platform fees.
- `MOONPAY_API_KEY`: API Key for MoonPay Onramp integration.
