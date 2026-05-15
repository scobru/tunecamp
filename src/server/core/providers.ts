import { SoundCloudStreamingProvider } from "../providers/streaming/soundcloud.provider.js";
import { SoundCloudMetadataProvider } from "../providers/metadata/soundcloud.metadata.js";
import { ITunesProvider } from "../providers/metadata/itunes.provider.js";
import { MusicBrainzProvider } from "../providers/metadata/musicbrainz.provider.js";
import { DiscogsProvider } from "../providers/metadata/discogs.provider.js";
import { TheAudioDBProvider } from "../providers/metadata/theaudiodb.provider.js";
import { SpotifyProvider } from "../providers/metadata/spotify.provider.js";
import { DeezerProvider } from "../providers/playlists/deezer.playlist.js";
import { BandcampMetadataProvider } from "../providers/metadata/bandcamp.metadata.js";
import { BandcampProvider } from "../providers/streaming/bandcamp.provider.js";
import { YouTubeStreamingProvider } from "../providers/streaming/youtube.provider.js";

/**
 * Shared provider instances to avoid redundant initialization and double logging.
 */

// Streaming & Metadata (Dual)

// Metadata Only (or specialized)
export const soundcloudMetadataProvider = new SoundCloudMetadataProvider();
export const itunesProvider = new ITunesProvider();
export const musicbrainzProvider = new MusicBrainzProvider();
export const discogsProvider = new DiscogsProvider();
export const theaudiodbProvider = new TheAudioDBProvider();
export const spotifyProvider = new SpotifyProvider();
export const deezerProvider = new DeezerProvider();
export const bandcampMetadataProvider = new BandcampMetadataProvider();

// Streaming Specialized
export const soundcloudStreamingProvider = new SoundCloudStreamingProvider();
export const bandcampStreamingProvider = new BandcampProvider();
export const youtubeProvider = new YouTubeStreamingProvider();
