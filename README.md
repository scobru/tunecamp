<img src="./logo.svg" alt="Tunecamp" width="100" height="100" style="display: block; margin-bottom: 20px; margin-top: 20px;"> 

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
download: free # Options: free, paycurtain, none
price: 10.00
paypalLink: "https://paypal.me/artistname/10"
stripeLink: "https://buy.stripe.com/..."
license: "cc-by" # Options: copyright, cc-by, cc-by-sa, cc-by-nc, cc-by-nc-sa, cc-by-nc-nd, cc-by-nd, public-domain
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
cover: "cover.jpg" # Optional, auto-detected
download: "free" # free, paycurtain, none
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

# Watch for changes and rebuild
tunecamp watch <input-dir> --output <output-dir>

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

Pay-what-you-want with suggested price. Users can download for free, but are encouraged to support the artist. This is an honor system - all files are technically downloadable.

## Supported Audio Formats

- MP3
- FLAC
- OGG Vorbis
- WAV
- M4A/AAC
- OPUS

## Themes

tunecamp includes 4 ready-to-use themes:

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

## Links

- [Documentation](./docs)
  - [Deployment Guide](./docs/DEPLOYMENT.md)
  - [API Documentation](./docs/API.md)
  - [Theme Documentation](./docs/THEMES.md)
  - [Theme Showcase](./docs/THEME_SHOWCASE.md)
- [Examples](./examples)
- [Changelog](./CHANGELOG.md)
