import path from "path";
import fs from "fs-extra";
import { Readable } from "stream";
import type { DatabaseService, Track } from "../../core/database.js";
import type { GoogleDriveService } from "../storage/google-drive.service.js";
import type { StreamingService } from "../streaming/streaming.service.js";
import { transcode, acquireTaskSlot, releaseTaskSlot } from "./ffmpeg.js";

export interface StreamOptions {
  trackId: number;
  format?: string;     // mp3, flac, ogg, etc.
  bitrate?: string;    // e.g. "128k", "192k"
  seek?: number;       // in seconds
  range?: string;      // standard HTTP Range header
}

export interface StreamResult {
  stream: Readable;
  contentType: string;
  contentLength?: number;
  contentRange?: string;
  statusCode: number;
}

export class MediaEngine {
  constructor(
    private database: DatabaseService,
    private musicDir: string,
    private gdriveService?: GoogleDriveService,
    private streamingService?: StreamingService
  ) {}

  /**
   * Main entry point for streaming a track.
   * Handles local files, Google Drive, and streaming provider fallbacks.
   */
  async getStream(options: StreamOptions): Promise<StreamResult> {
    const track = this.database.getTrack(options.trackId);
    if (!track) {
      throw new Error("Track not found");
    }

    // 1. Handle External IDs / Linked Tracks
    const extId = track.external_id || track.url;
    if (extId && extId.startsWith("ext:")) {
      return this.handleExternalStream(extId);
    }

    // 2. Handle Google Drive
    if (track.file_path?.startsWith("gdrive://")) {
      return this.handleGDriveStream(track, options.range);
    }

    // 3. Handle Local Files
    if (track.file_path) {
      const { trackPath, isLosslessFallback } = await this.resolveLocalPath(track);
      if (trackPath) {
        return this.handleLocalStream(trackPath, track, options, isLosslessFallback);
      }
    }

    // 4. Handle Fallback to Streaming Providers
    const fallback = await this.handleStreamingFallback(track);
    if (fallback) return fallback;

    throw new Error("Audio source not found");
  }

  private async handleExternalStream(extId: string): Promise<StreamResult> {
    if (!this.streamingService) throw new Error("Streaming service not available");
    
    const parts = extId.split(":");
    const providerId = parts[1];
    const originalId = parts.slice(2).join(":");

    let url: string | null = null;
    if (providerId === 'search') {
      const [artist, title] = originalId.split(" - ");
      url = await this.streamingService.resolve(title || originalId, artist || "");
    } else {
      url = await this.streamingService.resolveById(providerId, originalId);
    }

    if (!url) throw new Error("External stream not found");

    // For now, we return a redirect-like response or we could proxy it here.
    // The current implementation redirects to /api/proxy/stream.
    // To keep the interface clean, we'll return a 302-like result or handle the proxying.
    // Let's proxy it for true depth, or just signal the redirect.
    // Actually, the MediaEngine should probably return the proxy stream if we want it deep.
    throw new Error(`REDIRECT:/api/proxy/stream?url=${encodeURIComponent(url)}`);
  }

  private async handleGDriveStream(track: Track, range?: string): Promise<StreamResult> {
    if (!this.gdriveService) throw new Error("Google Drive service not available");
    
    const fileId = track.file_path!.substring(9);
    const ownerId = track.owner_id || this.database.getPrimaryAdminId() || 1;
    const { stream, status, headers } = await this.gdriveService.getFileStream(ownerId, fileId, range);

    return {
      stream: stream as Readable,
      contentType: headers['content-type'] || 'audio/mpeg',
      contentLength: headers['content-length'] ? parseInt(headers['content-length'] as string) : undefined,
      contentRange: headers['content-range'] as string,
      statusCode: status
    };
  }

  private async resolveLocalPath(track: Track): Promise<{ trackPath: string | null; isLosslessFallback: boolean }> {
    let trackPath = path.join(this.musicDir, track.file_path!);
    let isLosslessFallback = false;

    if (await fs.pathExists(trackPath)) return { trackPath, isLosslessFallback };

    // Try decoded path
    const decoded = decodeURIComponent(trackPath);
    if (await fs.pathExists(decoded)) return { trackPath: decoded, isLosslessFallback };

    // Try lossless fallback
    if (track.lossless_path) {
      let lp = path.join(this.musicDir, track.lossless_path);
      if (await fs.pathExists(lp)) return { trackPath: lp, isLosslessFallback: true };
      
      const lpDecoded = decodeURIComponent(lp);
      if (await fs.pathExists(lpDecoded)) return { trackPath: lpDecoded, isLosslessFallback: true };
    }

    return { trackPath: null, isLosslessFallback: false };
  }

  private async handleLocalStream(
    trackPath: string, 
    track: Track, 
    options: StreamOptions, 
    isLosslessFallback: boolean
  ): Promise<StreamResult> {
    const ext = path.extname(trackPath).toLowerCase();
    const sourceFormat = (track.format || ext.substring(1)).toLowerCase();
    const targetFormat = options.format || ( (ext === '.wav' || isLosslessFallback) ? 'mp3' : sourceFormat );
    
    const needsTranscode = options.seek! > 0 || 
                           (targetFormat !== sourceFormat) || 
                           (options.bitrate && this.isBitrateReductionNeeded(track.bitrate, options.bitrate));

    if (needsTranscode) {
      return this.streamTranscoded(trackPath, targetFormat, options);
    } else {
      return this.streamDirect(trackPath, options.range);
    }
  }

  private isBitrateReductionNeeded(sourceBitrate: number | null, targetBitrateStr: string): boolean {
    if (!sourceBitrate) return false;
    const target = parseInt(targetBitrateStr);
    return !isNaN(target) && (sourceBitrate / 1000) > target;
  }

  private async streamTranscoded(trackPath: string, format: string, options: StreamOptions): Promise<StreamResult> {
    const contentTypeMap: any = { 
      'mp3': 'audio/mpeg', 
      'aac': 'audio/aac', 
      'ogg': 'audio/ogg', 
      'opus': 'audio/opus',
      'flac': 'audio/flac',
      'wav': 'audio/wav'
    };

    const bitrate = options.bitrate ? parseInt(options.bitrate) : undefined;
    const command = transcode(trackPath, format, bitrate, options.seek);
    
    const stream = command.pipe() as Readable;

    // Attach error handler to prevent process crash
    stream.on('error', (err: any) => {
      if (!err.message.includes('Output stream closed') && !err.message.includes('EPIPE')) {
        console.error('[MediaEngine] Transcoding error:', err.message);
      }
    });

    return {
      stream,
      contentType: contentTypeMap[format] || 'audio/mpeg',
      statusCode: 200
    };
  }

  private async streamDirect(trackPath: string, range?: string): Promise<StreamResult> {
    const stat = await fs.stat(trackPath);
    const ext = path.extname(trackPath).toLowerCase();
    const contentTypeMap: any = { 
        ".mp3": "audio/mpeg", 
        ".flac": "audio/flac", 
        ".ogg": "audio/ogg", 
        ".wav": "audio/wav", 
        ".m4a": "audio/mp4", 
        ".aac": "audio/aac", 
        ".opus": "audio/opus" 
    };
    const contentType = contentTypeMap[ext] || "audio/mpeg";

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      
      return {
        stream: fs.createReadStream(trackPath, { start, end }),
        contentType,
        contentLength: end - start + 1,
        contentRange: `bytes ${start}-${end}/${stat.size}`,
        statusCode: 206
      };
    } else {
      return {
        stream: fs.createReadStream(trackPath),
        contentType,
        contentLength: stat.size,
        statusCode: 200
      };
    }
  }

  private async handleStreamingFallback(track: Track): Promise<StreamResult | null> {
    if (!this.streamingService) return null;
    
    const title = track.title || "";
    const artist = track.artist_name || "";
    const streamUrl = await this.streamingService.resolve(title, artist).catch(() => null);
    
    if (streamUrl) {
      console.log(`📡 [MediaEngine] Local file missing, falling back to streaming provider for: ${artist} - ${title}`);
      throw new Error(`REDIRECT:/api/proxy/stream?url=${encodeURIComponent(streamUrl)}`);
    }
    
    return null;
  }
}
