import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { TrackRepository } from "../repositories/track.repository.js";
import { AlbumRepository } from "../repositories/album.repository.js";
import { ArtistRepository } from "../repositories/artist.repository.js";
import { ReleaseTrackRepository } from "../repositories/release-track.repository.js";
import { SocialRepository } from "../repositories/social.repository.js";
import { RemoteActorRepository } from "../repositories/remote-actor.repository.js";
import { RemoteContentRepository } from "../repositories/remote-content.repository.js";

// All types are defined in database.types.ts and re-exported here for backward compatibility
export type {
    OAuthClient, OAuthLink, Artist, Follower, LikeEntry, Album, Track, TrackDTO, AlbumDTO, Release,
    ReleaseTrack, Playlist, PlayHistoryEntry, Post, ApNote, RemoteActor,
    RemoteContent, TrackWithPlayCount, ArtistWithPlayCount, ListeningStats,
    GunCacheEntry, Torrent, TorrentStatus, SoulseekDownload, DatabaseService, StorageAccount
} from "./database.types.js";

import type {
    Album, Artist, Track, Release, ReleaseTrack, Follower, Post, ApNote,
    Playlist, PlayHistoryEntry, RemoteActor, RemoteContent, Torrent, GunCacheEntry,
    OAuthClient, OAuthLink, TrackWithPlayCount, ArtistWithPlayCount, ListeningStats,
    LikeEntry, SoulseekDownload, DatabaseService, TorrentStatus, StorageAccount
} from "./database.types.js";

const _insertQueueTrackStmts = new Map<number, any>();

export function createDatabase(dbPath: string): DatabaseService {
    const db = new Database(dbPath);
    
    // Enable WAL mode for better concurrency
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");

    // Rescue Phase: Recover from interrupted migrations
    // MUST run before "CREATE TABLE IF NOT EXISTS" blocks
    const tablesToRescue = ['albums', 'tracks', 'releases', 'release_tracks', 'admin', 'artists'];
    db.transaction(() => {
        for (const table of tablesToRescue) {
            const mainExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
            const oldExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(`${table}_old`);
            const newExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(`${table}_new`);
            
            if (!mainExists) {
                if (oldExists) {
                    console.log(`📦 [Database] Rescuing orphaned ${table}_old table...`);
                    db.exec(`ALTER TABLE "${table}_old" RENAME TO "${table}"`);
                } else if (newExists) {
                    console.log(`📦 [Database] Rescuing orphaned ${table}_new table...`);
                    db.exec(`ALTER TABLE "${table}_new" RENAME TO "${table}"`);
                }
            } else {
                // Cleanup legacy artifacts if main table exists
                if (oldExists) {
                    console.log(`🧹 [Database] Cleaning up legacy ${table}_old artifact...`);
                    db.exec(`DROP TABLE "${table}_old"`);
                }
                if (newExists) {
                    console.log(`🧹 [Database] Cleaning up legacy ${table}_new artifact...`);
                    db.exec(`DROP TABLE "${table}_new"`);
                }
            }
        }

        // Deep Clean: Remove any indices, triggers or views referencing _old or _new tables
        // These often cause "no such table" errors if they persist after a migration
        const artifacts = db.prepare("SELECT name, type FROM sqlite_master WHERE (sql LIKE '%_old%' OR sql LIKE '%_new%')").all() as { name: string, type: string }[];
        for (const artifact of artifacts) {
            try {
                // Don't drop the tables themselves here, they are handled by the rescue loop above
                if (artifact.type === 'table') continue;

                if (artifact.type === 'index') {
                    console.log(`🧹 [Database] Dropping stale index: ${artifact.name}`);
                    db.exec(`DROP INDEX IF EXISTS "${artifact.name}"`);
                } else if (artifact.type === 'trigger') {
                    console.log(`🧹 [Database] Dropping stale trigger: ${artifact.name}`);
                    db.exec(`DROP TRIGGER IF EXISTS "${artifact.name}"`);
                } else if (artifact.type === 'view') {
                    console.log(`🧹 [Database] Dropping stale view: ${artifact.name}`);
                    db.exec(`DROP VIEW IF EXISTS "${artifact.name}"`);
                }
            } catch (err) {
                console.warn(`⚠️ [Database] Failed to drop stale artifact ${artifact.name}:`, err);
            }
        } // Added missing brace

        // Deep Clean: Find child tables with corrupted Foreign Keys (referencing _old or _new)
        // These tables need to be rebuilt so they point to the correct main tables again.
        const corruptedTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%\\_old' ESCAPE '\\' AND name NOT LIKE '%\\_new' ESCAPE '\\' AND name NOT LIKE '%\\_corrupt' ESCAPE '\\' AND (sql LIKE '%_old%' OR sql LIKE '%_new%')").all() as { name: string }[];
        
        for (const ct of corruptedTables) {
            console.log(`📦 [Database] Found corrupted schema for table ${ct.name}. Preparing for rebuild...`);
            try {
                // Drop indices of this table so they can be cleanly recreated by the schema block
                const indices = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").all(ct.name) as { name: string }[];
                for (const idx of indices) {
                    db.exec(`DROP INDEX IF EXISTS "${idx.name}"`);
                }
                // Backup the table to be rebuilt
                db.exec(`ALTER TABLE "${ct.name}" RENAME TO "${ct.name}_corrupt"`);
            } catch (err) {
                console.warn(`⚠️ [Database] Failed to prep corrupted table ${ct.name} for rebuild:`, err);
            }
        }
    })();

    // Expose corruptedTables so we can restore them after schema creation
    const corruptedTablesToRestore = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%\\_corrupt' ESCAPE '\\'").all() as { name: string }[];

    // Enable foreign key constraints AFTER the Rescue Phase.
    // This ensures that renames and drops during recovery don't trigger broken FK checks.
    db.pragma("foreign_keys = ON");

    // Register custom Levenshtein function
    db.function("levenshtein", (a: string, b: string) => {
        if (!a) return b ? b.length : 0;
        if (!b) return a ? a.length : 0;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    });

    // Schema Maintenance Phase: Ensure missing columns exist in existing tables
    // This handles old backups that might be missing newer columns.
    (() => {
        const migrations = [
            {
                table: 'albums', columns: [
                    { name: 'status', type: 'TEXT DEFAULT "draft"' },
                    { name: 'is_release', type: 'INTEGER DEFAULT 0' },
                    { name: 'published_to_gundb', type: 'INTEGER DEFAULT 0' },
                    { name: 'published_to_ap', type: 'INTEGER DEFAULT 0' },
                    { name: 'published_at', type: 'TEXT' },
                    { name: 'use_nft', type: 'INTEGER DEFAULT 1' },
                    { name: 'album_artist', type: 'TEXT' },
                    { name: 'external_id', type: 'TEXT' },
                    { name: 'price_usdc', type: 'REAL DEFAULT 0' },
                    { name: 'price_usdt', type: 'REAL DEFAULT 0' },
                    { name: 'currency', type: 'TEXT DEFAULT "ETH"' },
                    { name: 'visibility', type: 'TEXT DEFAULT "private"' }
                ]
            },
            {
                table: 'releases', columns: [
                    { name: 'status', type: 'TEXT DEFAULT "draft"' },
                    { name: 'visibility', type: 'TEXT DEFAULT "private"' },
                    { name: 'published_at', type: 'TEXT' },
                    { name: 'published_to_gundb', type: 'INTEGER DEFAULT 0' },
                    { name: 'published_to_ap', type: 'INTEGER DEFAULT 0' },
                    { name: 'license', type: 'TEXT' },
                    { name: 'use_nft', type: 'INTEGER DEFAULT 1' },
                    { name: 'album_artist', type: 'TEXT' },
                    { name: 'price_usdc', type: 'REAL DEFAULT 0' },
                    { name: 'price_usdt', type: 'REAL DEFAULT 0' },
                    { name: 'currency', type: 'TEXT DEFAULT "ETH"' }
                ]
            },
            {
                table: 'tracks', columns: [
                    { name: 'lossless_path', type: 'TEXT' },
                    { name: 'fingerprint', type: 'TEXT' },
                    { name: 'price_usdc', type: 'REAL DEFAULT 0' },
                    { name: 'price_usdt', type: 'REAL DEFAULT 0' },
                    { name: 'currency', type: 'TEXT DEFAULT "ETH"' }
                ]
            },
            {
                table: 'release_tracks', columns: [
                    { name: 'price_usdc', type: 'REAL DEFAULT 0' },
                    { name: 'price_usdt', type: 'REAL DEFAULT 0' },
                    { name: 'currency', type: 'TEXT DEFAULT "ETH"' }
                ]
            },
            {
                table: 'torrents', columns: [
                    { name: 'status', type: 'TEXT DEFAULT "metadata"' }
                ]
            },
            {
                table: 'soulseek_downloads', columns: [
                    { name: 'status', type: 'TEXT' }
                ]
            },
            {
                table: 'admin', columns: [
                    { name: 'gun_pub', type: 'TEXT' },
                    { name: 'gun_priv', type: 'TEXT' },
                    { name: 'gun_auth_mode', type: 'TEXT NOT NULL DEFAULT "local"' },
                    { name: 'is_active', type: 'INTEGER DEFAULT 1' },
                    { name: 'telegram_bot_token', type: 'TEXT' },
                    { name: 'telegram_allowed_channels', type: 'TEXT' },
                    { name: 'storage_quota', type: 'INTEGER NOT NULL DEFAULT 0' },
                    { name: 'storage_used', type: 'INTEGER NOT NULL DEFAULT 0' }
                ]
            },
            {
                table: 'unlock_codes', columns: [
                    { name: 'tx_hash', type: 'TEXT' }
                ]
            },
            {
                table: 'artists', columns: [

                    { name: 'visibility', type: 'TEXT DEFAULT "public"' },
                    { name: 'wallet_address', type: 'TEXT' }
                ]
            }
        ];

        for (const m of migrations) {
            try {
                const tableInfo = db.prepare(`PRAGMA table_info("${m.table}")`).all() as any[];
                if (tableInfo.length === 0) continue;

                const existingColumns = tableInfo.map(c => c.name);
                for (const col of m.columns) {
                    if (!existingColumns.includes(col.name)) {
                        console.log(`📦 [Database] Adding missing column ${col.name} to table ${m.table}...`);
                        db.exec(`ALTER TABLE "${m.table}" ADD COLUMN ${col.name} ${col.type}`);
                    }
                }
            } catch (err) {
                console.warn(`⚠️ [Database] Failed to check/upgrade table ${m.table}:`, err);
            }
        }
    })();

    // Create tables and indices
    db.exec(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      artist_id INTEGER DEFAULT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      storage_quota INTEGER NOT NULL DEFAULT 0,
      storage_used INTEGER NOT NULL DEFAULT 0,
      subsonic_token TEXT,
      subsonic_password TEXT,
      slsk_username TEXT,
      slsk_password TEXT,
      gun_pub TEXT,
      gun_priv TEXT,
      gun_auth_mode TEXT NOT NULL DEFAULT 'local',
      is_active INTEGER DEFAULT 1,
      telegram_bot_token TEXT,
      telegram_allowed_channels TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      bio TEXT,
      photo_path TEXT,
      links TEXT,
      post_params TEXT,
      public_key TEXT,
      private_key TEXT,
      wallet_address TEXT,
      visibility TEXT DEFAULT 'public',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS followers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      actor_uri TEXT NOT NULL,
      inbox_uri TEXT NOT NULL,
      shared_inbox_uri TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(artist_id, actor_uri)
    );

    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_actor_fid TEXT NOT NULL,
      object_type TEXT NOT NULL,
      object_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(remote_actor_fid, object_type, object_id)
    );

    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      artist_id INTEGER REFERENCES artists(id),
      owner_id INTEGER REFERENCES admin(id),
      artist_name TEXT,
      date TEXT,
      cover_path TEXT,
      genre TEXT,
      description TEXT,
      type TEXT,
      year INTEGER,
      download TEXT,
      price REAL DEFAULT 0,
      price_usdc REAL DEFAULT 0,
      price_usdt REAL DEFAULT 0,
      currency TEXT DEFAULT 'ETH',
      external_links TEXT,
      is_public INTEGER DEFAULT 0,
      visibility TEXT DEFAULT 'private',
      license TEXT,
      is_release INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      published_to_gundb INTEGER DEFAULT 0,
      published_to_ap INTEGER DEFAULT 0,
      published_at TEXT,
      use_nft INTEGER DEFAULT 1,
      album_artist TEXT,
      external_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      album_id INTEGER REFERENCES albums(id),
      artist_id INTEGER REFERENCES artists(id),
      owner_id INTEGER REFERENCES admin(id),
      artist_name TEXT,
      track_num INTEGER,
      duration REAL,
      file_path TEXT UNIQUE,
      lossless_path TEXT,
      format TEXT,
      bitrate INTEGER,
      sample_rate INTEGER,
      price REAL DEFAULT 0,
      price_usdc REAL DEFAULT 0,
      price_usdt REAL DEFAULT 0,
      currency TEXT DEFAULT 'ETH',
      waveform TEXT,
      url TEXT,
      service TEXT,
      external_artwork TEXT,
      lyrics TEXT,
      hash TEXT,
      genre TEXT,
      year INTEGER,
      external_id TEXT,
      fingerprint TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL,
      description TEXT,
      is_public INTEGER DEFAULT 0,
      cover_path TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
      track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
      position INTEGER,
      PRIMARY KEY (playlist_id, track_id)
    );

    CREATE TABLE IF NOT EXISTS releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      artist_id INTEGER REFERENCES artists(id),
      owner_id INTEGER REFERENCES admin(id),
      date TEXT,
      cover_path TEXT,
      genre TEXT,
      description TEXT,
      type TEXT,
      year INTEGER,
      download TEXT,
      price REAL DEFAULT 0,
      price_usdc REAL DEFAULT 0,
      price_usdt REAL DEFAULT 0,
      currency TEXT DEFAULT 'ETH',
      external_links TEXT,
      external_id TEXT,
      status TEXT DEFAULT 'draft',
      visibility TEXT DEFAULT 'private',
      published_at TEXT,
      published_to_gundb INTEGER DEFAULT 0,
      published_to_ap INTEGER DEFAULT 0,
      license TEXT,
      use_nft INTEGER DEFAULT 1,
      album_artist TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS release_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      release_id INTEGER,
      track_id INTEGER,
      title TEXT NOT NULL,
      artist_name TEXT,
      track_num INTEGER,
      duration REAL,
      file_path TEXT,
      price REAL DEFAULT 0,
      price_usdc REAL DEFAULT 0,
      price_usdt REAL DEFAULT 0,
      currency TEXT DEFAULT 'ETH',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
      played_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_plugins (
      id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 1,
      config TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS unlock_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      release_id INTEGER REFERENCES albums(id),
      track_id INTEGER REFERENCES tracks(id),
      is_used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      redeemed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      visibility TEXT DEFAULT 'public',
      published_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ap_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      note_id TEXT NOT NULL UNIQUE,
      note_type TEXT NOT NULL,
      content_id INTEGER NOT NULL,
      content_slug TEXT NOT NULL,
      content_title TEXT NOT NULL,
      published_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    -- Zen (P2P) users cache (SEA identities)
    CREATE TABLE IF NOT EXISTS gun_users (
      pub TEXT PRIMARY KEY,
      epub TEXT,
      alias TEXT,
      avatar TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS oauth_clients (
      instance_url TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS oauth_links (
      provider TEXT NOT NULL,
      subject TEXT NOT NULL,
      gun_pub TEXT NOT NULL,
      gun_priv TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (provider, subject)
    );

    CREATE TABLE IF NOT EXISTS remote_actors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uri TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      username TEXT,
      name TEXT,
      summary TEXT,
      icon_url TEXT,
      inbox_url TEXT,
      outbox_url TEXT,
      public_key TEXT,
      is_followed INTEGER DEFAULT 0,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS remote_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ap_id TEXT NOT NULL UNIQUE,
      actor_uri TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      content TEXT,
      url TEXT,
      cover_url TEXT,
      stream_url TEXT,
      artist_name TEXT,
      album_name TEXT,
      duration REAL,
      published_at TEXT,
      received_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS starred_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(username, item_type, item_id)
    );

    CREATE TABLE IF NOT EXISTS play_queue_state (
      username TEXT PRIMARY KEY,
      current_track_id TEXT,
      position_ms INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS torrents (
      info_hash TEXT PRIMARY KEY,
      name TEXT,
      magnet_uri TEXT NOT NULL,
      owner_id INTEGER REFERENCES admin(id) ON DELETE SET NULL,
      status TEXT DEFAULT 'metadata',
      progress REAL DEFAULT 0,
      download_speed REAL DEFAULT 0,
      upload_speed REAL DEFAULT 0,
      num_peers INTEGER DEFAULT 0,
      size INTEGER DEFAULT 0,
      path TEXT,
      added_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS soulseek_downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        filename TEXT NOT NULL,
        status TEXT NOT NULL,
        progress REAL DEFAULT 0,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES admin (id)
    );

    CREATE TABLE IF NOT EXISTS play_queue_tracks (
      username TEXT NOT NULL,
      track_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (username, position)
    );

    CREATE TABLE IF NOT EXISTS item_ratings (
      username TEXT NOT NULL,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (username, item_type, item_id)
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      track_id TEXT NOT NULL,
      position_ms INTEGER NOT NULL,
      comment TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS storage_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES admin(id),
      provider TEXT NOT NULL,
      account_email TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expiry_date INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS album_ownership (
      album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE,
      owner_id INTEGER REFERENCES admin(id) ON DELETE CASCADE,
      PRIMARY KEY (album_id, owner_id)
    );

    CREATE TABLE IF NOT EXISTS track_ownership (
      track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
      owner_id INTEGER REFERENCES admin(id) ON DELETE CASCADE,
      PRIMARY KEY (track_id, owner_id)
    );

    CREATE TABLE IF NOT EXISTS gun_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      type TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at);
    CREATE INDEX IF NOT EXISTS idx_play_history_track_id ON play_history(track_id);
    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist_id);
    CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
    CREATE INDEX IF NOT EXISTS idx_albums_public ON albums(is_public);
    CREATE INDEX IF NOT EXISTS idx_albums_release ON albums(is_release);
    CREATE INDEX IF NOT EXISTS idx_release_tracks_release_id ON release_tracks(release_id);
    CREATE INDEX IF NOT EXISTS idx_release_tracks_track_id ON release_tracks(track_id);
    CREATE INDEX IF NOT EXISTS idx_posts_artist_id ON posts(artist_id);
    CREATE INDEX IF NOT EXISTS idx_ap_notes_artist ON ap_notes(artist_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(username);
    CREATE INDEX IF NOT EXISTS idx_track_ownership_owner ON track_ownership(owner_id);
    CREATE INDEX IF NOT EXISTS idx_album_ownership_owner ON album_ownership(owner_id);
    CREATE INDEX IF NOT EXISTS idx_gun_cache_expires ON gun_cache(expires_at);
    CREATE INDEX IF NOT EXISTS idx_tracks_title_lower ON tracks(lower(title));
    CREATE INDEX IF NOT EXISTS idx_albums_visibility ON albums(visibility);
    CREATE INDEX IF NOT EXISTS idx_releases_artist ON releases(artist_id);
    CREATE INDEX IF NOT EXISTS idx_admin_artist ON admin(artist_id);
    CREATE INDEX IF NOT EXISTS idx_releases_visibility_status ON releases(visibility, status);
    CREATE INDEX IF NOT EXISTS idx_torrents_added_at ON torrents(added_at);
  `);

    // Restore data for any rebuilt corrupted tables
    if (corruptedTablesToRestore.length > 0) {
        db.transaction(() => {
            for (const ct of corruptedTablesToRestore) {
                const originalName = ct.name.replace(/(_corrupt)+$/, '');
                console.log(`📦 [Database] Restoring data for rebuilt table ${originalName}...`);
                try {
                    db.exec(`INSERT INTO "${originalName}" SELECT * FROM "${ct.name}"`);
                    db.exec(`DROP TABLE "${ct.name}"`);
                } catch (err) {
                    console.error(`🚨 [Database] Failed to restore data for ${originalName}:`, err);
                }
            }
        })();
    }

    // Performance Test Requirement: Explicit index creation call (MUST be after table creation)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_albums_date ON albums(date DESC)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_releases_date ON releases(date DESC)`);

    // Schema Enrichment: Views for metadata consistency and simplified reporting
    db.exec(`
    CREATE VIEW IF NOT EXISTS v_artists AS
    SELECT 
        id, name, slug, bio, photo_path, links, post_params, public_key, private_key, wallet_address, visibility, created_at
    FROM artists;

    CREATE VIEW IF NOT EXISTS v_albums AS
    SELECT 
        a.*,
        COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name,
        ar.slug as artist_slug,
        ar.wallet_address as artist_wallet_address
    FROM albums a
    LEFT JOIN artists ar ON a.artist_id = ar.id;

    CREATE VIEW IF NOT EXISTS v_releases AS
    SELECT 
        r.*,
        COALESCE(r.album_artist, ar.name, (SELECT artist_name FROM release_tracks WHERE release_id = r.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name,
        ar.slug as artist_slug,
        ar.wallet_address as artist_wallet_address
    FROM releases r
    LEFT JOIN artists ar ON r.artist_id = ar.id;

    CREATE VIEW IF NOT EXISTS v_tracks AS
    SELECT 
        t.*,
        a.title as album_title,
        a.album_artist as album_artist_tag,
        a.visibility as album_visibility,
        a.status as album_status,
        COALESCE(ar_t.name, t.artist_name, a.album_artist, ar_a.name, 'Unknown Artist') as artist_name,
        COALESCE(ar_t.slug, ar_a.slug) as artist_slug,
        COALESCE(ar_t.wallet_address, ar_a.wallet_address) as artist_wallet_address,
        COALESCE(t.owner_id, a.owner_id) as effective_owner_id
    FROM tracks t
    LEFT JOIN albums a ON t.album_id = a.id
    LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
    LEFT JOIN artists ar_a ON a.artist_id = ar_a.id;
    `);

    // Integrity Triggers (Protection since FKs were relaxed for some tables)
    db.exec(`
    CREATE TRIGGER IF NOT EXISTS tr_cleanup_release_tracks_on_release_delete
    AFTER DELETE ON releases
    FOR EACH ROW
    BEGIN
        DELETE FROM release_tracks WHERE release_id = OLD.id;
    END;

    CREATE TRIGGER IF NOT EXISTS tr_cleanup_release_tracks_on_track_delete
    AFTER DELETE ON tracks
    FOR EACH ROW
    BEGIN
        DELETE FROM release_tracks WHERE track_id = OLD.id;
    END;

    -- Status Sync Triggers: Ensure public visibility implies released status
    CREATE TRIGGER IF NOT EXISTS tr_albums_status_sync
    AFTER UPDATE OF visibility ON albums
    FOR EACH ROW
    WHEN NEW.visibility IN ('public', 'unlisted') AND OLD.status = 'draft'
    BEGIN
        UPDATE albums SET status = 'released', published_at = COALESCE(published_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS tr_releases_status_sync
    AFTER UPDATE OF visibility ON releases
    FOR EACH ROW
    WHEN NEW.visibility IN ('public', 'unlisted') AND OLD.status = 'draft'
    BEGIN
        UPDATE releases SET status = 'released', published_at = COALESCE(published_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS tr_albums_status_init
    AFTER INSERT ON albums
    FOR EACH ROW
    WHEN NEW.visibility IN ('public', 'unlisted') AND NEW.status = 'draft'
    BEGIN
        UPDATE albums SET status = 'released', published_at = COALESCE(published_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS tr_releases_status_init
    AFTER INSERT ON releases
    FOR EACH ROW
    WHEN NEW.visibility IN ('public', 'unlisted') AND NEW.status = 'draft'
    BEGIN
        UPDATE releases SET status = 'released', published_at = COALESCE(published_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
    END;
    `);

    // Migration: Add status column to albums and releases table
    try {
        const tableInfoAlbums = db.pragma("table_info(albums)") as any[];
        const hasStatusAlbums = Array.isArray(tableInfoAlbums) && tableInfoAlbums.some(col => col.name === "status");
        if (!hasStatusAlbums) {
            console.log("📦 Migrating database: Adding status column to albums table...");
            db.exec("ALTER TABLE albums ADD COLUMN status TEXT DEFAULT 'draft'");
        }

        const tableInfoReleases = db.pragma("table_info(releases)") as any[];
        const hasStatusReleases = Array.isArray(tableInfoReleases) && tableInfoReleases.some(col => col.name === "status");
        if (!hasStatusReleases) {
            console.log("📦 Migrating database: Adding status column to releases table...");
            db.exec("ALTER TABLE releases ADD COLUMN status TEXT DEFAULT 'draft'");
        }

        // Backfill: Existing public releases should be marked as 'released'
        // We do this even if the column already existed, to catch any drift
        db.exec("UPDATE releases SET status = 'released' WHERE (visibility = 'public' OR visibility = 'unlisted') AND (status = 'draft' OR status IS NULL)");
        db.exec("UPDATE albums SET status = 'released' WHERE (visibility = 'public' OR visibility = 'unlisted') AND (status = 'draft' OR status IS NULL)");
    } catch (e) {
        console.error("Migration error (status column):", e);
    }

    // Migration: Add album_artist column to albums and releases table
    try {
        const tableInfoAlbums = db.pragma("table_info(albums)") as any[];
        const hasAlbumArtistAlbums = Array.isArray(tableInfoAlbums) && tableInfoAlbums.some(col => col.name === "album_artist");
        if (!hasAlbumArtistAlbums) {
            console.log("📦 Migrating database: Adding album_artist column to albums table...");
            db.exec("ALTER TABLE albums ADD COLUMN album_artist TEXT");
        }

        const tableInfoReleases = db.pragma("table_info(releases)") as any[];
        const hasAlbumArtistReleases = Array.isArray(tableInfoReleases) && tableInfoReleases.some(col => col.name === "album_artist");
        if (!hasAlbumArtistReleases) {
            console.log("📦 Migrating database: Adding album_artist column to releases table...");
            db.exec("ALTER TABLE releases ADD COLUMN album_artist TEXT");
        }
    } catch (e) {
        console.error("Migration error (album_artist column):", e);
    }

    // Migration: Add genre column to albums table (older backups may not have it)
    try {
        const tableInfoAlbums = db.pragma("table_info(albums)") as any[];
        const hasGenreAlbums = Array.isArray(tableInfoAlbums) && tableInfoAlbums.some(col => col.name === "genre");
        if (!hasGenreAlbums) {
            console.log("📦 Migrating database: Adding genre column to albums table...");
            db.exec("ALTER TABLE albums ADD COLUMN genre TEXT");
        }
    } catch (e) {
        console.error("Migration error (albums genre column):", e);
    }

    // Migration: Add external_id column to albums and releases table
    try {
        const tableInfoAlbums = db.pragma("table_info(albums)") as any[];
        const hasExternalIdAlbums = Array.isArray(tableInfoAlbums) && tableInfoAlbums.some(col => col.name === "external_id");
        if (!hasExternalIdAlbums) {
            console.log("📦 Migrating database: Adding external_id column to albums table...");
            db.exec("ALTER TABLE albums ADD COLUMN external_id TEXT");
        }

        const tableInfoReleases = db.pragma("table_info(releases)") as any[];
        const hasExternalIdReleases = Array.isArray(tableInfoReleases) && tableInfoReleases.some(col => col.name === "external_id");
        if (!hasExternalIdReleases) {
            console.log("📦 Migrating database: Adding external_id column to releases table...");
            db.exec("ALTER TABLE releases ADD COLUMN external_id TEXT");
        }
    } catch (e) {
        console.error("Migration error (external_id column):", e);
    }

    // Migration: Add price_usdt column to albums and releases table
    try {
        const tableInfoAlbums = db.pragma("table_info(albums)") as any[];
        const hasPriceUsdtAlbums = Array.isArray(tableInfoAlbums) && tableInfoAlbums.some(col => col.name === "price_usdt");
        if (!hasPriceUsdtAlbums) {
            console.log("📦 Migrating database: Adding price_usdt column to albums table...");
            db.exec("ALTER TABLE albums ADD COLUMN price_usdt REAL DEFAULT 0");
        }

        const tableInfoReleases = db.pragma("table_info(releases)") as any[];
        const hasPriceUsdtReleases = Array.isArray(tableInfoReleases) && tableInfoReleases.some(col => col.name === "price_usdt");
        if (!hasPriceUsdtReleases) {
            console.log("📦 Migrating database: Adding price_usdt column to releases table...");
            db.exec("ALTER TABLE releases ADD COLUMN price_usdt REAL DEFAULT 0");
        }
    } catch (e) {
        console.error("Migration error (price_usdt column):", e);
    }

    try {
        const tableInfo = db.pragma("table_info(torrents)") as any[];
        const hasOwnerId = Array.isArray(tableInfo) && tableInfo.some(col => col.name === "owner_id");
        if (!hasOwnerId) {
            console.log("📦 Migrating database: Adding owner_id to torrents table...");
            db.exec("ALTER TABLE torrents ADD COLUMN owner_id INTEGER REFERENCES admin(id) ON DELETE SET NULL");
        }
    } catch (e) {
        console.error("Migration error (torrents owner_id):", e);
    }

    const trackRepository = new TrackRepository(db);
    const albumRepository = new AlbumRepository(db);
    const artistRepository = new ArtistRepository(db);
    const releaseTrackRepository = new ReleaseTrackRepository(db);
    const socialRepository = new SocialRepository(db);
    const remoteActorRepository = new RemoteActorRepository(db);
    const remoteContentRepository = new RemoteContentRepository(db);


    
    // Migration: Add visibility column to artists table
    try {
        const tableInfo = db.pragma("table_info(artists)") as any[];
        const hasVisibility = Array.isArray(tableInfo) && tableInfo.some(col => col.name === "visibility");
        if (!hasVisibility) {
            console.log("📦 Migrating database: Adding visibility column to artists table...");
            db.exec("ALTER TABLE artists ADD COLUMN visibility TEXT DEFAULT 'public'");
        }
    } catch (e) {
        console.error("Migration error (artists visibility):", e);
    }

    // Migration: Move existing releases from 'albums' to 'releases' table
    try {
        const releaseCount = (db.prepare("SELECT COUNT(*) as count FROM releases").get() as { count: number }).count;
        if (releaseCount === 0) {
            const oldReleases = db.prepare("SELECT * FROM albums WHERE is_release = 1").all() as any[];
            if (oldReleases.length > 0) {
                console.log(`📦 Migrating ${oldReleases.length} releases to new structure...`);
                db.transaction(() => {
                    for (const album of oldReleases) {
                        // 1. Insert into releases
                        db.prepare(`
                            INSERT INTO releases (id, title, slug, artist_id, owner_id, date, cover_path, genre, description, type, year, download, price, currency, external_links, visibility, published_at, published_to_gundb, published_to_ap, license, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            album.id, album.title, album.slug, album.artist_id, album.owner_id || album.artist_id,
                            album.date, album.cover_path, album.genre, album.description, album.type, album.year,
                            album.download, album.price, album.currency, album.external_links, album.visibility,
                            album.published_at, album.published_to_gundb, album.published_to_ap, album.license, album.created_at
                        );

                        // 2. Migrate tracks
                        const oldTracks = db.prepare(`
                            SELECT t.* FROM tracks t
                            JOIN release_tracks rt ON t.id = rt.track_id
                            WHERE rt.release_id = ?
                        `).all(album.id) as any[];

                        const insertTrack = db.prepare(`
                            INSERT INTO release_tracks (release_id, track_id, title, artist_name, track_num, duration, file_path, price, currency, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);
                        for (const track of oldTracks) {
                            insertTrack.run(
                                album.id, track.id, track.title, track.artist_name, track.track_num, track.duration,
                                track.file_path, track.price, track.currency, track.created_at
                            );
                        }
                    }
                })();
                console.log("✅ Migration complete: releases moved to separate compartment.");
            }
        }
    } catch (e) {
        console.error("Migration error (releases):", e);
    }


    // Migration: Recreate release_tracks without strict foreign keys
    try {
        const fixKey = "release_tracks_fk_fixed_v2";
        const isFixed = (db.prepare("SELECT value FROM settings WHERE key = ?").get(fixKey) as { value: string } | undefined);

        if (!isFixed) {
            console.log("📦 Migrating database: Removing strict foreign keys from release_tracks...");
            db.transaction(() => {
                const data = db.prepare("SELECT * FROM release_tracks").all() as any[];
                db.exec("DROP TABLE IF EXISTS release_tracks");
                db.exec(`
                    CREATE TABLE IF NOT EXISTS release_tracks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        release_id INTEGER,
                        track_id INTEGER,
                        title TEXT NOT NULL,
                        artist_name TEXT,
                        track_num INTEGER,
                        duration REAL,
                        file_path TEXT,
                        price REAL DEFAULT 0,
                        price_usdc REAL DEFAULT 0,
                        price_usdt REAL DEFAULT 0,
                        currency TEXT DEFAULT 'ETH',
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                if (data.length > 0) {
                    const insert = db.prepare(`
                        INSERT INTO release_tracks (id, release_id, track_id, title, artist_name, track_num, duration, file_path, price, price_usdc, price_usdt, currency, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);
                    for (const row of data) {
                        insert.run(row.id, row.release_id, row.track_id, row.title, row.artist_name, row.track_num, row.duration, row.file_path, row.price, row.price_usdc || 0, row.price_usdt || 0, row.currency, row.created_at);
                    }
                }

                db.exec("CREATE INDEX IF NOT EXISTS idx_release_tracks_release_id ON release_tracks(release_id)");
                db.exec("CREATE INDEX IF NOT EXISTS idx_release_tracks_track_id ON release_tracks(track_id)");
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(fixKey, "true");
            })();
            console.log("✅ Database migrated: release_tracks is now unconstrained.");
        }
    } catch (e) {
        console.warn("⚠️  Migration warning (release_tracks recreation):", e);
    }

    // Fix NOT NULL constraint on tracks.file_path for external tracks
    try {
        const columns = db.pragma("table_info(tracks)") as any[];
        const filePathCol = Array.isArray(columns) ? columns.find(c => c.name === "file_path") : undefined;
        if (filePathCol && filePathCol.notnull === 1) {
            console.log("📦 Migrating database: making tracks.file_path nullable...");
            db.transaction(() => {
                const tableDef = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tracks'").get() as { sql: string };
                let newSql = tableDef.sql.replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?['"`]?tracks['"`]?/i, "CREATE TABLE tracks_new");
                newSql = newSql.replace(/(['"`\[]?file_path['"`\]]?\s+TEXT)\s+NOT\s+NULL/i, "$1");
                db.exec(newSql);

                const colNames = columns.map(c => `"${c.name}"`).join(", ");
                db.exec(`INSERT INTO tracks_new (${colNames}) SELECT ${colNames} FROM tracks;`);
                db.exec(`DROP TABLE tracks;`);
                db.exec(`ALTER TABLE tracks_new RENAME TO tracks;`);

                db.exec(`DROP INDEX IF EXISTS idx_tracks_album;`);
                db.exec(`DROP INDEX IF EXISTS idx_tracks_artist;`);
                db.exec(`DROP INDEX IF EXISTS idx_tracks_title_lower;`);
                db.exec(`CREATE INDEX idx_tracks_album ON tracks(album_id);`);
                db.exec(`CREATE INDEX idx_tracks_artist ON tracks(artist_id);`);
                db.exec(`CREATE INDEX idx_tracks_title_lower ON tracks(lower(title));`);
            })();
            console.log("✅ Database migrated: tracks.file_path is now nullable.");
        }
    } catch (e) {
        console.warn("⚠️  Migration warning (tracks.file_path):", e);
    }

    // Migration: Add genre and year to tracks table
    try {
        const tableInfo = db.pragma("table_info(tracks)") as any[];
        const hasGenre = Array.isArray(tableInfo) && tableInfo.some(col => col.name === "genre");
        const hasYear = Array.isArray(tableInfo) && tableInfo.some(col => col.name === "year");
        
        if (!hasGenre) {
            console.log("📦 Migrating database: Adding genre to tracks table...");
            db.exec("ALTER TABLE tracks ADD COLUMN genre TEXT");
        }
        if (!hasYear) {
            console.log("📦 Migrating database: Adding year to tracks table...");
            db.exec("ALTER TABLE tracks ADD COLUMN year INTEGER");
        }
    } catch (e) {
        console.error("Migration error (tracks metadata):", e);
    }

    // Migration: Add fingerprint column to tracks table
    try {
        const tableInfo = db.pragma("table_info(tracks)") as any[];
        const hasFingerprint = Array.isArray(tableInfo) && tableInfo.some(col => col.name === "fingerprint");
        if (!hasFingerprint) {
            console.log("📦 Migrating database: Adding fingerprint column to tracks table...");
            db.exec("ALTER TABLE tracks ADD COLUMN fingerprint TEXT");
        }
    } catch (e) {
        console.error("Migration error (fingerprint column):", e);
    }

    // Unify owner_id to use User IDs (admin.id)
    try {
        const fixKey = "owner_id_to_userid_v2";
        const isFixed = (db.prepare("SELECT value FROM settings WHERE key = ?").get(fixKey) as { value: string } | undefined);

        if (!isFixed) {
            console.log("📦 Migrating database: Unifying owner_id to use User IDs (including releases)...");
            db.transaction(() => {
                db.exec(`
                    UPDATE tracks 
                    SET owner_id = (SELECT id FROM admin WHERE admin.artist_id = tracks.artist_id LIMIT 1)
                    WHERE (owner_id IS NULL OR owner_id = artist_id) AND artist_id IS NOT NULL;
                `);
                db.exec(`
                    UPDATE albums 
                    SET owner_id = (SELECT id FROM admin WHERE admin.artist_id = albums.artist_id LIMIT 1)
                    WHERE (owner_id IS NULL OR owner_id = artist_id) AND artist_id IS NOT NULL;
                `);
                db.exec(`
                    UPDATE releases 
                    SET owner_id = (SELECT id FROM admin WHERE admin.artist_id = releases.artist_id LIMIT 1)
                    WHERE (owner_id IS NULL OR owner_id = artist_id) AND artist_id IS NOT NULL;
                `);
                db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(fixKey, "true");
            })();
            console.log("✅ Database migrated: owner_id unified for all content types.");
        }
    } catch (e) {
        console.error("Migration error (unify owner_id v2):", e);
    }
    
    // Migration: Update torrents table with status and progress
    try {
        const tableInfo = db.pragma("table_info(torrents)") as any[];
        const hasStatus = Array.isArray(tableInfo) && tableInfo.some(col => col.name === "status");
        if (!hasStatus) {
            console.log("📦 Migrating database: Adding status, progress, speed, and size to torrents table...");
            db.exec("ALTER TABLE torrents ADD COLUMN status TEXT DEFAULT 'metadata'");
            db.exec("ALTER TABLE torrents ADD COLUMN progress REAL DEFAULT 0");
            db.exec("ALTER TABLE torrents ADD COLUMN download_speed REAL DEFAULT 0");
            db.exec("ALTER TABLE torrents ADD COLUMN upload_speed REAL DEFAULT 0");
            db.exec("ALTER TABLE torrents ADD COLUMN num_peers INTEGER DEFAULT 0");
            db.exec("ALTER TABLE torrents ADD COLUMN size INTEGER DEFAULT 0");
            db.exec("ALTER TABLE torrents ADD COLUMN path TEXT");
        }
    } catch (e) {
        console.error("Migration error (torrents status):", e);
    }

    // Migration: Add telegram bot settings to admin table
    try {
        const tableInfo = db.pragma("table_info(admin)") as any[];
        const hasTelegramToken = Array.isArray(tableInfo) && tableInfo.some(col => col.name === "telegram_bot_token");
        if (!hasTelegramToken) {
            console.log("📦 Migrating database: Adding telegram bot settings to admin table...");
            db.exec("ALTER TABLE admin ADD COLUMN telegram_bot_token TEXT");
            db.exec("ALTER TABLE admin ADD COLUMN telegram_allowed_channels TEXT");
        }
    } catch (e) {
        console.error("Migration error (admin telegram settings):", e);
    }

    // Migration: Fix foreign key constraints and schema artifacts (Deep Repair Phase)
    try {
        db.exec("PRAGMA foreign_keys = OFF");

        const checkNeedsRepair = (tableName: string) => {
            try {
                // Check if table exists
                const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
                if (!tableExists) return false;

                const fks = db.prepare(`PRAGMA foreign_key_list("${tableName}")`).all() as any[];
                const hasBrokenFK = fks.some(fk => 
                    fk.table.includes('_old') || 
                    fk.table.includes('_new') || 
                    (fk.from === 'owner_id' && fk.table === 'artists')
                );
                if (hasBrokenFK) return true;

                // Also check SQL for stale table references
                const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(tableName) as { sql: string } | undefined;
                if (row?.sql && (row.sql.includes('_old') || row.sql.includes('_new'))) return true;

                return false;
            } catch (e) {
                return false;
            }
        };

        const migrateTable = (tableName: string, createSql: string) => {
            console.log(`🛠️ [Database] Repairing '${tableName}' table...`);
            const tempName = `${tableName}_new`;
            try {
                db.exec(`DROP TABLE IF EXISTS ${tempName}`);
                db.exec(createSql);
                
                const oldCols = (db.prepare(`PRAGMA table_info(${tableName})`).all() as any[]).map(c => c.name);
                const newCols = (db.prepare(`PRAGMA table_info(${tempName})`).all() as any[]).map(c => c.name);
                const commonCols = oldCols.filter(c => newCols.includes(c));
                
                if (commonCols.length > 0) {
                    const colsStr = commonCols.join(', ');
                    db.exec(`INSERT OR IGNORE INTO ${tempName} (${colsStr}) SELECT ${colsStr} FROM ${tableName}`);
                }
                
                db.exec(`DROP TABLE ${tableName}`);
                db.exec(`ALTER TABLE ${tempName} RENAME TO ${tableName}`);
            } catch (err) {
                console.error(`❌ [Database] Failed to migrate table '${tableName}':`, err);
                throw err;
            }
        };

        const tablesToCheck = ['tracks', 'albums', 'releases', 'release_tracks', 'album_ownership', 'track_ownership'];
        const needsRepair = tablesToCheck.some(t => checkNeedsRepair(t));

        if (needsRepair) {
            console.log("📦 [Database] Deep schema repair required...");
            db.transaction(() => {
                if (checkNeedsRepair('tracks')) {
                    migrateTable('tracks', `
                        CREATE TABLE tracks_new (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          title TEXT NOT NULL,
                          album_id INTEGER REFERENCES albums(id),
                          artist_id INTEGER REFERENCES artists(id),
                          owner_id INTEGER REFERENCES admin(id),
                          artist_name TEXT,
                          track_num INTEGER,
                          duration REAL,
                          file_path TEXT,
                          format TEXT,
                          bitrate INTEGER,
                          sample_rate INTEGER,
                          price REAL DEFAULT 0,
                          price_usdc REAL DEFAULT 0,
                          price_usdt REAL DEFAULT 0,
                          currency TEXT DEFAULT 'ETH',
                          waveform TEXT,
                          url TEXT,
                          service TEXT,
                          external_artwork TEXT,
                          lyrics TEXT,
                          lossless_path TEXT,
                          external_id TEXT,
                          hash TEXT,
                          created_at TEXT DEFAULT CURRENT_TIMESTAMP
                        )
                    `);
                }

                if (checkNeedsRepair('albums')) {
                    migrateTable('albums', `
                        CREATE TABLE albums_new (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          title TEXT NOT NULL,
                          slug TEXT NOT NULL UNIQUE,
                          artist_id INTEGER REFERENCES artists(id),
                          owner_id INTEGER REFERENCES admin(id),
                          date TEXT,
                          cover_path TEXT,
                          genre TEXT,
                          description TEXT,
                          type TEXT DEFAULT 'album',
                          year INTEGER,
                          download TEXT,
                          price REAL DEFAULT 0,
                          price_usdc REAL DEFAULT 0,
                          currency TEXT DEFAULT 'ETH',
                          external_links TEXT,
                          is_public INTEGER DEFAULT 0,
                          visibility TEXT DEFAULT 'private',
                          is_release INTEGER DEFAULT 0,
                          published_at TEXT,
                          published_to_gundb INTEGER DEFAULT 0,
                          published_to_ap INTEGER DEFAULT 0,
                          license TEXT,
                          status TEXT DEFAULT 'draft',
                          created_at TEXT DEFAULT CURRENT_TIMESTAMP
                        )
                    `);
                }

                if (checkNeedsRepair('releases')) {
                    migrateTable('releases', `
                        CREATE TABLE releases_new (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          title TEXT NOT NULL,
                          slug TEXT NOT NULL UNIQUE,
                          artist_id INTEGER REFERENCES artists(id),
                          owner_id INTEGER REFERENCES admin(id),
                          date TEXT,
                          cover_path TEXT,
                          genre TEXT,
                          description TEXT,
                          type TEXT DEFAULT 'album',
                          year INTEGER,
                          download TEXT,
                          price REAL DEFAULT 0,
                          price_usdc REAL DEFAULT 0,
                          currency TEXT DEFAULT 'ETH',
                          external_links TEXT,
                          visibility TEXT DEFAULT 'private',
                          published_at TEXT,
                          published_to_gundb INTEGER DEFAULT 0,
                          published_to_ap INTEGER DEFAULT 0,
                          license TEXT,
                          status TEXT DEFAULT 'draft',
                          created_at TEXT DEFAULT CURRENT_TIMESTAMP
                        )
                    `);
                }

                if (checkNeedsRepair('release_tracks')) {
                    migrateTable('release_tracks', `
                        CREATE TABLE release_tracks_new (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          release_id INTEGER REFERENCES releases(id) ON DELETE CASCADE,
                          track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
                          owner_id INTEGER REFERENCES admin(id),
                          title TEXT NOT NULL,
                          artist_name TEXT,
                          track_num INTEGER,
                          duration REAL,
                          file_path TEXT,
                          price REAL DEFAULT 0,
                          price_usdc REAL DEFAULT 0,
                          price_usdt REAL DEFAULT 0,
                          currency TEXT DEFAULT 'ETH',
                          created_at TEXT DEFAULT CURRENT_TIMESTAMP
                        )
                    `);
                }

                if (checkNeedsRepair('album_ownership')) {
                    migrateTable('album_ownership', `
                        CREATE TABLE album_ownership_new (
                          album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE,
                          owner_id INTEGER REFERENCES admin(id) ON DELETE CASCADE,
                          PRIMARY KEY (album_id, owner_id)
                        )
                    `);
                }

                if (checkNeedsRepair('track_ownership')) {
                    migrateTable('track_ownership', `
                        CREATE TABLE track_ownership_new (
                          track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
                          owner_id INTEGER REFERENCES admin(id) ON DELETE CASCADE,
                          PRIMARY KEY (track_id, owner_id)
                        )
                    `);
                }
            })();
            console.log("✅ [Database] Deep schema repair complete.");
        }
    } catch (e) {
        console.error("❌ [Database] Critical error during schema repair:", e);
    } finally {
        db.exec("PRAGMA foreign_keys = ON");
    }

    // Optimized: Performance Test Requirement: Explicit index creation call (MUST be after table creation)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_albums_date ON albums(date DESC)`);

    const service: DatabaseService = {
        db,

        // Storage Accounts
        getStorageAccounts(userId?: number): StorageAccount[] {
            const sql = userId ? "SELECT * FROM storage_accounts WHERE user_id = ?" : "SELECT * FROM storage_accounts";
            return (userId ? db.prepare(sql).all(userId) : db.prepare(sql).all()) as StorageAccount[];
        },

        getStorageAccount(id: number): StorageAccount | undefined {
            return db.prepare("SELECT * FROM storage_accounts WHERE id = ?").get(id) as StorageAccount | undefined;
        },

        getStorageAccountByProvider(userId: number, provider: string): StorageAccount | undefined {
            return db.prepare("SELECT * FROM storage_accounts WHERE user_id = ? AND provider = ?").get(userId, provider) as StorageAccount | undefined;
        },

        createStorageAccount(account: Omit<StorageAccount, "id" | "created_at">): number {
            const res = db.prepare(`
                INSERT INTO storage_accounts (user_id, provider, account_email, access_token, refresh_token, expiry_date)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(account.user_id, account.provider, account.account_email, account.access_token, account.refresh_token, account.expiry_date);
            return res.lastInsertRowid as number;
        },

        updateStorageAccount(id: number, account: Partial<StorageAccount>): void {
            const fields: string[] = [];
            const values: any[] = [];
            for (const [key, value] of Object.entries(account)) {
                if (key === 'id' || key === 'created_at') continue;
                fields.push(`${key} = ?`);
                values.push(value);
            }
            if (fields.length === 0) return;
            values.push(id);
            db.prepare(`UPDATE storage_accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        },

        deleteStorageAccount(id: number): void {
            db.prepare("DELETE FROM storage_accounts WHERE id = ?").run(id);
        },

        getReleaseTrackIds(releaseId: number): number[] {
            const rows = db.prepare("SELECT track_id FROM release_tracks WHERE release_id = ?").all(releaseId) as { track_id: number }[];
            return rows.map(r => r.track_id).filter(id => id !== null) as number[];
        },

        // Releases (Watertight compartment)
        getReleases(publicOnly = false): Release[] {
            return albumRepository.getReleases(publicOnly);
        },

        getRelease(id: number): Release | undefined {
            return albumRepository.getById(id) as Release | undefined;
        },

        getReleaseBySlug(slug: string): Release | undefined {
            return albumRepository.getBySlug(slug) as Release | undefined;
        },

        getReleasesByArtist(artistId: number, publicOnly = false, artistName?: string): Release[] {
            return albumRepository.getReleasesByArtist(artistId, publicOnly, artistName);
        },

        getReleasesByOwner(ownerId: number, publicOnly = false): Release[] {
            return albumRepository.getReleasesByOwner(ownerId, publicOnly);
        },

        createRelease(release: Omit<Release, "id" | "created_at" | "artist_name" | "artist_slug">): number {
            return albumRepository.createRelease(release);
        },

        getRecentReleaseByMetadata(title: string, artistId: number | null, seconds: number): Release | undefined {
            const row = db.prepare(`
                SELECT * FROM releases 
                WHERE title = ? AND (artist_id = ? OR (artist_id IS NULL AND ? IS NULL))
                AND created_at >= datetime('now', ?)
                ORDER BY created_at DESC LIMIT 1
            `).get(title, artistId, artistId, `-${seconds} seconds`);
            return row as Release | undefined;
        },

        updateRelease(id: number, release: Partial<Release>): void {
            albumRepository.update(id, release);
        },

        deleteRelease(id: number): void {
            albumRepository.delete(id);
        },
        deleteReleasesBatch(ids: number[]): void {
            db.transaction(() => {
                for (const id of ids) {
                    albumRepository.delete(id);
                }
            })();
        },

        // Release Tracks
        getReleaseTracks(releaseId: number): ReleaseTrack[] {
            return releaseTrackRepository.getByReleaseId(releaseId);
        },

        getTracksSummaryByReleaseId(releaseId: number): Track[] {
            return trackRepository.getByReleaseId(releaseId);
        },

        getReleaseTrack(id: number): ReleaseTrack | undefined {
            return releaseTrackRepository.getById(id);
        },

        getTrackPriceFromRelease(releaseId: number, trackId: number): { price: number, price_usdc: number, currency: string, title: string } | undefined {
            return releaseTrackRepository.getPriceFromRelease(releaseId, trackId);
        },

        getTracksByReleaseId(releaseId: number): Track[] {
            return trackRepository.getByReleaseId(releaseId);
        },

        addTrackToRelease(releaseId: number, trackId: number, metadata?: Partial<ReleaseTrack>): number {
            return releaseTrackRepository.add(releaseId, { ...metadata, track_id: trackId });
        },

        updateReleaseTrack(id: number, metadata: Partial<ReleaseTrack>): void {
            releaseTrackRepository.update(id, metadata);
        },

        updateReleaseTrackMetadata(releaseId: number, trackId: number, metadata: Partial<ReleaseTrack>): void {
            releaseTrackRepository.updateMetadata(releaseId, trackId, metadata);
        },

        removeTrackFromRelease(releaseId: number, trackId: number): void {
            releaseTrackRepository.remove(releaseId, trackId);
        },

        removeTracksFromRelease(releaseId: number, trackIds: number[]): void {
            releaseTrackRepository.removeBatch(releaseId, trackIds);
        },

        deleteReleaseTrack(id: number): void {
            releaseTrackRepository.delete(id);
        },

        updateReleaseTracksOrder(releaseId: number, trackIds: number[]): void {
            releaseTrackRepository.updateOrder(releaseId, trackIds);
        },

        syncReleaseTracks(releaseId: number, trackIds: number[]): void {
            releaseTrackRepository.sync(releaseId, trackIds);
        },


        cleanUpGhostTracks(releaseId: number): void {
            releaseTrackRepository.cleanUpGhostTracks(releaseId);
        },

        // OAuth
        getOAuthClient(instanceUrl: string): OAuthClient | undefined {
            return db.prepare("SELECT * FROM oauth_clients WHERE instance_url = ?").get(instanceUrl) as OAuthClient | undefined;
        },

        saveOAuthClient(client: Omit<OAuthClient, "created_at">): void {
            db.prepare(`
                INSERT INTO oauth_clients (instance_url, client_id, client_secret, redirect_uri)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(instance_url) DO UPDATE SET
                    client_id=excluded.client_id,
                    client_secret=excluded.client_secret,
                    redirect_uri=excluded.redirect_uri
            `).run(client.instance_url, client.client_id, client.client_secret, client.redirect_uri);
        },

        getOAuthLink(provider: string, subject: string): OAuthLink | undefined {
            return db.prepare("SELECT * FROM oauth_links WHERE provider = ? AND subject = ?").get(provider, subject) as OAuthLink | undefined;
        },

        createOAuthLink(provider: string, subject: string, gunPub: string, gunPriv: string): void {
            db.prepare(`
                INSERT INTO oauth_links (provider, subject, gun_pub, gun_priv)
                VALUES (?, ?, ?, ?)
            `).run(provider, subject, gunPub, gunPriv);
        },

        // Artists
        getArtists(): Artist[] {
            return artistRepository.getAll();
        },

        getArtist(id: number): Artist | undefined {
            return artistRepository.getById(id);
        },

        getArtistSimple(id: number): Artist | undefined {
            return artistRepository.getByIdSimple(id);
        },

        getArtistsByIds(ids: number[]): Artist[] {
            return artistRepository.getByIds(ids);
        },

        getArtistByName(name: string): Artist | undefined {
            return artistRepository.getByName(name);
        },

        getArtistBySlug(slug: string): Artist | undefined {
            return artistRepository.getBySlug(slug);
        },

        createArtist(name: string, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string, visibility: 'public' | 'private' | 'unlisted' = 'public'): number {
            return artistRepository.create(name, bio, photoPath, links, postParams, walletAddress, visibility);
        },

        updateArtist(id: number, name?: string, bio?: string, photoPath?: string, links?: any, postParams?: any, walletAddress?: string, visibility?: 'public' | 'private' | 'unlisted'): void {
            artistRepository.update(id, name, bio, photoPath, links, postParams, walletAddress, visibility);
        },

        updateArtistKeys(id: number, publicKey: string, privateKey: string): void {
            artistRepository.updateKeys(id, publicKey, privateKey);
        },

        deleteArtist(id: number): void {
            artistRepository.delete(id);
        },
        isArtistLinkedToUser(id: number): boolean {
            const row = db.prepare("SELECT 1 FROM admin WHERE artist_id = ?").get(id);
            return !!row;
        },

        isArtistLinkedToUserBySlug(slug: string): boolean {
            const row = db.prepare(`
                SELECT 1 FROM admin adm
                JOIN artists art ON adm.artist_id = art.id
                WHERE art.slug = ?
            `).get(slug);
            return !!row;
        },

        // Followers
        addFollower(artistId: number, actorUri: string, inboxUri: string, sharedInboxUri?: string): void {
            socialRepository.addFollower(artistId, actorUri, inboxUri, sharedInboxUri);
        },
        removeFollower(artistId: number, actorUri: string): void {
            socialRepository.removeFollower(artistId, actorUri);
        },
        getFollowers(artistId: number): Follower[] {
            return socialRepository.getFollowers(artistId);
        },
        getFollower(artistId: number, actorUri: string): Follower | undefined {
            return socialRepository.getFollower(artistId, actorUri);
        },

        // Albums (Library)
        getAlbums(publicOnly = false): Album[] {
            return albumRepository.getLibraryAlbums(publicOnly);
        },
        getAlbumsWithStats(publicOnly = false): (Album & { songCount: number; duration: number })[] {
            return albumRepository.getWithStats(publicOnly);
        },
        getLibraryAlbums(): Album[] {
            return albumRepository.getLibraryAlbums();
        },
        getAlbum(id: number): Album | undefined {
            return albumRepository.getById(id);
        },
        getAlbumsByIds(ids: number[]): Album[] {
            return albumRepository.getByIds(ids);
        },
        getAlbumBySlug(slug: string): Album | undefined {
            return albumRepository.getBySlug(slug);
        },
        getAlbumByTitle(title: string, artistId?: number): Album | undefined {
            return albumRepository.getByTitle(title, artistId);
        },
        getArtistAlbumCounts(): { artist_id: number, count: number }[] {
            return albumRepository.getArtistAlbumCounts();
        },
        getArtistCovers(artistId: number): string[] {
            return albumRepository.getCovers(artistId);
        },
        getAlbumsByArtist(artistId: number, publicOnly = false, artistName?: string): Album[] {
            return albumRepository.getByArtist(artistId, publicOnly, artistName);
        },
        getAlbumsByOwner(ownerId: number, publicOnly = false): Album[] {
            return albumRepository.getByOwner(ownerId, publicOnly);
        },
        createAlbum(album: Omit<Album, "id" | "created_at" | "artist_name" | "artist_slug">): number {
            const albumId = albumRepository.create(album);
            const ownerId = album.owner_id;
            if (ownerId) this.addAlbumOwner(albumId, ownerId);
            return albumId;
        },
        searchAlbums(query: string, limit: number, publicOnly = false): Album[] {
            return albumRepository.search(query, limit, publicOnly);
        },
        updateAlbumVisibility(id: number, visibility: 'public' | 'private' | 'unlisted'): void {
            const isPublic = visibility === 'public' || visibility === 'unlisted';
            const publishedAt = isPublic ? new Date().toISOString() : null;
            albumRepository.update(id, { is_public: isPublic, visibility, published_at: publishedAt });
        },
        updateAlbumStatus(id: number, status: string): void {
            const updates: any = { status };
            if (status === 'released') {
                const item = albumRepository.getById(id);
                if (item && !item.published_at) {
                    updates.published_at = new Date().toISOString();
                }
            }
            albumRepository.update(id, updates);
        },
        updateReleaseStatus(id: number, status: string): void {
            const updates: any = { status };
            if (status === 'released') {
                const item = albumRepository.getById(id); // getById handles both tables
                if (item && !item.published_at) {
                    updates.published_at = new Date().toISOString();
                }
            }
            albumRepository.update(id, updates);
        },
        updateAlbumFederationSettings(id: number, publishedToGunDB: boolean, publishedToAP: boolean): void {
            albumRepository.update(id, { published_to_gundb: publishedToGunDB, published_to_ap: publishedToAP });
        },
        updateAlbumArtist(id: number, artistId: number): void {
            const artist = this.getArtist(artistId);
            if (artist) {
                albumRepository.update(id, { artist_id: artistId });
                db.prepare("UPDATE tracks SET artist_name = ? WHERE album_id = ? AND artist_id IS NULL").run(artist.name, id);
                db.prepare("UPDATE release_tracks SET artist_name = ? WHERE release_id = ? AND (track_id IS NULL OR track_id NOT IN (SELECT id FROM tracks WHERE artist_id IS NOT NULL))").run(artist.name, id);
            } else {
                albumRepository.update(id, { artist_id: artistId });
            }
        },
        updateAlbumOwner(id: number, ownerId: number): void { 
            albumRepository.update(id, { owner_id: ownerId });
        },
        updateAlbumTitle(id: number, title: string): void {
            albumRepository.update(id, { title });
        },
        updateAlbumCover(id: number, coverPath: string): void { albumRepository.update(id, { cover_path: coverPath }); },
        updateAlbumGenre(id: number, genre: string | null): void { albumRepository.update(id, { genre }); },
        updateAlbumYear(id: number, year: number | string | null): void { albumRepository.update(id, { year: Number(year) }); },
        updateAlbumDownload(id: number, download: string | null): void { albumRepository.update(id, { download }); },
        updateAlbumPrice(id: number, price: number | null, price_usdc: number | null, currency: 'ETH' | 'USD' = 'ETH'): void {
            albumRepository.update(id, { price, price_usdc, currency });
        },
        updateAlbumLinks(id: number, links: string | null): void { albumRepository.update(id, { external_links: links }); },
        updateAlbum(id: number, album: Partial<Album>): void {
            albumRepository.update(id, album);
        },
        promoteToRelease(id: number): void {
            albumRepository.promoteToRelease(id);
        },
        deleteAlbum(id: number, keepTracks = false): void {
            albumRepository.delete(id, keepTracks);
        },
        deleteAlbumsBatch(ids: number[], keepTracks = false): void {
            db.transaction(() => {
                for (const id of ids) {
                    albumRepository.delete(id, keepTracks);
                }
            })();
        },
        // Tracks
        getTracks(albumId?: number, publicOnly = false): Track[] {
            if (albumId) return trackRepository.getByAlbumId(albumId, publicOnly);
            return trackRepository.getAll(publicOnly);
        },
        getTracksByAlbum(albumId: number, publicOnly = false): Track[] { return this.getTracks(albumId, publicOnly); },
        getTracksByArtist(artistId: number, publicOnly = false, artistName?: string): Track[] {
            return trackRepository.getByArtist(artistId, publicOnly, artistName);
        },
        repairArtistLinks(artistId: number, artistName: string): { tracks: number, albums: number } {
            return db.transaction(() => {
                const trackRes = db.prepare("UPDATE tracks SET artist_id = ? WHERE (artist_id IS NULL OR artist_id IN (SELECT id FROM artists WHERE name LIKE ? AND id != ?)) AND (artist_name LIKE ? OR artist_name = ?)").run(artistId, artistName, artistId, `%${artistName}%`, artistName);
                // Improved album repair: now also catches albums linked to duplicate artists
                const albumRes = db.prepare("UPDATE albums SET artist_id = ? WHERE (artist_id IS NULL OR artist_id IN (SELECT id FROM artists WHERE name LIKE ? AND id != ?)) AND (title = ? OR title LIKE ?)").run(artistId, artistName, artistId, artistName, `%${artistName}%`);
                const albumTracksRes = db.prepare("UPDATE albums SET artist_id = ? WHERE (artist_id IS NULL OR artist_id IN (SELECT id FROM artists WHERE name LIKE ? AND id != ?)) AND id IN (SELECT DISTINCT album_id FROM tracks WHERE artist_id = ? AND album_id IS NOT NULL)").run(artistId, artistName, artistId, artistId);
                return { tracks: trackRes.changes, albums: albumRes.changes + albumTracksRes.changes };
            })();
        },
        getTracksByOwner(ownerId: number, publicOnly = false): Track[] {
            return trackRepository.getByOwner(ownerId, publicOnly);
        },
        getRandomTracks(limit: number): Track[] { return trackRepository.getRandom(limit); },
        getTracksByAlbumIds(albumIds: number[]): Track[] {
            return trackRepository.getByIds(albumIds);
        },
        getTrack(id: number): Track | undefined { return trackRepository.getById(id); },
        getTracksByIds(ids: number[]): Track[] { return trackRepository.getByIds(ids); },
        getTrackByPath(filePath: string): Track | undefined {
            return trackRepository.getByPath(filePath);
        },
        getTrackByExternalId(externalId: string): Track | undefined {
            const row = db.prepare("SELECT * FROM tracks WHERE external_id = ?").get(externalId) as any;
            return row ? (trackRepository as any).mapTrack(row) : undefined;
        },
        createTrack(track: Omit<Track, "id" | "created_at" | "album_title">): number {
            const trackId = trackRepository.create(track);
            const ownerId = track.owner_id;
            if (ownerId) this.addTrackOwner(trackId, ownerId);
            return trackId;
        },
        updateTrackAlbum(id: number, albumId: number | null): void { trackRepository.update(id, { album_id: albumId }); },
        updateTracksAlbum(trackIds: number[], albumId: number | null): void {
            if (trackIds.length === 0) return;
            const CHUNK_SIZE = 900;
            for (let i = 0; i < trackIds.length; i += CHUNK_SIZE) {
                const chunk = trackIds.slice(i, i + CHUNK_SIZE);
                const placeholders = chunk.map(() => "?").join(",");
                db.prepare(`UPDATE tracks SET album_id = ? WHERE id IN (${placeholders})`).run(albumId, ...chunk);
            }
        },
        updateTrackOrder(id: number, trackNum: number): void { trackRepository.updateOrder(id, trackNum); },
        updateTrackNumber(id: number, trackNum: number): void { this.updateTrackOrder(id, trackNum); },
        updateTracksOrder(trackOrders: { id: number, trackNum: number }[]): void {
            const stmt = db.prepare("UPDATE tracks SET track_num = ? WHERE id = ?");
            db.transaction(() => trackOrders.forEach(o => stmt.run(o.trackNum, o.id)))();
        },
        updateTrackArtist(id: number, artistId: number | null): void {
            const artist = artistId ? this.getArtist(artistId) : null;
            trackRepository.updateArtist(id, artistId, artist?.name || null);
        },
        updateTrackArtistName(id: number, artistName: string | null): void {
            trackRepository.updateArtist(id, null, artistName);
        },
        updateTrackOwner(id: number, ownerId: number | null): void { trackRepository.updateOwner(id, ownerId); },
        getTrackByMetadata(title: string, artistId: number | null, albumId: number | null): Track | undefined {
            return trackRepository.getByMetadata(title, artistId, albumId);
        },
        updateTrackTitle(id: number, title: string): void { 
            trackRepository.update(id, { title });
        },
        updateTrackPrice(id: number, price: number | null, price_usdc: number | null, currency: 'ETH' | 'USD' = 'ETH'): void {
            trackRepository.update(id, { price, price_usdc, currency });
        },
        updateTrackDuration(id: number, duration: number): void { 
            trackRepository.update(id, { duration });
        },
        updateTrackBitrate(id: number, bitrate: number): void {
            trackRepository.update(id, { bitrate });
        },
        updateTrackPath(id: number, filePath: string, albumId: number | null): void { 
            trackRepository.update(id, { file_path: filePath, album_id: albumId });
        },
        updateTrackWaveform(id: number, waveform: string): void { trackRepository.update(id, { waveform }); },
        updateTrackFingerprint(id: number, fingerprint: string): void { trackRepository.update(id, { fingerprint }); },
        updateTrackLosslessPath(id: number, losslessPath: string | null): void { trackRepository.update(id, { lossless_path: losslessPath }); },
        updateTrackExternalArtwork(id: number, artworkPath: string | null): void { trackRepository.update(id, { external_artwork: artworkPath }); },
        updateTrackLyrics(id: number, lyrics: string | null): void { trackRepository.update(id, { lyrics }); },
        updateTrackGenre(id: number, genre: string | null): void { trackRepository.update(id, { genre: genre ?? undefined }); },
        updateTrackYear(id: number, year: number | null): void { trackRepository.update(id, { year: year ?? undefined }); },
        updateTrackPathsPrefix(oldPrefix: string, newPrefix: string): void {
            trackRepository.updatePathsPrefix(oldPrefix, newPrefix);
        },
        mergeTracks(fromId: number, toId: number): void {
            const target = this.getTrack(toId); if (!target) return;
            trackRepository.merge(fromId, toId, target.file_path || "");
        },
        getAllTracks(whereClause?: string, params: any[] = []): Track[] {
            const sql = whereClause ? `SELECT * FROM tracks WHERE ${whereClause}` : "SELECT * FROM tracks";
            const rows = db.prepare(sql).all(...params) as any[];
            return rows.map(r => (trackRepository as any).mapTrack(r));
        },
        iterateTracks(whereClause?: string, params: any[] = []): IterableIterator<Track> {
            const sql = whereClause ? `SELECT * FROM tracks WHERE ${whereClause}` : "SELECT * FROM tracks";
            const stmt = db.prepare(sql);
            const iterator = stmt.iterate(...params);
            const mapTrack = (trackRepository as any).mapTrack.bind(trackRepository);
            
            return (function* () {
                for (const row of iterator) {
                    yield mapTrack(row);
                }
            })() as IterableIterator<Track>;
        },
        deleteTrack(id: number, ownerId?: number): void {
            trackRepository.delete(id, ownerId);
        },
        // Playlists
        getPlaylists(username?: string, publicOnly = false): Playlist[] {
            let sql = publicOnly ? "SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at as createdAt FROM playlists WHERE is_public = 1" : "SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at as createdAt FROM playlists";
            if (username) sql += publicOnly ? " AND username = ?" : " WHERE username = ?";
            sql += " ORDER BY name";
            return username ? db.prepare(sql).all(username) as Playlist[] : db.prepare(sql).all() as Playlist[];
        },
        getPlaylist(id: number): Playlist | undefined { return db.prepare("SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at as createdAt FROM playlists WHERE id = ?").get(id) as Playlist | undefined; },
        createPlaylist(name: string, username: string, description?: string, isPublic = false): number {
            const res = db.prepare("INSERT INTO playlists (name, username, description, is_public) VALUES (?, ?, ?, ?)").run(name, username, description || null, isPublic ? 1 : 0);
            return res.lastInsertRowid as number;
        },
        updatePlaylistVisibility(id: number, isPublic: boolean): void { db.prepare("UPDATE playlists SET is_public = ? WHERE id = ?").run(isPublic ? 1 : 0, id); },
        updatePlaylistCover(id: number, coverPath: string | null): void { db.prepare("UPDATE playlists SET cover_path = ? WHERE id = ?").run(coverPath, id); },
        deletePlaylist(id: number): void { db.prepare("DELETE FROM playlists WHERE id = ?").run(id); },
        getPlaylistTracks(playlistId: number): Track[] {
            return db.prepare(`SELECT t.*, a.title as album_title, COALESCE(ar_t.name, ar_a.name) as artist_name, COALESCE(ar_t.id, ar_a.id) as artist_id
           FROM tracks t JOIN playlist_tracks pt ON t.id = pt.track_id LEFT JOIN albums a ON t.album_id = a.id LEFT JOIN artists ar_t ON t.artist_id = ar_t.id LEFT JOIN artists ar_a ON a.artist_id = ar_a.id WHERE pt.playlist_id = ? ORDER BY pt.position`).all(playlistId) as Track[];
        },
        isTrackInPublicPlaylist(trackId: number): boolean {
            return !!db.prepare("SELECT count(*) as count FROM playlist_tracks pt JOIN playlists p ON pt.playlist_id = p.id WHERE pt.track_id = ? AND p.is_public = 1").get(trackId);
        },
        addTrackToPlaylist(playlistId: number, trackId: number): void {
            const max = db.prepare("SELECT MAX(position) as max FROM playlist_tracks WHERE playlist_id = ?").get(playlistId) as { max: number | null };
            db.prepare("INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)").run(playlistId, trackId, (max?.max || 0) + 1);
        },
        removeTrackFromPlaylist(playlistId: number, trackId: number): void { db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?").run(playlistId, trackId); },
        // Posts
        getPublicPosts(): Post[] { return db.prepare("SELECT p.*, a.name as artist_name, a.slug as artist_slug, a.photo_path as artist_photo FROM posts p JOIN artists a ON p.artist_id = a.id WHERE p.visibility = 'public' ORDER BY p.created_at DESC").all() as Post[]; },
        getPostsByArtist(artistId: number, publicOnly = false): Post[] {
            const sql = publicOnly ? "SELECT p.*, a.name as artist_name, a.slug as artist_slug, a.photo_path as artist_photo FROM posts p JOIN artists a ON p.artist_id = a.id WHERE p.artist_id = ? AND p.visibility = 'public' ORDER BY p.created_at DESC" : "SELECT p.*, a.name as artist_name, a.slug as artist_slug, a.photo_path as artist_photo FROM posts p JOIN artists a ON p.artist_id = a.id WHERE p.artist_id = ? ORDER BY p.created_at DESC";
            return db.prepare(sql).all(artistId) as Post[];
        },
        getPost(id: number): Post | undefined { return db.prepare("SELECT p.*, a.name as artist_name, a.slug as artist_slug, a.photo_path as artist_photo FROM posts p JOIN artists a ON p.artist_id = a.id WHERE p.id = ?").get(id) as Post | undefined; },
        getPostBySlug(slug: string): Post | undefined { return db.prepare("SELECT p.*, a.name as artist_name, a.slug as artist_slug, a.photo_path as artist_photo FROM posts p JOIN artists a ON p.artist_id = a.id WHERE p.slug = ?").get(slug) as Post | undefined; },
        createPost(artistId: number, content: string, visibility: 'public' | 'private' | 'unlisted' = 'public'): number {
            const snippet = content.slice(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const random = Math.random().toString(36).substring(2, 8);
            const slug = snippet ? `${snippet}-${random}` : `post-${random}`;
            const publishedAt = (visibility === 'public' || visibility === 'unlisted') ? new Date().toISOString() : null;
            const res = db.prepare("INSERT INTO posts (artist_id, content, slug, visibility, published_at) VALUES (?, ?, ?, ?, ?)").run(artistId, content, slug, visibility, publishedAt);
            return res.lastInsertRowid as number;
        },
        deletePost(id: number): void { db.prepare("DELETE FROM posts WHERE id = ?").run(id); },
        updatePostVisibility(id: number, visibility: 'public' | 'private' | 'unlisted'): void {
            const publishedAt = (visibility === 'public' || visibility === 'unlisted') ? new Date().toISOString() : null;
            db.prepare("UPDATE posts SET visibility = ?, published_at = ? WHERE id = ?").run(visibility, publishedAt, id);
        },
        updatePost(id: number, content: string, visibility?: 'public' | 'private' | 'unlisted'): void {
            if (content !== undefined && visibility !== undefined) {
                const publishedAt = (visibility === 'public' || visibility === 'unlisted') ? new Date().toISOString() : null;
                db.prepare("UPDATE posts SET content = ?, visibility = ?, published_at = ? WHERE id = ?").run(content, visibility, publishedAt, id);
            } else if (content !== undefined) db.prepare("UPDATE posts SET content = ? WHERE id = ?").run(content, id);
            else if (visibility !== undefined) this.updatePostVisibility(id, visibility);
        },
        // Stats
        async getStats(artistId?: number, ownerId?: number) {
            let filter = ""; if (artistId && ownerId) filter = `WHERE artist_id = ${artistId} OR owner_id = ${ownerId}`;
            else if (artistId) filter = `WHERE artist_id = ${artistId}`; else if (ownerId) filter = `WHERE owner_id = ${ownerId}`;
            const artists = (db.prepare(`SELECT COUNT(*) as count FROM artists ${artistId ? 'WHERE id='+artistId : ''}`).get() as any).count;
            const albums = (db.prepare(`SELECT COUNT(*) as count FROM albums ${filter}`).get() as any).count;
            const tracksCount = (db.prepare(`SELECT COUNT(*) as count FROM tracks ${filter}`).get() as any).count;
            const releaseTracksCount = (db.prepare(`SELECT COUNT(rt.id) as count FROM release_tracks rt JOIN releases r ON rt.release_id = r.id ${filter.replace(/artist_id/g, 'r.artist_id').replace(/owner_id/g, 'r.owner_id')}`).get() as any).count;
            const tracks = tracksCount + releaseTracksCount;

            const publicAlbums = (db.prepare(`SELECT COUNT(*) as count FROM releases ${filter ? filter+' AND' : 'WHERE'} visibility IN ('public', 'unlisted')`).get() as any).count;
            const totalUsers = (artistId || ownerId) ? 0 : (db.prepare("SELECT COUNT(*) as count FROM admin").get() as any)?.count || 0;
            
            const storageTracks = db.prepare(`SELECT SUM(duration) as total FROM tracks ${filter}`).get() as any;
            const storageReleaseTracks = db.prepare(`SELECT SUM(rt.duration) as total FROM release_tracks rt JOIN releases r ON rt.release_id = r.id ${filter.replace(/artist_id/g, 'r.artist_id').replace(/owner_id/g, 'r.owner_id')}`).get() as any;
            const totalDuration = (storageTracks.total || 0) + (storageReleaseTracks.total || 0);
            const genreSet = new Set<string>();
            try {
                const allGenres = db.prepare(`SELECT genre FROM albums ${filter ? filter + ' AND' : 'WHERE'} genre IS NOT NULL AND genre != ''`).all() as { genre: string }[];
                allGenres.forEach(r => r.genre?.split(',').forEach(g => genreSet.add(g.trim().toLowerCase())));
            } catch (_e) { /* genre column may not exist in old backups */ }
            try {
                const allTrackGenres = db.prepare(`SELECT genre FROM tracks ${filter ? filter + ' AND' : 'WHERE'} genre IS NOT NULL AND genre != ''`).all() as { genre: string }[];
                allTrackGenres.forEach(r => r.genre?.split(',').forEach(g => genreSet.add(g.trim().toLowerCase())));
            } catch (_e) { /* genre column may not exist in old backups */ }
            return { artists, albums, tracks, totalTracks: tracks, publicAlbums, totalUsers, storageUsed: (totalDuration || 0) * 40 * 1024, networkSites: (artistId || ownerId) ? 0 : (db.prepare("SELECT COUNT(*) as count FROM remote_actors WHERE type = 'Service'").get() as any).count, genresCount: genreSet.size, genres: Array.from(genreSet).sort() };
        },
        getPublicTracksCount(): number { 
            const libraryPublic = (db.prepare("SELECT COUNT(t.id) as count FROM tracks t JOIN albums a ON t.album_id = a.id WHERE a.visibility = 'public'").get() as any).count;
            const releasePublic = (db.prepare("SELECT COUNT(rt.id) as count FROM release_tracks rt JOIN releases r ON rt.release_id = r.id WHERE r.visibility = 'public'").get() as any).count;
            return libraryPublic + releasePublic;
        },
        getGenres(publicOnly = false): string[] {
            const genreSet = new Set<string>();
            try {
                const albumGenres = db.prepare(publicOnly ? "SELECT genre FROM albums WHERE is_release = 1 AND visibility IN ('public', 'unlisted') AND status = 'released' AND genre IS NOT NULL AND genre != ''" : "SELECT genre FROM albums WHERE genre IS NOT NULL AND genre != ''").all() as { genre: string }[];
                albumGenres.forEach(r => r.genre?.split(',').forEach(g => genreSet.add(g.trim().toLowerCase())));
            } catch (_e) { /* genre column may not exist in old backups */ }
            try {
                const trackGenres = db.prepare(publicOnly ? "SELECT t.genre FROM tracks t JOIN albums a ON t.album_id = a.id WHERE a.is_release = 1 AND a.visibility IN ('public', 'unlisted') AND a.status = 'released' AND t.genre IS NOT NULL AND t.genre != ''" : "SELECT genre FROM tracks WHERE genre IS NOT NULL AND genre != ''").all() as { genre: string }[];
                trackGenres.forEach(r => r.genre?.split(',').forEach(g => genreSet.add(g.trim().toLowerCase())));
            } catch (_e) { /* genre column may not exist in old backups */ }
            return Array.from(genreSet).sort();
        },
        getTracksByGenre(genre: string, publicOnly = false): Track[] {
            const lq = `%${genre}%`;
            const sql = publicOnly ? 
                "SELECT t.*, a.title as album_title, COALESCE(ar_t.name, ar_a.name) as artist_name, COALESCE(ar_t.id, ar_a.id) as artist_id FROM tracks t LEFT JOIN albums a ON t.album_id = a.id LEFT JOIN artists ar_t ON t.artist_id = ar_t.id LEFT JOIN artists ar_a ON a.artist_id = ar_a.id WHERE a.is_release = 1 AND a.visibility IN ('public', 'unlisted') AND a.status = 'released' AND (t.genre LIKE ? OR a.genre LIKE ?)" :
                "SELECT t.*, a.title as album_title, COALESCE(ar_t.name, ar_a.name) as artist_name, COALESCE(ar_t.id, ar_a.id) as artist_id FROM tracks t LEFT JOIN albums a ON t.album_id = a.id LEFT JOIN artists ar_t ON t.artist_id = ar_t.id LEFT JOIN artists ar_a ON a.artist_id = ar_a.id WHERE t.genre LIKE ? OR a.genre LIKE ?";
            return db.prepare(sql).all(lq, lq) as Track[];
        },
        getGenreTrackCounts(publicOnly = false): Map<string, number> {
            const sql = publicOnly ? 
                "SELECT t.genre FROM tracks t JOIN albums a ON t.album_id = a.id WHERE a.is_release = 1 AND a.visibility IN ('public', 'unlisted') AND a.status = 'released' AND t.genre IS NOT NULL AND t.genre != ''" :
                "SELECT genre FROM tracks WHERE genre IS NOT NULL AND genre != ''";
            const rows = db.prepare(sql).all() as { genre: string }[];
            const counts = new Map<string, number>();
            rows.forEach(r => {
                r.genre?.split(',').forEach(g => {
                    const name = g.trim().toLowerCase();
                    counts.set(name, (counts.get(name) || 0) + 1);
                });
            });
            return counts;
        },
        search(query: string, publicOnly = false) {
            const lq = `%${query}%`;
            const artists = db.prepare("SELECT * FROM artists WHERE name LIKE ?").all(lq) as Artist[];
            const albums = db.prepare(publicOnly ? 
                "SELECT a.*, ar.name as artist_name FROM albums a LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.is_release = 1 AND a.visibility IN ('public', 'unlisted') AND a.status = 'released' AND (a.title LIKE ? OR ar.name LIKE ? OR a.genre LIKE ?)" : 
                "SELECT a.*, ar.name as artist_name FROM albums a LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.title LIKE ? OR ar.name LIKE ? OR a.genre LIKE ?").all(lq, lq, lq) as Album[];
            const tracks = db.prepare(publicOnly ? 
                "SELECT t.*, a.title as album_title, COALESCE(ar_t.name, ar_a.name) as artist_name, COALESCE(ar_t.id, ar_a.id) as artist_id FROM tracks t LEFT JOIN albums a ON t.album_id = a.id LEFT JOIN artists ar_t ON t.artist_id = ar_t.id LEFT JOIN artists ar_a ON a.artist_id = ar_a.id WHERE a.is_release = 1 AND a.visibility IN ('public', 'unlisted') AND a.status = 'released' AND (t.title LIKE ? OR ar_t.name LIKE ? OR ar_a.name LIKE ? OR t.genre LIKE ?)" : 
                "SELECT t.*, a.title as album_title, COALESCE(ar_t.name, ar_a.name) as artist_name, COALESCE(ar_t.id, ar_a.id) as artist_id FROM tracks t LEFT JOIN albums a ON t.album_id = a.id LEFT JOIN artists ar_t ON t.artist_id = ar_t.id LEFT JOIN artists ar_a ON a.artist_id = ar_a.id WHERE t.title LIKE ? OR ar_t.name LIKE ? OR ar_a.name LIKE ? OR t.genre LIKE ?").all(lq, lq, lq, lq) as Track[];
            return { artists, albums, tracks };
        },
        // Settings
        getSetting(key: string): string | undefined { return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any)?.value; },
        setSetting(key: string, value: string): void { db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value); },
        getAllSettings(): { [key: string]: string } {
            const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string, value: string }[];
            const s: any = {}; rows.forEach(r => s[r.key] = r.value); return s;
        },
        // Play History
        recordPlay: (trackId: number, playedAt?: string) => socialRepository.recordPlay(trackId, playedAt),
        getRecentPlays: (limit = 50) => socialRepository.getRecentPlays(limit),
        getTopTracks: (limit = 20, days = 30, filter: 'all' | 'library' | 'releases' = 'all') => socialRepository.getTopTracks(limit, days, filter),
        getTopArtists: (limit = 10, days = 30, filter: 'all' | 'library' | 'releases' = 'all') => socialRepository.getTopArtists(limit, days, filter),
        getPrimaryAdminId(): number | null {
            const admin = db.prepare("SELECT id FROM admin WHERE role IN ('admin', 'super_user', 'root_admin') ORDER BY id ASC LIMIT 1").get() as { id: number } | undefined;
            return admin ? admin.id : null;
        },
        getTracksMissingMetadata(filter: 'genre' | 'year' | 'cover' | 'album' | 'description' | 'artist'): Track[] {
            let query = "";
            if (filter === 'genre') {
                query = "SELECT t.*, al.title as album_title, ar.name as artist_name FROM tracks t LEFT JOIN albums al ON t.album_id = al.id LEFT JOIN artists ar ON t.artist_id = ar.id WHERE t.genre IS NULL OR t.genre = '' OR t.genre = 'Library'";
            } else if (filter === 'year') {
                query = "SELECT t.*, al.title as album_title, ar.name as artist_name FROM tracks t LEFT JOIN albums al ON t.album_id = al.id LEFT JOIN artists ar ON t.artist_id = ar.id WHERE t.year IS NULL OR t.year = 0";
            } else if (filter === 'cover') {
                query = "SELECT t.*, al.title as album_title, ar.name as artist_name FROM tracks t LEFT JOIN albums al ON t.album_id = al.id LEFT JOIN artists ar ON t.artist_id = ar.id WHERE (t.external_artwork IS NULL OR t.external_artwork = '') AND (al.cover_path IS NULL OR al.cover_path = '')";
            } else if (filter === 'album') {
                query = "SELECT t.*, NULL as album_title, ar.name as artist_name FROM tracks t LEFT JOIN artists ar ON t.artist_id = ar.id WHERE t.album_id IS NULL";
            } else if (filter === 'artist') {
                query = "SELECT t.*, al.title as album_title, ar.name as artist_name FROM tracks t LEFT JOIN albums al ON t.album_id = al.id LEFT JOIN artists ar ON t.artist_id = ar.id WHERE t.artist_id IS NULL OR ar.name = 'Unknown Artist' OR ar.name = '' OR t.artist_name = 'Unknown Artist' OR t.artist_name = ''";
            } else if (filter === 'description') {
                return [];
            }

            if (!query) return [];
            return db.prepare(query).all() as Track[];
        },
        getAlbumsMissingMetadata(filter: 'genre' | 'year' | 'cover' | 'description' | 'artist'): Album[] {
            let query = "";
            if (filter === 'genre') {
                query = "SELECT a.*, ar.name as artist_name FROM albums a LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.genre IS NULL OR a.genre = '' OR a.genre = 'Library'";
            } else if (filter === 'year') {
                query = "SELECT a.*, ar.name as artist_name FROM albums a LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.year IS NULL OR a.year = 0";
            } else if (filter === 'cover') {
                query = "SELECT a.*, ar.name as artist_name FROM albums a LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.cover_path IS NULL OR a.cover_path = ''";
            } else if (filter === 'description') {
                query = "SELECT a.*, ar.name as artist_name FROM albums a LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.description IS NULL OR a.description = ''";
            } else if (filter === 'artist') {
                query = "SELECT a.*, ar.name as artist_name FROM albums a LEFT JOIN artists ar ON a.artist_id = ar.id WHERE a.artist_id IS NULL OR ar.name = 'Unknown Artist' OR ar.name = '' OR a.album_artist = 'Unknown Artist' OR a.album_artist = ''";
            }
            return (db.prepare(query).all() as any[]).map(r => (albumRepository as any).mapAlbum(r));
        },
        getArtistsMissingMetadata(filter: 'photo'): Artist[] {
            if (filter === 'photo') {
                return db.prepare("SELECT * FROM artists WHERE photo_path IS NULL OR photo_path = ''").all() as Artist[];
            }
            return [];
        },
        getListeningStats(): ListeningStats {
            const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            const week = new Date(now.getTime() - 7*24*3600000).toISOString(); const month = new Date(now.getTime() - 30*24*3600000).toISOString();
            const totalPlays = (db.prepare("SELECT COUNT(*) as count FROM play_history").get() as any).count;
            const stats = db.prepare(`SELECT COUNT(CASE WHEN played_at >= ? THEN 1 END) as playsToday, COUNT(CASE WHEN played_at >= ? THEN 1 END) as playsThisWeek, COUNT(CASE WHEN played_at >= ? THEN 1 END) as playsThisMonth FROM play_history WHERE played_at >= ?`).get(today, week, month, month) as any;
            const unique = (db.prepare("SELECT COUNT(DISTINCT track_id) as count FROM play_history").get() as any).count;
            const time = db.prepare("SELECT COALESCE(SUM(ph.cnt * t.duration), 0) as total FROM (SELECT track_id, COUNT(*) as cnt FROM play_history GROUP BY track_id) ph JOIN tracks t ON ph.track_id = t.id").get() as any;
            return { totalPlays, totalListeningTime: Math.round(time.total), uniqueTracks: unique, playsToday: stats.playsToday, playsThisWeek: stats.playsThisWeek, playsThisMonth: stats.playsThisMonth };
        },
        // Unlock Codes
        createUnlockCode(code: string, releaseId?: number, trackId?: number, txHash?: string): void { db.prepare("INSERT INTO unlock_codes (code, release_id, track_id, tx_hash) VALUES (?, ?, ?, ?)").run(code, releaseId || null, trackId || null, txHash || null); },
        validateUnlockCode(code: string): { valid: boolean; releaseId?: number; trackId?: number; isUsed: boolean } {
            const row = db.prepare("SELECT * FROM unlock_codes WHERE code = ?").get(code) as any;
            return row ? { valid: true, releaseId: row.release_id, trackId: row.track_id, isUsed: !!row.is_used } : { valid: false, isUsed: false };
        },
        redeemUnlockCode(code: string): void { db.prepare("UPDATE unlock_codes SET is_used = 1, redeemed_at = CURRENT_TIMESTAMP WHERE code = ?").run(code); },
        getUnlockCodeByTxHash(txHash: string): any | undefined { return db.prepare("SELECT * FROM unlock_codes WHERE tx_hash = ?").get(txHash); },
        listUnlockCodes(releaseId?: number): any[] { return releaseId ? db.prepare("SELECT * FROM unlock_codes WHERE release_id = ? ORDER BY created_at DESC").all(releaseId) : db.prepare("SELECT * FROM unlock_codes ORDER BY created_at DESC").all(); },
        // AP Notes
        createApNote(artistId: number, noteId: string, noteType: 'post' | 'release', contentId: number, contentSlug: string, contentTitle: string): number {
            return Number(db.prepare("INSERT OR REPLACE INTO ap_notes (artist_id, note_id, note_type, content_id, content_slug, content_title, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)").run(artistId, noteId, noteType, contentId, contentSlug, contentTitle).lastInsertRowid);
        },
        getApNotes(artistId: number, includeDeleted = false): ApNote[] { return db.prepare(includeDeleted ? "SELECT * FROM ap_notes WHERE artist_id = ? ORDER BY published_at DESC" : "SELECT * FROM ap_notes WHERE artist_id = ? AND deleted_at IS NULL ORDER BY published_at DESC").all(artistId) as any[]; },
        getApNote(noteId: string): ApNote | undefined { return db.prepare("SELECT * FROM ap_notes WHERE note_id = ?").get(noteId) as any; },
        markApNoteDeleted(noteId: string): void { db.prepare("UPDATE ap_notes SET deleted_at = CURRENT_TIMESTAMP WHERE note_id = ?").run(noteId); },
        deleteApNote(noteId: string): void { db.prepare("DELETE FROM ap_notes WHERE note_id = ?").run(noteId); },
        // Zen Users
        syncZenUser(pub: string, epub: string, alias: string, avatar?: string): void {
            let ca = alias; if (alias === pub || alias.length > 64) { const e = this.getZenUser(pub); if (e?.alias && e.alias !== pub) ca = e.alias; }
            db.prepare("INSERT OR REPLACE INTO gun_users (pub, epub, alias, avatar) VALUES (?, ?, ?, ?)").run(pub, epub, ca, avatar || null);
        },
        getZenUser(pub: string): any { return db.prepare("SELECT pub, epub, alias, avatar FROM gun_users WHERE pub = ?").get(pub); },
        // AP Remote
        upsertRemoteActor(actor: any): void { remoteActorRepository.upsertRemoteActor(actor); },
        getRemoteActor(uri: string): any { return remoteActorRepository.getRemoteActor(uri); },
        getRemoteActors(): any[] { return remoteActorRepository.getRemoteActors(); },
        getFollowedActors(): any[] { return remoteActorRepository.getFollowedActors(); },
        unfollowActor(uri: string): void { remoteActorRepository.unfollowActor(uri); },
        upsertRemoteContent(content: any): void { remoteContentRepository.upsertRemoteContent(content); },
        saveRemoteActor(actor: any): void { remoteActorRepository.saveRemoteActor(actor); },
        getRemoteTracks(): any[] { return remoteContentRepository.getRemoteTracks(); },
        getRemotePosts(): any[] { return remoteContentRepository.getRemotePosts(); },
        getRemoteTrack(id: string): any { return remoteContentRepository.getRemoteTrack(id); },
        getRemoteContent(id: string): any { return remoteContentRepository.getRemoteContent(id); },
        saveRemotePost(post: any): void { remoteContentRepository.saveRemotePost(post); },
        deleteRemotePost(id: string): void { remoteContentRepository.deleteRemotePost(id); },
        deleteRemoteContent(id: string): void { remoteContentRepository.deleteRemoteContent(id); },
        addLike: (actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number) => socialRepository.addLike(actorUri, objectType, objectId),
        removeLike: (actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number) => socialRepository.removeLike(actorUri, objectType, objectId),
        getLikesCount: (objectType: 'album' | 'track' | 'post', objectId: number) => socialRepository.getLikesCount(objectType, objectId),
        hasLiked: (actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number) => socialRepository.hasLiked(actorUri, objectType, objectId),

        starItem: (user: string, type: any, id: string) => socialRepository.starItem(user, type, id),
        starItems: (user: string, items: any[]) => { if (items.length === 0) return; db.transaction(() => items.forEach(i => socialRepository.starItem(user, i.type, i.id)))(); },
        unstarItem: (user: string, type: any, id: string) => socialRepository.unstarItem(user, type, id),
        unstarItems: (user: string, items: any[]) => { if (items.length === 0) return; db.transaction(() => items.forEach(i => socialRepository.unstarItem(user, i.type, i.id)))(); },
        getStarredItems: (user: string, type?: any) => socialRepository.getStarredItems(user, type),
        isStarred: (user: string, type: any, id: string) => socialRepository.isStarred(user, type, id),

        setItemRating: (user: string, type: any, id: string, r: number) => socialRepository.setItemRating(user, type, id, r),
        getItemRating: (user: string, type: any, id: string) => socialRepository.getItemRating(user, type, id),
        getItemRatings: (user: string, type: any) => socialRepository.getItemRatings(user, type),
        // Play Queue (Subsonic)
        savePlayQueue: (username: string, trackIds: string[], current: string | null, positionMs: number) => {
            const val = JSON.stringify({ trackIds, current, positionMs });
            db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(`play_queue_${username}`, val);
        },
        getPlayQueue: (username: string) => {
            const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(`play_queue_${username}`) as any;
            if (r && r.value) {
                try { return JSON.parse(r.value); } catch(e) {}
            }
            return { trackIds: [], current: null, positionMs: 0 };
        },
        // Bookmarks
        createBookmark(user: string, id: string, pos: number, comm?: string): void { db.prepare("INSERT INTO bookmarks (username, track_id, position_ms, comment, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)").run(user, id, pos, comm || null); },
        getBookmarks(user: string): any[] { return db.prepare("SELECT * FROM bookmarks WHERE username = ? ORDER BY updated_at DESC").all(user); },
        deleteBookmark(user: string, id: string): void { db.prepare("DELETE FROM bookmarks WHERE username = ? AND track_id = ?").run(user, id); },
        getBookmark(user: string, id: string): any { return db.prepare("SELECT * FROM bookmarks WHERE username = ? AND track_id = ?").get(user, id); },
        // Ownership
        addTrackOwner(tid: number, oid: number): void { db.prepare("INSERT OR IGNORE INTO track_ownership (track_id, owner_id) VALUES (?, ?)").run(tid, oid); },
        removeTrackOwner(tid: number, oid: number): void { db.prepare("DELETE FROM track_ownership WHERE track_id = ? AND owner_id = ?").run(tid, oid); },
        addAlbumOwner(aid: number, oid: number): void { db.prepare("INSERT OR IGNORE INTO album_ownership (album_id, owner_id) VALUES (?, ?)").run(aid, oid); },
        removeAlbumOwner(aid: number, oid: number): void { db.prepare("DELETE FROM album_ownership WHERE album_id = ? AND owner_id = ?").run(aid, oid); },
        getTrackByHash(h: string): any { return db.prepare("SELECT * FROM tracks WHERE hash = ?").get(h); },
        getTrackOwners(id: number): number[] { return db.prepare("SELECT owner_id FROM track_ownership WHERE track_id = ?").all(id).map((r: any) => r.owner_id); },
        getAlbumOwners(id: number): number[] { return db.prepare("SELECT owner_id FROM album_ownership WHERE album_id = ?").all(id).map((r: any) => r.owner_id); },
        // Torrents
        getTorrents(): Torrent[] { return db.prepare("SELECT * FROM torrents ORDER BY added_at DESC").all() as Torrent[]; },
        getTorrent(h: string): Torrent | undefined { return db.prepare("SELECT * FROM torrents WHERE info_hash = ?").get(h) as Torrent | undefined; },
        createTorrent(t: any): void { 
            db.prepare("INSERT OR REPLACE INTO torrents (info_hash, name, magnet_uri, owner_id, status, progress, download_speed, upload_speed, num_peers, size, path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
              .run(t.info_hash, t.name, t.magnet_uri, t.owner_id || null, t.status || 'metadata', t.progress || 0, t.download_speed || 0, t.upload_speed || 0, t.num_peers || 0, t.size || 0, t.path || null); 
        },
        updateTorrentProgress(infoHash: string, progress: number, status: Torrent['status'], downloadSpeed: number, uploadSpeed: number, numPeers: number, size: number, path: string | null): void {
            db.prepare("UPDATE torrents SET progress = ?, status = ?, download_speed = ?, upload_speed = ?, num_peers = ?, size = ?, path = ? WHERE info_hash = ?")
              .run(progress, status, downloadSpeed, uploadSpeed, numPeers, size, path, infoHash);
        },
        deleteTorrent(h: string): void { db.prepare("DELETE FROM torrents WHERE info_hash = ?").run(h); },
        transaction<T>(fn: () => T): () => T {
            return db.transaction(fn);
        },
        // Gun Cache

        getGunCache(k: string): any {
            const r = db.prepare("SELECT * FROM gun_cache WHERE key = ?").get(k) as any;
            if (!r) return undefined;
            if (r.expires_at < Date.now()) { db.prepare("DELETE FROM gun_cache WHERE key = ?").run(k); return undefined; }
            return r;
        },
        setGunCache(k: string, v: string, t: string, ttl: number): void { db.prepare("INSERT INTO gun_cache (key, value, type, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, type=excluded.type, expires_at=excluded.expires_at").run(k, v, t, Date.now() + ttl*1000); },
        clearExpiredGunCache(): void { db.prepare("DELETE FROM gun_cache WHERE expires_at < ?").run(Date.now()); },
        // Soulseek
        updateUserSoulseekCredentials(uid: number, u: string, p: string): void { db.prepare("UPDATE admin SET slsk_username = ?, slsk_password = ? WHERE id = ?").run(u, p, uid); },
        getUserSoulseekCredentials(uid: number): any { return db.prepare("SELECT slsk_username as username, slsk_password as password_encrypted FROM admin WHERE id = ?").get(uid); },
        createSoulseekDownload(d: any): number { return Number(db.prepare("INSERT INTO soulseek_downloads (user_id, file_path, filename, status) VALUES (?, ?, ?, ?)").run(d.user_id, d.file_path, d.filename, d.status).lastInsertRowid); },
        updateSoulseekDownloadProgress(id: number, p: number, s?: string, fp?: string): void {
            if (s && fp) db.prepare("UPDATE soulseek_downloads SET progress = ?, status = ?, file_path = ? WHERE id = ?").run(p, s, fp, id);
            else if (s) db.prepare("UPDATE soulseek_downloads SET progress = ?, status = ? WHERE id = ?").run(p, s, id);
            else if (fp) db.prepare("UPDATE soulseek_downloads SET progress = ?, file_path = ? WHERE id = ?").run(p, fp, id);
            else db.prepare("UPDATE soulseek_downloads SET progress = ? WHERE id = ?").run(p, id);
        },
        getSoulseekDownloads(uid?: number): any[] { return uid ? db.prepare("SELECT * FROM soulseek_downloads WHERE user_id = ? ORDER BY added_at DESC").all(uid) : db.prepare("SELECT * FROM soulseek_downloads ORDER BY added_at DESC").all(); },
        getSoulseekDownload(id: number): any { return db.prepare("SELECT * FROM soulseek_downloads WHERE id = ?").get(id); },
        deleteSoulseekDownload(id: number): void { db.prepare("DELETE FROM soulseek_downloads WHERE id = ?").run(id); },
        clearFailedSoulseekDownloads(uid: number): void { db.prepare("DELETE FROM soulseek_downloads WHERE user_id = ? AND status = 'failed'").run(uid); },
        consolidateDatabase(): void {
            console.log("🧹 [Database] Consolidating database: cleaning up dead records...");
            db.transaction(() => {
                const deletedAlbums = db.prepare("DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM tracks WHERE album_id IS NOT NULL)").run();
                const deletedReleases = db.prepare("DELETE FROM releases WHERE id NOT IN (SELECT DISTINCT release_id FROM release_tracks WHERE release_id IS NOT NULL)").run();
                const deletedArtists = db.prepare(`
                    DELETE FROM artists 
                    WHERE id NOT IN (SELECT DISTINCT artist_id FROM albums WHERE artist_id IS NOT NULL)
                      AND id NOT IN (SELECT DISTINCT artist_id FROM releases WHERE artist_id IS NOT NULL)
                      AND id NOT IN (SELECT DISTINCT artist_id FROM tracks WHERE artist_id IS NOT NULL)
                `).run();
                
                if (deletedAlbums.changes > 0 || deletedReleases.changes > 0 || deletedArtists.changes > 0) {
                    console.log(`🧹 [Database] Consolidated: deleted ${deletedAlbums.changes} empty albums, ${deletedReleases.changes} releases, and ${deletedArtists.changes} artists.`);
                }
            })();
        },
        // Plugins
        getPluginState(id: string): { enabled: boolean; config: string | null } | undefined {
            const row = db.prepare("SELECT enabled, config FROM system_plugins WHERE id = ?").get(id) as any;
            return row ? { enabled: !!row.enabled, config: row.config } : undefined;
        },
        setPluginEnabled(id: string, enabled: boolean): void {
            db.prepare("INSERT INTO system_plugins (id, enabled) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP").run(id, enabled ? 1 : 0);
        },
        setPluginConfig(id: string, config: string): void {
            db.prepare("INSERT INTO system_plugins (id, config) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET config = excluded.config, updated_at = CURRENT_TIMESTAMP").run(id, config);
        },
        getAllPluginsState(): any[] {
            return db.prepare("SELECT * FROM system_plugins").all();
        }
    };

    // Run consolidation on startup
    service.consolidateDatabase();

    return service;
}
