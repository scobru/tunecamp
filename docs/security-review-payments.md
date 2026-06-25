# Security Review — Payments Flow

Scope: `src/server/routes/api/payments.ts` (Stripe checkout, webhook, on-chain verification, gated downloads). Reviewed 2026-06-12.

## Fixed in this review

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | **High** | Unlock codes were generated with `Math.random()` (purchase, subscription, webhook paths). The V8 PRNG is predictable: an attacker observing a handful of codes can reconstruct its state and derive other valid codes, unlocking paid content without payment. | All codes now come from `crypto.randomBytes` (`generateUnlockCode()`). |
| 2 | **High** | `feeTxHash` (label-fee transaction for split direct payments) had no replay protection: a single fee payment to the treasury could back unlimited purchases. The purchase `txHash` was protected, the fee tx was not. | The fee tx is checked against the same used-hash table before verification and "burned" with a `FEE-` marker row after a successful unlock. Marker rows carry no track/release/asset id, so they cannot be spent as download codes. |
| 3 | Medium | The label-fee **amount** was not verified — only that the fee tx targeted the treasury and succeeded. A buyer could send 1 wei as the "fee". | The fee amount is now verified against `effective price × adminFeePct` for both native-ETH fees (`feeTx.value`, 5% tolerance for rate drift) and USDC fees (parsed from ERC-20 calldata, 1% tolerance). |
| 4 | Medium | `/verify` checked the price against `track.price` only, while the Stripe path also consults per-release overrides (`release_tracks`). A track sold at a higher per-release price could be unlocked on-chain by paying the (lower) track-level price. | `/verify` now resolves the effective price (price, price_usdc, currency) via `getTrackPriceFromRelease` exactly like the Stripe path, and all three verification cases compare against it. |
| 7 | Low | `successUrl`/`cancelUrl` for Stripe sessions were taken from the client unvalidated — a crafted link could bounce a paying user to an attacker URL after checkout (phishing vector, no funds at risk). | Both URLs must now match the instance origin (`publicUrl` setting or request host) on both session-creation routes. |
| 8 | Low | `/verify` and `/subscription/verify` are unauthenticated and each call triggers two RPC lookups — a cheap amplification target for RPC-quota exhaustion. | Dedicated rate limiter on both routes: 30 requests / 15 min per IP (global limiter is 1000 / 15 min). |
| 6 | Low | Session JWT accepted via query string (`?token=`) and request body. Tokens in URLs end up in server logs, proxies and browser history; a leaked download link was a leaked session. | Session tokens are now header-only. Download routes accept a purpose-scoped token (`?dt=`, 5-minute expiry) minted via `POST /api/payments/download-token`; download tokens are rejected on every other authenticated route, so a leaked link expires in minutes and grants nothing beyond downloads. |

## Open findings (accepted or needing follow-up)

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 5 | Medium | `purchaseWithUSDC` via the checkout contract is trusted on `trackId` match alone — no amount check server-side. This is sound **only if** the deployed contract enforces its own price mapping; the server cannot tell whether the configured `web3_checkout_address` actually does. | Trust assumption now documented here and in [STATUS.md](./STATUS.md); optionally read the contract's price mapping via RPC and compare. Only the instance admin can set `web3_checkout_address`, so exploiting this requires a malicious or buggy admin-deployed contract. |
| 9 | Info | Path handling in downloads is safe: `track.file_path` comes from the DB (scanner-controlled), not from the request; asset absolute paths are admin-set. | — |
| 10 | Info | Stripe webhook signature verification is correctly implemented with the raw body before any JSON parser. | — |

## Trust model notes

- The on-chain "direct payment" paths (B/C) verify recipient + amount but **not the sender**: anyone who can point at a qualifying transaction (e.g. found on a block explorer) can claim the unlock code before the real buyer does, since the code is returned to whoever submits the hash first. This is inherent to hash-presentation schemes; the replay table at least guarantees only one claim per tx. A signed-message challenge (buyer proves control of the sending address) would close it.
- A self-hosted single-artist instance (artist = admin = treasury) is unaffected by findings 3–5, which only matter in multi-tenant label setups.
