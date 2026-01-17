# Changelog

All notable changes to Tunecamp will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.3] - 2026-01-17

### Fixed

- **Community Registry Unlisted Releases**: Releases with `unlisted: true` are now excluded from the community registry
  - Unlisted release tracks are not registered in the community player
  - Unlisted releases do not appear in the "now playing" feature (`currentPage` is not updated)
  - Site homepage registration still works normally - only unlisted releases are excluded

## [1.1.2] - 2026-01-17

### Added

- **Streaming Links Support**: Added `streamingLinks` field to `release.yaml` for custom links to listen on platforms (Spotify, Apple Music, YouTube Music, etc.)
  - Links are displayed prominently after genres, before the audio player
  - Supports unlimited custom platforms with `platform` and `url` fields
  - Styled as clickable buttons with hover effects

## [1.1.1] - 2026-01-17

### Changed

- **Improved Audio Player Layout**: Audio player is now positioned prominently immediately after basic release metadata (title, artist, date, genres), before description, credits, and support sections
  - Better visibility and accessibility - player appears right after core information, no need to scroll through lyrics/credits
  - Player is now separated from the header section for better visual hierarchy
  - Enhanced styling with improved margins and subtle box-shadow
  - More intuitive user experience - player is the first interactive element users see after release details

### Removed

- **Wizard (CLI and Web)**: Removed both CLI and web-based wizard interfaces
  - Users should use `tunecamp init <directory>` to initialize a new catalog with template files
  - Manual YAML file creation is straightforward and provides more flexibility
  - All wizard files removed from `src/wizard/` and `website/wizard/` directories
  - References to wizard removed from documentation, website, and CLI commands

## [1.1.0] - 2026-01-17

### Added

- **Community Player**: Centralized player to discover and listen to music from all Tunecamp sites
  - Streams tracks from all registered sites in the community
  - Search and filter by artist
  - Shuffle play and queue management
  - Real-time updates via GunDB
  - Available at [tunecamp.vercel.app/player.html](https://tunecamp.vercel.app/player.html)
- **Community Directory**: Browse all Tunecamp sites in one place
  - Auto-registration of sites via GunDB
  - Real-time updates with live indicator
  - Deduplication of duplicate entries
- **Background Image Support**: New `backgroundImage` option in `catalog.yaml` for custom page backgrounds
  - Supports local files and external URLs
  - Separate from header image - covers entire page body
  - Semi-transparent overlay for text readability
- **M3U Playlist Links**: Download links to playlists now available in frontend
  - Homepage sidebar: Link to `catalog.m3u`
  - Release pages: Link to `playlist.m3u` in Share & Embed section

### Changed

- **Website Redesign**: Complete redesign of tunecamp.vercel.app with Faircamp-inspired aesthetics
  - Clean, minimal design with dark mode support
  - Feature cards and improved typography
  - Support button linking to Buy Me a Coffee
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

- **Wizard YAML Link Import**: Fixed bug where importing an existing project only recognized the `website` link, ignoring other social links (bandcamp, spotify, instagram, etc.)
  - Parser now correctly creates a separate object for each link in the YAML array
- **Track Deduplication**: Player now deduplicates tracks by title + artist, keeping only the most recent version
- **Site Deduplication**: Community directory now deduplicates sites, preventing duplicate entries
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
