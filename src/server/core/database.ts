import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { TrackRepository } from "../repositories/track.repository.js";
import { AlbumRepository } from "../repositories/album.repository.js";
import { ArtistRepository } from "../repositories/artist.repository.js";
import { VisibilityProfile, ViewerContext, UserRole, getContextFromProfile, VisibilityGuardian } from "../common/visibility.js";
import { ReleaseTrackRepository } from "../repositories/release-track.repository.js";
import { SocialRepository } from "../repositories/social.repository.js";
import { RemoteActorRepository } from "../repositories/remote-actor.repository.js";
import { RemoteContentRepository } from "../repositories/remote-content.repository.js";
import { createIdentityManager } from "./managers/identity.js";
import { createLibraryManager } from "./managers/library.js";
import { createSocialManager } from "./managers/social.js";
import { createIntegrationManager } from "./managers/integration.js";

// Re-export all types so consumers can continue to import from here
export type {
    Album, Artist, Track, Release, Post,
    DatabaseService,
    TrackDTO, AlbumDTO
} from "./database.types.js";

import type {
    Album, Artist, Track, Release, Post, Playlist,
    DatabaseService,
    IdentityManager, LibraryManager, SocialManager, IntegrationManager
} from "./database.types.js";

export function createDatabase(dbPath: string): DatabaseService {
    const db = new Database(dbPath);
    
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");

    // Rescue Phase: Recover from interrupted migrations
    const tablesToRescue = ['albums', 'tracks', 'admin', 'artists'];
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
    })();

    // Initial Schema (Base Tables)
    db.exec(`
        CREATE TABLE IF NOT EXISTS artists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            slug TEXT NOT NULL UNIQUE,
            bio TEXT,
            photo_path TEXT,
            links TEXT,
            public_key TEXT,
            private_key TEXT,
            wallet_address TEXT,
            visibility TEXT DEFAULT 'public',
            post_params TEXT,
            external_id TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

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
            gun_pub TEXT,
            gun_priv TEXT,
            gun_auth_mode TEXT NOT NULL DEFAULT 'local',
            is_active INTEGER DEFAULT 1,
            token_version INTEGER DEFAULT 0,
            subscription_status TEXT DEFAULT 'none',
            subscription_expires_at TEXT DEFAULT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            slsk_username TEXT,
            slsk_password TEXT,
            telegram_bot_token TEXT,
            telegram_allowed_channels TEXT
        );

        CREATE TABLE IF NOT EXISTS albums (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            artist_id INTEGER REFERENCES artists(id),
            owner_id REFERENCES admin(id),
            date TEXT,
            cover_path TEXT,
            genre TEXT,
            description TEXT,
            type TEXT DEFAULT 'album',
            year INTEGER,
            download TEXT,
            price REAL DEFAULT 0,
            price_usdc REAL DEFAULT 0,
            price_usdt REAL DEFAULT 0,
            currency TEXT DEFAULT 'ETH',
            external_links TEXT,
            external_id TEXT,
            is_public INTEGER DEFAULT 0,
            visibility TEXT DEFAULT 'private',
            is_release INTEGER DEFAULT 0,
            published_at TEXT,
            published_to_gundb INTEGER DEFAULT 0,
            published_to_ap INTEGER DEFAULT 0,
            license TEXT,
            status TEXT DEFAULT 'draft',
            album_artist TEXT,
            use_nft INTEGER DEFAULT 1,
            product_type TEXT DEFAULT 'music',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            album_id INTEGER REFERENCES albums(id),
            artist_id INTEGER REFERENCES artists(id),
            owner_id REFERENCES admin(id),
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
            fingerprint TEXT,
            genre TEXT,
            year INTEGER,
            mime_type TEXT DEFAULT 'audio/mpeg',
            file_size INTEGER DEFAULT 0,
            file_hash TEXT DEFAULT NULL,
            version TEXT DEFAULT NULL,
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

        CREATE TABLE IF NOT EXISTS starred_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(username, item_type, item_id)
        );

        CREATE TABLE IF NOT EXISTS item_ratings (
            username TEXT NOT NULL,
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            rating INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (username, item_type, item_id)
        );

        CREATE TABLE IF NOT EXISTS play_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
            played_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
            title TEXT,
            summary TEXT,
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

        CREATE TABLE IF NOT EXISTS followers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
            actor_uri TEXT NOT NULL,
            inbox_uri TEXT NOT NULL,
            shared_inbox_uri TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'pending',
            UNIQUE(artist_id, actor_uri)
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

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
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

        CREATE TABLE IF NOT EXISTS gun_users (
            pub TEXT PRIMARY KEY,
            epub TEXT,
            alias TEXT,
            avatar TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS gun_cache (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            type TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS unlock_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            release_id INTEGER REFERENCES albums(id),
            track_id INTEGER REFERENCES tracks(id),
            asset_id INTEGER REFERENCES assets(id),
            tx_hash TEXT,
            is_used INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            redeemed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT,
            artist_id INTEGER REFERENCES artists(id),
            owner_id INTEGER REFERENCES admin(id),
            type TEXT NOT NULL DEFAULT 'digital',
            file_path TEXT,
            mime_type TEXT,
            file_size INTEGER,
            cover_path TEXT,
            price REAL DEFAULT 0,
            price_usdc REAL DEFAULT 0,
            currency TEXT DEFAULT 'ETH',
            visibility TEXT DEFAULT 'public',
            requires_subscription INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
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

        CREATE TABLE IF NOT EXISTS system_plugins (
            id TEXT PRIMARY KEY,
            enabled INTEGER DEFAULT 0,
            config TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
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

        CREATE TABLE IF NOT EXISTS fedify_kv (
            key TEXT PRIMARY KEY,
            value TEXT,
            expires_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            username TEXT NOT NULL,
            text TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Runtime Migrations (robust column checks)
    db.transaction(() => {
        // --- Consolidation Migration ---
        const releasesTableInfo = db.prepare("SELECT type FROM sqlite_master WHERE type='table' AND name='releases'").get() as { type: string } | undefined;
        if (releasesTableInfo) {
            console.log("📦 [Database Consolidation] Physical releases table detected. Migrating data to albums...");
            
            // 1. Move unique releases to albums
            db.exec(`
                INSERT OR IGNORE INTO albums (
                    id, title, slug, artist_id, owner_id, date, cover_path, genre, description, type, year, download, 
                    price, price_usdc, price_usdt, currency, external_links, external_id, visibility, published_at, 
                    published_to_gundb, published_to_ap, license, status, album_artist, use_nft, created_at
                )
                SELECT 
                    id, title, slug, artist_id, owner_id, date, cover_path, genre, description, type, year, download, 
                    price, price_usdc, price_usdt, currency, external_links, external_id, visibility, published_at, 
                    published_to_gundb, published_to_ap, license, 'released', album_artist, use_nft, created_at
                FROM releases;
            `);

            // 2. Move unique release tracks to tracks, ensuring album_id is mapped correctly
            const releaseTracksTableInfo = db.prepare("SELECT type FROM sqlite_master WHERE type='table' AND name='release_tracks'").get() as { type: string } | undefined;
            if (releaseTracksTableInfo) {
                console.log("📦 [Database Consolidation] Physical release_tracks table detected. Syncing to tracks...");
                // Link existing tracks to their album if they aren't linked yet
                db.exec(`
                    UPDATE tracks 
                    SET album_id = (SELECT release_id FROM release_tracks WHERE release_tracks.track_id = tracks.id LIMIT 1)
                    WHERE album_id IS NULL AND EXISTS (SELECT 1 FROM release_tracks WHERE release_tracks.track_id = tracks.id);
                `);
                
                // If any release_tracks didn't have a track_id (ghost tracks), we can insert them into tracks
                db.exec(`
                    INSERT OR IGNORE INTO tracks (
                        title, album_id, artist_name, track_num, duration, file_path, price, price_usdc, price_usdt, currency, created_at
                    )
                    SELECT 
                        title, release_id, artist_name, track_num, duration, file_path, price, price_usdc, price_usdt, currency, created_at
                    FROM release_tracks
                    WHERE track_id IS NULL;
                `);

                db.exec("DROP TABLE release_tracks");
            }
            
            db.exec("DROP TABLE releases");
            console.log("📦 [Database Consolidation] Physical tables dropped. Ready to create views.");
        }

        const artistsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='artists'").get();
        if (artistsExists) {
            const cols = db.prepare("PRAGMA table_info(artists)").all() as any[];
            if (!cols.some(col => col.name === 'external_id')) {
                console.log("📦 [Database] Migrating artists table: adding external_id column...");
                db.exec("ALTER TABLE artists ADD COLUMN external_id TEXT");
            }
            if (!cols.some(col => col.name === 'visibility')) {
                console.log("📦 [Database] Migrating artists table: adding visibility column...");
                db.exec("ALTER TABLE artists ADD COLUMN visibility TEXT DEFAULT 'public'");
            }
            if (!cols.some(col => col.name === 'post_params')) {
                console.log("📦 [Database] Migrating artists table: adding post_params column...");
                db.exec("ALTER TABLE artists ADD COLUMN post_params TEXT");
            }
            if (!cols.some(col => col.name === 'wallet_address')) {
                console.log("📦 [Database] Migrating artists table: adding wallet_address column...");
                db.exec("ALTER TABLE artists ADD COLUMN wallet_address TEXT");
            }
            
            // Migrate unlock_codes: add asset_id column if missing
            const ucCols = db.prepare("PRAGMA table_info(unlock_codes)").all() as any[];
            if (!ucCols.some(col => col.name === 'asset_id')) {
                db.exec("ALTER TABLE unlock_codes ADD COLUMN asset_id INTEGER REFERENCES assets(id)");
            }

            // Site Actor Initialization (id = -1, slug = 'site')
            const hasSiteActor = db.prepare("SELECT 1 FROM artists WHERE id = -1").get();
            if (!hasSiteActor) {
                console.log("📡 [Database] Creating virtual artist record for Site Actor (@site)...");
                const pubKey = db.prepare("SELECT value FROM settings WHERE key = 'site_public_key'").get() as { value: string } | undefined;
                const privKey = db.prepare("SELECT value FROM settings WHERE key = 'site_private_key'").get() as { value: string } | undefined;
                db.prepare("INSERT INTO artists (id, name, slug, visibility, public_key, private_key) VALUES (-1, 'Instance Actor', 'site', 'public', ?, ?)")
                  .run(pubKey ? pubKey.value : null, privKey ? privKey.value : null);
            }
        }

        const albumsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='albums'").get();
        if (albumsExists) {
            const cols = db.prepare("PRAGMA table_info(albums)").all() as any[];
            if (!cols.some(col => col.name === 'status')) {
                console.log("📦 [Database] Migrating albums table: adding status column...");
                db.exec("ALTER TABLE albums ADD COLUMN status TEXT DEFAULT 'draft'");
            }
            if (!cols.some(col => col.name === 'album_artist')) {
                console.log("📦 [Database] Migrating albums table: adding album_artist column...");
                db.exec("ALTER TABLE albums ADD COLUMN album_artist TEXT");
            }
            if (!cols.some(col => col.name === 'use_nft')) {
                console.log("📦 [Database] Migrating albums table: adding use_nft column...");
                db.exec("ALTER TABLE albums ADD COLUMN use_nft INTEGER DEFAULT 1");
            }
            if (!cols.some(col => col.name === 'product_type')) {
                console.log("📦 [Database] Migrating albums table: adding product_type column...");
                db.exec("ALTER TABLE albums ADD COLUMN product_type TEXT DEFAULT 'music'");
            }
        }

        const tracksExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tracks'").get();
        if (tracksExists) {
            const cols = db.prepare("PRAGMA table_info(tracks)").all() as any[];
            if (!cols.some(col => col.name === 'fingerprint')) {
                console.log("📦 [Database] Migrating tracks table: adding fingerprint column...");
                db.exec("ALTER TABLE tracks ADD COLUMN fingerprint TEXT");
            }
            if (!cols.some(col => col.name === 'mime_type')) {
                console.log("📦 [Database] Migrating tracks table: adding mime_type column...");
                db.exec("ALTER TABLE tracks ADD COLUMN mime_type TEXT DEFAULT 'audio/mpeg'");
            }
            if (!cols.some(col => col.name === 'file_size')) {
                console.log("📦 [Database] Migrating tracks table: adding file_size column...");
                db.exec("ALTER TABLE tracks ADD COLUMN file_size INTEGER DEFAULT 0");
            }
            if (!cols.some(col => col.name === 'file_hash')) {
                console.log("📦 [Database] Migrating tracks table: adding file_hash column...");
                db.exec("ALTER TABLE tracks ADD COLUMN file_hash TEXT");
            }
            if (!cols.some(col => col.name === 'version')) {
                console.log("📦 [Database] Migrating tracks table: adding version column...");
                db.exec("ALTER TABLE tracks ADD COLUMN version TEXT");
            }
        }

        const adminExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admin'").get();
        if (adminExists) {
            const cols = db.prepare("PRAGMA table_info(admin)").all() as any[];
            if (!cols.some(col => col.name === 'subscription_status')) {
                console.log("📦 [Database] Migrating admin table: adding subscription_status column...");
                db.exec("ALTER TABLE admin ADD COLUMN subscription_status TEXT DEFAULT 'none'");
            }
            if (!cols.some(col => col.name === 'subscription_expires_at')) {
                console.log("📦 [Database] Migrating admin table: adding subscription_expires_at column...");
                db.exec("ALTER TABLE admin ADD COLUMN subscription_expires_at TEXT DEFAULT NULL");
            }
            if (!cols.some(col => col.name === 'alias')) {
                db.exec("ALTER TABLE admin ADD COLUMN alias TEXT");
            }
            if (!cols.some(col => col.name === 'avatar')) {
                db.exec("ALTER TABLE admin ADD COLUMN avatar TEXT");
            }
        }

        const remoteActorsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='remote_actors'").get();
        if (remoteActorsExists) {
            const cols = db.prepare("PRAGMA table_info(remote_actors)").all() as any[];
            if (!cols.some(col => col.name === 'public_key')) {
                console.log("📦 [Database] Migrating remote_actors table: adding public_key column...");
                db.exec("ALTER TABLE remote_actors ADD COLUMN public_key TEXT");
            }
        }

        const followersExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='followers'").get();
        if (followersExists) {
            const cols = db.prepare("PRAGMA table_info(followers)").all() as any[];
            if (!cols.some(col => col.name === 'status')) {
                console.log("📦 [Database] Migrating followers table: adding status column...");
                db.exec("ALTER TABLE followers ADD COLUMN status TEXT DEFAULT 'pending'");
            }
            if (!cols.some(col => col.name === 'follow_id')) {
                console.log("📦 [Database] Migrating followers table: adding follow_id column...");
                db.exec("ALTER TABLE followers ADD COLUMN follow_id TEXT");
            }
        }

        const postsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='posts'").get();
        if (postsExists) {
            const cols = db.prepare("PRAGMA table_info(posts)").all() as any[];
            if (!cols.some(col => col.name === 'title')) {
                console.log("📦 [Database] Migrating posts table: adding title column...");
                db.exec("ALTER TABLE posts ADD COLUMN title TEXT");
            }
            if (!cols.some(col => col.name === 'summary')) {
                console.log("📦 [Database] Migrating posts table: adding summary column...");
                db.exec("ALTER TABLE posts ADD COLUMN summary TEXT");
            }
        }

        const apNotesExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ap_notes'").get();
        if (apNotesExists) {
            const cols = db.prepare("PRAGMA table_info(ap_notes)").all() as any[];
            if (!cols.some(col => col.name === 'likes_count')) {
                console.log("📦 [Database] Migrating ap_notes table: adding likes_count column...");
                db.exec("ALTER TABLE ap_notes ADD COLUMN likes_count INTEGER DEFAULT 0");
            }
            if (!cols.some(col => col.name === 'announces_count')) {
                console.log("📦 [Database] Migrating ap_notes table: adding announces_count column...");
                db.exec("ALTER TABLE ap_notes ADD COLUMN announces_count INTEGER DEFAULT 0");
            }
        }

        db.exec(`
            CREATE TABLE IF NOT EXISTS ap_interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id TEXT NOT NULL,
                actor_uri TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('like', 'announce')),
                activity_id TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(note_id, actor_uri, type)
            )
        `);
    })();

    // View Refresh Phase: Ensure views are always up-to-date with current logic
    db.transaction(() => {
        const views = ['v_artists', 'v_albums', 'v_releases', 'v_tracks', 'releases', 'release_tracks'];
        for (const view of views) {
            db.exec(`DROP VIEW IF EXISTS ${view}`);
        }
    })();

    // Views & Backward Compatibility Views
    db.exec(`
        CREATE VIEW v_artists AS
        SELECT * FROM artists;

        CREATE VIEW v_albums AS
        SELECT
            a.*,
            COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name,
            ar.slug as artist_slug,
            ar.wallet_address as artist_wallet_address
        FROM albums a
        LEFT JOIN artists ar ON a.artist_id = ar.id;

        CREATE VIEW releases AS
        SELECT * FROM albums WHERE status = 'released';

        CREATE VIEW release_tracks AS
        SELECT 
            t.id as id,
            t.album_id as release_id,
            t.id as track_id,
            t.title,
            t.artist_name,
            t.track_num,
            t.duration,
            t.file_path,
            t.price,
            t.price_usdc,
            t.price_usdt,
            t.currency,
            t.lyrics,
            t.waveform,
            t.lossless_path,
            t.created_at
        FROM tracks t
        JOIN albums a ON t.album_id = a.id
        WHERE a.is_release = 1;

        CREATE VIEW v_releases AS
        SELECT
            a.*,
            COALESCE(a.album_artist, ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL LIMIT 1), 'Unknown Artist') as artist_name,
            ar.slug as artist_slug,
            ar.wallet_address as artist_wallet_address
        FROM albums a
        LEFT JOIN artists ar ON a.artist_id = ar.id
        WHERE a.status = 'released';

        CREATE VIEW v_tracks AS
        SELECT
            t.*,
            a.title as album_title,
            a.album_artist as album_artist_tag,
            a.visibility as album_visibility,
            a.status as album_status,
            COALESCE(t.artist_name, ar_t.name, a.album_artist, ar_a.name, 'Unknown Artist') as artist_name,
            COALESCE(ar_t.slug, ar_a.slug) as artist_slug,
            COALESCE(ar_t.wallet_address, ar_a.wallet_address) as artist_wallet_address,
            COALESCE(t.owner_id, a.owner_id) as effective_owner_id
        FROM tracks t
        LEFT JOIN albums a ON t.album_id = a.id
        LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
        LEFT JOIN artists ar_a ON a.artist_id = ar_a.id;
    `);

    // Triggers
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS tr_albums_status_sync
        AFTER UPDATE OF visibility ON albums
        FOR EACH ROW
        WHEN NEW.visibility IN ('public', 'unlisted') AND OLD.status = 'draft'
        BEGIN
            UPDATE albums SET status = 'released', published_at = COALESCE(published_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
        END;

        CREATE TRIGGER IF NOT EXISTS tr_albums_status_init
        AFTER INSERT ON albums
        FOR EACH ROW
        WHEN NEW.visibility IN ('public', 'unlisted')
        BEGIN
            UPDATE albums SET status = 'released', published_at = COALESCE(published_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
        END;
    `);

    // Indices
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_albums_date ON albums(date DESC);
        CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);
        CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist_id);
        CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
        CREATE INDEX IF NOT EXISTS idx_albums_public ON albums(is_public);
        CREATE INDEX IF NOT EXISTS idx_albums_release ON albums(is_release);
        CREATE INDEX IF NOT EXISTS idx_albums_status ON albums(status);
        CREATE INDEX IF NOT EXISTS idx_track_ownership_owner ON track_ownership(owner_id);
        CREATE INDEX IF NOT EXISTS idx_album_ownership_owner ON album_ownership(owner_id);
        CREATE INDEX IF NOT EXISTS idx_tracks_title_lower ON tracks(lower(title));
        CREATE INDEX IF NOT EXISTS idx_albums_visibility ON albums(visibility);
        -- Legacy indexes on releases removed (releases is now a view)
    `);

    // Register Levenshtein
    db.function("levenshtein", (a: string, b: string) => {
        if (!a) return b ? b.length : 0;
        if (!b) return a ? a.length : 0;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
                else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
        return matrix[b.length][a.length];
    });

    const trackRepository = new TrackRepository(db);
    const albumRepository = new AlbumRepository(db);
    const artistRepository = new ArtistRepository(db);
    const releaseTrackRepository = new ReleaseTrackRepository(db);
    const socialRepository = new SocialRepository(db);
    const remoteActorRepository = new RemoteActorRepository(db);
    const remoteContentRepository = new RemoteContentRepository(db);

    const identity = createIdentityManager(db);
    const library = createLibraryManager(
        db,
        artistRepository,
        albumRepository,
        trackRepository,
        releaseTrackRepository,
        remoteContentRepository
    );
    const social = createSocialManager(
        db,
        socialRepository,
        remoteActorRepository,
        remoteContentRepository
    );
    const integration = createIntegrationManager(db);

    const service: DatabaseService = {
        db,
        identity,
        library,
        social,
        integration,
        transaction<T>(fn: () => T): T {
            return db.transaction(fn)();
        },
        ...identity,
        ...library,
        ...social,
        ...integration,
    };

    return service;
}
