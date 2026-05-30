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

    // 1. Check for existing track by Hash (Deduplication / Move detection)
    if (hash) {
      const existingByHash = this.database.getTrackByHash(hash);
      if (existingByHash) {
        return this.handleHashMatch(existingByHash, normalizedPath, ownerId);
      }
    }

    // 2. Resolve Domain Entities
    const common = metadata?.common || {};
    const format = metadata?.format || {};
    const albumArtist = common.albumartist;

    const artistId = await this.resolveArtist(common.artist, metadataHints?.artist, overrideArtistId);
    const albumId = await this.resolveAlbum(dir, common, metadataHints, overrideAlbumId, musicDir, ownerId, suggestedCoverPath, artistId, albumArtist);

    // Resolve duration with FFmpeg fallback if missing/falsy
    let duration = format.duration || null;
    if (!duration || duration <= 0 || isNaN(duration)) {
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
        const title = metadataHints?.title || common.title || path.basename(filePath, ext);
        existing = this.database.getTrackByMetadata(title, artistId, albumId);
    }

    if (existing) {
        return this.updateExistingTrack(existing, { hash, normalizedPath, ownerId, metadata, metadataHints, overrideArtistId, artistId, albumId, musicDir, duration });
    }

    // 4. Create New Track
    return this.createNewTrack({ filePath, normalizedPath, hash, artistId, albumId, ownerId, metadata, metadataHints, musicDir, duration });
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
    const name = hintArtist || tagArtist || "Unknown Artist";
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

    // Folder-based check first (to prevent duplicate tag-based albums)
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

    // Hint Priority
    if (hints?.album) {
      let album = this.database.getAlbumByTitle(hints.album, artistId);
      const slug = slugify("hint-" + artistId + "-" + hints.album);
      if (!album) {
        album = this.database.getAlbumBySlug(slug);
      }
      if (album) return album.id;

      return this.database.createAlbum({
        title: hints.album,
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

    // Tag Priority
    if (common.album) {
      let album = this.database.getAlbumByTitle(common.album, artistId);
      const slug = slugify("tag-" + artistId + "-" + common.album);
      if (!album) {
        album = this.database.getAlbumBySlug(slug);
      }
      if (album) return album.id;

      return this.database.createAlbum({
        title: common.album,
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

    return { trackId: existing.id, success: true, message: "Track updated.", action: 'updated' };
  }

  private createNewTrack(data: any): SyncResult {
    const { normalizedPath, hash, artistId, albumId, ownerId, metadata, metadataHints, duration } = data;
    const common = metadata?.common || {};
    const format = metadata?.format || {};
    const ext = path.extname(normalizedPath).toLowerCase();
    const isLossless = this.LOSSLESS_EXTENSIONS.includes(ext);

    const trackId = this.database.createTrack({
        title: metadataHints?.title || common.title || path.basename(normalizedPath, ext),
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
        url: null, service: null, external_artwork: null, price: 0, price_usdc: 0, currency: 'ETH', hash: hash
    });

    if (this.autotagger) {
        const track = this.database.getTrack(trackId);
        if (track && (track.artist_name === 'Unknown Artist' || !track.album_id)) {
            this.autotagger.auditTrack(track, { forceRepair: false, useAI: true }).catch(() => {});
        }
    }

    return { trackId, success: true, message: "Processed.", action: 'created', queuedConversion: ext === ".wav" };
  }

  private normalizePath(filePath: string, musicDir: string): string {
    const absoluteMusicDir = path.resolve(musicDir);
    const absoluteFilePath = path.isAbsolute(filePath) ? filePath : path.resolve(musicDir, filePath);
    let relative = path.relative(absoluteMusicDir, absoluteFilePath).replace(/\\/g, "/");
    while (relative.startsWith("../")) relative = relative.substring(3);
    return relative === ".." ? "." : relative;
  }

  async cleanupEmptyEntities() {
    console.log("🧹 [LibrarySync] Cleaning up empty albums and artists...");
    const emptyAlbums = this.database.db.prepare(`
        SELECT a.id FROM albums a
        LEFT JOIN tracks t ON a.id = t.album_id
        WHERE t.id IS NULL AND a.is_release = 0
    `).all() as { id: number }[];
    for (const row of emptyAlbums) this.database.deleteAlbum(row.id);

    const emptyArtists = this.database.db.prepare(`
        SELECT ar.id FROM artists ar
        LEFT JOIN albums a ON ar.id = a.artist_id
        LEFT JOIN tracks t ON ar.id = t.artist_id
        WHERE a.id IS NULL AND t.id IS NULL
    `).all() as { id: number }[];
    for (const row of emptyArtists) this.database.deleteArtist(row.id);
  }
}
