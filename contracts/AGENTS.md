# TuneCamp Smart Contracts

## Purpose

Solidity contracts on Base network: music ownership as NFTs and on-chain payment processing. See `../docs/smart-contracts.md`.

## Ownership

- `TuneCampFactory.sol` — EIP-1167 minimal proxy factory, clones per-artist instances
- `TuneCampCheckout.sol` — payment processor: ETH/USDC purchases, artist/platform revenue split, NFT minting on purchase
- `TuneCampNFT.sol` — ERC-1155, one token ID per track/album; ownership gates high-quality downloads

Backend integration lives in `src/server/routes/api/payments.ts` (verifies tx logs, calls NFT contract to mint) — see [../src/server/AGENTS.md](../src/server/AGENTS.md).

## Local Contracts

Inherits root [../AGENTS.md](../AGENTS.md). Contract-specific:

- All payment functions must keep `ReentrancyGuard`.
- Sensitive management functions restricted to instance admin or platform factory (`AccessControl`) — never open to arbitrary callers.
- Revenue split (`adminFeeBps`) is enforced on-chain, not just in backend logic — keep the split calculation in the contract, not delegated to a caller-supplied value.
- Contracts are kept intentionally simple to minimize attack surface — resist adding features here; prefer backend-side logic when it doesn't need on-chain enforcement.

## Work Guidance

Deployment order: implementation contracts (`TuneCampCheckout`, `TuneCampNFT`) → `TuneCampFactory` (pointed at implementations) → server spawns its own checkout/NFT clones via the factory on first init or admin request.

## Verification

No test framework configured in this directory yet.

## Child DOX Index

None.
