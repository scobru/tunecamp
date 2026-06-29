# Comparison: Funkwhale vs TuneCamp

This document provides an honest and detailed comparison between **Funkwhale** and **TuneCamp**, two federated music platforms designed for different purposes, architectures, and target audiences.

---

## Quick Comparison Table

| Feature | Funkwhale | TuneCamp |
| :--- | :--- | :--- |
| **Primary Use Case** | Community music and podcast sharing | Self-publishing and sales for artists/labels |
| **Backend Stack** | Python (Django) + PostgreSQL + Redis | Node.js (TypeScript) + SQLite |
| **Frontend Stack** | Vue.js | React + Vite + Tailwind CSS / DaisyUI |
| **Federation Model** | Native ActivityPub (partial library replication between pods) | **Hybrid**: ActivityPub (social) + Gossip Discovery (node discovery via HTTP/NodeInfo) + HTTP REST |
| **Monetization** | None | **Integrated**: NFT (ERC-1155 on Base) + Stripe (Fiat) |
| **Mobile Compatibility** | Subsonic API | Subsonic / OpenSubsonic API |
| **Ingestion Methods** | Web upload, local import, YouTube | Web upload, Telegram Bot; Soulseek and BitTorrent available but disabled by default (admin opt-in) |
| **Social Features** | Comments, favorites, user profiles | Fediverse posts, integrated chat, live stream (server-side HLS) |
| **Management Difficulty** | Medium/High (multiple services running) | Low (single Node process or lightweight Docker Compose) |

---

## Detailed Feature Analysis

### 1. Philosophy and Target Audience
* **Funkwhale** was born with the vision of a "SoundCloud/Spotify in the Fediverse". It is ideal for collectives, free music enthusiasts, podcast creators, and users who want to stream music while sharing libraries with other enthusiasts.
* **TuneCamp** is specifically designed as a decentralized, self-hosted alternative to **Bandcamp**. The primary goal is to put the artist's financial independence at the center, offering personalized profiles and galleries managed directly by the artist, without intermediaries or centralized algorithms. Unlike Funkwhale, publishing is not open to all registrants: registered users are listeners, and those wishing to publish must request an artist profile that the admin approves (the account keeps its `user` role — the artist-profile link grants publishing rights, no Curator promotion); sales remain disabled for an artist until the admin verifies them (see [community-mode.md](community-mode.md)).

### 2. Architecture and Hosting Simplicity
* **Funkwhale** requires a medium-to-large infrastructure. It needs a Django backend, a PostgreSQL database, Redis for background task queues (Celery), and a web server to manage static files and media. This makes it more demanding to maintain for a single artist.
* **TuneCamp** focuses on maximum simplicity and is written entirely in TypeScript. The database is SQLite (via `better-sqlite3`), which resides in a single file. The React build is compiled and served directly by the Node.js server, allowing the entire platform (including the database) to run in a single lightweight process or via a simple Docker Compose file.

### 3. Federation Model
* **Funkwhale** implements the full **ActivityPub** protocol for sharing libraries. Users can follow channels or libraries hosted on other servers, and content streaming is requested and transmitted between federated instances.
* **TuneCamp** uses a **hybrid federated model**:
  * **Social (ActivityPub)**: Handles artist actors and external followers (e.g., Mastodon or Funkwhale users can follow the artist and receive notifications about new releases).
  * **Discovery (Gossip over HTTP/NodeInfo)**: Discover other TuneCamp instances in the network via decentralized gossip without central relays.
  * **Catalog (HTTP REST with cache)**: To avoid data duplication and catalog desynchronization, each instance queries the `/api/catalog` endpoint of discovered peers. Responses are cached in SQLite with a *stale-while-revalidate* strategy (TTL 1 hour, hard expiry 7 days): requests serve the cached copy and update it in the background, so a temporarily offline peer does not make its tracks disappear from the network. Data on tracks and prices are therefore "fresh up to ~1 hour", not real-time.

### 4. Monetization and Web3
* **Funkwhale** is centered exclusively on free listening of federated music. It has no payment module.
* **TuneCamp** integrates a native financial layer:
  * **Fiat**: Allows users without a crypto wallet to purchase tracks or albums with a credit card via Stripe.
  * **Web3**: Leverages the **Base** network (Ethereum L2) to sell tracks as ERC-1155 NFTs, purchasable with USDC or ETH.
  * **Gated Access**: Artists can generate temporary or permanent unlock codes to grant exclusive download access to music.

### 5. Content Ingestion
* **Funkwhale** supports uploading local music files and folders and can import audio from external sources (e.g., YouTube URLs).
* **TuneCamp** includes dedicated ingestion tools for users collecting large music libraries:
  * **Soulseek & Torrent (opt-in, disabled by default)**: Integration that allows searching and downloading albums from P2P networks directly from the admin panel. Since these are legally "grey" sources — problematic as a default on a platform that sells music — these plugins are registered as disabled and require explicit activation by the admin via plugin toggles. The same applies to SoundCloud/Bandcamp stream scrapers. Legal responsibility for activation lies with the instance administrator.
  * **Telegram Bot**: A dedicated bot where the instance administrator can simply forward audio files in a chat to have them automatically added and processed on their TuneCamp server.
  * **Google Drive Storage**: Allows using a remote Drive folder instead of local disk space to host music files.

---

## Conclusion: Which Platform to Choose?

### Choose Funkwhale if:
* You want to start a community web radio or an open music library to share with friends and Fediverse users.
* You have no intention of selling music and prefer to focus on cataloging, free listening, or publishing podcasts.
* You want immediate and exclusive integration with the Mastodon/Pleroma ecosystem.

### Choose TuneCamp if:
* You are an independent artist, producer, or small label who wants to sell music directly, with no platform fees if you self-host your instance (only Stripe fees of ~2.9% + €0.30 and VPS costs remain — see [payments.md § 3.1](payments.md) for an honest breakdown).
* You want a solution that can be configured in a few minutes on a small, cheap server (VPS) without having to configure multiple infrastructural components (Redis, PostgreSQL, Celery).
* You want to experiment with blockchain-based distribution (Base Network) to create music NFTs and activate a fan-ownership model.
* You want flexibility in file management via a Telegram bot or Google Drive storage.
