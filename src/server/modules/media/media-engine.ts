import path from "path";
import fs from "fs-extra";
import crypto from "crypto";
import { Readable } from "stream";
import type { DatabaseService, Track } from "../../core/database.js";
import type { GoogleDriveService } from "../storage/google-drive.service.js";
import type { StreamingService } from "../streaming/streaming.service.js";
import { transcode, transcodeToFile, tryAcquireLiveSlot, releaseLiveSlot } from "./ffmpeg.js";
import { NotFoundError, ServiceUnavailableError } from "../../common/errors.js";

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
  if (result.stream) {
    const stream = result.stream;
    stream.pipe(res);
    // Free the upstream (ffmpeg) promptly when the client disconnects mid-stream,
    // so live-transcode slots are released instead of lingering until ffmpeg
    // eventually errors on a full output buffer.
    res.on("close", () => { if (!stream.destroyed) stream.destroy(); });
  } else {
    res.end();
  }
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
            return this.handleExternalStream(options.externalId, undefined, options.range);
        }
    }

    if (!track) {
      throw new NotFoundError("Track not found");
    }

    // 1. Handle Google Drive
    if (track.file_path?.startsWith("gdrive://")) {
      return this.handleGDriveStream(track, options.range);
    }

    // 2. Handle Local Files (a localized/ripped track always wins over any
    // leftover external_id/url from before it was downloaded)
    if (track.file_path) {
      const { trackPath, isLosslessFallback } = await this.resolveLocalPath(track);
      if (trackPath) {
        return this.handleLocalStream(trackPath, track, options, isLosslessFallback);
      }
    }

    // 3. Handle External IDs / Linked Tracks
    const extId = track.external_id || track.url;
    if (extId && (extId.startsWith("ext:") || extId.startsWith("http://") || extId.startsWith("https://"))) {
      if (extId.startsWith("http://") || extId.startsWith("https://")) {
        return this.handleExternalStream(`ext:link:${extId}`, track, options.range);
      }
      return this.handleExternalStream(extId, track, options.range);
    }

    // 4. Handle Fallback to Streaming Providers
    const fallback = await this.handleStreamingFallback(track);
    if (fallback) return fallback;

    throw new NotFoundError("Audio source not found");
  }

  private async handleExternalStream(extId: string, track?: Track, range?: string): Promise<StreamResult> {
    const parts = extId.split(":");
    const providerId = parts[1];
    const originalId = parts.slice(2).join(":");

    // If providerId is 'link', 'gdrive', or 'dropbox', the originalId is already the direct stream/download URL.
    if (providerId === 'link' || providerId === 'gdrive' || providerId === 'dropbox') {
      const url = originalId;
      
      // If it is a Google Drive URL, extract file ID and stream/proxy
      if (url.includes("drive.google.com")) {
        const gdriveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                            url.match(/id=([a-zA-Z0-9_-]+)/) ||
                            url.match(/\/uc\?export=download&id=([a-zA-Z0-9_-]+)/);
        const gdriveFileId = gdriveMatch ? gdriveMatch[1] : null;

        if (gdriveFileId) {
          if (this.gdriveService) {
            const ownerId = track?.owner_id || this.database.getPrimaryAdminId() || 1;
            const { stream, status, headers } = await this.gdriveService.getFileStream(ownerId, gdriveFileId, range);
            return {
              stream: stream as Readable,
              contentType: headers['content-type'] || 'audio/mpeg',
              contentLength: headers['content-length'] ? parseInt(headers['content-length'] as string) : undefined,
              contentRange: headers['content-range'] as string,
              statusCode: status
            };
          } else {
            // Fallback to Google Drive public export link via proxy
            const downloadUrl = `https://drive.google.com/uc?export=download&id=${gdriveFileId}`;
            throw new Error(`REDIRECT:/api/proxy/stream?url=${encodeURIComponent(downloadUrl)}`);
          }
        }
      }

      // Otherwise, redirect to proxy for direct stream
      throw new Error(`REDIRECT:/api/proxy/stream?url=${encodeURIComponent(url)}`);
    }

    if (!this.streamingService) throw new Error("Streaming service not available");

    let url: string | null = null;
    if (providerId === 'search') {
      const [artist, title] = originalId.split(" - ");
      url = await this.streamingService.resolve(title || originalId, artist || "");
    } else {
      url = await this.streamingService.resolveById(providerId, originalId);
    }

    if (!url) throw new NotFoundError("External stream not found");

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

    // Formats a browser <audio> element can decode from a raw byte stream.
    // Anything else must be transcoded to mp3, even when no explicit target
    // format is requested. In particular MP4/M4A containers (which may hold
    // ALAC — unsupported by Chrome) and some cloud imports whose body is an
    // M4A mislabeled .mp3 with an ID3 tag glued on the front; served raw as
    // audio/mpeg these fail with DEMUXER_ERROR_COULD_NOT_OPEN. ffmpeg reads
    // past the ID3 tag and decodes the real container.
    const directlyStreamable = new Set(["mp3", "ogg", "opus", "flac", "aac"]);
    const targetFormat = options.format ||
      ((isLosslessFallback || !directlyStreamable.has(sourceFormat)) ? "mp3" : sourceFormat);

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

    const cacheFile = this.transcodeCacheFile(trackPath, format, bitrate);

    // Fast path: a cached transcode already exists — serve it as a plain file
    // (Range-capable, no ffmpeg). This is the steady state for popular tracks.
    try {
      if (await fs.pathExists(cacheFile)) {
        return this.serveLocalFile(cacheFile, options.range, this.opts.transcodeCacheDir, this.opts.xaccelCachePrefix, contentType);
      }
    } catch { /* fall through to live streaming */ }

    // Cache miss: stream live immediately for instant first-byte, and populate the
    // cache in the background so the NEXT play is a file read. We deliberately do
    // NOT await a full encode here — that serialized cold plays behind the encode
    // queue and tripped proxy timeouts (504) under concurrency.
    this.populateCacheInBackground(trackPath, cacheFile, format, bitrate);
    return this.liveTranscode(trackPath, format, bitrate, undefined, contentType);
  }

  /** Fire-and-forget cache fill. Bounded by the ffmpeg CPU queue; never blocks a request. */
  private populateCacheInBackground(trackPath: string, cacheFile: string, format: string, bitrate?: number): void {
    this.produceTranscode(trackPath, cacheFile, format, bitrate).catch((err: any) => {
      // Best-effort: a failed fill just means the next play transcodes live again.
      console.warn(`[MediaEngine] Background transcode cache fill failed: ${err?.message}`);
    });
  }

  private liveTranscode(trackPath: string, format: string, bitrate: number | undefined, seek: number | undefined, contentType: string): StreamResult {
    // Admission control: shed load instead of spawning unbounded ffmpeg processes.
    if (!tryAcquireLiveSlot()) {
      throw new ServiceUnavailableError("Transcoder is busy, please retry shortly.");
    }

    let released = false;
    const release = () => { if (!released) { released = true; releaseLiveSlot(); } };

    const command = transcode(trackPath, format, bitrate, seek);
    const stream = command.pipe() as Readable;

    const onError = (err: any) => {
      const msg = err?.message || '';
      if (!msg.includes('Output stream closed') && !msg.includes('EPIPE') && !msg.includes('SIGKILL')) {
        console.error('[MediaEngine] Transcoding error:', msg);
      }
      // fluent-ffmpeg emits 'error' on the COMMAND, not on the piped stream.
      // Without a listener on the command an ffmpeg failure (e.g. a corrupt
      // source file) becomes an uncaughtException and crashes the whole server.
      // Tear the output stream down so the HTTP response ends instead of hanging.
      if (!stream.destroyed) stream.destroy();
      release();
    };

    // Listen on BOTH: the command surfaces ffmpeg process failures (the crash
    // source), the stream surfaces downstream pipe errors (client disconnect /
    // EPIPE). The `released` guard makes a double-fire harmless.
    command.on('error', onError);
    stream.on('error', onError);
    stream.on('close', release);
    stream.on('end', release);
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

  /**
   * Pre-warm the transcode cache for a list of tracks.
   * Processes one at a time at low priority so live playback is not impacted.
   * Returns the number of tracks actually transcoded (cache misses).
   */
  async prewarmCache(
    tracks: Track[],
    onProgress: (done: number, total: number, current: string) => void,
    shouldAbort: () => boolean
  ): Promise<number> {
    const directlyStreamable = new Set(["mp3", "ogg", "opus", "flac", "aac"]);
    let warmed = 0;

    for (let i = 0; i < tracks.length; i++) {
      if (shouldAbort()) break;

      const track = tracks[i];
      const filePath = track.file_path;
      if (!filePath) { onProgress(i + 1, tracks.length, track.title); continue; }

      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      const sourceFormat = (track.format || ext).toLowerCase();

      // Skip tracks that play directly without transcoding
      if (directlyStreamable.has(sourceFormat)) { onProgress(i + 1, tracks.length, track.title); continue; }

      const targetFormat = "mp3";
      const cacheFile = this.transcodeCacheFile(filePath, targetFormat, undefined);

      try {
        if (!(await fs.pathExists(cacheFile))) {
          await this.produceTranscode(filePath, cacheFile, targetFormat, undefined);
          warmed++;
        }
      } catch (err: any) {
        console.warn(`[MediaEngine] Prewarm failed for "${track.title}": ${err?.message}`);
      }

      onProgress(i + 1, tracks.length, track.title);

      // Yield between tracks to avoid starving the event loop
      await new Promise(r => setTimeout(r, 100));
    }

    return warmed;
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
