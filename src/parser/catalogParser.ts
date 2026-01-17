import path from 'path';
import fs from 'fs-extra';
import { Catalog, Release, ReleaseConfig, TrackMetadata } from '../types/index.js';
import {
  readCatalogConfig,
  readArtistConfig,
  readReleaseConfig,
} from '../utils/configUtils.js';
import { findAudioFiles, findCover, createSlug } from '../utils/fileUtils.js';
import { readAudioMetadata } from '../utils/audioUtils.js';

/**
 * Parses catalog directory and extracts all metadata
 */
export class CatalogParser {
  private inputDir: string;

  constructor(inputDir: string) {
    this.inputDir = inputDir;
  }

  async parse(): Promise<Catalog> {
    console.log('📚 Parsing catalog...');

    // Read main configs
    const catalogConfig = await readCatalogConfig(this.inputDir);
    const artistConfig = await readArtistConfig(this.inputDir);

    // Find all releases
    const releases = await this.findReleases();

    console.log(`✅ Found ${releases.length} release(s)`);

    return {
      config: catalogConfig,
      artist: artistConfig || undefined,
      releases,
    };
  }

  private async findReleases(): Promise<Release[]> {
    const releases: Release[] = [];
    const releasesDir = path.join(this.inputDir, 'releases');

    if (!(await fs.pathExists(releasesDir))) {
      console.warn('⚠️  No releases directory found');
      return releases;
    }

    const entries = await fs.readdir(releasesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const releaseDir = path.join(releasesDir, entry.name);

        try {
          const release = await this.parseRelease(releaseDir, entry.name);
          if (release) {
            releases.push(release);
          }
        } catch (error) {
          console.error(`❌ Error parsing release ${entry.name}:`, error);
        }
      }
    }

    // Sort by date (newest first)
    releases.sort((a, b) => {
      const dateA = new Date(a.config.date).getTime();
      const dateB = new Date(b.config.date).getTime();
      return dateB - dateA;
    });

    return releases;
  }

  private async parseRelease(releaseDir: string, dirName: string): Promise<Release | null> {
    console.log(`  📀 Parsing release: ${dirName}`);

    // Read release config
    let releaseConfig = await readReleaseConfig(releaseDir);

    // If no config, try to use directory name as title
    if (!releaseConfig) {
      const tracksDir = path.join(releaseDir, 'tracks');
      const hasAudio = (await findAudioFiles(releaseDir)).length > 0 ||
        (await fs.pathExists(tracksDir) && (await findAudioFiles(tracksDir)).length > 0);

      if (!hasAudio) {
        return null;
      }

      releaseConfig = {
        title: dirName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        date: new Date().toISOString().split('T')[0],
      };
    }

    // Find tracks
    const tracks = await this.findTracks(releaseDir);

    if (tracks.length === 0) {
      console.warn(`  ⚠️  No tracks found in ${dirName}`);
      return null;
    }

    // Find cover
    const coverPath = await findCover(releaseDir);

    const release: Release = {
      config: releaseConfig,
      tracks,
      coverPath,
      path: releaseDir,
      slug: createSlug(releaseConfig.title),
    };

    console.log(`    ✅ ${tracks.length} track(s) found`);

    return release;
  }

  private async findTracks(releaseDir: string): Promise<TrackMetadata[]> {
    const tracks: TrackMetadata[] = [];
    const seenFiles = new Set<string>(); // Track seen filenames to prevent duplicates

    // Check both root and tracks/ subdirectory
    const searchDirs = [
      releaseDir,
      path.join(releaseDir, 'tracks'),
    ];

    for (const dir of searchDirs) {
      if (await fs.pathExists(dir)) {
        const audioFiles = await findAudioFiles(dir);

        for (const audioFile of audioFiles) {
          // Only process files directly in this directory (not in subdirectories)
          // This prevents duplicates from recursive glob matching
          if (audioFile.includes('/') || audioFile.includes('\\')) {
            continue;
          }

          // Skip if we've already seen this filename
          const basename = path.basename(audioFile);
          if (seenFiles.has(basename)) {
            continue;
          }
          seenFiles.add(basename);

          const fullPath = path.join(dir, audioFile);
          const metadata = await readAudioMetadata(fullPath);
          tracks.push(metadata);
        }
      }
    }

    // Sort by track number or filename
    tracks.sort((a, b) => {
      if (a.track && b.track) {
        return a.track - b.track;
      }
      return a.filename.localeCompare(b.filename);
    });

    return tracks;
  }
}

