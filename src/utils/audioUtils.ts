import { parseFile } from 'music-metadata';
import path from 'path';
import { TrackMetadata } from '../types/index.js';

/**
 * Audio file utilities
 */

export async function readAudioMetadata(filePath: string): Promise<TrackMetadata> {
  try {
    const metadata = await parseFile(filePath);
    const filename = path.basename(filePath);

    return {
      file: filePath,
      filename,
      title: metadata.common.title || filename.replace(/\.[^.]+$/, ''),
      artist: metadata.common.artist,
      album: metadata.common.album,
      year: metadata.common.year,
      track: metadata.common.track.no ?? undefined,
      duration: metadata.format.duration,
      format: metadata.format.container,
      bitrate: metadata.format.bitrate,
      sampleRate: metadata.format.sampleRate,
      genre: metadata.common.genre,
    };
  } catch (error) {
    // Fallback if metadata reading fails
    const filename = path.basename(filePath);
    return {
      file: filePath,
      filename,
      title: filename.replace(/\.[^.]+$/, ''),
    };
  }
}

import {
  format_duration as formatDurationGleam,
  format_file_size as formatFileSizeGleam
} from '../gleam_generated/audio_utils.js';

export function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  return formatDurationGleam(seconds);
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return '0 B';
  // Gleam handles int/float, we pass number (which is float in JS/Gleam usually, 
  // but Gleam int is distinct. Our Gleam code accepted Int for file size.
  // We need to ensure we pass an integer if Gleam expects Int.
  // JS number is float. Gleam JS backend treats JS numbers as floats but logic might check.
  // The Gleam code: `pub fn format_file_size(bytes: Int)`.
  // Wrapper for generated JS usually expects safe integer.

  return formatFileSizeGleam(Math.floor(bytes));
}

export function getAudioFormat(filename: string): string {
  const ext = path.extname(filename).toLowerCase().slice(1);
  const formats: Record<string, string> = {
    'mp3': 'MP3',
    'flac': 'FLAC',
    'ogg': 'OGG Vorbis',
    'wav': 'WAV',
    'm4a': 'M4A/AAC',
    'aac': 'AAC',
    'opus': 'OPUS',
  };

  return formats[ext] || ext.toUpperCase();
}

