# GEMINI.md: Project TuneCamp

This document provides a comprehensive overview of the TuneCamp project, its structure, and key operational commands to facilitate development and interaction with the Gemini CLI.

## Project Overview

TuneCamp is a full-stack application designed for musicians and labels to host and share their music. It functions both as a static site generator and a dynamic streaming server.

-   **Static Site Generator**: Creates fast, static HTML websites from a directory of audio files and YAML configuration. This is ideal for simple, robust hosting on platforms like GitHub Pages, Vercel, or Netlify.
-   **Server Mode**: Runs a persistent Node.js server that provides a full-featured web application for music streaming, library management, user accounts, and decentralized social features.

The project is a monorepo-like structure containing the main server/CLI application and a separate frontend web application.

### Key Technologies

-   **Backend**:
    -   Language: **TypeScript**
    -   Framework: **Node.js** with **Express.js**
    -   Database: **GunDB** (for decentralized features like comments and unlock codes) and **better-sqlite3** (for server-side data).
    -   Templating: **Handlebars** (for the static site generator).
    -   Audio Processing: `music-metadata` and `fluent-ffmpeg`.
-   **Frontend (`webapp/`)**:
    -   Framework: **React** (with TypeScript/TSX)
    -   Build Tool: **Vite**
    -   Styling: **Tailwind CSS** with **DaisyUI**
    -   State Management: **Zustand**
-   **Configuration**: YAML files (`catalog.yaml`, `release.yaml`).
-   **Deployment**: Can be deployed as static files or as a dynamic server using **Docker**.

## Directory Structure

-   `src/`: The core backend and CLI logic written in TypeScript.
    -   `src/cli.ts`: The main entry point for CLI commands.
    -   `src/server/`: The Express.js server implementation for server mode.
    -   `src/generator/`: Logic for the static site generator.
    -   `src/parser/`: Logic for parsing YAML and audio metadata.
-   `webapp/`: The source code for the React-based frontend application.
-   `templates/`: Handlebars templates used by the static site generator.
-   `docs/`: Project documentation.
-   `examples/`: Example catalog structures for users.
-   `package.json`: Defines dependencies and scripts for the backend/CLI.
-   `webapp/package.json`: Defines dependencies and scripts for the frontend application.

## Building and Running

### Full-Stack Development Setup

To run the full application (backend server + frontend dev server), you will need two separate terminal sessions.

**1. Backend/CLI:**

These commands are run from the project root (`D:\shogun-2\tunecamp`).

```bash
# 1. Install root dependencies
npm install

# 2. Build the TypeScript code
npm run build

# 3. To run the CLI (e.g., to build a static site)
# The built output is in ./dist
node dist/cli.js build ./examples/artist-free --output ./public
```

**2. Frontend (`webapp/`):**

These commands are run from the `webapp` directory.

```bash
# 1. Navigate to the webapp directory
cd webapp

# 2. Install frontend dependencies
npm install

# 3. Start the Vite development server
npm run dev
```

### Running Tests

The project does not currently have a dedicated top-level test script.

### Production Build

To create a production-ready build of both the backend and frontend:

```bash
# 1. Build the backend
npm run build

# 2. Build the frontend
cd webapp
npm run build
cd ..
```

### Docker

The project can also be run using Docker, which is the recommended method for production deployment.

```bash
# Make sure to configure docker-compose.yml first
docker-compose up -d
```

## Development Conventions

-   **Code Style**: The project uses **TypeScript** for type safety. The frontend uses **ESLint** for linting.
-   **Styling**: The `webapp` uses **Tailwind CSS**. Any new UI components should be styled using Tailwind utility classes.
-   **Commits**: (Inferred) Commit messages should be descriptive. No formal convention is immediately apparent from the log.
-   **Dependencies**: Manage backend and frontend dependencies separately in their respective `package.json` files.
