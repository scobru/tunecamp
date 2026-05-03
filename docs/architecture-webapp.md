# WebApp Architecture - TuneCamp

## Overview
The WebApp is a modern React application built with Vite, providing a rich, responsive interface for music discovery, playback, and administration.

## Core Patterns

### 1. State Management (Zustand)
Global state is managed using lightweight Zustand stores:
- `usePlayerStore`: Manages queue, playback status, and volume.
- `useAuthStore`: Handles user session and permissions.
- `useWalletStore`: Integrates with Ethereum wallets for on-chain interactions.

### 2. Component Architecture
Components are organized by function:
- **Player:** High-complexity components like `PlayerBar` and `Waveform`.
- **Admin:** Panels for maintenance, backups, and user management.
- **Modals:** Heavy use of modals for specific actions (Checkout, Metadata editing).

### 3. API Communication
Uses `axios` for communicating with the Backend. Services are defined to wrap API calls, ensuring type safety with TypeScript.

### 4. Styling
- **Tailwind CSS:** Utility-first styling.
- **DaisyUI:** Component library for consistent UI elements (buttons, modals, cards).

## Integration
- **Web3:** `ethers.js` is used to interact with the TuneCamp smart contracts directly from the browser for payments and minting.
- **Audio:** Native HTML5 Audio API wrapped in custom React logic.
