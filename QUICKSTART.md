# Quick Start Guide

Get up and running with Tunecamp in 5 minutes!

## Installation

```bash
cd tunecamp
yarn install
yarn build
```

## Option 1: Use the Example

Test with the provided example:

```bash
# Build the example catalog
node dist/cli.js build ./examples/artist-free -o ./test-output

# View the result
node dist/cli.js serve ./test-output
```

Then open http://localhost:3000 in your browser!

## Option 2: Create Your Own Catalog

### 1. Initialize a new catalog

**Manual Setup**

```bash
node dist/cli.js init ./my-music
cd my-music
```

This creates:
```
my-music/
├── catalog.yaml
├── artist.yaml
├── releases/
│   └── example-album/
│       ├── release.yaml
│       └── tracks/
└── README.md
```

### 2. Add Your Music

1. **Add your audio files** to `releases/example-album/tracks/`:
   - Supported formats: MP3, FLAC, OGG, WAV, M4A, OPUS
   - Name them like: `01-track-name.mp3`, `02-another-track.mp3`, etc.

2. **Add cover art** (optional):
   - Add `cover.jpg` or `cover.png` to the `releases/example-album/` folder

### 3. Configure Your Catalog

Edit `catalog.yaml`:
```yaml
title: "My Music"
description: "My awesome music collection"
url: "https://mymusic.com"
theme: "default"  # Currently only default theme is available
headerImage: "image.png"  # Optional: Header image
backgroundImage: "background.png"  # Optional: Page background image
```

Edit `artist.yaml`:
```yaml
name: "Your Name"
bio: "Your biography here"
links:
  - bandcamp: "https://yourname.bandcamp.com"
  - spotify: "https://open.spotify.com/artist/..."
```

Edit `releases/example-album/release.yaml`:
```yaml
title: "My Album"
date: "2024-10-21"
description: "Description of your album"
download: "free"  # Options: free, paycurtain, codes, none
genres:
  - "Your Genre"
streamingLinks: # Optional links to listen on streaming platforms
  - platform: "Spotify"
    url: "https://open.spotify.com/track/..."
  - platform: "Apple Music"
    url: "https://music.apple.com/album/..."
```

### 4. Build Your Site

```bash
cd ..
node dist/cli.js build ./my-music -o ./public
```

### 5. Preview Locally

```bash
node dist/cli.js serve ./public
```

Open http://localhost:3000

### 6. Deploy

Upload the `public` folder to any static hosting:

#### Netlify
```bash
# Drag and drop the public folder to netlify.com
# Or use CLI:
netlify deploy --dir=public --prod
```

#### Vercel
```bash
vercel --prod public
```

#### GitHub Pages
```bash
cd public
git init
git add .
git commit -m "Deploy music site"
git remote add origin <your-repo-url>
git push -u origin main
```

## Adding More Releases

Create a new directory in `releases/`:

```bash
mkdir -p my-music/releases/my-second-album/tracks
```

Add a `release.yaml`:
```yaml
title: "Second Album"
date: "2024-11-01"
download: "free"
genres:
  - "Electronic"
```

Add your tracks and rebuild!

## Common Configurations

### Free Downloads
```yaml
download: "free"
```

### Pay What You Want
```yaml
download: "paycurtain"
price: 10.00
```

### Download Codes Only
```yaml
download: "codes"
```

### No Downloads (Streaming Only)
```yaml
download: "none"
```

## Tips

1. **Track Metadata**: The generator reads metadata from your audio files automatically
2. **Cover Art**: Name it `cover.jpg`, `cover.png`, `artwork.jpg`, etc.
3. **Track Order**: Files are sorted alphabetically, use numbers: `01-`, `02-`, etc.
4. **Genres**: Add multiple genres as a YAML array
5. **Credits**: Add credits to your releases for collaborators

## Customization

Tunecamp's default theme is highly customizable:

- **Background images**: Add `backgroundImage` to `catalog.yaml` for a custom page background
- **Header images**: Add `headerImage` to `catalog.yaml` for a custom header image
- **Custom CSS**: Add `customCSS` to override styles or change colors
- **Custom fonts**: Add `customFont` for typography customization

The theme uses CSS variables that you can override in your custom CSS. See the README for details on customization options.

## Next Steps

- [Read the full documentation](README.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Server mode](docs/SERVER.md)
- [REST API](docs/API.md)
- [Browse examples](examples/)

## Troubleshooting

### "Cannot find catalog.yaml"
Make sure you're running the build command from the right directory, and `catalog.yaml` exists in your input folder.

### "No tracks found"
- Check that your audio files are in a supported format
- Make sure they're in the `tracks/` subdirectory or directly in the release folder
- Verify file permissions

### Build errors
Run with verbose mode:
```bash
node dist/cli.js build ./my-music -o ./public --verbose
```

## Getting Help

- Check the [examples](examples/) directory
- Read the [README](README.md)
- Open an issue on GitHub

Happy music sharing! 🎵

