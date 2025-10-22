/**
 * Type definitions for Shogun Faircamp
 */

export interface CatalogConfig {
  title: string;
  description?: string;
  url?: string;
  basePath?: string; // Base path for deployment (e.g., "" for root, "/repo-name" for subdirectory)
  theme?: string;
  language?: string;
  metadata?: Record<string, any>;
}

export interface ArtistConfig {
  name: string;
  bio?: string;
  photo?: string;
  links?: ArtistLink[];
  donationLinks?: DonationLink[];
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

export type DownloadMode = 'free' | 'paycurtain' | 'none';

export type LicenseType = 'copyright' | 'cc-by' | 'cc-by-sa' | 'cc-by-nc' | 'cc-by-nc-sa' | 'cc-by-nc-nd' | 'cc-by-nd' | 'public-domain';

export interface ReleaseConfig {
  title: string;
  date: string;
  description?: string;
  cover?: string;
  download?: DownloadMode;
  price?: number;
  paypalLink?: string;
  stripeLink?: string;
  license?: LicenseType;
  genres?: string[];
  credits?: Credit[];
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
  artist?: ArtistConfig;
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

