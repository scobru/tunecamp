# Contributing to Tunecamp

Thank you for your interest in contributing to Tunecamp! This guide outlines the process for proposing changes, setting up your development environment, and submitting pull requests.

## Code of Conduct

By participating in this project, you agree to abide by standard open-source norms: be respectful, constructive, and collaborative.

## How to Contribute

### 1. Report Bugs or Request Features

Before writing code, please check the existing issues to see if your concern has already been addressed. If not, open a new issue with:
- A clear, descriptive title.
- Steps to reproduce (for bugs).
- Expected vs. actual behavior.
- Relevant logs or screenshots.

### 2. Propose Changes

1. **Fork** the repository.
2. Create a **feature branch** (`git checkout -b feature/your-feature`).
3. Make your changes (see [Development Setup](#development-setup)).
4. **Test** your changes (see [Testing](#testing)).
5. **Commit** with clear, descriptive messages (`git commit -m 'Add support for X'`).
6. **Push** to your fork (`git push origin feature/your-feature`).
7. Open a **Pull Request** against the `main` branch.

---

## Development Setup

Tunecamp is a monorepo consisting of a Node.js/TypeScript backend and a Vite/React frontend.

### Prerequisites

- **Node.js**: v18+
- **npm**: v9+
- **FFmpeg**: Required for audio processing (waveform generation, transcoding).

### Installation

```bash
# Clone the repository
git clone https://github.com/scobru/tunecamp.git
cd tunecamp

# Install root & backend dependencies
npm install

# Install frontend dependencies
cd webapp
npm install
cd ..
```

### Running Locally

You need to run both the backend and frontend in parallel for the best development experience.

#### Terminal 1: Backend
```bash
# Watch and recompile TypeScript + CSS
npm run dev
```

#### Terminal 2: Frontend
```bash
# Start Vite dev server with Hot Module Replacement (HMR)
cd webapp
npm run dev
```

The frontend will proxy API requests to the backend (default port `1970`).

---

## Project Structure

- `src/server/`: Backend logic (ActivityPub, Federated Discovery, Subsonic API, Database).
- `webapp/`: Frontend React application.
- `docs/`: Supplemental architecture and API documentation.
- `contracts/`: Web3 smart contracts (Solidity).

---

## Testing

Always verify your changes before submitting a PR.

```bash
# Run backend test suite
npm test
```

Ensure no TypeScript errors:
```bash
npm run build
cd webapp
npm run build
```

---

## Pull Request Guidelines

- Keep PRs focused on a single issue or feature.
- Ensure all tests pass.
- Update documentation if you introduce new features or change existing behavior.
- Follow the existing code style (TypeScript, Prettier/ESLint).
