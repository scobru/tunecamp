# My Music Catalog

This is your Tunecamp catalog.

## Structure

- `catalog.yaml` - Main catalog configuration
- `artist.yaml` - Artist information
- `releases/` - Your music releases
  - Each subdirectory is a release
  - Add `release.yaml` to configure each release
  - Add audio files and cover art

## Usage

1. Add your music files to `releases/your-album-name/tracks/`
2. Add cover art (cover.jpg, cover.png, etc.)
3. Configure `release.yaml` for each album
4. Build: `tunecamp build . -o public`
5. Deploy the `public` folder

## Documentation

See https://github.com/scobru/tunecamp for full documentation.
