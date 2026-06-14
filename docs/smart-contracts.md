# Smart Contracts Technical Guide

TuneCamp uses a suite of Solidity smart contracts on the **Base Network** to manage music ownership as NFTs and handle secure payments.

## 1. Contract Overview

- **`TuneCampFactory.sol`**: An EIP-1167 minimal proxy factory. It allows the platform to deploy "clones" of the main contracts for each new artist instance at a fraction of the gas cost.
- **`TuneCampCheckout.sol`**: The main payment processor. It handles:
  - Purchases with ETH or USDC.
  - Automatic revenue splits between the Artist and the Platform Treasury.
  - Integration with the NFT contract for minting.
- **`TuneCampNFT.sol`**: An ERC-1155 contract. Each track or album is represented as a unique token ID. Ownership of the NFT grants the user access to high-quality downloads.

## 2. Development & Deployment

The contracts are located in the `contracts/` directory.

### Prerequisites
- Node.js
- Hardhat or Foundry (preferred for Base)
- A private key with Base ETH for gas.

### Deployment Flow
1. **Deploy Implementation Contracts**: Deploy the logic for `TuneCampCheckout` and `TuneCampNFT`.
2. **Deploy Factory**: Deploy `TuneCampFactory` pointing to the implementation addresses.
3. **Configure Instance**: The TuneCamp server uses the Factory to "spawn" its own checkout and NFT contracts upon first initialization or admin request.

## 3. On-Chain Revenue Logic

The `TuneCampCheckout` contract acts as the **on-chain enforcement** of the platform's universal revenue split policy. While Stripe payments handle splits via backend logic, Web3 payments are immutable and automatic:

```solidity
uint256 platformShare = (msg.value * adminFeeBps) / 10000;
uint256 artistShare = msg.value - platformShare;
payable(adminTreasury).transfer(platformShare);
payable(artistWallet).transfer(artistShare);
```

## 4. Integration with Backend

The backend (`src/server/routes/api/payments.ts`) interacts with these contracts via **Ethers.js**:
- **Verification**: It parses transaction logs to confirm that a specific `trackId` was paid for.
- **Publishing**: It calls the NFT contract to mint new editions when an artist releases music on-chain.

## 5. Security

- **ReentrancyGuard**: Applied to all payment functions.
- **AccessControl**: Only the instance admin or the platform factory can call sensitive management functions.
- **Auditing**: These contracts are designed for simplicity to minimize the attack surface.
