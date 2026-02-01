# TuneCamp Project Context

## Overview
TuneCamp is a modern static site generator (SSG) specifically designed for musicians and music labels. It allows users to create professional, fast, and responsive websites to showcase their music without requiring databases or complex hosting setups. It supports audio-first features like automatic metadata extraction, built-in players, and decentralized features via GunDB.

## Tech Stack
-   **Runtime**: Node.js (v18+)
-   **Languages**: TypeScript (Main logic), Gleam (Performance-critical utilities), JavaScript (Client-side).
-   **Core Libraries**:
    -   `express`: Server mode and API.
    -   `handlebars`: HTML templating.
    -   `gun`: Decentralized database for comments, unlock codes, and community features.
    -   `fluent-ffmpeg` / `music-metadata`: Audio processing.
    -   `ws`: WebSocket support for real-time features.
-   **Build Tools**: `tsc` (TypeScript Compiler), `gleam` (Gleam Compiler), `esbuild` (Bundling).

## Architecture
The project operates in two main modes:

1.  **Static Generation (CLI)**:
    -   Reads configuration (`catalog.yaml`, `artist.yaml`, etc.) and audio files from a local directory.
    -   Generates a static HTML website in an output directory using Handlebars templates.
    -   Produces `feed.xml`, `atom.xml`, and `playlist.m3u`.

2.  **Server Mode**:
    -   Runs a long-lived Express server.
    -   Provides a dynamic interface for streaming and managing the library.
    -   Supports ActivityPub for federation (Mastodon-compatible).
    -   Includes a "Studio" for administrative tasks.

## Key Directories
-   `src/`: Main source code.
-   `src/generator`: Logic for the static site generator.
-   `src/server`: Implementation of the dynamic server mode.
-   `src/gleam`: Gleam source files for high-performance utilities.
-   `webapp/`: Client-side assets (JS, CSS) used by the web interface.
-   `templates/`: Handlebars templates for the default theme.
