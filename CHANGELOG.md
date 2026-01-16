# Changelog

All notable changes to Tunecamp will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Interactive Wizard**: New CLI and Web-based wizard for easy catalog creation
  - CLI wizard: `tunecamp wizard` - guided step-by-step setup in terminal
  - Web wizard: Standalone HTML interface with file uploads and live previews
  - Supports multiple languages (English/Italian)
  - Web wizard generates complete deployable site as ZIP
- **Background Image Support**: New `backgroundImage` option in `catalog.yaml` for custom page backgrounds
  - Supports local files and external URLs
  - Separate from header image - covers entire page body
  - Semi-transparent overlay for text readability
- **M3U Playlist Links**: Download links to playlists now available in frontend
  - Homepage sidebar: Link to `catalog.m3u`
  - Release pages: Link to `playlist.m3u` in Share & Embed section
- **Web Wizard Features**:
  - File upload support for cover images and audio files
  - Option to use external URLs for audio files instead of uploads
  - Live preview of generated site
  - Complete site generation in browser (no build step needed)
  - ZIP download with all files included

### Changed

- **Theme System Simplified**: Removed multiple theme variants (minimal, dark, retro, translucent)
  - Now using single `default` theme with Faircamp-inspired layout
  - Theme is highly customizable via CSS variables and custom CSS
  - All themes now share the same structure (top navigation, header, two-column layout)
- **Default Theme**: Complete redesign with Faircamp-style layout
  - Integrated top navigation bar with logo
  - Header with background image support
  - Two-column layout on homepage (releases grid + sidebar)
  - Improved responsive design

### Fixed

- **Streaming-only Mode**: Fixed audio player not working when `download: "none"`
  - Audio file paths now correctly encoded for browser compatibility
  - Player works correctly for streaming-only releases
- **Background Image Copy**: Background images from local files are now correctly copied during build

## [1.0.1] - 2026-01-14

### Added

- **Public Key Support for Unlock Codes**: When using private GunDB space (with `--keypair`), you can now specify `publicKey` in `release.yaml` so the frontend can read codes from your private space
- **Improved Code Generator Output**: `generate-codes.ts` now outputs the `publicKey` in the instructions when using `--keypair`, making it easier to configure `release.yaml`
- **`isPrivateSpace()` method**: New helper method in `TunecampUnlockCodes` class to check if using private space

### Changed

- **Updated GunDB Peers**: Default peers updated to more reliable servers:
  - `https://gun.defucc.me/gun`
  - `https://gun.o8.is/gun`
  - `https://shogun-relay.scobrudot.dev/gun`
  - `https://relay.peer.ooo/gun`
- **Improved Unlock Codes Documentation**: `UNLOCK_CODES.md` now includes detailed instructions for private space usage and `publicKey` configuration

### Fixed

- **Private Space Unlock Codes**: Fixed issue where codes generated with `--keypair` couldn't be validated by the frontend. The frontend now correctly reads from the artist's user space using `gun.user(publicKey)`

### Technical Details

- `unlock-codes.js` now supports `publicKey` option in constructor
- New `getCodesRoot()` method handles both public and private space access
- Default theme updated with new `unlock-codes.js`
- `release.hbs` template updated to pass `publicKey` to the unlock codes script

## [1.0.0] - 2026-01-13

### Added

- Initial stable release
- **Static Site Generation**: Generate beautiful music catalog websites from audio files
- **5 Built-in Themes**: default, minimal, dark, retro, translucent
- **Audio-First**: Automatic metadata extraction from MP3, FLAC, OGG, WAV, M4A, OPUS
- **Download Models**: free, paycurtain (honor system), codes (GunDB validation), none
- **RSS/Atom Feeds**: Automatic feed generation for releases
- **Podcast Support**: Generate podcast RSS feeds
- **Embed Widgets**: Embeddable HTML players for releases
- **M3U Playlists**: Automatic playlist generation
- **Procedural Covers**: Auto-generate cover art if missing
- **Unlock Codes**: Decentralized download protection via GunDB
- **Download Statistics**: Real-time download counters via GunDB
- **Community Registry**: Decentralized directory of Tunecamp sites
- **Label Mode**: Multi-artist catalog support
- **Custom CSS/Fonts**: Support for custom styling
- **Header Images**: Bandcamp-style header image support

### Documentation

- Complete README with all features documented
- QUICKSTART.md for getting started quickly
- UNLOCK_CODES.md for unlock codes guide
- DEPLOYMENT.md for deployment instructions
- API.md for programmatic usage
- THEME_SHOWCASE.md for theme documentation
