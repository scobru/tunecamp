import path from "path";
import fs from "fs-extra";
import crypto from "crypto";
import { Readable } from "stream";
import type { DatabaseService, Track } from "../../core/database.js";
import type { GoogleDriveService } from "../storage/google-drive.service.js";
import type { StreamingService } from "../streaming/streaming.service.js";
import { transcode, transcodeToFile } from "./ffmpeg.js";
import { NotFoundError } from "../../common/errors.js";

export interface StreamOptions {
  trackId?: number;
  externalId?: string;
  format?: string;     // mp3, flac, ogg, etc.
  bitrate?: string;    // e.g. "128k", "192k"
  seek?: number;       // in seconds
  range?: string;      // standard HTTP Range header
}

export interface StreamResult {
  stream?: Readable;
  /** When set, the route hands the file to nginx via X-Accel-Redirect instead of piping a stream. */
  xAccelRedirect?: string;
  contentType: string;
  contentLength?: number;
  contentRange?: string;
  statusCode: number;
}

export interface MediaEngineOptions {
  /** Directory where on-the-fly transcodes are cached as plain files. */
  transcodeCacheDir?: string;
  /** Soft cap for the transcode cache; oldest files are pruned past this. */
  transcodeCacheMaxBytes?: number;
  /** When true, local files are served via X-Accel-Redirect (nginx) instead of piped through Node. */
  xaccelRedirect?: boolean;
  /** Internal nginx location aliased to musicDir. */
  xaccelMediaPrefix?: string;
  /** Internal nginx location aliased to transcodeCacheDir. */
  xaccelCachePrefix?: string;
}

// Dedupe concurrent transcodes of the same cache key so a popular track is
// encoded once, not once per concurrent listener (thundering-herd guard).
const inflightTranscodes = new Map<string, Promise<void>>();
let lastCachePrune = 0;

/**
 * Write a StreamResult to an Express response: either an X-Accel-Redirect that
 * delegates byte-serving to nginx, or a piped Node stream. Single source of
 * truth so every streaming route handles the offload identically.
 */
export function sendStreamResult(res: any, result: StreamResult): void {
  res.setHeader("Content-Type", result.contentType);
  if (result.xAccelRedirect) {
    res.setHeader("X-Accel-Redirect", result.xAccelRedirect);
    res.status(200).end();
    return;
  }
  res.setHeader("Accept-Ranges", "bytes");
  if (result.contentLength != null) res.setHeader("Content-Length", result.contentLength);
  if (result.contentRange) res.setHeader("Content-Range", result.contentRange);
  res.status(result.statusCode);
  if (result.stream) result.stream.pipe(res);
  else res.end();
}

export class MediaEngine {
  private opts: Required<MediaEngineOptions>;

  constructor(
    private database: DatabaseService,
    private musicDir: string,
    private gdriveService?: GoogleDriveService,
    private streamingService?: StreamingService,
    opts: MediaEngineOptions = {}
  ) {
    this.opts = {
      transcodeCacheDir: opts.transcodeCacheDir || path.join(musicDir, ".transcode-cache"),
      transcodeCacheMaxBytes: opts.transcodeCacheMaxBytes ?? 2 * 1024 * 1024 * 1024,
      xaccelRedirect: opts.xaccelRedirect ?? false,
      xaccelMediaPrefix: opts.xaccelMediaPrefix || "/_protected_media",
      xaccelCachePrefix: opts.xaccelCachePrefix || "/_protected_cache",
    };
  }

  /**
   * Main entry point for streaming a track.
   * Handles local files, Google Drive, and streaming provider fallbacks.
   */
  async getStream(options: StreamOptions): Promise<StreamResult> {
    let track: Track | undefined;

    if (options.trackId) {
        track = this.database.getTrack(options.trackId);
    } else if (options.externalId) {
        // 1. Try to find track in database by external ID
        track = this.database.getTrackByExternalId(options.externalId);
        
        // 2. If not in DB, handle as direct external stream (e.g. from global search)
        if (!track) {
            return this.handleExternalStream(options.externalId);
        }
    }

    if (!track) {
      throw new NotFoundError("Track not found");
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

    throw new NotFoundError("Audio source not found");
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

    if (!url) throw new NotFoundError("External stream not found");

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

  private contentTypeForFormat(format: string): string {
    const map: Record<string, string> = {
      mp3: 'audio/mpeg', aac: 'audio/aac', ogg: 'audio/ogg',
      opus: 'audio/opus', flac: 'audio/flac', wav: 'audio/wav',
    };
    return map[format] || 'audio/mpeg';
  }

  private async streamTranscoded(trackPath: string, format: string, options: StreamOptions): Promise<StreamResult> {
    const bitrate = options.bitrate ? parseInt(options.bitrate) : undefined;
    const contentType = this.contentTypeForFormat(format);

    // Seek requests are transient and would explode the cache key space — transcode live, don't cache.
    if (options.seek && options.seek > 0) {
      return this.liveTranscode(trackPath, format, bitrate, options.seek, contentType);
    }

    // Cache-aware path: serve a cached transcode if present, otherwise produce it once.
    const cacheFile = this.transcodeCacheFile(trackPath, format, bitrate);
    try {
      if (!(await fs.pathExists(cacheFile))) {
        await this.produceTranscode(trackPath, cacheFile, format, bitrate);
      }
      return this.serveLocalFile(cacheFile, options.range, this.opts.transcodeCacheDir, this.opts.xaccelCachePrefix, contentType);
    } catch (err: any) {
      // Cache write/serve failed — never block playback, fall back to a live transcode.
      console.warn(`[MediaEngine] Transcode cache unavailable (${err?.message}); streaming live.`);
      return this.liveTranscode(trackPath, format, bitrate, options.seek, contentType);
    }
  }

  private liveTranscode(trackPath: string, format: string, bitrate: number | undefined, seek: number | undefined, contentType: string): StreamResult {
    const command = transcode(trackPath, format, bitrate, seek);
    const stream = command.pipe() as Readable;
    stream.on('error', (err: any) => {
      if (!err.message.includes('Output stream closed') && !err.message.includes('EPIPE')) {
        console.error('[MediaEngine] Transcoding error:', err.message);
      }
    });
    return { stream, contentType, statusCode: 200 };
  }

  private transcodeCacheFile(trackPath: string, format: string, bitrate?: number): string {
    const key = crypto.createHash('sha1').update(`${trackPath}|${format}|${bitrate ?? ''}`).digest('hex');
    return path.join(this.opts.transcodeCacheDir, `${key}.${format}`);
  }

  private async produceTranscode(trackPath: string, cacheFile: string, format: string, bitrate?: number): Promise<void> {
    // Dedupe concurrent encodes of the same target (thundering-herd guard).
    const existing = inflightTranscodes.get(cacheFile);
    if (existing) return existing;

    const job = (async () => {
      await fs.ensureDir(this.opts.transcodeCacheDir);
      const tmp = `${cacheFile}.tmp-${crypto.randomBytes(6).toString('hex')}`;
      try {
        await transcodeToFile(trackPath, tmp, format, bitrate);
        // Atomic publish; if a racer beat us to it, our copy is redundant.
        await fs.move(tmp, cacheFile, { overwrite: false }).catch(async (e: any) => {
          await fs.remove(tmp).catch(() => {});
          if (!(await fs.pathExists(cacheFile))) throw e;
        });
      } catch (e) {
        await fs.remove(tmp).catch(() => {});
        throw e;
      }
    })();

    inflightTranscodes.set(cacheFile, job);
    try {
      await job;
    } finally {
      inflightTranscodes.delete(cacheFile);
    }
    void this.maybePruneCache();
  }

  private async streamDirect(trackPath: string, range?: string): Promise<StreamResult> {
    return this.serveLocalFile(trackPath, range, this.musicDir, this.opts.xaccelMediaPrefix);
  }

  private async serveLocalFile(
    absPath: string,
    range: string | undefined,
    baseDir: string,
    xaccelPrefix: string,
    contentTypeOverride?: string
  ): Promise<StreamResult> {
    const ext = path.extname(absPath).toLowerCase();
    const contentTypeMap: any = {
        ".mp3": "audio/mpeg",
        ".flac": "audio/flac",
        ".ogg": "audio/ogg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".opus": "audio/opus"
    };
    const contentType = contentTypeOverride || contentTypeMap[ext] || "audio/mpeg";

    // X-Accel offload: hand the file to nginx, which serves bytes + Range itself.
    // No read stream is opened and no stat is needed — Node leaves the data path.
    if (this.opts.xaccelRedirect) {
      const uri = this.toXAccelUri(absPath, baseDir, xaccelPrefix);
      if (uri) {
        return { xAccelRedirect: uri, contentType, statusCode: 200 };
      }
      // Path escaped the served base (shouldn't happen) — fall through to piping.
    }

    const stat = await fs.stat(absPath);
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

      return {
        stream: fs.createReadStream(absPath, { start, end }),
        contentType,
        contentLength: end - start + 1,
        contentRange: `bytes ${start}-${end}/${stat.size}`,
        statusCode: 206
      };
    }
    return {
      stream: fs.createReadStream(absPath),
      contentType,
      contentLength: stat.size,
      statusCode: 200
    };
  }

  /** Map an absolute path under `baseDir` to an internal nginx URI, or null if outside it. */
  private toXAccelUri(absPath: string, baseDir: string, prefix: string): string | null {
    const rel = path.relative(baseDir, absPath);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
    const encoded = rel.split(path.sep).map(encodeURIComponent).join("/");
    return `${prefix}/${encoded}`;
  }

  private async maybePruneCache(): Promise<void> {
    const now = Date.now();
    if (now - lastCachePrune < 60_000) return; // throttle: at most once per minute
    lastCachePrune = now;
    try {
      const dir = this.opts.transcodeCacheDir;
      const names = await fs.readdir(dir).catch(() => [] as string[]);
      const stats = await Promise.all(names
        .filter(n => !n.includes('.tmp-'))
        .map(async n => {
          const p = path.join(dir, n);
          const st = await fs.stat(p).catch(() => null);
          return st && st.isFile() ? { p, size: st.size, atime: st.atimeMs } : null;
        }));
      const valid = stats.filter(Boolean) as { p: string; size: number; atime: number }[];
      let total = valid.reduce((s, f) => s + f.size, 0);
      if (total <= this.opts.transcodeCacheMaxBytes) return;
      const target = this.opts.transcodeCacheMaxBytes * 0.9;
      valid.sort((a, b) => a.atime - b.atime); // evict oldest-accessed first
      for (const f of valid) {
        if (total <= target) break;
        await fs.remove(f.p).catch(() => {});
        total -= f.size;
      }
    } catch { /* pruning is best-effort */ }
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
