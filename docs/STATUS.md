# Project Status

An honest snapshot of how production-ready each part of TuneCamp is. Updated 2026-07-08.

**Overall**: young, single-maintainer project. Solid for a self-hosted single artist or small label that can tolerate rough edges; not yet a drop-in replacement for a managed platform. 600+ automated tests, no external security audit.

## By area

| Area | Status | Notes |
|------|--------|-------|
| Library, scanning, streaming | **Stable** | Core since the beginning; worker-pool parsing, pre-transcoding of lossless, Subsonic/OpenSubsonic API. |
| Web player & artist pages | **Stable** | |
| Stripe payments & unlock codes | **Beta** | Internally reviewed (see [security-review-payments.md](security-review-payments.md)); no external audit. Test with small amounts first. |
| On-chain payments (Base, NFT) | **Beta / opt-in** | Disabled by default (`web3Enabled`). Trust assumptions documented in the security review. |
| Federation (ActivityPub + catalog) | **Beta** | Followable from Mastodon/Funkwhale; peer catalogs cached with stale-while-revalidate. Expect interop quirks. |
| Sidecamp (Peer Sharing) | **Beta** | Transient peer sharing over WebSocket tunnel, local import. See [sidecamp.md](sidecamp.md). |
| Live streaming (HLS) | **New** | Recently migrated from WebRTC mesh to server-side HLS; lightly battle-tested. |
| Radio (HLS station) | **New** | Always-on station from playlists + dynamic genre mixes; FFmpeg concat loop. See [radio.md](radio.md). |
| MCP server | **New / opt-in** | Exposes the catalog to AI clients (search, stats, scan) over SSE, token-gated. See [mcp-setup-guide.md](mcp-setup-guide.md). |
| Lab apps | **Experimental** | Sandboxed-iFrame browser audio tools; PostMessage bridge implemented (getUser/getLibrary/getNowPlaying/exportAudio). See [LAB.md](LAB.md). |
| Admin System panel | **New** | Live CPU/RAM/storage/task metrics for leak hunting. See [monitoring.md](monitoring.md). |
| Telegram bot, Google Drive storage | **Beta** | Functional, less test coverage. |
| SoundCloud & Bandcamp streaming | **Opt-in** | Streaming integration via SoundCloud / Bandcamp providers; enable under Admin → Integrations. |
| Soulseek & Torrents | **Delegated to Sidecamp** | P2P downloading is fully offloaded to the Sidecamp desktop app to keep the server clean. |
| Backup & restore | **Stable** | UI + CLI tools; see [backup-migration.md](backup-migration.md). Consider Litestream for continuous replication ([scaling.md](scaling.md)). |

## Known limits

- Single process, single SQLite writer — scaling model and ceilings in [scaling.md](scaling.md).
- No external security audit; payment flows internally reviewed with open findings tracked in [security-review-payments.md](security-review-payments.md).
- Small community: expect to debug some things yourself and report issues.
