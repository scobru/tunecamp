import { YouTubeStreamingProvider } from "../providers/streaming/youtube.provider.js";
import { BandcampStreamingProvider } from "../providers/streaming/bandcamp.provider.js";
import { SoundCloudStreamingProvider } from "../providers/streaming/soundcloud.provider.js";
import { KhInsiderProvider } from "../providers/streaming/khinsider.provider.js";
import { HiFiProvider } from "../providers/streaming/hifi.provider.js";
import { BandcampMetadataProvider } from "../providers/metadata/bandcamp.metadata.js";
import { SoundCloudMetadataProvider } from "../providers/metadata/soundcloud.metadata.js";
import { ITunesProvider } from "../providers/metadata/itunes.provider.js";
import { MusicBrainzProvider } from "../providers/metadata/musicbrainz.provider.js";
import { DiscogsProvider } from "../providers/metadata/discogs.provider.js";
import { TheAudioDBProvider } from "../providers/metadata/theaudiodb.provider.js";
import { SpotifyProvider } from "../providers/metadata/spotify.provider.js";
import { DeezerProvider } from "../providers/playlists/deezer.playlist.js";

/**
 * Shared provider instances to avoid redundant initialization and double logging.
 */

// Streaming & Metadata (Dual)
export const youtubeProvider = new YouTubeStreamingProvider(process.env.YOUTUBE_COOKIES_PATH);
export const khinsiderProvider = new KhInsiderProvider();
export const hifiProvider = new HiFiProvider();

// Metadata Only (or specialized)
export const bandcampMetadataProvider = new BandcampMetadataProvider();
export const soundcloudMetadataProvider = new SoundCloudMetadataProvider();
export const itunesProvider = new ITunesProvider();
export const musicbrainzProvider = new MusicBrainzProvider();
export const discogsProvider = new DiscogsProvider();
export const theaudiodbProvider = new TheAudioDBProvider();
export const spotifyProvider = new SpotifyProvider();
export const deezerProvider = new DeezerProvider();

// Streaming Specialized
export const bandcampStreamingProvider = new BandcampStreamingProvider();
export const soundcloudStreamingProvider = new SoundCloudStreamingProvider();
