import path from "path";
import { slugify } from "../../../utils/audioUtils.js";
import { getFastFileHash } from "../../../utils/fileUtils.js";
import type { DatabaseService, Track } from "../../core/database.js";
import type { AutoTaggerService } from "./autotagger.service.js";
import { getDurationFromFfmpeg } from "../media/ffmpeg.js";

export interface SyncOptions {
  musicDir: string;
  overrideArtistId?: number;
  ownerId?: number;
  overrideAlbumId?: number;
  suggestedCoverPath?: string;
  metadataHints?: {
    artist?: string;
    album?: string;
    year?: number;
    title?: string;
    genre?: string;
  };
}

export interface SyncResult {
  trackId?: number;
  success: boolean;
  message: string;
  action: 'created' | 'updated' | 'unchanged' | 'moved' | 'failed';
  queuedConversion?: boolean;
}

/**
 * Deep module for Catalog Synchronization logic.
 * Decouples domain rules (metadata mapping, protection, deduplication) from IO (chokidar, filesystem).
 */
export class LibrarySync {
  private readonly LOSSLESS_EXTENSIONS = ['.wav', '.flac'];
  private readonly AUDIO_EXTENSIONS = [".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus"];

  constructor(
    private database: DatabaseService,
    private autotagger?: AutoTaggerService,
    private primaryAdminId?: number | null
  ) {}

  /**
   * Syncs a single audio file with the database.
   * Handles hash matching, metadata extraction (passed in), and domain protection rules.
   */
  async syncFile(filePath: string, metadata: any, options: SyncOptions): Promise<SyncResult> {
    const { musicDir, ownerId, overrideArtistId, overrideAlbumId, metadataHints, suggestedCoverPath } = options;
    const ext = path.extname(filePath).toLowerCase();
    const dir = path.dirname(filePath);
    const normalizedPath = this.normalizePath(filePath, musicDir);

    let hash: string | null = null;
    try {
      hash = await getFastFileHash(filePath);
    } catch (e) {
      console.warn(`[LibrarySync] Failed to hash file: ${filePath}`);
    }

    // 1. Resolve Domain Entities first so overrides apply even on hash match
    const common = metadata?.common || {};
    const format = metadata?.format || {};
    const albumArtist = common.albumartist;

    const artistId = await this.resolveArtist(common.artist, metadataHints?.artist, overrideArtistId);
    const albumId = await this.resolveAlbum(dir, common, metadataHints, overrideAlbumId, musicDir, ownerId, suggestedCoverPath, artistId, albumArtist);

    // 2. Check for existing track by Hash (Deduplication / Move detection)
    if (hash) {
      const existingByHash = this.database.getTrackByHash(hash);
      if (existingByHash) {
        // Apply explicit overrides (artist/title/album hints) even on hash match
        const hasOverrides = overrideArtistId || metadataHints?.artist || metadataHints?.title || metadataHints?.album;
        if (hasOverrides) {
          return this.updateExistingTrack(existingByHash, { hash, normalizedPath, ownerId, metadata, metadataHints, overrideArtistId, artistId, albumId, musicDir, duration: format.duration || null });
        }
        return this.handleHashMatch(existingByHash, normalizedPath, ownerId);
      }
    }

    // Resolve duration with FFmpeg fallback if missing/falsy
    let duration = format.duration || null;
    const isAudio = this.AUDIO_EXTENSIONS.includes(ext);
    if (isAudio && (!duration || duration <= 0 || isNaN(duration))) {
      try {
        const ffDuration = await getDurationFromFfmpeg(filePath);
        if (ffDuration && ffDuration > 0 && !isNaN(ffDuration)) {
          duration = ffDuration;
          console.log(`⏱️ [LibrarySync] Extracted fallback duration using FFmpeg/ffprobe for ${path.basename(filePath)}: ${duration}s`);
        }
      } catch (err) {
        console.warn(`[LibrarySync] FFmpeg duration fallback failed for ${filePath}:`, err);
      }
    }

    // 3. Handle Existing Track by Path or Metadata
    let existing = this.database.getTrackByPath(normalizedPath);
    if (!existing) {
        const hadTag = !!(metadataHints?.title || common.title);
        const title = metadataHints?.title || common.title || path.basename(filePath, ext);
        existing = this.database.getTrackByMetadata(title, artistId, albumId);
        // When no usable tag exists the title falls back to the raw filename,
        // which often carries extension/track-number/artist-prefix noise
        // (e.g. "Homologo_-_Ordine_Ovviamente"). That mismatch lets a lossless
        // drop-in slip past dedup and spawn a duplicate of its already-imported
        // transcode. Retry the lookup with a normalized title before creating.
        if (!existing && !hadTag) {
            const normTitle = this.normalizeFilenameTitle(path.basename(filePath, ext));
            if (normTitle && normTitle !== title) {
                existing = this.database.getTrackByMetadata(normTitle, artistId, albumId);
            }
        }
    }

    if (existing) {
        return this.updateExistingTrack(existing, { hash, normalizedPath, ownerId, metadata, metadataHints, overrideArtistId, artistId, albumId, musicDir, duration });
    }

    // 4. Create New Track
    return this.createNewTrack({ filePath, normalizedPath, hash, artistId, albumId, ownerId, metadata, metadataHints, musicDir, duration });
  }

  /**
   * Best-effort cleanup of a title derived from a raw filename so it can be
   * compared against tagged tracks during deduplication. Used for read-only
   * lookups only (never for persisted titles), so heuristics are acceptable:
   * a false match is bounded by the same artistId + albumId requirement.
   */
  private normalizeFilenameTitle(raw: string): string {
    let s = raw.replace(/_/g, " ").replace(/\s+/g, " ").trim();
    // Drop trailing audio-extension tokens left over from messy conversions
    // (e.g. "...Ovviamente mp3", "...Ovviamente wav wav").
    s = s.replace(/(\s+(wav|mp3|flac|m4a|aac|ogg|opus))+$/i, "").trim();
    // Strip a leading track number ("01 - ", "1. ").
    s = s.replace(/^\d+\s*[-.]\s*/, "").trim();
    // Strip a leading "Artist - " filename prefix.
    const dash = s.indexOf(" - ");
    if (dash > 0) s = s.slice(dash + 3).trim();
    return s;
  }

  private handleHashMatch(existing: Track, normalizedPath: string, ownerId?: number): SyncResult {
    if (ownerId) {
      this.database.addTrackOwner(existing.id, ownerId);
    }
    if (existing.album_id && ownerId) {
      this.database.addAlbumOwner(existing.album_id, ownerId);
    }

    if (existing.file_path !== normalizedPath) {
      console.log(`🚚 [LibrarySync] Track ${existing.id} moved: ${existing.file_path} -> ${normalizedPath}`);
      this.database.updateTrackPath(existing.id, normalizedPath, existing.album_id);
      return { trackId: existing.id, success: true, message: "Track moved.", action: 'moved' };
    }

    return { trackId: existing.id, success: true, message: "Hash matched, path identical.", action: 'unchanged' };
  }

  private async resolveArtist(tagArtist?: string, hintArtist?: string, overrideId?: number): Promise<number> {
    if (overrideId) return overrideId;
    let name = (hintArtist || tagArtist || "Unknown Artist").trim();
    const lowerName = name.toLowerCase();
    if (name === "" || lowerName === "null" || lowerName === "undefined") {
      name = "Unknown Artist";
    }
    const existing = this.database.getArtistByName(name);
    return existing ? existing.id : this.database.createArtist(name, undefined, undefined, undefined, undefined, undefined, 'private');
  }

  private async resolveAlbum(
    dir: string, 
    common: any, 
    hints: any, 
    overrideId: number | undefined, 
    musicDir: string, 
    ownerId: number | undefined, 
    suggestedCoverPath: string | undefined,
    artistId: number,
    albumArtist?: string
  ): Promise<number | null> {
    if (overrideId) return overrideId;

    // Hint Priority
    if (hints?.album) {
      const albumTitle = hints.album.trim();
      const lowerAlbum = albumTitle.toLowerCase();
      if (albumTitle !== "" && lowerAlbum !== "null" && lowerAlbum !== "undefined") {
        let album = this.database.getAlbumByTitle(albumTitle, artistId);
        const slug = slugify("hint-" + artistId + "-" + albumTitle);
        if (!album) {
          album = this.database.getAlbumBySlug(slug);
        }
        if (album) return album.id;

        return this.database.createAlbum({
          title: albumTitle,
          slug: slug,
          artist_id: artistId,
          album_artist: albumArtist || null,
          owner_id: ownerId || this.primaryAdminId || 1,
          date: hints.year ? `${hints.year}-01-01` : null,
          year: hints.year || null,
          cover_path: suggestedCoverPath ? this.normalizePath(suggestedCoverPath, musicDir) : null,
          genre: hints.genre || "Imported",
          description: `Imported via metadata hint`,
          type: 'album',
          download: null, price: 0, price_usdc: 0, currency: 'ETH', external_links: null,
          is_public: false, visibility: 'private', is_release: false, published_at: new Date().toISOString(),
          published_to_gundb: false, published_to_ap: false, license: null, status: 'draft',
        });
      }
    }

    // Tag Priority
    if (common.album) {
      const albumTitle = common.album.trim();
      const lowerAlbum = albumTitle.toLowerCase();
      if (albumTitle !== "" && lowerAlbum !== "null" && lowerAlbum !== "undefined") {
        let album = this.database.getAlbumByTitle(albumTitle, artistId);
        const slug = slugify("tag-" + artistId + "-" + albumTitle);
        if (!album) {
          album = this.database.getAlbumBySlug(slug);
        }
        if (album) return album.id;

        return this.database.createAlbum({
          title: albumTitle,
          slug: slug,
          artist_id: artistId,
          album_artist: albumArtist || common.artist || null,
          owner_id: ownerId || this.primaryAdminId || 1,
          date: common.year ? `${common.year}-01-01` : (common.date ? common.date : null),
          year: common.year || (common.date ? new Date(common.date).getFullYear() : null),
          cover_path: suggestedCoverPath ? this.normalizePath(suggestedCoverPath, musicDir) : null,
          genre: common.genre ? common.genre.join(", ") : "Library",
          description: `Imported from tags`,
          type: 'album',
          download: null, price: 0, price_usdc: 0, currency: 'ETH', external_links: null,
          is_public: false, visibility: 'private', is_release: false, published_at: new Date().toISOString(),
          published_to_gundb: false, published_to_ap: false, license: null, status: 'draft',
        });
      }
    }

    // Folder-based check last (to prevent duplicate tag-based albums but allow overrides)
    const relativeDir = this.normalizePath(dir, musicDir);
    const isRoot = relativeDir === "." || relativeDir === "";
    if (!isRoot) {
      if (relativeDir.startsWith("releases/")) {
        const pathParts = relativeDir.split("/");
        if (pathParts.length === 2 && pathParts[0] === "releases") {
          const releaseSlug = pathParts[1];
          const formalRelease = this.database.getReleaseBySlug(releaseSlug) || this.database.getAlbumBySlug(releaseSlug);
          if (formalRelease) return formalRelease.id;
        }
      }
      const folderSlug = slugify("lib-" + relativeDir);
      const folderAlbum = this.database.getAlbumBySlug(folderSlug) || this.database.getReleaseBySlug(folderSlug);
      if (folderAlbum) return folderAlbum.id;
    }

    return null; // Fallback to folder-based handled by Scanner for now
  }

  private updateExistingTrack(existing: Track, data: any): SyncResult {
    const { hash, normalizedPath, ownerId, metadata, metadataHints, overrideArtistId, artistId, albumId, duration } = data;
    const common = metadata?.common || {};
    const ext = path.extname(normalizedPath).toLowerCase();

    if (hash && existing.hash !== hash) {
        this.database.updateTrackHash(existing.id, hash);
    }

    if (ownerId) this.database.addTrackOwner(existing.id, ownerId);
    
    const isLossless = this.LOSSLESS_EXTENSIONS.includes(ext);
    const mp3Path = isLossless ? normalizedPath.replace(new RegExp(`\\${ext}$`, 'i'), '.mp3') : normalizedPath;
    if (isLossless && !existing.lossless_path) {
        this.database.updateTrackLosslessPath(existing.id, normalizedPath);
    }

    // Protection Logic
    const newTitle = metadataHints?.title || common.title || path.basename(normalizedPath, ext);
    if (existing.title !== newTitle && (existing.title === "Untitled" || metadataHints?.title || overrideArtistId)) {
        this.database.updateTrackTitle(existing.id, newTitle);
    }

    let finalAlbumId = albumId;
    if (existing.album_id && existing.album_id !== albumId) {
        const existingAlbum = this.database.getAlbum(existing.album_id);
        const newAlbum = albumId ? this.database.getAlbum(albumId) : null;
        if ((existingAlbum?.is_release && !(newAlbum?.is_release)) || (existing.album_id && !(newAlbum?.is_release))) {
            finalAlbumId = existing.album_id;
        }
    }

    this.database.updateTrackPath(existing.id, mp3Path, finalAlbumId);
    if (existing.album_id !== finalAlbumId) this.database.updateTrackAlbum(existing.id, finalAlbumId);

    // Artist Protection
    if (artistId && existing.artist_id !== artistId) {
        const existingArt = this.database.getArtist(existing.artist_id!);
        if (!existing.artist_id || existingArt?.name === 'Unknown Artist' || overrideArtistId) {
            this.database.updateTrackArtist(existing.id, artistId);
        }
    }

    // Dynamic duration auto-repair/update
    if (duration && (!existing.duration || existing.duration <= 0)) {
        this.database.updateTrackDuration(existing.id, duration);
        console.log(`⏱️ [LibrarySync] Updated existing track ${existing.id} duration to ${duration}s`);
    }

    const format = metadata?.format || {};
    // Update new multi-asset fields
    const resolvedMimeType = this.getMimeType(normalizedPath, format.mimeType || existing.mime_type);
    this.database.updateTrack(existing.id, {
        mime_type: resolvedMimeType || existing.mime_type,
        file_size: format.fileSize || existing.file_size,
        file_hash: hash || existing.file_hash,
        version: metadataHints?.version || existing.version
    } as any);

    return { trackId: existing.id, success: true, message: "Track updated.", action: 'updated' };
  }

  private createNewTrack(data: any): SyncResult {
    const { normalizedPath, hash, artistId, albumId, ownerId, metadata, metadataHints, duration } = data;
    const common = metadata?.common || {};
    const format = metadata?.format || {};
    const ext = path.extname(normalizedPath).toLowerCase();
    const isLossless = this.LOSSLESS_EXTENSIONS.includes(ext);

    // Filename-fallback titles keep conversion junk ("A_Gravame_mp3") that then
    // leaks into every future generated filename. Strip trailing ext tokens.
    const fallbackTitle = path.basename(normalizedPath, ext)
        .replace(/([_\s.-]+(wav|mp3|flac|m4a|aac|ogg|opus))+$/i, '') || path.basename(normalizedPath, ext);

    const trackId = this.database.createTrack({
        title: metadataHints?.title || common.title || fallbackTitle,
        album_id: albumId,
        artist_id: artistId,
        owner_id: ownerId || this.primaryAdminId || 1,
        track_num: common.track?.no || null,
        duration: duration || null,
        file_path: isLossless ? normalizedPath.replace(new RegExp(`\\${ext}$`, 'i'), '.mp3') : normalizedPath,
        format: isLossless ? 'mp3' : (format.codec || ext.substring(1)),
        bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
        sample_rate: format.sampleRate || null,
        lossless_path: isLossless ? normalizedPath : null,
        waveform: null,
        year: metadataHints?.year || common.year || (common.date ? new Date(common.date).getFullYear() : null),
        genre: metadataHints?.genre || (common.genre ? common.genre.join(", ") : null),
        url: null,
        service: null,
        external_artwork: null,
        price: 0,
        price_usdc: 0,
        currency: 'ETH',
        hash: hash,
        mime_type: this.getMimeType(normalizedPath, format.mimeType),
        file_size: format.fileSize || 0,
        file_hash: hash,
        version: metadataHints?.version || null
    });

    if (this.autotagger) {
        const track = this.database.getTrack(trackId);
        if (track && (track.artist_name === 'Unknown Artist' || !track.album_id)) {
            this.autotagger.auditTrack(track, { forceRepair: false, useAI: true }).catch(() => {});
        }
    }

    // Queue MP3 pre-transcoding for every lossless source (.wav AND .flac):
    // file_path already points at the future .mp3, so without this the file
    // never exists and every stream transcodes on the fly forever.
    return { trackId, success: true, message: "Processed.", action: 'created', queuedConversion: isLossless };
  }

  private normalizePath(filePath: string, musicDir: string): string {
    const absoluteMusicDir = path.resolve(musicDir);
    const absoluteFilePath = path.isAbsolute(filePath) ? filePath : path.resolve(musicDir, filePath);
    let relative = path.relative(absoluteMusicDir, absoluteFilePath).replace(/\\/g, "/");
    while (relative.startsWith("../")) relative = relative.substring(3);
    return relative === ".." ? "." : relative;
  }

  private getMimeType(filePath: string, formatMimeType?: string): string {
    if (formatMimeType && formatMimeType !== 'application/octet-stream') {
      return formatMimeType;
    }
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.mp3': return 'audio/mpeg';
      case '.wav': return 'audio/wav';
      case '.flac': return 'audio/flac';
      case '.ogg': return 'audio/ogg';
      case '.opus': return 'audio/opus';
      case '.m4a': return 'audio/mp4';
      case '.aac': return 'audio/aac';
      default: return 'application/octet-stream';
    }
  }

  async cleanupEmptyEntities() {
    console.log("🧹 [LibrarySync] Cleaning up empty albums and artists...");
    const emptyAlbums = this.database.db.prepare(`
        SELECT a.id FROM albums a
        LEFT JOIN tracks t ON a.id = t.album_id
        WHERE t.id IS NULL AND a.is_release = 0
    `).all() as { id: number }[];
    this.database.deleteAlbumsBatch(emptyAlbums.map(a => a.id));

    const emptyArtists = this.database.db.prepare(`
        SELECT ar.id FROM artists ar
        LEFT JOIN albums a ON ar.id = a.artist_id
        LEFT JOIN tracks t ON ar.id = t.artist_id
        WHERE a.id IS NULL AND t.id IS NULL
    `).all() as { id: number }[];
    this.database.deleteArtistsBatch(emptyArtists.map(ar => ar.id));
  }
}
