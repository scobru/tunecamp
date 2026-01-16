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
- 🎶 **M3U playlists**: Automatic playlist generation with frontend download links
- 🎨 **Procedural covers**: Auto-generate cover art if missing
- 🔐 **Unlock codes**: Decentralized download protection via GunDB
- 🏢 **Label mode**: Multi-artist catalog support
- 🧙 **Interactive Wizard**: CLI and Web-based wizard for easy catalog creation
- 🖼️ **Custom backgrounds**: Header and page background image support
- 🔗 **Remote audio files**: Use external URLs for audio files instead of local files

## Quick Start

### Installation

```bash
npm install -g tunecamp
# or
yarn global add tunecamp
```

### Using the Wizard (Easiest Way)

Tunecamp includes an interactive wizard to help you create your catalog without manually editing YAML files.

**CLI Wizard:**
```bash
tunecamp wizard
```

**Web Wizard:**
Open `wizard/index.html` in your browser for a visual, step-by-step interface that:

**Online Wizard:**
The wizard can also be deployed online (Netlify, Vercel, GitHub Pages, etc.) so users can generate sites directly from the web without downloading files. See `wizard/README.md` for deployment instructions.
- Guides you through all configuration steps
- Allows file uploads (cover images and audio files)
- Provides live previews
- Generates a complete deployable site as a ZIP file
- Supports multiple languages (English/Italian)

The web wizard generates everything you need - just download the ZIP and deploy it!

**Deploy the Wizard Online:**
The wizard is 100% client-side and can be deployed to any static hosting service. Users can then access it online to generate their sites without downloading anything locally. See `wizard/README.md` for deployment details.

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

# Serve locally
tunecamp serve <output-dir> --port 3000

# Initialize a new catalog
tunecamp init <directory>

# Interactive wizard (CLI)
tunecamp wizard

# Interactive wizard (Web - open wizard/index.html in browser)
# The web wizard generates a complete site including uploaded files as a ZIP download
```

## Wizard

Tunecamp includes an interactive wizard to help you create your catalog without manually editing YAML files.

### CLI Wizard

Run the wizard from the command line:

```bash
tunecamp wizard
```

The CLI wizard guides you through:
1. Language selection (English/Italian)
2. Catalog configuration (title, description, URL)
3. Artist information (name, bio, social links)
4. First release setup (title, date, description, genres)
5. Download mode selection (free, paycurtain, codes, none)

The wizard generates all necessary YAML files and creates the catalog structure automatically.

### Web Wizard

For a visual, user-friendly interface, use the web wizard:

1. Open `wizard/index.html` in your browser
2. Follow the step-by-step guide
3. Upload cover images and audio files directly
4. Get live previews of your site
5. Download a complete, deployable ZIP file

**Web Wizard Features:**
- Drag-and-drop file uploads
- Live preview of generated site
- Support for both local file uploads and external URLs for audio files
- Complete site generation in the browser
- ZIP download with all files included
- Multilingual support (English/Italian)
- Background and header image customization

The web wizard is especially useful for users who prefer a GUI over the command line.

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

Protect downloads with unlock codes validated via GunDB (decentralized, no backend required). See [Unlock Codes Guide](./docs/UNLOCK_CODES.md) for details.

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

### Community Registry (Decentralized Directory)

Tunecamp includes an automatic community registry powered by GunDB. When someone visits your Tunecamp site, it gets automatically registered in a decentralized directory of Tunecamp sites.

**Features:**
- **Automatic registration**: No sign-up needed - your site is discovered when visited
- **Decentralized**: Data stored on public GunDB peers, no central server
- **Real-time**: New sites appear instantly in the community directory
- **Privacy-respecting**: Only public info is shared (URL, title, artist name)

**How it works:**
1. Build and deploy your Tunecamp site
2. When a visitor loads your site, it registers automatically
3. Your site appears in the [Tunecamp Community](https://tunecamp.dev/community.html) directory
4. Discover other independent artists using Tunecamp!

You can disable auto-registration by removing the `community-registry.js` script from your build output.

## Supported Audio Formats

- MP3
- FLAC
- OGG Vorbis
- WAV
- M4A/AAC
- OPUS

## Themes

Tunecamp includes a single, highly customizable theme:

### Default Theme

The **default** theme is a modern, Faircamp-inspired design with:
- Dark/light mode toggle
- Responsive two-column layout
- Integrated header with background image support
- Modern navigation bar
- Customizable colors via CSS variables

### Customization

You can customize the default theme using:

- **Background images**: Set `backgroundImage` in `catalog.yaml` for a custom page background
- **Header images**: Set `headerImage` in `catalog.yaml` for a custom header image
- **Custom CSS**: Add `customCSS` to override styles or change colors
- **Custom fonts**: Add `customFont` for typography customization

The theme uses CSS variables for easy customization:
- `--bg-color`: Main background color
- `--text-color`: Primary text color
- `--accent`: Accent color (buttons, links)
- `--accent-hover`: Hover state for accent
- And more (see `templates/default/assets/style.css`)

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

For detailed information about themes, see [Theme Showcase](./docs/THEME_SHOWCASE.md).

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
headerImage: "header.png"  # Path relative to catalog directory or URL
```

The header image will be displayed prominently at the top of all pages in the header section. This image appears in the header area with the navigation bar.

### Page Background Image

Set a custom background image for the entire page:

```yaml
# catalog.yaml
backgroundImage: "background.png"  # Path relative to catalog directory or URL
```

The background image will cover the entire page with a semi-transparent overlay to maintain text readability. This is separate from the header image - the header image appears in the header section, while the background image covers the entire page body.

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
  - [Unlock Codes Guide](./docs/UNLOCK_CODES.md)
- [Examples](./examples)
- [Changelog](./CHANGELOG.md)
