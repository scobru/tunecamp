import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import path from "path";
import { TrackRepository } from "../repositories/track.repository.js";
import { AlbumRepository } from "../repositories/album.repository.js";
import { ArtistRepository } from "../repositories/artist.repository.js";
import { VisibilityProfile, ViewerContext, UserRole, getContextFromProfile, VisibilityGuardian } from "../common/visibility.js";
import { ReleaseTrackRepository } from "../repositories/release-track.repository.js";
import { SocialRepository } from "../repositories/social.repository.js";
import { RemoteActorRepository } from "../repositories/remote-actor.repository.js";
import { RemoteContentRepository } from "../repositories/remote-content.repository.js";
import { ReportsRepository } from "../repositories/reports.repository.js";
import { createIdentityManager } from "./managers/identity.js";
import { createLibraryManager } from "./managers/library.js";
import { createSocialManager } from "./managers/social.js";
import { createIntegrationManager } from "./managers/integration.js";
import { createPeerManager } from "./managers/peer.js";

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
    // WAL + NORMAL is the SQLite-recommended pairing: commits append to the WAL
    // without an fsync each (the checkpoint still syncs), which makes bulk scans
    // with thousands of small writes behave like batched transactions. Safe in
    // WAL mode: a power cut can lose the last commits but cannot corrupt the DB.
    db.pragma("synchronous = NORMAL");

    // Rescue Phase: Recover from interrupted migrations
    const tablesToRescue = ['albums', 'tracks', 'admin', 'artists'];
    db.transaction(() => {
        const tableNames = new Set(
            db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row: any) => row.name)
        );

        for (const table of tablesToRescue) {
            if (!/^[a-z0-9_]+$/i.test(table)) {
                throw new Error(`Invalid table name for rescue: ${table}`);
            }
            const mainExists = tableNames.has(table);
            const oldExists = tableNames.has(`${table}_old`);
            const newExists = tableNames.has(`${table}_new`);

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
            stripe_account_id TEXT,
            visibility TEXT DEFAULT 'public',
            post_params TEXT,
            external_id TEXT,
            also_known_as TEXT,
            moved_to TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS admin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            artist_id INTEGER DEFAULT NULL,
            artist_unlinked INTEGER DEFAULT 0,
            role TEXT NOT NULL DEFAULT 'admin',
            storage_quota INTEGER NOT NULL DEFAULT 0,
            storage_used INTEGER NOT NULL DEFAULT 0,
            track_quota INTEGER DEFAULT NULL,
            track_quota_floor INTEGER NOT NULL DEFAULT 0,
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
            telegram_allowed_channels TEXT,
            security_q1 TEXT,
            security_a1_hash TEXT,
            security_q2 TEXT,
            security_a2_hash TEXT
        );

        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used_at TEXT DEFAULT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
            curation_notes TEXT,
            additional_artworks TEXT,
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

        CREATE TABLE IF NOT EXISTS artist_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            event_date TEXT NOT NULL,
            venue TEXT,
            city TEXT,
            country TEXT,
            ticket_url TEXT,
            description TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_artist_events_artist ON artist_events(artist_id, event_date);

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

        CREATE TABLE IF NOT EXISTS following (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
            actor_uri TEXT NOT NULL,
            inbox_uri TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
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

        CREATE TABLE IF NOT EXISTS api_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
            token TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            expires_at TEXT DEFAULT NULL
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
            artist TEXT,
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

        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reporter_id INTEGER REFERENCES admin(id) ON DELETE SET NULL,
            reporter_name TEXT,
            reporter_email TEXT,
            release_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
            reason TEXT NOT NULL,
            details TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS board_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            message TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'webapp',
            telegram_message_id INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Digging ("Dig") feature: external crate-digging sessions inspired by Badger.
        CREATE TABLE IF NOT EXISTS dig_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS dig_crate_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES dig_sessions(id) ON DELETE CASCADE,
            source TEXT NOT NULL DEFAULT 'bandcamp',
            source_url TEXT NOT NULL,
            title TEXT,
            artist TEXT,
            cover_url TEXT,
            preview_url TEXT,
            bpm REAL,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS dig_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
            query TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'bandcamp',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Cache of scraped fan collections (TTL via expires_at, unix seconds) to avoid re-scraping.
        CREATE TABLE IF NOT EXISTS dig_cache (
            cache_key TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        );

        -- Active peer sessions (transient)
        CREATE TABLE IF NOT EXISTS peer_sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
            connected_at INTEGER NOT NULL,
            last_seen INTEGER NOT NULL,
            ip_address TEXT,
            allow_downloads INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS peer_tracks (
            id TEXT NOT NULL,
            session_id TEXT NOT NULL REFERENCES peer_sessions(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            artist TEXT,
            album TEXT,
            duration REAL,
            file_size INTEGER,
            mime_type TEXT,
            allow_download INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            magnet_uri TEXT,
            PRIMARY KEY (id, session_id)
        );

        CREATE INDEX IF NOT EXISTS idx_dig_sessions_user ON dig_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_dig_crate_session ON dig_crate_items(session_id);
        CREATE INDEX IF NOT EXISTS idx_dig_history_user ON dig_history(user_id);
        CREATE INDEX IF NOT EXISTS idx_dig_cache_expires ON dig_cache(expires_at);
        CREATE INDEX IF NOT EXISTS idx_peer_tracks_session ON peer_tracks(session_id);
        CREATE INDEX IF NOT EXISTS idx_peer_tracks_search ON peer_tracks(title, artist);

        -- Lab apps: community audio tools embedded via iFrame
        CREATE TABLE IF NOT EXISTS lab_apps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            src TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'other',
            author TEXT,
            source_url TEXT,
            permissions TEXT NOT NULL DEFAULT '[]',
            sandbox TEXT NOT NULL DEFAULT '["allow-scripts"]',
            allow TEXT NOT NULL DEFAULT '[]',
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        -- Seed the built-in 4-Track Recorder if not already present
        INSERT OR IGNORE INTO lab_apps (id, name, description, src, category, author, source_url, permissions, sandbox, allow, enabled)
        VALUES (
            1,
            '4-Track Recorder',
            'Browser-based 4-track audio recorder with overdub support, latency compensation, and sample-accurate multi-track playback. Runs entirely in your browser — no server needed.',
            'https://tunecamp-4-track-recorder.vercel.app',
            'recording',
            'andreboekhorst',
            'https://github.com/andreboekhorst/4-track-recorder',
            '["microphone"]',
            '["allow-scripts","allow-same-origin","allow-downloads","allow-forms"]',
            '["microphone"]',
            1
        );

        -- Seed the built-in Audiofabric visualiser if not already present
        INSERT OR IGNORE INTO lab_apps (id, name, description, src, category, author, source_url, permissions, sandbox, allow, enabled)
        VALUES (
            2,
            'Audiofabric',
            'Real-time 3D WebGL music visualiser powered by the Web Audio API. Renders a spring-physics frequency fabric that pulses with the music. Plays built-in demo tracks or streams directly from your TuneCamp library via the Subsonic API.',
            'https://tunecamp-audiofabric.vercel.app',
            'effects',
            'scobru',
            'https://github.com/scobru/tunecamp-audiofabric',
            '["autoplay"]',
            '["allow-scripts","allow-same-origin"]',
            '["autoplay"]',
            1
        );
        -- Migrate existing rows to the deployed Vercel URLs
        UPDATE lab_apps SET src = 'https://tunecamp-4-track-recorder.vercel.app' WHERE id = 1 AND src != 'https://tunecamp-4-track-recorder.vercel.app';
        UPDATE lab_apps SET src = 'https://tunecamp-audiofabric.vercel.app' WHERE id = 2 AND src != 'https://tunecamp-audiofabric.vercel.app';
    `);

    // Runtime Migrations (robust column checks)
    db.transaction(() => {
        // --- Admin Security Questions Migration ---
        const adminCols = db.prepare("PRAGMA table_info(admin)").all() as any[];
        if (!adminCols.some(col => col.name === 'security_q1')) {
            console.log("📦 [Database] Migrating admin table: adding security questions columns...");
            db.exec("ALTER TABLE admin ADD COLUMN security_q1 TEXT");
            db.exec("ALTER TABLE admin ADD COLUMN security_a1_hash TEXT");
            db.exec("ALTER TABLE admin ADD COLUMN security_q2 TEXT");
            db.exec("ALTER TABLE admin ADD COLUMN security_a2_hash TEXT");
        }

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
            if (!cols.some(col => col.name === 'stripe_account_id')) {
                console.log("📦 [Database] Migrating artists table: adding stripe_account_id column...");
                // Stripe Connect (Express) account id for fiat direct charges. NULL
                // means the artist has no connected account, so checkout falls back
                // to the instance's own Stripe account (single-artist / self-host).
                db.exec("ALTER TABLE artists ADD COLUMN stripe_account_id TEXT");
            }
            if (!cols.some(col => col.name === 'also_known_as')) {
                console.log("📦 [Database] Migrating artists table: adding also_known_as column...");
                db.exec("ALTER TABLE artists ADD COLUMN also_known_as TEXT");
            }
            if (!cols.some(col => col.name === 'moved_to')) {
                console.log("📦 [Database] Migrating artists table: adding moved_to column...");
                db.exec("ALTER TABLE artists ADD COLUMN moved_to TEXT");
            }
            if (!cols.some(col => col.name === 'can_sell')) {
                console.log("📦 [Database] Migrating artists table: adding can_sell column...");
                // Existing artists keep selling (default 1); community-mode
                // auto-promoted artists are created with can_sell = 0.
                db.exec("ALTER TABLE artists ADD COLUMN can_sell INTEGER DEFAULT 1");
            }
            if (!cols.some(col => col.name === 'banner_path')) {
                console.log("📦 [Database] Migrating artists table: adding banner_path column...");
                db.exec("ALTER TABLE artists ADD COLUMN banner_path TEXT");
            }
            if (!cols.some(col => col.name === 'manually_approves_followers')) {
                console.log("📦 [Database] Migrating artists table: adding manually_approves_followers column...");
                db.exec("ALTER TABLE artists ADD COLUMN manually_approves_followers INTEGER DEFAULT 0");
            }
            
            // Migrate unlock_codes: add asset_id column if missing
            const ucCols = db.prepare("PRAGMA table_info(unlock_codes)").all() as any[];
            if (!ucCols.some(col => col.name === 'asset_id')) {
                db.exec("ALTER TABLE unlock_codes ADD COLUMN asset_id INTEGER REFERENCES assets(id)");
            }
            if (!ucCols.some(col => col.name === 'user_id')) {
                db.exec("ALTER TABLE unlock_codes ADD COLUMN user_id INTEGER REFERENCES admin(id)");
            }

            // Site Actor Initialization (id = -1). The public handle defaults to
            // 'site' but follows the configured `siteHandle` setting when present
            // (kept in sync with the instance name on settings save).
            const hasSiteActor = db.prepare("SELECT 1 FROM artists WHERE id = -1").get();
            const siteHandleRow = db.prepare("SELECT value FROM settings WHERE key = 'siteHandle'").get() as { value: string } | undefined;
            const siteNameRow = db.prepare("SELECT value FROM settings WHERE key = 'siteName'").get() as { value: string } | undefined;
            const siteSlug = siteHandleRow?.value || 'site';
            const siteActorName = siteNameRow?.value || 'Site';
            // The site actor's slug (id -1) is reserved. If a library artist already
            // holds it, free it up so the reserved-slug insert/update doesn't crash
            // with SQLITE_CONSTRAINT_UNIQUE on every restart.
            const collidingArtist = db.prepare("SELECT id FROM artists WHERE slug = ? AND id != -1").get(siteSlug) as { id: number } | undefined;
            if (collidingArtist) {
                let fallbackSlug = `${siteSlug}-artist`;
                let n = 2;
                while (db.prepare("SELECT 1 FROM artists WHERE slug = ?").get(fallbackSlug)) {
                    fallbackSlug = `${siteSlug}-artist-${n++}`;
                }
                db.prepare("UPDATE artists SET slug = ? WHERE id = ?").run(fallbackSlug, collidingArtist.id);
            }
            if (!hasSiteActor) {
                console.log(`📡 [Database] Creating virtual artist record for Site Actor (@${siteSlug})...`);
                const pubKey = db.prepare("SELECT value FROM settings WHERE key = 'site_public_key'").get() as { value: string } | undefined;
                const privKey = db.prepare("SELECT value FROM settings WHERE key = 'site_private_key'").get() as { value: string } | undefined;
                db.prepare("INSERT INTO artists (id, name, slug, visibility, public_key, private_key) VALUES (-1, ?, ?, 'public', ?, ?)")
                  .run(siteActorName, siteSlug, pubKey ? pubKey.value : null, privKey ? privKey.value : null);
            } else {
                db.prepare("UPDATE artists SET name = 'Site' WHERE id = -1 AND name = 'Instance Actor'").run();
                // Reconcile the stored slug with the configured handle if they drifted.
                db.prepare("UPDATE artists SET slug = ? WHERE id = -1 AND slug != ?").run(siteSlug, siteSlug);
            }
            // Give the site actor the site logo as its default photo so Fediverse
            // clients (and the Social page) show the instance branding image.
            // Only sets the default — a custom upload via the artist avatar form takes precedence.
            db.prepare("UPDATE artists SET photo_path = '/api/settings/logo' WHERE id = -1 AND (photo_path IS NULL OR photo_path = '')").run();
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
            if (!cols.some(col => col.name === 'podcast_author')) {
                console.log("📦 [Database] Migrating albums table: adding podcast_author column...");
                db.exec("ALTER TABLE albums ADD COLUMN podcast_author TEXT");
            }
            if (!cols.some(col => col.name === 'podcast_email')) {
                console.log("📦 [Database] Migrating albums table: adding podcast_email column...");
                db.exec("ALTER TABLE albums ADD COLUMN podcast_email TEXT");
            }
            if (!cols.some(col => col.name === 'podcast_category')) {
                console.log("📦 [Database] Migrating albums table: adding podcast_category column...");
                db.exec("ALTER TABLE albums ADD COLUMN podcast_category TEXT");
            }
            if (!cols.some(col => col.name === 'podcast_explicit')) {
                console.log("📦 [Database] Migrating albums table: adding podcast_explicit column...");
                db.exec("ALTER TABLE albums ADD COLUMN podcast_explicit INTEGER DEFAULT 0");
            }
            if (!cols.some(col => col.name === 'curation_notes')) {
                console.log("📦 [Database] Migrating albums table: adding curation_notes column...");
                db.exec("ALTER TABLE albums ADD COLUMN curation_notes TEXT");
            }
            if (!cols.some(col => col.name === 'additional_artworks')) {
                console.log("📦 [Database] Migrating albums table: adding additional_artworks column...");
                db.exec("ALTER TABLE albums ADD COLUMN additional_artworks TEXT");
            }

            // Data migration: unify the release category onto the `type` column.
            // Legacy podcasts were stored with type='album' + product_type='podcast'.
            // Backfill type='podcast' so the category is readable from a single field.
            const podcastTypeFix = db.prepare(
                "UPDATE albums SET type = 'podcast' WHERE product_type = 'podcast' AND (type IS NULL OR type = 'album')"
            ).run();
            if (podcastTypeFix.changes > 0) {
                console.log(`📦 [Database] Migrated ${podcastTypeFix.changes} podcast release(s) to type='podcast'.`);
            }

            // The supported categories are album | single | liveset | podcast.
            // Fold the deprecated 'ep' type into 'album'.
            const epTypeFix = db.prepare(
                "UPDATE albums SET type = 'album' WHERE type = 'ep'"
            ).run();
            if (epTypeFix.changes > 0) {
                console.log(`📦 [Database] Migrated ${epTypeFix.changes} 'ep' release(s) to type='album'.`);
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
            if (!cols.some(col => col.name === 'description')) {
                console.log("📦 [Database] Migrating tracks table: adding description column...");
                db.exec("ALTER TABLE tracks ADD COLUMN description TEXT");
            }
            if (!cols.some(col => col.name === 'podcast_episode_num')) {
                console.log("📦 [Database] Migrating tracks table: adding podcast_episode_num column...");
                db.exec("ALTER TABLE tracks ADD COLUMN podcast_episode_num INTEGER");
            }
            if (!cols.some(col => col.name === 'podcast_season_num')) {
                console.log("📦 [Database] Migrating tracks table: adding podcast_season_num column...");
                db.exec("ALTER TABLE tracks ADD COLUMN podcast_season_num INTEGER");
            }
            if (!cols.some(col => col.name === 'podcast_episode_type')) {
                console.log("📦 [Database] Migrating tracks table: adding podcast_episode_type column...");
                db.exec("ALTER TABLE tracks ADD COLUMN podcast_episode_type TEXT DEFAULT 'full'");
            }

            // Repair incorrect mime_type values for audio files
            console.log("⚙️ [Database] Repairing incorrect/generic audio mime types...");
            db.exec(`
                UPDATE tracks 
                SET mime_type = CASE 
                    WHEN file_path LIKE '%.mp3' THEN 'audio/mpeg'
                    WHEN file_path LIKE '%.wav' THEN 'audio/wav'
                    WHEN file_path LIKE '%.flac' THEN 'audio/flac'
                    WHEN file_path LIKE '%.ogg' THEN 'audio/ogg'
                    WHEN file_path LIKE '%.opus' THEN 'audio/opus'
                    WHEN file_path LIKE '%.m4a' THEN 'audio/mp4'
                    WHEN file_path LIKE '%.aac' THEN 'audio/aac'
                    ELSE 'audio/mpeg'
                END
                WHERE (mime_type = 'application/octet-stream' OR mime_type IS NULL) 
                  AND (
                    file_path LIKE '%.mp3' OR file_path LIKE '%.wav' OR file_path LIKE '%.flac' OR
                    file_path LIKE '%.ogg' OR file_path LIKE '%.opus' OR file_path LIKE '%.m4a' OR
                    file_path LIKE '%.aac'
                  );
            `);
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
            // Phase 4: ActivityPub keys for user actors
            if (!cols.some(col => col.name === 'ap_public_key')) {
                console.log("📦 [Database] Migrating admin table: adding ap_public_key/ap_private_key columns...");
                db.exec("ALTER TABLE admin ADD COLUMN ap_public_key TEXT");
                db.exec("ALTER TABLE admin ADD COLUMN ap_private_key TEXT");
            }
            if (!cols.some(col => col.name === 'artist_unlinked')) {
                console.log("📦 [Database] Migrating admin table: adding artist_unlinked column...");
                db.exec("ALTER TABLE admin ADD COLUMN artist_unlinked INTEGER DEFAULT 0");
            }
            if (!cols.some(col => col.name === 'artist_requested_at')) {
                console.log("📦 [Database] Migrating admin table: adding artist_requested_at column...");
                db.exec("ALTER TABLE admin ADD COLUMN artist_requested_at TEXT DEFAULT NULL");
            }
            // Opt-in "now listening" presence (off by default for privacy).
            if (!cols.some(col => col.name === 'now_playing_enabled')) {
                console.log("📦 [Database] Migrating admin table: adding now_playing_enabled column...");
                db.exec("ALTER TABLE admin ADD COLUMN now_playing_enabled INTEGER DEFAULT 0");
            }
            if (!cols.some(col => col.name === 'can_peer')) {
                console.log("📦 [Database] Migrating admin table: adding can_peer column...");
                db.exec("ALTER TABLE admin ADD COLUMN can_peer INTEGER NOT NULL DEFAULT 0");
            }
            // Opt-in public listener profile at /u/:username (off by default for privacy).
            if (!cols.some(col => col.name === 'public_profile_enabled')) {
                console.log("[Database] Migrating admin table: adding public_profile_enabled column...");
                db.exec("ALTER TABLE admin ADD COLUMN public_profile_enabled INTEGER DEFAULT 0");
            }
            // Password reset via email (Brevo)
            if (!cols.some(col => col.name === 'email')) {
                console.log("📦 [Database] Migrating admin table: adding email column...");
                db.exec("ALTER TABLE admin ADD COLUMN email TEXT");
                db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_email ON admin(email COLLATE NOCASE) WHERE email IS NOT NULL");
            }
            if (!cols.some(col => col.name === 'track_quota')) {
                console.log("📦 [Database] Migrating admin table: adding track_quota column...");
                db.exec("ALTER TABLE admin ADD COLUMN track_quota INTEGER DEFAULT NULL");
            }
            if (!cols.some(col => col.name === 'track_quota_floor')) {
                console.log("📦 [Database] Migrating admin table: adding track_quota_floor column...");
                db.exec("ALTER TABLE admin ADD COLUMN track_quota_floor INTEGER NOT NULL DEFAULT 0");
            }
            // Repair stale artist links: artist_id pointing to a deleted artist.
            const artistsTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='artists'").get();
            if (artistsTableExists) {
                const dangling = db.prepare("UPDATE admin SET artist_id = NULL WHERE artist_id IS NOT NULL AND artist_id NOT IN (SELECT id FROM artists)").run();
                if (dangling.changes > 0) console.log(`🧹 [Database] Cleared ${dangling.changes} dangling artist link(s) on admin accounts`);
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
            if (!cols.some(col => col.name === 'replies_count')) {
                console.log("📦 [Database] Migrating ap_notes table: adding replies_count column...");
                db.exec("ALTER TABLE ap_notes ADD COLUMN replies_count INTEGER DEFAULT 0");
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

        db.exec(`
            CREATE TABLE IF NOT EXISTS ap_replies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id TEXT NOT NULL,
                reply_uri TEXT NOT NULL UNIQUE,
                actor_uri TEXT NOT NULL,
                content TEXT NOT NULL,
                published_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_ap_replies_note ON ap_replies(note_id)`);

        // Durable outbound delivery queue (federation retry-on-failure).
        db.exec(`
            CREATE TABLE IF NOT EXISTS ap_delivery_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor_slug TEXT NOT NULL,
                inbox_uri TEXT NOT NULL,
                activity_json TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                next_attempt_at INTEGER NOT NULL,
                last_error TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_ap_delivery_due ON ap_delivery_queue(status, next_attempt_at)`);

        // Phase 0: Zen → signaling only — local stats tables
        // play_count = public counter (embedded player + webapp /stats/track/.../play)
        // play_history stays separate (library plays via /stats/library/play + subsonic)
        db.exec(`
            CREATE TABLE IF NOT EXISTS track_stats (
                track_id       INTEGER PRIMARY KEY,
                play_count     INTEGER NOT NULL DEFAULT 0,
                download_count INTEGER NOT NULL DEFAULT 0
            )
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS release_stats (
                slug           TEXT PRIMARY KEY,
                download_count INTEGER NOT NULL DEFAULT 0
            )
        `);
        // Ensure play_history is indexed for COUNT(*) queries
        db.exec(`CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history(track_id)`);

        // peer_tracks PK migration: old schema used id TEXT PRIMARY KEY (single-column).
        // Two concurrent sessions sharing the same track ID (e.g. from the library) caused
        // SQLITE_CONSTRAINT_PRIMARYKEY. Upgraded to composite PK (id, session_id).
        const peerTracksExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='peer_tracks'").get();
        if (peerTracksExists) {
            const ptCols = db.prepare("PRAGMA table_info(peer_tracks)").all() as any[];
            const sessionIdCol = ptCols.find((c: any) => c.name === 'session_id');
            if (sessionIdCol && sessionIdCol.pk === 0) {
                console.log("📦 [Database] Migrating peer_tracks: upgrading to composite PK (id, session_id)...");
                db.transaction(() => {
                    db.exec(`
                        CREATE TABLE peer_tracks_new (
                            id TEXT NOT NULL,
                            session_id TEXT NOT NULL REFERENCES peer_sessions(id) ON DELETE CASCADE,
                            title TEXT NOT NULL,
                            artist TEXT,
                            album TEXT,
                            duration REAL,
                            file_size INTEGER,
                            mime_type TEXT,
                            allow_download INTEGER NOT NULL DEFAULT 1,
                            created_at INTEGER NOT NULL,
                            PRIMARY KEY (id, session_id)
                        )
                    `);
                    db.exec("INSERT OR IGNORE INTO peer_tracks_new SELECT * FROM peer_tracks");
                    db.exec("DROP TABLE peer_tracks");
                    db.exec("ALTER TABLE peer_tracks_new RENAME TO peer_tracks");
                    db.exec("CREATE INDEX IF NOT EXISTS idx_peer_tracks_session ON peer_tracks(session_id)");
                    db.exec("CREATE INDEX IF NOT EXISTS idx_peer_tracks_search ON peer_tracks(title, artist)");
                })();
            }

            // Migration for magnet_uri column
            const updatedPtCols = db.prepare("PRAGMA table_info(peer_tracks)").all() as any[];
            if (!updatedPtCols.some((c: any) => c.name === 'magnet_uri')) {
                console.log("📦 [Database] Migrating peer_tracks: adding magnet_uri column...");
                db.exec("ALTER TABLE peer_tracks ADD COLUMN magnet_uri TEXT");
            }
        }

        const torrentsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='torrents'").get();
        if (torrentsExists) {
            const torrentCols = db.prepare("PRAGMA table_info(torrents)").all() as any[];
            if (!torrentCols.some(col => col.name === 'artist')) {
                console.log("📦 [Database] Migrating torrents table: adding artist column...");
                db.exec("ALTER TABLE torrents ADD COLUMN artist TEXT");
            }
        }

        const chatMessagesExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_messages'").get();
        const boardMessagesExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='board_messages'").get();
        if (chatMessagesExists && !boardMessagesExists) {
            console.log("📦 [Database] Renaming chat_messages table to board_messages...");
            db.exec("ALTER TABLE chat_messages RENAME TO board_messages");
        }
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
            COALESCE(NULLIF(a.album_artist, ''), ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL AND artist_name != '' LIMIT 1), 'Unknown Artist') as artist_name,
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
            COALESCE(NULLIF(a.album_artist, ''), ar.name, (SELECT artist_name FROM tracks WHERE album_id = a.id AND artist_name IS NOT NULL AND artist_name != '' LIMIT 1), 'Unknown Artist') as artist_name,
            ar.slug as artist_slug,
            ar.wallet_address as artist_wallet_address
        FROM albums a
        LEFT JOIN artists ar ON a.artist_id = ar.id
        WHERE a.is_release = 1;

        CREATE VIEW v_tracks AS
        SELECT
            t.id,
            t.title,
            t.album_id,
            t.artist_id,
            t.owner_id,
            t.track_num,
            t.duration,
            t.file_path,
            t.format,
            t.bitrate,
            t.sample_rate,
            t.price,
            t.price_usdc,
            t.price_usdt,
            t.currency,
            t.waveform,
            t.url,
            t.service,
            t.external_artwork,
            t.lyrics,
            t.lossless_path,
            t.external_id,
            t.hash,
            t.fingerprint,
            t.genre,
            t.year,
            t.mime_type,
            t.file_size,
            t.file_hash,
            t.version,
            t.description,
            t.podcast_episode_num,
            t.podcast_season_num,
            t.podcast_episode_type,
            t.created_at,
            a.title as album_title,
            a.album_artist as album_artist_tag,
            a.visibility as album_visibility,
            a.status as album_status,
            COALESCE(NULLIF(t.artist_name, ''), ar_t.name, NULLIF(a.album_artist, ''), ar_a.name, 'Unknown Artist') as artist_name,
            COALESCE(ar_t.slug, ar_a.slug) as artist_slug,
            COALESCE(ar_t.wallet_address, ar_a.wallet_address) as artist_wallet_address,
            COALESCE(t.owner_id, a.owner_id) as effective_owner_id,
            own.username as owner_name
        FROM tracks t
        LEFT JOIN albums a ON t.album_id = a.id
        LEFT JOIN artists ar_t ON t.artist_id = ar_t.id
        LEFT JOIN artists ar_a ON a.artist_id = ar_a.id
        LEFT JOIN admin own ON COALESCE(t.owner_id, a.owner_id) = own.id;
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
        CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON api_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_reports_release ON reports(release_id);
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

    // Clean up any files that were incorrectly imported as tracks (e.g. artworks/avatars)
    try {
        const tracks = db.prepare("SELECT id, file_path FROM tracks WHERE file_path IS NOT NULL").all() as { id: number, file_path: string }[];
        const toDelete: number[] = [];
        for (const t of tracks) {
            const ext = path.extname(t.file_path).toLowerCase();
            if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"].includes(ext)) {
                const baseName = path.basename(t.file_path, ext).toLowerCase();
                const normalized = t.file_path.replace(/\\/g, "/").toLowerCase();
                const isArtwork = 
                    ["cover", "folder", "artwork", "avatar"].includes(baseName) ||
                    baseName.startsWith("cover-") || 
                    baseName.startsWith("avatar-") ||
                    baseName.startsWith("track-") ||
                    baseName.startsWith("artwork-") ||
                    baseName.startsWith("background") ||
                    baseName.startsWith("site-cover") ||
                    baseName.startsWith("site-logo") ||
                    normalized.includes("/artwork/") || 
                    normalized.includes("/assets/");
                if (isArtwork) {
                    toDelete.push(t.id);
                }
            }
        }
        if (toDelete.length > 0) {
            console.log(`🧹 [Database Cleanup] Removing ${toDelete.length} incorrectly imported artwork track entries...`);
            db.transaction(() => {
                for (let i = 0; i < toDelete.length; i += 500) {
                    const chunk = toDelete.slice(i, i + 500);
                    const placeholders = chunk.map(() => '?').join(',');
                    db.prepare(`DELETE FROM track_ownership WHERE track_id IN (${placeholders})`).run(chunk);
                    db.prepare(`DELETE FROM tracks WHERE id IN (${placeholders})`).run(chunk);
                }
            })();
        }
    } catch (e) {
        console.error("⚠️ [Database Cleanup] Failed to run artwork tracks cleanup:", e);
    }

    const trackRepository = new TrackRepository(db);
    const albumRepository = new AlbumRepository(db);
    const artistRepository = new ArtistRepository(db);
    const releaseTrackRepository = new ReleaseTrackRepository(db);
    const socialRepository = new SocialRepository(db);
    const remoteActorRepository = new RemoteActorRepository(db);
    const remoteContentRepository = new RemoteContentRepository(db);
    const reportsRepository = new ReportsRepository(db);

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
        remoteContentRepository,
        reportsRepository
    );
    const integration = createIntegrationManager(db);
    const peer = createPeerManager(db);

    const service: DatabaseService = {
        db,
        identity,
        library,
        social,
        integration,
        peer,
        transaction<T>(fn: () => T): T {
            return db.transaction(fn)();
        },
        ...identity,
        ...library,
        ...social,
        ...integration,
        ...peer,
    };

    return service;
}
