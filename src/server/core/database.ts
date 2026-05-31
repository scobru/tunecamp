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

// Re-export all types so consumers can continue to import from here
export type {
    Album, Artist, Track, Release, Post, Playlist,
    DatabaseService,
    TrackDTO, AlbumDTO
} from "./database.types.js";

import type {
    Album, Artist, Track, Release, Post, Playlist,
    DatabaseService
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
            tx_hash TEXT,
            is_used INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            redeemed_at TEXT
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
        }

        const tracksExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tracks'").get();
        if (tracksExists) {
            const cols = db.prepare("PRAGMA table_info(tracks)").all() as any[];
            if (!cols.some(col => col.name === 'fingerprint')) {
                console.log("📦 [Database] Migrating tracks table: adding fingerprint column...");
                db.exec("ALTER TABLE tracks ADD COLUMN fingerprint TEXT");
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

    const service: DatabaseService = {
        // Enforce private-like access to db through closure. 
        // We'll keep the 'db' property in the interface for now to avoid massive breakages,
        // but the goal is to phase it out.
        db,

        transaction<T>(fn: () => T): T {
            return db.transaction(fn)();
        },

        consolidateDatabase(): void {
            db.transaction(() => {
                db.prepare("DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM tracks WHERE album_id IS NOT NULL) AND is_release = 0").run();
                db.prepare("DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT release_id FROM release_tracks WHERE release_id IS NOT NULL) AND is_release = 1").run();
                db.prepare("DELETE FROM artists WHERE id NOT IN (SELECT artist_id FROM albums) AND id NOT IN (SELECT artist_id FROM tracks)").run();
            })();
        },

        // Users
        getUser: (id: number) => db.prepare("SELECT * FROM admin WHERE id = ?").get(id) as any,
        getUserByUsername: (u: string) => db.prepare("SELECT * FROM admin WHERE username = ?").get(u) as any,
        getUserByArtistId: (aid: number) => db.prepare("SELECT * FROM admin WHERE artist_id = ?").get(aid) as any,
        createUser(u: string, p: string, aid?: number | null, r = 'admin'): number {
            return Number(db.prepare("INSERT INTO admin (username, password_hash, artist_id, role) VALUES (?, ?, ?, ?)").run(u, p, aid || null, r).lastInsertRowid);
        },
        updateUser(id: number, data: any): void {
            const f = Object.keys(data).map(k => `${k} = ?`).join(", ");
            db.prepare(`UPDATE admin SET ${f} WHERE id = ?`).run(...Object.values(data), id);
        },
        getAllUsers: () => db.prepare("SELECT * FROM admin").all() as any[],
        deleteUser: (id: number) => { db.prepare("DELETE FROM admin WHERE id = ?").run(id); },
        getAdmins: () => db.prepare("SELECT * FROM admin WHERE role IN ('admin', 'super_user', 'root_admin')").all() as any[],
        syncZenUser(pub: string, epub: string, alias: string, avatar?: string): void {
            db.prepare("INSERT OR REPLACE INTO gun_users (pub, epub, alias, avatar) VALUES (?, ?, ?, ?)").run(pub, epub, alias, avatar || null);
        },
        getZenUser: (pub: string) => db.prepare("SELECT * FROM gun_users WHERE pub = ?").get(pub) as any,

        // Auth
        createOAuthClient(c: any): void { db.prepare("INSERT INTO oauth_clients (instance_url, client_id, client_secret, redirect_uri) VALUES (?, ?, ?, ?)").run(c.instance_url, c.client_id, c.client_secret, c.redirect_uri); },
        getOAuthClient: (url: string) => db.prepare("SELECT * FROM oauth_clients WHERE instance_url = ?").get(url) as any,
        saveOAuthLink(p: string, s: string, pub: string, priv: string): void { db.prepare("INSERT OR REPLACE INTO oauth_links (provider, subject, gun_pub, gun_priv) VALUES (?, ?, ?, ?)").run(p, s, pub, priv); },
        getOAuthLink: (p: string, s: string) => db.prepare("SELECT * FROM oauth_links WHERE provider = ? AND subject = ?").get(p, s) as any,

        // Artists
        getArtists: (p?: VisibilityProfile | ViewerContext) => artistRepository.getAll(p),
        getArtist: (id: number) => artistRepository.getById(id),
        getArtistSimple: (id: number) => artistRepository.getByIdSimple(id),
        getArtistBySlug: (s: string) => artistRepository.getBySlug(s),
        getArtistBySlugSimple: (s: string) => artistRepository.getBySlug(s) as any,
        getArtistByName: (n: string) => artistRepository.getByName(n),
        getArtistsByIds: (ids: number[]) => artistRepository.getByIds(ids),
        getFollowers: (id: number) => socialRepository.getFollowers(id),
        addFollower: (id: number, u: string, i: string, si?: string) => socialRepository.addFollower(id, u, i, si),
        removeFollower: (id: number, u: string) => socialRepository.removeFollower(id, u),
        unfollowActor: (u: string) => { db.prepare("UPDATE remote_actors SET is_followed = 0 WHERE uri = ?").run(u); },
        createArtist: (n: string, b?: string, p?: string, l?: any, pp?: any, w?: string, v: any = 'private', e?: string) => artistRepository.create(n, b, p, l, pp, w, v, e),
        updateArtist: (id: number, n?: string, b?: string, p?: string, l?: any, pp?: any, w?: string, v?: any) => artistRepository.update(id, n, b, p, l, pp, w, v),
        updateArtistKeys: (id: number, pub: string, priv: string) => artistRepository.updateKeys(id, pub, priv),
        deleteArtist: (id: number) => artistRepository.delete(id),
        deleteArtistsBatch: (ids: number[]) => { ids.forEach(id => artistRepository.delete(id)); },
        updateArtistsVisibilityBatch: (ids: number[], v: any) => { db.transaction(() => ids.forEach(id => artistRepository.update(id, undefined, undefined, undefined, undefined, undefined, undefined, v)))(); },
        isArtistLinkedToUser: (id: number) => artistRepository.isLinkedToUser(id),
        isArtistLinkedToUserBySlug: (s: string) => artistRepository.isLinkedToUserBySlug(s),

        // Releases
        getReleases: (p?: VisibilityProfile | ViewerContext) => albumRepository.getReleases(p),
        getRelease: (id: number) => albumRepository.getById(id) as any,
        getReleaseBySlug: (s: string) => albumRepository.getBySlug(s) as any,
        getRecentReleaseByMetadata: (t: string, aid: number | null, s: number) => db.prepare("SELECT * FROM releases WHERE title = ? AND (artist_id = ? OR (artist_id IS NULL AND ? IS NULL)) AND created_at >= datetime('now', ?) ORDER BY created_at DESC LIMIT 1").get(t, aid, aid, `-${s} seconds`) as any,
        getReleasesByArtist: (id: number, p?: VisibilityProfile | ViewerContext, n?: string) => albumRepository.getReleasesByArtist(id, p, n),
        getReleasesByOwner: (id: number, p?: VisibilityProfile | ViewerContext) => albumRepository.getReleasesByOwner(id, p),
        createRelease: (r: any) => albumRepository.createRelease(r),
        updateRelease: (id: number, d: any) => albumRepository.update(id, d),
        getReleaseTracks: (id: number) => releaseTrackRepository.getByReleaseId(id),
        getReleaseTrackIds: (id: number) => db.prepare("SELECT track_id FROM release_tracks WHERE release_id = ?").all(id).map((r: any) => r.track_id).filter(i => i !== null),
        addTrackToRelease: (rid: number, tid: number, m?: any) => releaseTrackRepository.add(rid, { ...m, track_id: tid }),
        syncReleaseTracks: (rid: number, tids: number[]) => releaseTrackRepository.sync(rid, tids),
        deleteRelease: (id: number) => albumRepository.delete(id),
        deleteReleasesBatch: (ids: number[]) => { ids.forEach(id => albumRepository.delete(id)); },

        // Albums
        getAlbums: (p?: VisibilityProfile | ViewerContext) => albumRepository.getLibraryAlbums(p),
        getAlbumsWithStats: (p?: VisibilityProfile | ViewerContext) => albumRepository.getWithStats(p),
        getLibraryAlbums: (p?: VisibilityProfile | ViewerContext) => albumRepository.getLibraryAlbums(p),
        getAlbum: (id: number) => albumRepository.getById(id),
        getAlbumsByIds: (ids: number[]) => albumRepository.getByIds(ids),
        getAlbumBySlug: (s: string) => albumRepository.getBySlug(s),
        getAlbumByTitle: (t: string, aid?: number) => albumRepository.getByTitle(t, aid),
        getAlbumByExternalId: (e: string) => albumRepository.getByExternalId(e) as any,
        getArtistAlbumCounts: () => albumRepository.getArtistAlbumCounts(),
        getArtistCovers: (id: number) => albumRepository.getCovers(id),
        getAlbumsByArtist: (id: number, p?: VisibilityProfile | ViewerContext, n?: string) => albumRepository.getByArtist(id, p, n),
        getAlbumsByOwner: (id: number, p?: VisibilityProfile | ViewerContext) => albumRepository.getByOwner(id, p),
        createAlbum: (a: any) => { const aid = albumRepository.create(a); if (a.owner_id) albumRepository.addOwner(aid, a.owner_id); return aid; },
        updateAlbumVisibility: (id: number, v: any) => { const ip = v === 'public' || v === 'unlisted'; albumRepository.update(id, { visibility: v, is_public: ip, published_at: ip ? new Date().toISOString() : null }); },
        updateAlbumStatus: (id: number, s: any) => albumRepository.update(id, { status: s }),
        updateReleaseStatus: (id: number, s: any) => albumRepository.updateReleaseStatus(id, s),
        updateAlbum: (id: number, d: any) => albumRepository.update(id, d),
        updateAlbumFederationSettings: (id: number, g: boolean, a: boolean) => albumRepository.update(id, { published_to_gundb: g, published_to_ap: a }),
        updateAlbumArtist: (id: number, aid: number) => albumRepository.update(id, { artist_id: aid }),
        updateAlbumOwner: (id: number, oid: number) => albumRepository.update(id, { owner_id: oid }),
        updateAlbumTitle: (id: number, t: string) => albumRepository.update(id, { title: t }),
        updateAlbumCover: (id: number, p: string) => albumRepository.update(id, { cover_path: p }),
        updateAlbumGenre: (id: number, g: string | null) => albumRepository.update(id, { genre: g }),
        updateAlbumYear: (id: number, y: any) => albumRepository.update(id, { year: Number(y) }),
        updateAlbumDownload: (id: number, d: string | null) => albumRepository.update(id, { download: d }),
        updateAlbumPrice: (id: number, p: any, pu: any, c: any = 'ETH') => albumRepository.update(id, { price: p || 0, price_usdc: pu || 0, currency: c }),
        updateAlbumLinks: (id: number, l: string | null) => albumRepository.update(id, { external_links: l }),
        promoteToRelease: (id: number) => albumRepository.promoteToRelease(id),
        deleteAlbum: (id: number, k = false) => albumRepository.delete(id, k),
        deleteAlbumsBatch: (ids: number[], k = false) => { ids.forEach(id => albumRepository.delete(id, k)); },
        updateAlbumsVisibilityBatch: (ids: number[], v: any) => { ids.forEach(id => service.updateAlbumVisibility(id, v)); },
        searchAlbums: (q: string, l: number, p?: VisibilityProfile | ViewerContext) => albumRepository.search(q, l, p),
        addAlbumOwner: (aid: number, oid: number) => { albumRepository.addOwner(aid, oid); },

        // Tracks
        getTracks: (aid?: number, p?: VisibilityProfile | ViewerContext) => aid ? trackRepository.getByAlbumId(aid, p) : trackRepository.getAll(p),
        getTracksByAlbum: (aid: number, p?: VisibilityProfile | ViewerContext) => trackRepository.getByAlbumId(aid, p),
        getTracksByArtist: (aid: number, p?: VisibilityProfile | ViewerContext, n?: string) => trackRepository.getByArtist(aid, p, n),
        repairArtistLinks(aid: number, n: string) { return db.transaction(() => ({ tracks: db.prepare("UPDATE tracks SET artist_id = ? WHERE (artist_id IS NULL OR artist_id IN (SELECT id FROM artists WHERE name LIKE ? AND id != ?)) AND (artist_name LIKE ? OR artist_name = ?)").run(aid, n, aid, `%${n}%`, n).changes, albums: db.prepare("UPDATE albums SET artist_id = ? WHERE (artist_id IS NULL OR artist_id IN (SELECT id FROM artists WHERE name LIKE ? AND id != ?)) AND (title = ? OR title LIKE ?)").run(aid, n, aid, n, `%${n}%`).changes }))(); },
        getTracksByOwner: (oid: number, p?: VisibilityProfile | ViewerContext) => trackRepository.getByOwner(oid, p),
        getTrack: (id: number) => trackRepository.getById(id),
        getTracksByIds: (ids: number[]) => trackRepository.getByIds(ids),
        getTrackByPath: (p: string) => trackRepository.getByPath(p),
        getTracksByPaths: (ps: string[]) => trackRepository.getByIds(ps.map(p => trackRepository.getByPath(p)?.id).filter(id => id !== undefined) as number[]),
        getTracksByAlbumIds: (aids: number[]) => db.prepare(`SELECT id FROM tracks WHERE album_id IN (${aids.map(() => "?").join(",")})`).all(...aids).map((r: any) => trackRepository.getById(r.id)).filter(t => t !== undefined) as Track[],
        getRandomTracks: (l: number) => trackRepository.getRandom(l),
        createTrack: (t: any) => { const tid = trackRepository.create(t); if (t.owner_id) trackRepository.addOwner(tid, t.owner_id); return tid; },
        updateTrack: (id: number, d: any) => trackRepository.update(id, d),
        updateTrackPath: (id: number, p: string, aid?: number | null) => trackRepository.update(id, { file_path: p, album_id: aid }),
        updateTrackLosslessPath: (id: number, p: string | null) => trackRepository.update(id, { lossless_path: p }),
        updateTrackTitle: (id: number, t: string) => trackRepository.update(id, { title: t }),
        updateTrackArtist: (id: number, aid: number | null) => trackRepository.updateArtist(id, aid, null),
        updateTrackArtistName: (id: number, n: string | null) => trackRepository.updateArtist(id, null, n),
        updateTrackArtistInfo: (id: number, aid: number | null, n: string | null) => trackRepository.updateArtist(id, aid, n),
        updateTrackAlbum: (id: number, aid: number | null) => trackRepository.update(id, { album_id: aid }),
        updateTracksAlbum: (ids: number[], aid: number | null) => { ids.forEach(id => trackRepository.update(id, { album_id: aid })); },
        updateTrackOrder: (id: number, n: number) => trackRepository.updateOrder(id, n),
        updateTrackNumber: (id: number, n: number | null) => trackRepository.updateOrder(id, n || 0),
        updateTracksOrder: (os: any[]) => { os.forEach(o => trackRepository.updateOrder(o.id, o.trackNum)); },
        updateTrackDuration: (id: number, d: number) => trackRepository.update(id, { duration: d }),
        updateTrackBitrate: (id: number, b: number) => trackRepository.update(id, { bitrate: b }),
        updateTrackWaveform: (id: number, w: string) => trackRepository.update(id, { waveform: w }),
        updateTrackPrice: (id: number, p: any, pu: any, c: any = 'ETH') => trackRepository.update(id, { price: p || 0, price_usdc: pu || 0, currency: c }),
        updateTrackLyrics: (id: number, l: string | null) => trackRepository.update(id, { lyrics: l }),
        updateTrackGenre: (id: number, g: string | null) => trackRepository.update(id, { genre: g }),
        updateTrackYear: (id: number, y: number | null) => trackRepository.update(id, { year: y }),
        updateTrackExternalArtwork: (id: number, u: string | null) => trackRepository.update(id, { external_artwork: u }),
        updateTrackService: (id: number, s: string | null) => trackRepository.update(id, { service: s }),
        updateTrackUrl: (id: number, u: string | null) => trackRepository.update(id, { url: u }),
        updateTrackExternalId: (id: number, eid: string | null) => trackRepository.update(id, { external_id: eid }),
        updateTrackFingerprint: (id: number, f: string) => trackRepository.update(id, { fingerprint: f }),
        updateTrackHash: (id: number, h: string) => trackRepository.update(id, { hash: h }),
        updateTrackPathsPrefix: (o: string, n: string) => trackRepository.updatePathsPrefix(o, n),
        getTrackByExternalId: (e: string) => trackRepository.getByExternalId(e) as any,
        getTrackByFingerprint: (f: string) => trackRepository.getByFingerprint(f) as any,
        getTrackByMetadata: (t: string, aid: number | null, albid: number | null) => trackRepository.getByMetadata(t, aid, albid),
        getRemoteTracks: () => remoteContentRepository.getRemoteTracks(),
        getRemotePosts: () => remoteContentRepository.getRemotePosts(),
        getRemoteTrack: (id: string) => remoteContentRepository.getRemoteTrack(id),
        deleteTrack: (id: number, oid?: number) => trackRepository.delete(id, oid),
        deleteTracksBatch: (ids: number[]) => { ids.forEach(id => trackRepository.delete(id)); },
        getAlbumOwners: (id: number) => albumRepository.getAlbumOwners(id),
        addTrackOwner: (tid: number, oid: number) => { trackRepository.addOwner(tid, oid); },
        updateTrackOwner: (id: number, oid: number | null) => { trackRepository.updateOwner(id, oid); },
        getTracksByReleaseId: (id: number) => trackRepository.getByReleaseId(id),
        getReleasesByTrackId: (tid: number) => db.prepare("SELECT r.* FROM releases r JOIN release_tracks rt ON r.id = rt.release_id WHERE rt.track_id = ?").all(tid) as Release[],
        updateReleaseTrackMetadata: (rid: number, tid: number, m: any) => releaseTrackRepository.updateMetadata(rid, tid, m),
        getTrackPriceFromRelease: (rid: number, tid: number) => releaseTrackRepository.getPriceFromRelease(rid, tid),
        getTracksSummaryByReleaseId: (id: number) => trackRepository.getByReleaseId(id),
        getTrackByHash: (h: string) => trackRepository.getByHash(h) as any,
        mergeTracks: (f: number, t: number) => { const target = trackRepository.getById(t); if (target) trackRepository.merge(f, t, target.file_path || ""); },
        getAllTracks: (w?: string, p: any[] = []) => trackRepository.getAll(),
        iterateTracks(w?: string, p: any[] = []) {
            const it = db.prepare(w ? `SELECT id FROM tracks WHERE ${w}` : "SELECT id FROM tracks").iterate(...p);
            const tr = trackRepository;
            return (function* () { for (const r of it) yield tr.getById((r as any).id)!; })();
        },

        // Playlists
        getPlaylists(u?: string, profile?: VisibilityProfile | ViewerContext): Playlist[] {
            const context = getContextFromProfile(profile);
            const po = context.role === UserRole.GUEST;
            let sql = po ? "SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at as createdAt FROM playlists WHERE is_public = 1" : "SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at as createdAt FROM playlists";
            if (u) sql += po ? " AND username = ?" : " WHERE username = ?";
            return (u ? db.prepare(sql).all(u) : db.prepare(sql).all()) as any[];
        },
        getPlaylist: (id: number) => db.prepare("SELECT id, name, username, description, is_public as isPublic, cover_path as coverPath, created_at as createdAt FROM playlists WHERE id = ?").get(id) as any,
        createPlaylist: (n: string, u: string, d?: string, ip = false) => Number(db.prepare("INSERT INTO playlists (name, username, description, is_public) VALUES (?, ?, ?, ?)").run(n, u, d || null, ip ? 1 : 0).lastInsertRowid),
        updatePlaylistVisibility: (id: number, ip: boolean) => { db.prepare("UPDATE playlists SET is_public = ? WHERE id = ?").run(ip ? 1 : 0, id); },
        updatePlaylistCover: (id: number, p: string | null) => { db.prepare("UPDATE playlists SET cover_path = ? WHERE id = ?").run(p, id); },
        deletePlaylist: (id: number) => { db.prepare("DELETE FROM playlists WHERE id = ?").run(id); },
        getPlaylistTracks: (id: number) => db.prepare("SELECT t.* FROM tracks t JOIN playlist_tracks pt ON t.id = pt.track_id WHERE pt.playlist_id = ? ORDER BY pt.position").all(id) as any[],
        isTrackInPublicPlaylist: (id: number) => !!db.prepare("SELECT 1 FROM playlist_tracks pt JOIN playlists p ON pt.playlist_id = p.id WHERE pt.track_id = ? AND p.is_public = 1").get(id),
        addTrackToPlaylist: (pid: number, tid: number) => { const m = db.prepare("SELECT MAX(position) as m FROM playlist_tracks WHERE playlist_id = ?").get(pid) as any; db.prepare("INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)").run(pid, tid, (m?.m || 0) + 1); },
        removeTrackFromPlaylist: (pid: number, tid: number) => { db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?").run(pid, tid); },

        // Starred / Social
        starItem: (u: string, t: any, id: string) => socialRepository.starItem(u, t, id),
        unstarItem: (u: string, t: any, id: string) => socialRepository.unstarItem(u, t, id),
        starItems: (u: string, is: any[]) => { db.transaction(() => is.forEach(i => socialRepository.starItem(u, i.type, i.id)))(); },
        unstarItems: (u: string, is: any[]) => { db.transaction(() => is.forEach(i => socialRepository.unstarItem(u, i.type, i.id)))(); },
        getStarredItems: (u: string, t?: any) => socialRepository.getStarredItems(u, t),
        isStarred: (u: string, t: any, id: string) => socialRepository.isStarred(u, t, id),
        setItemRating: (u: string, t: any, id: string, r: number) => socialRepository.setItemRating(u, t, id, r),
        getItemRating: (u: string, t: any, id: string) => socialRepository.getItemRating(u, t, id),
        getItemRatings: (u: string, t: any) => socialRepository.getItemRatings(u, t),
        addLike: (a: string, t: any, id: number) => socialRepository.addLike(a, t, id),
        removeLike: (a: string, t: any, id: number) => socialRepository.removeLike(a, t, id),
        getLikesCount: (t: any, id: number) => socialRepository.getLikesCount(t, id),
        hasLiked: (a: string, t: any, id: number) => socialRepository.hasLiked(a, t, id),
        recordPlay: (tid: number, p?: string) => socialRepository.recordPlay(tid, p),
        getRecentPlays: (l = 50) => socialRepository.getRecentPlays(l),
        getTopTracks: (l = 20, d = 30, f: any = 'all') => socialRepository.getTopTracks(l, d, f),
        getTopArtists: (l = 10, d = 30, f: any = 'all') => socialRepository.getTopArtists(l, d, f),
        savePlayQueue: (u: string, ids: string[], c: string | null, p: number) => db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(`play_queue_${u}`, JSON.stringify({ trackIds: ids, current: c, positionMs: p })),
        getPlayQueue: (u: string) => { const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(`play_queue_${u}`) as any; return r ? JSON.parse(r.value) : { trackIds: [], current: null, positionMs: 0 }; },

        // Bookmarks
        createBookmark: (u: string, id: string, p: number, c?: string) => { db.prepare("INSERT INTO bookmarks (username, track_id, position_ms, comment) VALUES (?, ?, ?, ?)").run(u, id, p, c || null); },
        getBookmarks: (u: string) => db.prepare("SELECT * FROM bookmarks WHERE username = ? ORDER BY updated_at DESC").all(u) as any[],
        getBookmark: (u: string, id: string) => db.prepare("SELECT * FROM bookmarks WHERE username = ? AND track_id = ?").get(u, id) as any,
        deleteBookmark: (u: string, id: string) => { db.prepare("DELETE FROM bookmarks WHERE username = ? AND track_id = ?").run(u, id); },

        // Posts
        getPostsByArtist: (aid: number, pr?: VisibilityProfile | ViewerContext) => {
            const context = getContextFromProfile(pr);
            const po = context.role === UserRole.GUEST;
            return db.prepare(po ? "SELECT * FROM posts WHERE artist_id = ? AND visibility = 'public' ORDER BY created_at DESC" : "SELECT * FROM posts WHERE artist_id = ? ORDER BY created_at DESC").all(aid) as any[];
        },
        getPublicPosts: () => db.prepare(`
            SELECT p.*, a.name AS artist_name, a.slug AS artist_slug, a.photo_path AS artist_photo
            FROM posts p
            LEFT JOIN artists a ON p.artist_id = a.id
            WHERE p.visibility = 'public'
            ORDER BY p.created_at DESC
        `).all() as any[],
        getPost: (id: number) => db.prepare("SELECT * FROM posts WHERE id = ?").get(id) as any,
        getPostBySlug: (s: string) => db.prepare("SELECT * FROM posts WHERE slug = ?").get(s) as any,
        createPost: (aid: number, c: string, v: any = 'public') => Number(db.prepare("INSERT INTO posts (artist_id, content, slug, visibility, published_at) VALUES (?, ?, ?, ?, ?)").run(aid, c, c.slice(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Math.random().toString(36).substring(2, 8), v, (v === 'public' || v === 'unlisted') ? new Date().toISOString() : null).lastInsertRowid),
        updatePost: (id: number, c: string, v?: any) => { db.prepare("UPDATE posts SET content = ?, visibility = COALESCE(?, visibility) WHERE id = ?").run(c, v || null, id); },
        updatePostVisibility: (id: number, v: any) => { db.prepare("UPDATE posts SET visibility = ? WHERE id = ?").run(v, id); },
        deletePost: (id: number) => { db.prepare("DELETE FROM posts WHERE id = ?").run(id); },

        // Stats
        getStats: async (aid?: number, oid?: number) => { 
            const isAdmin = aid === undefined && oid === undefined;
            const profile = isAdmin ? VisibilityProfile.ALL_ACCESS : VisibilityProfile.PUBLIC_STAGE;
            const genres = service.getGenres(profile);

            return { 
                artists: artistRepository.getCount(), 
                albums: albumRepository.getCount(), 
                tracks: trackRepository.getCount(), 
                publicAlbums: albumRepository.getLibraryAlbums(VisibilityProfile.PUBLIC_STAGE).length, 
                totalUsers: (db.prepare("SELECT COUNT(*) as count FROM admin").get() as any).count, 
                storageUsed: 0, networkSites: 0, totalTracks: trackRepository.getCount(), 
                genresCount: genres.length, genres: genres 
            }; 
        },
        getPublicTracksCount: () => trackRepository.getAll(VisibilityProfile.PUBLIC_STAGE).length,
        getGenres(p?: VisibilityProfile | ViewerContext): string[] {
            const context = getContextFromProfile(p);
            const filter = VisibilityGuardian.getTrackFilter(context, 'v_tracks');
            const rows = db.prepare(`SELECT DISTINCT genre FROM v_tracks WHERE genre IS NOT NULL AND genre != '' AND (${filter.sql})`).all(...filter.params) as any[];
            const genreSet = new Set<string>();
            rows.forEach(r => {
                r.genre.split(',').forEach((g: string) => {
                    const trimmed = g.trim();
                    if (trimmed) genreSet.add(trimmed);
                });
            });
            return Array.from(genreSet).sort();
        },
        getTracksByGenre(g: string, p?: VisibilityProfile | ViewerContext): Track[] {
            const context = getContextFromProfile(p);
            const filter = VisibilityGuardian.getTrackFilter(context, 'v_tracks');
            // Use LIKE to find tracks that have the genre in a comma-separated list
            const rows = db.prepare(`SELECT * FROM v_tracks WHERE (genre = ? OR genre LIKE ? OR genre LIKE ? OR genre LIKE ?) AND (${filter.sql}) ORDER BY artist_name, album_title, track_num`).all(g, `${g},%`, `%, ${g},%`, `%, ${g}`, ...filter.params);
            return rows.map(r => (trackRepository as any).mapTrack(r));
        },
        getGenreTrackCounts(p?: VisibilityProfile | ViewerContext): Map<string, number> {
            const context = getContextFromProfile(p);
            const filter = VisibilityGuardian.getTrackFilter(context, 'v_tracks');
            const rows = db.prepare(`SELECT genre, COUNT(*) as count FROM v_tracks WHERE genre IS NOT NULL AND genre != '' AND (${filter.sql}) GROUP BY genre`).all(...filter.params) as any[];
            const counts = new Map<string, number>();
            rows.forEach(r => {
                r.genre.split(',').forEach((g: string) => {
                    const trimmed = g.trim().toLowerCase();
                    if (trimmed) {
                        counts.set(trimmed, (counts.get(trimmed) || 0) + r.count);
                    }
                });
            });
            return counts;
        },
        getListeningStats: () => ({ totalPlays: 0, uniqueTracks: 0, totalListeningTime: 0, playsToday: 0, playsThisWeek: 0, playsThisMonth: 0 }),

        // AP Metadata
        createApNote: (aid: number, nid: string, nt: any, cid: number, cs: string, ct: string) => Number(db.prepare("INSERT OR IGNORE INTO ap_notes (artist_id, note_id, note_type, content_id, content_slug, content_title) VALUES (?, ?, ?, ?, ?, ?)").run(aid, nid, nt, cid, cs, ct).lastInsertRowid),
        getApNotes: (aid: number, id = false) => db.prepare(id ? "SELECT * FROM ap_notes WHERE artist_id = ?" : "SELECT * FROM ap_notes WHERE artist_id = ? AND deleted_at IS NULL").all(aid) as any[],
        getApNote: (nid: string) => db.prepare("SELECT * FROM ap_notes WHERE note_id = ?").get(nid) as any,
        markApNoteDeleted: (nid: string) => { db.prepare("UPDATE ap_notes SET deleted_at = CURRENT_TIMESTAMP WHERE note_id = ?").run(nid); },
        deleteApNote: (nid: string) => { db.prepare("DELETE FROM ap_notes WHERE note_id = ?").run(nid); },

        // Remote Content
        getRemoteActor: (u: string) => remoteActorRepository.getRemoteActor(u),
        getRemoteActors: () => remoteActorRepository.getRemoteActors(),
        getFollowedActors: () => remoteActorRepository.getFollowedActors(),
        upsertRemoteActor: (a: any) => { remoteActorRepository.upsertRemoteActor(a); },
        upsertRemoteContent: (c: any) => { remoteContentRepository.upsertRemoteContent(c); },
        getRemoteContent: (id: string) => remoteContentRepository.getRemoteContent(id),
        saveRemoteActor: (a: any) => { remoteActorRepository.saveRemoteActor(a); },
        saveRemotePost: (p: any) => { remoteContentRepository.saveRemotePost(p); },
        deleteRemotePost: (id: string) => { remoteContentRepository.deleteRemotePost(id); },
        deleteRemoteContent: (id: string) => { remoteContentRepository.deleteRemoteContent(id); },

        // Unlock Codes
        createUnlockCode: (c: string, rid?: number, tid?: number, tx?: string) => { db.prepare("INSERT INTO unlock_codes (code, release_id, track_id, tx_hash) VALUES (?, ?, ?, ?)").run(c, rid || null, tid || null, tx || null); },
        validateUnlockCode: (c: string) => { const r = db.prepare("SELECT * FROM unlock_codes WHERE code = ?").get(c) as any; return r ? { valid: true, releaseId: r.release_id, trackId: r.track_id, isUsed: !!r.is_used } : { valid: false, isUsed: false }; },
        redeemUnlockCode: (c: string) => { db.prepare("UPDATE unlock_codes SET is_used = 1, redeemed_at = CURRENT_TIMESTAMP WHERE code = ?").run(c); },
        listUnlockCodes: (rid?: number) => rid ? db.prepare("SELECT * FROM unlock_codes WHERE release_id = ?").all(rid) : db.prepare("SELECT * FROM unlock_codes").all(),
        getUnlockCodeByTxHash: (tx: string) => db.prepare("SELECT * FROM unlock_codes WHERE tx_hash = ?").get(tx),

        // Storage
        getStorageAccounts: (uid?: number) => (uid ? db.prepare("SELECT * FROM storage_accounts WHERE user_id = ?").all(uid) : db.prepare("SELECT * FROM storage_accounts").all()) as any[],
        getStorageAccount: (id: number) => db.prepare("SELECT * FROM storage_accounts WHERE id = ?").get(id) as any,
        getStorageAccountByProvider: (uid: number, p: string) => db.prepare("SELECT * FROM storage_accounts WHERE user_id = ? AND provider = ?").get(uid, p) as any,
        createStorageAccount: (a: any) => Number(db.prepare("INSERT INTO storage_accounts (user_id, provider, account_email, access_token, refresh_token, expiry_date) VALUES (?, ?, ?, ?, ?, ?)").run(a.user_id, a.provider, a.account_email, a.access_token, a.refresh_token, a.expiry_date).lastInsertRowid),
        updateStorageAccount: (id: number, a: any) => { const f = Object.keys(a).map(k => `${k} = ?`).join(", "); db.prepare(`UPDATE storage_accounts SET ${f} WHERE id = ?`).run(...Object.values(a), id); },
        deleteStorageAccount: (id: number) => { db.prepare("DELETE FROM storage_accounts WHERE id = ?").run(id); },
        getPrimaryAdminId: () => { const a = db.prepare("SELECT id FROM admin WHERE role IN ('admin', 'super_user', 'root_admin') ORDER BY id ASC LIMIT 1").get() as any; return a ? a.id : null; },

        // Soulseek
        createSoulseekDownload: (d: any) => Number(db.prepare("INSERT INTO soulseek_downloads (user_id, file_path, filename, status) VALUES (?, ?, ?, ?)").run(d.user_id, d.file_path, d.filename, d.status).lastInsertRowid),
        updateSoulseekDownloadProgress: (id: number, p: number, s?: string, fp?: string) => { db.prepare("UPDATE soulseek_downloads SET progress = ?, status = COALESCE(?, status), file_path = COALESCE(?, file_path) WHERE id = ?").run(p, s || null, fp || null, id); },
        getSoulseekDownloads: (uid?: number) => uid ? db.prepare("SELECT * FROM soulseek_downloads WHERE user_id = ?").all(uid) as any[] : db.prepare("SELECT * FROM soulseek_downloads").all() as any[],
        getSoulseekDownload: (id: number) => db.prepare("SELECT * FROM soulseek_downloads WHERE id = ?").get(id) as any,
        getUserSoulseekCredentials: (uid: number) => db.prepare("SELECT slsk_username as username, slsk_password as password_encrypted FROM admin WHERE id = ?").get(uid) as any,
        updateUserSoulseekCredentials: (uid: number, u?: string, p?: string) => { db.prepare("UPDATE admin SET slsk_username = COALESCE(?, slsk_username), slsk_password = COALESCE(?, slsk_password) WHERE id = ?").run(u || null, p || null, uid); },
        clearFailedSoulseekDownloads: (uid: number) => { db.prepare("DELETE FROM soulseek_downloads WHERE user_id = ? AND status = 'failed'").run(uid); },
        deleteSoulseekDownload: (id: number) => { db.prepare("DELETE FROM soulseek_downloads WHERE id = ?").run(id); },

        // Torrents
        getTorrents: () => db.prepare("SELECT * FROM torrents").all() as any[],
        getTorrent: (h: string) => db.prepare("SELECT * FROM torrents WHERE info_hash = ?").get(h) as any,
        getTorrentsStatus: () => [], 
        createTorrent: (t: any) => { db.prepare("INSERT OR REPLACE INTO torrents (info_hash, magnet_uri, status) VALUES (?, ?, ?)").run(t.info_hash, t.magnet_uri, t.status || 'metadata'); },
        updateTorrentProgress: (ih: string, p: number, s: any, ds: number, us: number, np: number, sz: number, path: string | null) => { db.prepare("UPDATE torrents SET progress = ?, status = ?, download_speed = ?, upload_speed = ?, num_peers = ?, size = ?, path = ? WHERE info_hash = ?").run(p, s, ds, us, np, sz, path, ih); },
        updateTorrentStatus: (ih: string, s: any) => { db.prepare("UPDATE torrents SET status = ? WHERE info_hash = ?").run(s, ih); },
        deleteTorrent: (h: string) => { db.prepare("DELETE FROM torrents WHERE info_hash = ?").run(h); },

        // Gun Cache
        getGunCache: (k: string) => db.prepare("SELECT * FROM gun_cache WHERE key = ?").get(k) as any,
        setGunCache: (k: string, v: string, t: string, ttl: number) => { db.prepare("INSERT OR REPLACE INTO gun_cache (key, value, type, expires_at) VALUES (?, ?, ?, ?)").run(k, v, t, Date.now() + ttl * 1000); },
        clearExpiredGunCache: () => { db.prepare("DELETE FROM gun_cache WHERE expires_at < ?").run(Date.now()); },

        // Settings
        getSetting: (k: string) => (db.prepare("SELECT value FROM settings WHERE key = ?").get(k) as any)?.value,
        setSetting: (k: string, v: string) => { db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(k, v); },
        getAllSettings: () => { const rows = db.prepare("SELECT * FROM settings").all() as any[]; const s: any = {}; rows.forEach(r => s[r.key] = r.value); return s; },

        // Plugins
        getPluginState: (id: string) => { const r = db.prepare("SELECT enabled, config FROM system_plugins WHERE id = ?").get(id) as any; return r ? { enabled: !!r.enabled, config: r.config } : undefined; },
        setPluginEnabled: (id: string, e: boolean) => { db.prepare("INSERT OR REPLACE INTO system_plugins (id, enabled) VALUES (?, ?)").run(id, e ? 1 : 0); },
        setPluginConfig(id: string, config: string) { db.prepare("UPDATE system_plugins SET config = ? WHERE id = ?").run(config, id); },
        getAllPluginsState: () => db.prepare("SELECT * FROM system_plugins").all(),

        // Search
        search: (q: string, p?: VisibilityProfile | ViewerContext) => ({ 
            artists: artistRepository.getAll(p).filter(a => a.name.toLowerCase().includes(q.toLowerCase())), 
            albums: albumRepository.search(q, 10, p), 
            tracks: trackRepository.getAll(p).filter(t => t.title.toLowerCase().includes(q.toLowerCase())) 
        }),

        // Maintenance
        getTracksMissingMetadata: (f: any) => trackRepository.getMissingMetadata(f),
        getAlbumsMissingMetadata: (f: any) => albumRepository.getMissingMetadata(f),
        getArtistsMissingMetadata: (f: any) => artistRepository.getMissingMetadata(f)
    };

    return service;
}
