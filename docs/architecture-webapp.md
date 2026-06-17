# Webapp Architecture

The TuneCamp webapp is a modern Single Page Application (SPA) built with React and Vite, optimized for the music user experience and decentralized interaction.

## Tech Stack

- **UI Framework**: React (TypeScript)
- **Build Tool**: Vite
- **State Management**: Zustand
- **Routing**: React Router
- **Instance Discovery**: HTTP Gossip REST API
- **Wallet**: Ethers.js v6 (EIP-1193 injected provider, e.g., MetaMask)

## Code Organization

### 1. Components (`components/`)
Organized by functional domain:
- **`player/`**: The global music player, handles playback state, queue, and waveform display.
- **`artist/`**, **`auth/`**, **`admin/`**: Specific components for different areas of the application.
- **`ui/`**: Atomic and reusable components (buttons, inputs, loaders).

### 2. Pages (`pages/`)
Each file represents a main route:
- `Home.tsx`: Main dashboard.
- `Albums.tsx` / `Artists.tsx`: Library browsing.
- `Admin.tsx`: Management panel for the server administrator.
- `Network.tsx`: View of the federated network.

### 3. State Stores (`stores/`)
We use Zustand for lightweight and high-performance state:
- `usePlayerStore`: Current playback state (queue, active track).
- `useAuthStore`: Logged-in user state and JWT token.
- `useWalletStore`: Connected wallet state (account, network).
- `useConfigStore`: Instance configuration (branding, feature flags).
- `useUIStore`: Interface state (modals, panels).
- `useDigStore`: State of "Dig" mode (crate digging / music discovery).

### 4. Services (`services/`)
- `api.ts`: Wrapper for REST calls to the TuneCamp backend.
- `wallet.ts`: Browser wallet management (connection, signing, on-chain transactions via ethers).

## Navigation & Playback Flow

1. **Navigation**: User clicks on an album -> `AlbumDetails.tsx` requests data from `api.ts` -> Data displayed using `artist/` components.
2. **Playback**: Click on "Play" -> Track added to `usePlayerStore` -> `player/` component starts streaming from backend (`/api/tracks/:id/stream`), with fallback to external providers if local file is missing.
3. **Web3 Interaction**: Connect wallet -> `wallet.ts` manages the account -> Ability to purchase releases or unlock content.
