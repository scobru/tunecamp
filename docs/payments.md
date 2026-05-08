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

### Stripe Crypto Onramp
- **Purpose**: Enables users to buy USDC directly on the Base network to use for Web3 purchases.
- **Route**: `POST /api/payments/onramp-session`
- **Mechanism**: Backend creates a session with Stripe's Onramp API, targeting the user's wallet address on the `base` network.

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

## 3. Revenue Splits

TuneCamp implements a fee split mechanism:
- **Artist Revenue**: Sent directly to the artist's wallet address.
- **Platform Fee**: A percentage (default defined by `adminFeePercentage` in settings) is sent to the `adminTreasuryAddress`.

## 4. Configuration

Required Environment Variables:
- `STRIPE_SECRET_KEY`: Stripe API secret.
- `STRIPE_WEBHOOK_SECRET`: Secret for verifying webhook signatures.
- `TUNECAMP_RPC_URL`: RPC endpoint for Base Network (e.g., Alchemy or Base public RPC).
- `TUNECAMP_OWNER_ADDRESS`: Default address for platform fees.
