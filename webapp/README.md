# TuneCamp Webapp

The React frontend for [TuneCamp](../README.md) — the self-hosted, federated music
platform. This is an npm workspace of the root project; it builds to static assets
that the TuneCamp backend serves.

## Stack

- **React** + **TypeScript**
- **Vite** (build tool & dev server with HMR)
- **Zustand** for state (`src/stores/`)
- **React Router** for navigation
- **ethers** v6 for the in-browser wallet (any injected EIP-1193 provider, e.g. MetaMask)
- Plain CSS with theme variables (light/dark)

## Development

From the **repository root** (recommended), install once for both root and webapp:

```bash
npm install
```

Then run the Vite dev server from this directory:

```bash
cd webapp
npm run dev      # http://localhost:5173
```

The dev server proxies API calls to the backend, so start the backend too (from the
repo root: `npm run dev` to watch + `npm start` to run). See the root
[README](../README.md#using-nodejs-development) for the full dev workflow.

## Build

```bash
npm run build -w webapp   # from repo root
# or, from this directory:
npm run build
```

The production bundle is emitted to `dist/` and served by the backend.

## Layout

```
src/
├── components/   # UI by domain (admin/, artist/, player/, layout/, modals/, ui/)
├── pages/        # route entry points (Home, Library, Network, Admin, Dig, Live, ...)
├── stores/       # Zustand stores (useAuthStore, usePlayerStore, useWalletStore, ...)
├── services/     # api.ts (REST client), wallet.ts, zen.ts (instance discovery)
├── hooks/        # custom React hooks
└── main.tsx      # app mount point
```

## Configuration

Frontend build-time variables use the `VITE_` prefix (set in `.env` at the repo root):

| Variable | Description | Default |
|:---------|:------------|:--------|
| `VITE_TUNECAMP_RPC_URL` | Base RPC endpoint used by the in-browser wallet | `https://mainnet.base.org` |
| `VITE_TUNECAMP_CURRENCY_CONTRACT` | ERC-20 token contract (USDC on Base) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

See the root [README](../README.md#configuration) for the complete configuration reference.

:-)