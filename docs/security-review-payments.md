# Security Review — Payments Flow

Scope: `src/server/routes/api/payments.ts` (Stripe checkout, webhook, on-chain verification, gated downloads). Reviewed 2026-06-12.

## Fixed in this review

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | **High** | Unlock codes were generated with `Math.random()` (purchase, subscription, webhook paths). The V8 PRNG is predictable: an attacker observing a handful of codes can reconstruct its state and derive other valid codes, unlocking paid content without payment. | All codes now come from `crypto.randomBytes` (`generateUnlockCode()`). |
| 2 | **High** | `feeTxHash` (label-fee transaction for split direct payments) had no replay protection: a single fee payment to the treasury could back unlimited purchases. The purchase `txHash` was protected, the fee tx was not. | The fee tx is checked against the same used-hash table before verification and "burned" with a `FEE-` marker row after a successful unlock. Marker rows carry no track/release/asset id, so they cannot be spent as download codes. |

## Open findings (accepted or needing follow-up)

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 3 | Medium | The label-fee **amount** is not verified — only that the fee tx targets the treasury and succeeded. A buyer can send 1 wei as the "fee". The comment in code says "Optional: verify amount". | Verify `feeTx.value` (or USDC transfer amount) ≥ `price × adminFeePct` within tolerance. Needs care with USDC-fee txs, where the value lives in the ERC-20 calldata. |
| 4 | Medium | `/verify` checks the price against `track.price` only, while the Stripe path also consults per-release overrides (`release_tracks`). A track sold at a higher per-release price can be unlocked on-chain by paying the (lower) track-level price. | Resolve the effective price the same way the Stripe path does before comparing amounts. |
| 5 | Medium | `purchaseWithUSDC` via the checkout contract is trusted on `trackId` match alone — no amount check server-side. This is sound **only if** the deployed contract enforces its own price mapping; the server cannot tell whether the configured `web3_checkout_address` actually does. | Document the trust assumption; optionally read the contract's price mapping via RPC and compare. |
| 6 | Low | JWT accepted via query string (`?token=`) in `getUserIdFromRequest`. Tokens in URLs end up in server logs, proxies and browser history. | Keep for download links if needed, but prefer short-lived single-purpose tokens for URL use. |
| 7 | Low | `successUrl`/`cancelUrl` for Stripe sessions are taken from the client unvalidated — a crafted link can bounce a paying user to an attacker URL after checkout (phishing vector, no funds at risk). | Validate against the instance's own origin. |
| 8 | Low | `/verify` and `/subscription/verify` are unauthenticated and each call triggers two RPC lookups — a cheap amplification target for RPC-quota exhaustion. | Covered in part by the global rate limiter; consider a tighter per-IP limit on these routes. |
| 9 | Info | Path handling in downloads is safe: `track.file_path` comes from the DB (scanner-controlled), not from the request; asset absolute paths are admin-set. | — |
| 10 | Info | Stripe webhook signature verification is correctly implemented with the raw body before any JSON parser. | — |

## Trust model notes

- The on-chain "direct payment" paths (B/C) verify recipient + amount but **not the sender**: anyone who can point at a qualifying transaction (e.g. found on a block explorer) can claim the unlock code before the real buyer does, since the code is returned to whoever submits the hash first. This is inherent to hash-presentation schemes; the replay table at least guarantees only one claim per tx. A signed-message challenge (buyer proves control of the sending address) would close it.
- A self-hosted single-artist instance (artist = admin = treasury) is unaffected by findings 3–5, which only matter in multi-tenant label setups.
