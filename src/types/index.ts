/**
 * Type definitions for Tunecamp
 */

export interface CatalogConfig {
  title: string;
  description?: string;
  url?: string;
  basePath?: string; // Base path for deployment (e.g., "" for root, "/repo-name" for subdirectory)
  theme?: string;
  language?: string;
  headerImage?: string; // Header image path (replaces title text, like Bandcamp)
  backgroundImage?: string; // Background image path for entire page (local file or URL)
  backgroundImageUrl?: string; // Background image URL (alternative to backgroundImage, for consistency)
  customFont?: string; // Custom font URL (e.g., Google Fonts) or local file path
  customCSS?: string; // Custom CSS file path (relative to input directory) or URL
  labelMode?: boolean; // Enable multi-artist label mode
  podcast?: PodcastConfig; // Podcast feed configuration
  metadata?: Record<string, any>;
}

export interface PodcastConfig {
  enabled?: boolean;
  title?: string;
  description?: string;
  author?: string;
  email?: string;
  category?: string;
  image?: string;
  explicit?: boolean;
}

export interface ArtistConfig {
  name: string;
  bio?: string;
  photo?: string;
  links?: ArtistLink[];
  donationLinks?: DonationLink[];
  slug?: string; // For label mode: artist page URL slug
  metadata?: Record<string, any>;
}

export interface DonationLink {
  platform: string;
  url: string;
  description?: string;
}

export interface ArtistLink {
  [platform: string]: string;
}

export type DownloadMode = 'free' | 'paycurtain' | 'codes' | 'none';

export type LicenseType = 'copyright' | 'cc-by' | 'cc-by-sa' | 'cc-by-nc' | 'cc-by-nc-sa' | 'cc-by-nc-nd' | 'cc-by-nd' | 'public-domain';

export interface UnlockCodesConfig {
  enabled: boolean;
  namespace?: string; // GunDB namespace (default: 'tunecamp')
  peers?: string[]; // Custom GunDB peers (optional)
}

export interface ReleaseConfig {
  title: string;
  date: string;
  description?: string;
  cover?: string;
  download?: DownloadMode;
  unlockCodes?: UnlockCodesConfig; // For 'codes' download mode
  price?: number;
  paypalLink?: string;
  stripeLink?: string;
  license?: LicenseType;
  genres?: string[];
  credits?: Credit[];
  unlisted?: boolean; // If true, release is hidden from index but accessible via direct link
  artistSlug?: string; // For label mode: associate release with an artist
  metadata?: Record<string, any>;
}

export interface Credit {
  role: string;
  name: string;
}

export interface TrackConfig {
  file: string;
  title?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface TrackMetadata {
  file: string;
  filename: string;
  title: string;
  artist?: string;
  album?: string;
  year?: number;
  track?: number;
  duration?: number;
  format?: string;
  bitrate?: number;
  sampleRate?: number;
  description?: string;
  genre?: string[];
}

export interface Release {
  config: ReleaseConfig;
  tracks: TrackMetadata[];
  coverPath?: string;
  path: string;
  slug: string;
}

export interface Catalog {
  config: CatalogConfig;
  artist?: ArtistConfig; // Single artist (non-label mode)
  artists?: ArtistConfig[]; // Multiple artists (label mode)
  releases: Release[];
}

export interface BuildOptions {
  inputDir: string;
  outputDir: string;
  theme?: string;
  basePath?: string; // Override basePath from config
  verbose?: boolean;
}

export interface GeneratorOptions extends BuildOptions {
  watch?: boolean;
}

