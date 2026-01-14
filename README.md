<img src="./logo.svg" alt="Tunecamp" width="200" height="200" style="display: block; margin-bottom: 20px; margin-top: 20px; align-items: center; justify-content: center; margin-left: auto; margin-right: auto;"> 

# Tunecamp

A modern static site generator for musicians and music labels, written in JavaScript/TypeScript.

Inspired by [Faircamp](https://simonrepp.com/faircamp/), this tool helps you create beautiful, fast static websites to showcase your music without the need for databases or complex hosting.

## Features

- 🎵 **Audio-first**: Automatically reads metadata from your audio files
- 📦 **Zero database**: Pure static HTML generation
- 🎨 **Customizable**: Template-based theming system
- 🚀 **Fast**: Static sites that load instantly
- 📱 **Responsive**: Mobile-friendly out of the box
- 🔊 **Built-in player**: Modern HTML5 audio player
- 💿 **Multi-format**: Support for MP3, FLAC, OGG, WAV, and more
- 🏷️ **Flexible metadata**: YAML-based configuration files
- 📡 **RSS/Atom feeds**: Automatic feed generation for releases
- 🎙️ **Podcast support**: Generate podcast RSS feeds
- 📦 **Embed widgets**: Embeddable HTML widgets for releases
- 🎶 **M3U playlists**: Automatic playlist generation
- 🎨 **Procedural covers**: Auto-generate cover art if missing
- 🔐 **Unlock codes**: Decentralized download protection via GunDB
- 🏢 **Label mode**: Multi-artist catalog support

## Quick Start

### Installation

```bash
npm install -g tunecamp
# or
yarn global add tunecamp
```

### Basic Usage

1. **Create your catalog structure:**

```
my-music/
├── catalog.yaml
├── artist.yaml
└── releases/
    └── my-first-album/
        ├── release.yaml
        ├── cover.jpg
        └── tracks/
            ├── 01-track-one.mp3
            ├── 02-track-two.mp3
            └── track.yaml (optional)
```

2. **Configure your catalog:**

```yaml
# catalog.yaml
title: "My Music Catalog"
description: "Independent music releases"
url: "https://mymusic.com"
```

```yaml
# artist.yaml
name: "Artist Name"
bio: "Artist biography goes here"
links:
  - bandcamp: "https://artistname.bandcamp.com"
  - spotify: "https://open.spotify.com/artist/..."
donationLinks:
  - platform: "PayPal"
    url: "https://paypal.me/artistname"
    description: "Support the artist"
  - platform: "Ko-fi"
    url: "https://ko-fi.com/artistname"
    description: "Buy me a coffee"
```

```yaml
# releases/my-first-album/release.yaml
title: "My First Album"
date: "2024-01-15"
description: "An amazing debut album"
download: free # Options: free, paycurtain, codes, none
price: 10.00
paypalLink: "https://paypal.me/artistname/10"
stripeLink: "https://buy.stripe.com/..."
license: "cc-by" # Options: copyright, cc-by, cc-by-sa, cc-by-nc, cc-by-nc-sa, cc-by-nc-nd, cc-by-nd, public-domain
unlisted: false # Set to true to hide from index but keep accessible via direct link
```

3. **Generate your site:**

```bash
tunecamp build ./my-music --output ./public
```

4. **Deploy:**

Upload the `public` folder to any static hosting service (Netlify, Vercel, GitHub Pages, etc.)

## Deployment

### Deploying to Different Platforms

The `basePath` configuration is essential for correct asset loading when your site is deployed.

#### Root Domain Deployment

For deployments at the root of a domain (e.g., `mymusic.com`):

```yaml
# catalog.yaml
basePath: ""  # or omit the field
```

#### Subdirectory Deployment

For deployments in a subdirectory (e.g., GitHub Pages at `username.github.io/my-music`):

```yaml
# catalog.yaml
basePath: "/my-music"
```

#### Platform-Specific Examples

**GitHub Pages (Project Site)**
```yaml
basePath: "/repository-name"
```

**Netlify/Vercel (Custom Domain)**
```yaml
basePath: ""
```

**Netlify/Vercel (Subdirectory)**
```yaml
basePath: "/subfolder"
```

You can also override the `basePath` at build time:
```bash
tunecamp build ./my-music --output ./public --basePath /my-music
```

## Configuration Files

### catalog.yaml

Global catalog configuration:

```yaml
title: "Catalog Title"
description: "Catalog description"
url: "https://yoursite.com"
basePath: "" # Base path for deployment (empty for root, "/repo-name" for subdirectory)
theme: "default" # or custom theme name
language: "en"
headerImage: "header.png" # Optional: Image to replace title in header (Bandcamp-style)
customFont: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" # Optional: Custom font URL (Google Fonts, etc.) or local file path
customCSS: "custom.css" # Optional: Custom CSS file path (relative to input directory) or external URL
labelMode: false # Set to true for multi-artist label catalogs
podcast: # Optional podcast feed configuration
  enabled: true
  title: "My Podcast"
  description: "Podcast description"
  author: "Artist Name"
  email: "email@example.com"
  category: "Music"
  image: "podcast-cover.jpg"
  explicit: false
```

**Important**: The `basePath` option is crucial when deploying to subdirectories (e.g., GitHub Pages). If your site will be at `username.github.io/my-music/`, set `basePath: "/my-music"`.

### artist.yaml

Artist information:

```yaml
name: "Artist Name"
bio: "Biography text"
photo: "artist.jpg"
links:
  - website: "https://..."
  - bandcamp: "https://..."
  - spotify: "https://..."
  - instagram: "https://..."
```

### release.yaml

Individual release configuration:

```yaml
title: "Album Title"
date: "2024-01-15"
description: "Album description"
cover: "cover.jpg" # Optional, auto-detected (procedural cover generated if missing)
download: "free" # free, paycurtain, codes, none
price: 10.00 # For paycurtain mode
paypalLink: "https://paypal.me/artistname/10" # Optional PayPal link
stripeLink: "https://buy.stripe.com/..." # Optional Stripe link
license: "cc-by" # License type
genres:
  - "Electronic"
  - "Ambient"
credits:
  - role: "Producer"
    name: "Producer Name"
unlisted: false # Set to true to hide from index/feeds but keep accessible via direct link
artistSlug: "artist-name" # For label mode: associate release with an artist
unlockCodes: # For download: codes mode
  enabled: true
  namespace: tunecamp
  peers: # Optional custom GunDB peers
    - "https://your-relay.com/gun"
```

### track.yaml

Optional track-level metadata overrides:

```yaml
tracks:
  - file: "01-track.mp3"
    title: "Custom Title"
    description: "Track notes"
```

## CLI Commands

```bash
# Build a catalog
tunecamp build <input-dir> --output <output-dir>

# Build with custom base path (overrides catalog.yaml)
tunecamp build <input-dir> --output <output-dir> --basePath /my-music

# Build with custom theme (overrides catalog.yaml)
tunecamp build <input-dir> --output <output-dir> --theme dark

# Serve locally
tunecamp serve <output-dir> --port 3000

# Initialize a new catalog
tunecamp init <directory>
```

## Development Modes

### Free Downloads

```yaml
download: free
```

All tracks available for immediate download.

### Soft Paycurtain (Honor System)

```yaml
download: paycurtain
price: 10.00
paypalLink: "https://paypal.me/artistname/10"
stripeLink: "https://buy.stripe.com/..."
```

Pay-what-you-want with suggested price. Users can download for free, but are encouraged to support the artist.

**⚠️ Important**: This is an **honor system** - all files remain technically downloadable. PayPal and Stripe links are simply displayed as buttons; there is no payment verification or gating. If you need real download protection, use the `codes` mode instead.

### Unlock Codes (Decentralized Protection)

```yaml
download: codes
unlockCodes:
  enabled: true
  namespace: tunecamp  # Optional, default: tunecamp
```

Protect downloads with unlock codes validated via GunDB (decentralized, no backend required). See [Unlock Codes Guide](./docs/unlock-codes-guida.md) for details.

**⚠️ Important - Self-Hosting Required**: The code generation tool (`generate-codes.ts`) must be run locally on your machine where you have access to the Tunecamp source code. If you deploy only the static HTML output (e.g., to Vercel, Netlify, GitHub Pages), you won't be able to generate new codes from the deployed site - it's just static HTML.

**Workflow:**
1. Run `tunecamp build` locally
2. Generate codes locally: `npx ts-node src/tools/generate-codes.ts <release-slug> --count 20`
3. Deploy the static `public/` folder to your hosting
4. Distribute the generated codes to your customers

Generate codes using:
```bash
npx ts-node src/tools/generate-codes.ts <release-slug> --count 20
```

### Download Statistics (Public GunDB)

Tunecamp automatically tracks and displays download counts for your releases using a public GunDB space. This works out of the box with no configuration required:

- **Real-time counter**: Download counts update in real-time across all visitors
- **Decentralized**: No server required - data is stored on public GunDB peers
- **Anonymous**: No user tracking, just simple counters
- **Visible to all**: Download counts are shown on each release page

The download counter increments when users click "Download All" or individual track download buttons.

## Supported Audio Formats

- MP3
- FLAC
- OGG Vorbis
- WAV
- M4A/AAC
- OPUS

## Themes

tunecamp includes 5 ready-to-use themes:

### Available Themes

1. **default** - Modern dark theme with purple/blue gradients
2. **minimal** - Clean light theme with lots of white space
3. **dark** - Aggressive dark theme with red accents (perfect for rock/metal)
4. **retro** - 80s-inspired theme with neon colors (perfect for synthwave/vaporwave)
5. **translucent** - Glassmorphism theme with blur effects and transparency (perfect for ambient/electronic)

### Using a Theme

Specify the theme in your `catalog.yaml`:

```yaml
catalog:
  title: "My Music"
  theme: "translucent"  # Change to: default, minimal, dark, retro, or translucent
```

Or use the `--theme` option when building:

```bash
tunecamp build ./my-music --output ./public --theme translucent
```

### Creating Custom Themes

Create your own theme by adding a folder in the `templates/` directory:

```
templates/my-theme/
├── layout.hbs
├── index.hbs
├── release.hbs
└── assets/
    ├── style.css
    └── player.js
```

For detailed information about themes, see [Theme Documentation](./docs/THEMES.md).

## Generated Files

When you build a catalog, Tunecamp automatically generates:

- **HTML pages**: `index.html` and release pages
- **RSS/Atom feeds**: `feed.xml` (RSS 2.0) and `atom.xml`
- **Podcast feed**: `podcast.xml` (if enabled in config)
- **M3U playlists**: `playlist.m3u` for each release and `catalog.m3u` for the entire catalog
- **Embed widgets**: `embed.html`, `embed-code.txt`, and `embed-compact.txt` for each release
- **Procedural covers**: Auto-generated SVG covers if release has no cover art

### Embed Widgets

Each release gets embeddable HTML widgets that you can use on other websites:

- **Full embed**: Complete widget with cover, info, and audio player
- **Compact embed**: Smaller inline widget
- **Iframe embed**: Standalone embed page for iframe embedding

Access embed codes at: `releases/<release-slug>/embed-code.txt`

**Share & Embed Section**: Each release page includes a "Share & Embed" section at the top with:
- **Catalog link**: Quick navigation back to the main catalog
- **RSS/Atom feeds**: Direct links to `feed.xml` (RSS 2.0) and `atom.xml` for feed readers
- **Copy link**: One-click button to copy the release URL to clipboard
- **Embed code**: Modal viewer with tabs for full and compact embed codes, with copy functionality
- All embed codes are accessible directly from the page without needing to navigate to text files

### RSS/Atom Feeds

Automatic feed generation for:
- RSS 2.0 feed at `feed.xml`
- Atom feed at `atom.xml`
- Podcast RSS feed at `podcast.xml` (if enabled)

All feeds include proper metadata, cover images, and track information.

### M3U Playlists

Playlists are generated for:
- Each individual release: `releases/<release-slug>/playlist.m3u`
- Entire catalog: `catalog.m3u`

Playlists include track metadata (duration, artist, title) and can be opened in any music player.

## Examples

Check the `/examples` directory for complete catalog examples:

- **artist-free**: Simple artist catalog with free downloads
- **artist-paycurtain**: Artist with pay-what-you-want model
- **label**: Multi-artist label catalog

## API Usage

You can also use tunecamp programmatically:

```javascript
import { Tunecamp } from "tunecamp";

const generator = new Tunecamp({
  inputDir: "./my-music",
  outputDir: "./public",
  theme: "default",
});

await generator.build();
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Credits

Inspired by [Faircamp](https://simonrepp.com/faircamp/) by Simon Repp.

## Advanced Features

### Label Mode (Multi-Artist)

Enable label mode to create catalogs with multiple artists:

```yaml
# catalog.yaml
labelMode: true
```

Create `artists/` directory with artist YAML files. Each release can be associated with an artist using `artistSlug` in `release.yaml`.

### Unlisted Releases

Hide releases from the main index and feeds while keeping them accessible via direct link:

```yaml
# release.yaml
unlisted: true
```

Useful for:
- Work-in-progress releases
- Exclusive content
- Testing releases before public launch

### Procedural Cover Generation

If a release has no cover art, Tunecamp automatically generates a procedural SVG cover based on the release title and artist name. The cover uses deterministic algorithms (no AI) to create unique, consistent artwork.

### Header Image (Bandcamp-style)

Replace the text title in the header with a custom image, similar to Bandcamp:

```yaml
# catalog.yaml
headerImage: "header.png"  # Path relative to catalog directory
```

The header image will be displayed prominently at the top of all pages. If `headerImage` is set, the text title and description are hidden to avoid redundancy.

### Custom Font

Add custom fonts from Google Fonts or other sources:

```yaml
# catalog.yaml
customFont: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
```

The font will be loaded before the theme CSS, allowing you to use it in your custom CSS.

### Custom CSS

Add custom CSS to override or extend theme styles. You can use either a local file or an external URL:

```yaml
# catalog.yaml
# Local file (copied to assets/ during build)
customCSS: "custom.css"

# Or external URL (CDN, etc.)
customCSS: "https://cdn.jsdelivr.net/npm/water.css@2/out/water.css"
```

Local CSS files are copied to the `assets/` directory during build. The custom CSS is loaded after the theme CSS, so your styles will override the default theme.

**Example custom.css:**

```css
/* Apply custom font to body */
body {
  font-family: 'Inter', sans-serif;
}

/* Custom header image styling */
.header-image {
  max-height: 300px;
  border-radius: 8px;
}
```

## Links

- [Documentation](./docs)
  - [Deployment Guide](./docs/DEPLOYMENT.md)
  - [API Documentation](./docs/API.md)
  - [Theme Showcase](./docs/THEME_SHOWCASE.md)
  - [Unlock Codes Guide](./docs/unlock-codes-guida.md)
- [Examples](./examples)
- [Changelog](./CHANGELOG.md)
