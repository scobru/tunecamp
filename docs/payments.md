# Payments & Monetization

TuneCamp supports a hybrid payment system combining traditional Fiat (via Stripe) and Web3 (Base Network) to provide a seamless monetization experience for artists.

## 1. Hybrid Payment Flows

### Stripe Checkout (Fiat)
- **Purpose**: Allows users to buy tracks, albums, or store assets using credit/debit cards.
- **Route**: `POST /api/payments/stripe/create-session`
- **Mechanism**:
  1. Frontend requests a session for an `itemId` and `type` (track/album/asset).
  2. Backend calculates the price (converting ETH to USD if necessary via `price.ts`).
  3. Backend resolves the item's artist. For assets this is the asset's `artist_id` if it was self-published by an artist; admin-created assets (no `artist_id`) have no resolvable artist. **If the artist has a connected Stripe account** (`artists.stripe_account_id`), the session is created as a **Stripe Connect direct charge** on that account, with the instance fee taken as an `application_fee_amount`. **Otherwise** the session is created on the instance's own Stripe account (single-artist / self-host fallback, or admin-managed assets — the operator already keeps 100%).
  4. A Stripe Checkout session is created and the URL is returned to the client.
  5. Upon successful payment, Stripe sends a webhook to `/api/payments/stripe/webhook`. For direct charges this arrives as a **connected-account event** (enable "Listen to events on connected accounts" on the endpoint).
  6. Backend generates an **Unlock Code** and stores it in the database.

### Crypto Onramp — not implemented
- **Route**: `GET /api/payments/onramp-config` always returns `configured: false`. There is no `onramp-session` endpoint and no onramp provider (Stripe Onramp, MoonPay) is wired up.
- Buyers without crypto cannot convert fiat → USDC in-app today. The only crypto path is **Web3 On-chain Verification** below (send ETH/USDC you already hold).

### Web3 On-chain Verification
- **Purpose**: Unlocks content based on direct blockchain transactions.
- **Route**: `POST /api/payments/verify`
- **Supported Methods**:
  - **Direct ETH**: Sending ETH directly to the artist's wallet.
  - **Direct USDC**: Sending USDC (ERC-20) to the artist's wallet.
  - **Checkout Contract**: Calling the `purchaseWithETH` or `purchaseWithUSDC` methods on the `TuneCampCheckout` smart contract.
- **Mechanism**: Backend fetches the transaction and receipt from the Base RPC, parses the transaction data (using `ethers.js`), and verifies the recipient and amount.
- **Note**: Store assets have no on-chain verify endpoint yet — the crypto tab is hidden for asset checkouts, which are Stripe-only.

## 1.5 Release distribution modes ("Download Experience")

Every album/release picks **one** distribution mode in the editor (**Studio → Release → Download Experience**). It is stored on `albums.download` and decides which (if any) purchase/download flow the release page exposes.

| Mode (UI) | `download` value | Behavior |
| :--- | :--- | :--- |
| **Streaming Only** | `none` (or `null`) | In-app streaming only. No download button, no purchase flow. |
| **Free Download** | `free` | Public ZIP download via `GET /api/releases/:slug/download?format=mp3\|wav` — no payment, no code. |
| **Unlock Codes** | `codes` | Download is gated behind a unique unlock code (see §2). Codes are issued on purchase (Stripe/crypto) or handed out manually from the editor. |
| **External Showcase** | `external` | **All on-platform purchase/download flows are disabled.** The release page replaces the buy button with a single **"Buy on Bandcamp"** link pointing at the configured *External Buy URL*. |

**External Showcase details:**
- The buy URL is stored as the first entry of `albums.external_links` (`[{ label, url }]`). The button label is `Buy on {label}`, defaulting to **"Buy on Bandcamp"** when no label is set.
- Selecting this mode forces `use_nft = false` and clears the price — TuneCamp never takes a cut of an off-platform sale.
- Streaming on TuneCamp still works for any audio that was uploaded to the release; only the *sale* happens off-platform. Uploading audio is optional and only needed if you also want in-app playback (publishing/streaming model is unchanged — TuneCamp does not stream from Bandcamp).

### Track-Slot Topup (Stripe)
- **Purpose**: Lets a listener buy extra track-upload slots when they hit their `listenerTrackCap` (or per-user `track_quota` override).
- **Route**: `POST /api/payments/stripe/create-trackcap-session`
- **Mechanism**:
  1. Requires an authenticated user; the return URL must point back at this instance.
  2. Price and slot count come from the admin settings `trackcapTopupPriceUsd` and `trackcapTopupTracksGranted`.
  3. Always charged to the instance's own Stripe account (never Connect-routed — this is a platform quota, not an artist sale).
  4. On `checkout.session.completed`, the webhook calls `AuthService.addPurchasedTracks`, which raises both `track_quota` and its floor `track_quota_floor` so a later admin override can never undercut a paid purchase.

## 2. Unlock Codes

When a payment is verified (either via Stripe Webhook or On-chain Verify), the system generates a unique 10-character alphanumeric code.
- **Storage**: `database.createUnlockCode(code, releaseId, trackId)`
- **Download**: Users can download the track via `GET /api/payments/download/:trackId?code=XXXXX`.

## 3. Revenue Splits & Fees

TuneCamp implements a universal fee split mechanism that applies to **all payment methods**, ensuring the platform remains sustainable regardless of how the user pays.

- **Platform Policy**: By default, the platform takes a percentage of every sale (e.g., 15%).
- **Web3 Payments (On-chain)**: The split is enforced directly by the `TuneCampCheckout` smart contract. Funds are distributed instantly: the artist's share goes to their wallet, and the platform's share goes to the `adminTreasuryAddress`.
- **Stripe Payments (Fiat)**: The split is enforced by **Stripe Connect**, mirroring the on-chain contract:
  - **Multi-artist instances** (artist has a connected account): the charge is a **direct charge** on the artist's Stripe account — funds land in the artist's balance directly, never in the instance's account. The instance's cut is collected automatically as `application_fee_amount`, using the **same `adminFeePercentage` setting as the on-chain split** so fiat and crypto take an identical percentage. No manual payout or custody.
  - **Single-artist / self-hosted instances** (no connected account): the charge stays on the instance's own Stripe account. The operator *is* the artist, so they already keep 100% (minus Stripe's processing fee) — Connect would only add onboarding friction.
  - **Cross-border guard**: Stripe rejects application fees for direct charges in a few countries/currencies (e.g. `MX`, `BR` / `mxn`, `brl`). For connected accounts based there, the fee is skipped so checkout never hard-fails — the artist simply receives the full amount.
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

**On-chain payments: near-zero fees, with caveats.** A buyer who already holds USDC on Base pays only gas (cents), and you receive ~100% — the best case of any payment path, beating Stripe's ~94%. Two caveats keep it from being the default recommendation: (1) buyers *without* crypto have no in-app onramp today (see §1, "Crypto Onramp — not implemented") — they'd have to buy USDC/ETH elsewhere first, worse UX than a plain card checkout; (2) you receive USDC/ETH, so cashing out to EUR has its own exchange/withdrawal costs, and holding ETH carries price risk until you convert (USDC largely avoids this). The instance fee split (85/15 default) applies on-chain too — it is enforced by the `TuneCampCheckout` contract itself.

## 3.2 Stripe Connect onboarding (artist accounts)

For multi-artist instances, each artist connects their own Stripe (Express) account so card payments can be routed to them directly. This is admin-managed (the same gate as artist publishing):

- `POST /api/admin/artists/:id/stripe-connect/onboard` — creates (or reuses) the artist's Express account, stores its id in `artists.stripe_account_id`, and returns a hosted Stripe onboarding link. The artist completes KYC on Stripe's side.
- `GET /api/admin/artists/:id/stripe-connect/status` — reports `connected`, `chargesEnabled`, `payoutsEnabled`, `detailsSubmitted`, and `country`.
- `DELETE /api/admin/artists/:id/stripe-connect` — unlinks the account from the artist (does **not** delete it on Stripe); their checkouts revert to the instance's own account.

No new environment variables are required — onboarding reuses the instance's `stripe_secret_key`. Until an artist completes onboarding (`chargesEnabled = false`), their fiat checkouts use the single-artist fallback (instance account).

## 4. Configuration

Required Environment Variables:
- `STRIPE_SECRET_KEY`: Stripe API secret.
- `STRIPE_WEBHOOK_SECRET`: Secret for verifying webhook signatures.
- `TUNECAMP_RPC_URL`: RPC endpoint for Base Network (e.g., Alchemy or Base public RPC).
- `TUNECAMP_OWNER_ADDRESS`: Default address for platform fees.

### Stripe webhook — "Listen to events on connected accounts"

When at least one artist has a connected Stripe account, checkout sessions are created as **direct charges** on that account. Stripe dispatches the resulting `checkout.session.completed` event as a **connected-account event** (`event.account` is set). Your webhook endpoint must have **"Listen to events on connected accounts"** enabled in the Stripe Dashboard (*Developers → Webhooks → your endpoint → Edit*); otherwise these events are silently dropped and no unlock codes are generated for payments made on connected accounts.

The same `STRIPE_WEBHOOK_SECRET` covers both platform and connected-account events — no second secret is needed.
