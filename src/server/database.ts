import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";

export interface Artist {
    id: number;
    name: string;
    slug: string;
    bio: string | null;
    photo_path: string | null;
    links: string | null;  // JSON string of links
    public_key: string | null;
    private_key: string | null;
    created_at: string;
}

export interface Follower {
    id: number;
    artist_id: number;
    actor_uri: string;
    inbox_uri: string;
    shared_inbox_uri: string | null;
    created_at: string;
}

export interface Album {
    id: number;
    title: string;
    slug: string;
    artist_id: number | null;
    artist_name?: string;
    artist_slug?: string;
    date: string | null;
    cover_path: string | null;
    genre: string | null;
    description: string | null;
    download: string | null; // 'free' | 'paid' | null
    external_links: string | null; // JSON string of ExternalLink[]
    is_public: boolean;
    is_release: boolean; // true = published release, false = library album
    published_at: string | null;
    created_at: string;
}

export interface Track {
    id: number;
    title: string;
    album_id: number | null;
    album_title?: string;
    artist_id: number | null;
    artist_name?: string;
    track_num: number | null;
    duration: number | null;
    file_path: string;
    format: string | null;
    bitrate: number | null;
    sample_rate: number | null;
    waveform: string | null; // JSON string of number[]
    created_at: string;
}

export interface Playlist {
    id: number;
    name: string;
    description: string | null;
    is_public: boolean;
    created_at: string;
}

export interface PlayHistoryEntry {
    id: number;
    track_id: number;
    track_title: string;
    artist_name: string | null;
    album_title: string | null;
    played_at: string;
}

export interface TrackWithPlayCount extends Track {
    play_count: number;
}

export interface ArtistWithPlayCount extends Artist {
    play_count: number;
}

export interface ListeningStats {
    totalPlays: number;
    totalListeningTime: number; // in seconds
    uniqueTracks: number;
    playsToday: number;
    playsThisWeek: number;
    playsThisMonth: number;
}

export interface DatabaseService {
    db: DatabaseType;
    // Artists
    getArtists(): Artist[];
    getArtist(id: number): Artist | undefined;
    getArtistByName(name: string): Artist | undefined;
    getArtistBySlug(slug: string): Artist | undefined;
    createArtist(name: string, bio?: string, photoPath?: string, links?: any): number;
    updateArtist(id: number, bio?: string, photoPath?: string, links?: any): void;
    updateArtistKeys(id: number, publicKey: string, privateKey: string): void;
    deleteArtist(id: number): void;
    // Followers
    addFollower(artistId: number, actorUri: string, inboxUri: string, sharedInboxUri?: string): void;
    removeFollower(artistId: number, actorUri: string): void;
    getFollowers(artistId: number): Follower[];
    getFollower(artistId: number, actorUri: string): Follower | undefined;
    // Albums
    getAlbums(publicOnly?: boolean): Album[];
    getReleases(publicOnly?: boolean): Album[]; // is_release=1
    getLibraryAlbums(): Album[]; // is_release=0
    getAlbum(id: number): Album | undefined;
    getAlbumBySlug(slug: string): Album | undefined;
    getAlbumByTitle(title: string, artistId?: number): Album | undefined;
    getAlbumsByArtist(artistId: number, publicOnly?: boolean): Album[];
    createAlbum(album: Omit<Album, "id" | "created_at" | "artist_name" | "artist_slug">): number;
    updateAlbumVisibility(id: number, isPublic: boolean): void;
    updateAlbumArtist(id: number, artistId: number): void;
    updateAlbumTitle(id: number, title: string): void;
    updateAlbumCover(id: number, coverPath: string): void;
    updateAlbumDownload(id: number, download: string | null): void;
    updateAlbumLinks(id: number, links: string | null): void;
    promoteToRelease(id: number): void; // Mark library album as release
    deleteAlbum(id: number, keepTracks?: boolean): void;
    // Tracks
    getTracks(albumId?: number): Track[];
    getTrack(id: number): Track | undefined;
    getTrackByPath(filePath: string): Track | undefined;
    createTrack(track: Omit<Track, "id" | "created_at" | "album_title" | "artist_name">): number;
    updateTrackAlbum(id: number, albumId: number | null): void;
    updateTrackArtist(id: number, artistId: number | null): void;
    updateTrackTitle(id: number, title: string): void;
    updateTrackPath(id: number, filePath: string, albumId: number): void;
    updateTrackDuration(id: number, duration: number): void;
    updateTrackWaveform(id: number, waveform: string): void;
    deleteTrack(id: number): void;
    // Playlists
    getPlaylists(publicOnly?: boolean): Playlist[];
    getPlaylist(id: number): Playlist | undefined;
    createPlaylist(name: string, description?: string, isPublic?: boolean): number;
    updatePlaylistVisibility(id: number, isPublic: boolean): void;
    deletePlaylist(id: number): void;
    getPlaylistTracks(playlistId: number): Track[];
    addTrackToPlaylist(playlistId: number, trackId: number): void;
    removeTrackFromPlaylist(playlistId: number, trackId: number): void;
    // Stats
    getStats(): { artists: number; albums: number; tracks: number; publicAlbums: number };
    // Play History
    recordPlay(trackId: number): void;
    getRecentPlays(limit?: number): PlayHistoryEntry[];
    getTopTracks(limit?: number, days?: number): TrackWithPlayCount[];
    getTopArtists(limit?: number, days?: number): ArtistWithPlayCount[];
    getListeningStats(): ListeningStats;
    // Search
    search(query: string, publicOnly?: boolean): { artists: Artist[]; albums: Album[]; tracks: Track[] };
    // Settings
    getSetting(key: string): string | undefined;
    setSetting(key: string, value: string): void;
    getAllSettings(): { [key: string]: string };

    // Unlock Codes
    createUnlockCode(code: string, releaseId?: number): void;
    validateUnlockCode(code: string): { valid: boolean; releaseId?: number; isUsed: boolean };
    redeemUnlockCode(code: string): void;
    listUnlockCodes(releaseId?: number): any[];
}

export function createDatabase(dbPath: string): DatabaseService {
    const db = new Database(dbPath);

    // Enable WAL mode for better concurrency
    db.pragma("journal_mode = WAL");

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

    // Create tables
    db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      bio TEXT,
      photo_path TEXT,
      links TEXT,
      photo_path TEXT,
      links TEXT,
      public_key TEXT,
      private_key TEXT,
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

    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      artist_id INTEGER REFERENCES artists(id),
      date TEXT,
      cover_path TEXT,
      genre TEXT,
      description TEXT,
      download TEXT,
      external_links TEXT,
      is_public INTEGER DEFAULT 0,
      is_release INTEGER DEFAULT 0,
      published_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      album_id INTEGER REFERENCES albums(id),
      artist_id INTEGER REFERENCES artists(id),
      track_num INTEGER,
      duration REAL,
      file_path TEXT NOT NULL UNIQUE,
      format TEXT,
      bitrate INTEGER,
      sample_rate INTEGER,
      waveform TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      is_public INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
      track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
      position INTEGER,
      PRIMARY KEY (playlist_id, track_id)
    );

    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
      played_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist_id);
    CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
    CREATE INDEX IF NOT EXISTS idx_albums_public ON albums(is_public);
    CREATE INDEX IF NOT EXISTS idx_albums_release ON albums(is_release);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS unlock_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      release_id INTEGER REFERENCES albums(id),
      is_used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      redeemed_at TEXT
    );
  `);

    // Migration: Add is_release column if it doesn't exist
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN is_release INTEGER DEFAULT 0`);
        console.log("📦 Migrated database: added is_release column");
    } catch (e) {
        // Column already exists, ignore
    }

    // Migration: Add download column if it doesn't exist
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN download TEXT`);
        console.log("📦 Migrated database: added download column");
    } catch (e) {
        // Column already exists, ignore
    }

    // Migration: Add external_links column if it doesn't exist
    try {
        db.exec(`ALTER TABLE albums ADD COLUMN external_links TEXT`);
        console.log("📦 Migrated database: added external_links column");
    } catch (e) {
        // Column already exists, ignore
    }

    // Migration: Add waveform column to tracks
    try {
        db.exec(`ALTER TABLE tracks ADD COLUMN waveform TEXT`);
        console.log("📦 Migrated database: added waveform column");
    } catch (e) {
        // Column already exists, ignore
    }

    // Migration: Add is_public column to playlists if it doesn't exist
    try {
        db.exec(`ALTER TABLE playlists ADD COLUMN is_public INTEGER DEFAULT 0`);
        console.log("📦 Migrated database: added is_public column to playlists");
    } catch (e) {
        // Column already exists, ignore
    }

    // Migration: Add keys to artists
    try {
        db.exec(`ALTER TABLE artists ADD COLUMN public_key TEXT`);
        db.exec(`ALTER TABLE artists ADD COLUMN private_key TEXT`);
        console.log("📦 Migrated database: added keys to artists");
    } catch (e) {
        // Column already exists
    }

    return {
        db,

        // Artists
        getArtists(): Artist[] {
            return db.prepare("SELECT * FROM artists ORDER BY name").all() as Artist[];
        },

        getArtist(id: number): Artist | undefined {
            return db.prepare("SELECT * FROM artists WHERE id = ?").get(id) as Artist | undefined;
        },

        getArtistByName(name: string): Artist | undefined {
            return db.prepare("SELECT * FROM artists WHERE name = ?").get(name) as Artist | undefined;
        },

        getArtistBySlug(slug: string): Artist | undefined {
            return db.prepare("SELECT * FROM artists WHERE slug = ?").get(slug) as Artist | undefined;
        },

        createArtist(name: string, bio?: string, photoPath?: string, links?: any): number {
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const linksJson = links ? JSON.stringify(links) : null;

            // Try to insert, if slug exists add a number suffix
            let finalSlug = slug;
            let attempt = 0;
            while (attempt < 100) {
                try {
                    const result = db
                        .prepare("INSERT INTO artists (name, slug, bio, photo_path, links) VALUES (?, ?, ?, ?, ?)")
                        .run(name, finalSlug, bio || null, photoPath || null, linksJson);
                    return result.lastInsertRowid as number;
                } catch (e: any) {
                    if (e.code === "SQLITE_CONSTRAINT_UNIQUE" && e.message.includes("slug")) {
                        attempt++;
                        finalSlug = `${slug}-${attempt}`;
                    } else {
                        throw e;
                    }
                }
            }
            throw new Error("Could not create unique slug for artist");
        },

        updateArtist(id: number, bio?: string, photoPath?: string, links?: any): void {
            const linksJson = links ? JSON.stringify(links) : null;
            db.prepare("UPDATE artists SET bio = ?, photo_path = ?, links = ? WHERE id = ?")
                .run(bio || null, photoPath || null, linksJson, id);
        },

        updateArtistKeys(id: number, publicKey: string, privateKey: string): void {
            db.prepare("UPDATE artists SET public_key = ?, private_key = ? WHERE id = ?")
                .run(publicKey, privateKey, id);
        },

        deleteArtist(id: number): void {
            // Unlink from albums
            db.prepare("UPDATE albums SET artist_id = NULL WHERE artist_id = ?").run(id);
            // Unlink from tracks
            db.prepare("UPDATE tracks SET artist_id = NULL WHERE artist_id = ?").run(id);
            // Delete followers
            db.prepare("DELETE FROM followers WHERE artist_id = ?").run(id);
            // Delete artist
            db.prepare("DELETE FROM artists WHERE id = ?").run(id);
        },

        // Followers
        addFollower(artistId: number, actorUri: string, inboxUri: string, sharedInboxUri?: string): void {
            db.prepare(
                "INSERT OR IGNORE INTO followers (artist_id, actor_uri, inbox_uri, shared_inbox_uri) VALUES (?, ?, ?, ?)"
            ).run(artistId, actorUri, inboxUri, sharedInboxUri || null);
        },

        removeFollower(artistId: number, actorUri: string): void {
            db.prepare("DELETE FROM followers WHERE artist_id = ? AND actor_uri = ?").run(artistId, actorUri);
        },

        getFollowers(artistId: number): Follower[] {
            return db.prepare("SELECT * FROM followers WHERE artist_id = ?").all(artistId) as Follower[];
        },

        getFollower(artistId: number, actorUri: string): Follower | undefined {
            return db.prepare("SELECT * FROM followers WHERE artist_id = ? AND actor_uri = ?").get(artistId, actorUri) as Follower | undefined;
        },

        // Albums
        getAlbums(publicOnly = false): Album[] {
            const sql = publicOnly
                ? `SELECT a.*, ar.name as artist_name, ar.slug as artist_slug FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.is_public = 1 ORDER BY a.date DESC`
                : `SELECT a.*, ar.name as artist_name, ar.slug as artist_slug FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           ORDER BY a.date DESC`;
            return db.prepare(sql).all() as Album[];
        },

        getReleases(publicOnly = false): Album[] {
            const sql = publicOnly
                ? `SELECT a.*, ar.name as artist_name, ar.slug as artist_slug FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.is_release = 1 AND a.is_public = 1 ORDER BY a.date DESC`
                : `SELECT a.*, ar.name as artist_name, ar.slug as artist_slug FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.is_release = 1 ORDER BY a.date DESC`;
            return db.prepare(sql).all() as Album[];
        },

        getLibraryAlbums(): Album[] {
            return db.prepare(
                `SELECT a.*, ar.name as artist_name, ar.slug as artist_slug FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.is_release = 0 ORDER BY a.title`
            ).all() as Album[];
        },


        getAlbum(id: number): Album | undefined {
            return db
                .prepare(
                    `SELECT a.*, ar.name as artist_name, ar.slug as artist_slug FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.id = ?`
                )
                .get(id) as Album | undefined;
        },

        getAlbumBySlug(slug: string): Album | undefined {
            return db
                .prepare(
                    `SELECT a.*, ar.name as artist_name, ar.slug as artist_slug FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.slug = ?`
                )
                .get(slug) as Album | undefined;
        },

        getAlbumByTitle(title: string, artistId?: number): Album | undefined {
            if (artistId) {
                return db
                    .prepare("SELECT * FROM albums WHERE title = ? AND artist_id = ?")
                    .get(title, artistId) as Album | undefined;
            }
            return db
                .prepare("SELECT * FROM albums WHERE title = ?")
                .get(title) as Album | undefined;
        },

        getAlbumsByArtist(artistId: number, publicOnly = false): Album[] {
            const sql = publicOnly
                ? "SELECT * FROM albums WHERE artist_id = ? AND is_public = 1 ORDER BY date DESC"
                : "SELECT * FROM albums WHERE artist_id = ? ORDER BY date DESC";
            return db.prepare(sql).all(artistId) as Album[];
        },

        createAlbum(album: Omit<Album, "id" | "created_at" | "artist_name" | "artist_slug">): number {
            const slug = album.slug || album.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

            // Try to insert, if slug exists add a number suffix
            let finalSlug = slug;
            let attempt = 0;
            while (attempt < 100) {
                try {
                    const result = db
                        .prepare(
                            `INSERT INTO albums (title, slug, artist_id, date, cover_path, genre, description, download, external_links, is_public, is_release, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                        )
                        .run(
                            album.title,
                            finalSlug,
                            album.artist_id,
                            album.date,
                            album.cover_path,
                            album.genre,
                            album.description,
                            album.download,
                            album.external_links,
                            album.is_public ? 1 : 0,
                            album.is_release ? 1 : 0,
                            album.published_at
                        );
                    return result.lastInsertRowid as number;
                } catch (e: any) {
                    if (e.code === "SQLITE_CONSTRAINT_UNIQUE" && e.message.includes("slug")) {
                        attempt++;
                        finalSlug = `${slug}-${attempt}`;
                    } else {
                        throw e;
                    }
                }
            }
            throw new Error("Could not create unique slug for album");
        },

        updateAlbumVisibility(id: number, isPublic: boolean): void {
            const publishedAt = isPublic ? new Date().toISOString() : null;
            db.prepare(
                "UPDATE albums SET is_public = ?, published_at = ? WHERE id = ?"
            ).run(isPublic ? 1 : 0, publishedAt, id);
        },

        updateAlbumArtist(id: number, artistId: number): void {
            db.prepare("UPDATE albums SET artist_id = ? WHERE id = ?").run(artistId, id);
        },

        updateAlbumTitle(id: number, title: string): void {
            // Also update slug to match scanner behavior
            const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            // Handle uniqueness collision? 
            // If another album has this slug, we might fail constraint. 
            // Ideally we try-catch or check first.
            // For now, let's try direct update. 
            // If it fails, the user will get an error, which is better than silent failure.
            db.prepare("UPDATE albums SET title = ?, slug = ? WHERE id = ?").run(title, slug, id);
        },

        updateAlbumCover(id: number, coverPath: string): void {
            db.prepare("UPDATE albums SET cover_path = ? WHERE id = ?").run(coverPath, id);
        },

        updateAlbumDownload(id: number, download: string | null): void {
            db.prepare("UPDATE albums SET download = ? WHERE id = ?").run(download, id);
        },

        updateAlbumLinks(id: number, links: string | null): void {
            db.prepare("UPDATE albums SET external_links = ? WHERE id = ?").run(links, id);
        },

        promoteToRelease(id: number): void {
            db.prepare("UPDATE albums SET is_release = 1 WHERE id = ?").run(id);
        },

        deleteAlbum(id: number, keepTracks = false): void {
            if (keepTracks) {
                // Determine if we should unlink tracks or just nullify album_id
                // For now, nullify album_id (move to loose tracks)
                db.prepare("UPDATE tracks SET album_id = NULL WHERE album_id = ?").run(id);
            } else {
                // First delete associated tracks
                db.prepare("DELETE FROM tracks WHERE album_id = ?").run(id);
            }
            // Then delete the album
            db.prepare("DELETE FROM albums WHERE id = ?").run(id);
        },

        // Tracks
        getTracks(albumId?: number): Track[] {
            if (albumId) {
                return db
                    .prepare(
                        `SELECT t.*, a.title as album_title, ar.name as artist_name 
             FROM tracks t
             LEFT JOIN albums a ON t.album_id = a.id
             LEFT JOIN artists ar ON t.artist_id = ar.id
             WHERE t.album_id = ? ORDER BY t.track_num`
                    )
                    .all(albumId) as Track[];
            }
            return db
                .prepare(
                    `SELECT t.*, a.title as album_title, ar.name as artist_name 
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar ON t.artist_id = ar.id
           ORDER BY ar.name, a.title, t.track_num`
                )
                .all() as Track[];
        },

        getTrack(id: number): Track | undefined {
            return db
                .prepare(
                    `SELECT t.*, a.title as album_title, ar.name as artist_name 
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar ON t.artist_id = ar.id
           WHERE t.id = ?`
                )
                .get(id) as Track | undefined;
        },

        getTrackByPath(filePath: string): Track | undefined {
            return db
                .prepare("SELECT * FROM tracks WHERE file_path = ?")
                .get(filePath) as Track | undefined;
        },

        createTrack(track: Omit<Track, "id" | "created_at" | "album_title" | "artist_name">): number {
            const result = db
                .prepare(
                    `INSERT INTO tracks (title, album_id, artist_id, track_num, duration, file_path, format, bitrate, sample_rate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
                )
                .run(
                    track.title,
                    track.album_id,
                    track.artist_id,
                    track.track_num,
                    track.duration,
                    track.file_path,
                    track.format,
                    track.bitrate,
                    track.sample_rate
                );
            return result.lastInsertRowid as number;
        },

        updateTrackAlbum(id: number, albumId: number | null): void {
            db.prepare("UPDATE tracks SET album_id = ? WHERE id = ?").run(albumId, id);
        },

        updateTrackArtist(id: number, artistId: number | null): void {
            db.prepare("UPDATE tracks SET artist_id = ? WHERE id = ?").run(artistId, id);
        },

        updateTrackTitle(id: number, title: string): void {
            db.prepare("UPDATE tracks SET title = ? WHERE id = ?").run(title, id);
        },

        updateTrackPath(id: number, filePath: string, albumId: number): void {
            db.prepare("UPDATE tracks SET file_path = ?, album_id = ? WHERE id = ?").run(filePath, albumId, id);
        },

        updateTrackDuration(id: number, duration: number): void {
            db.prepare("UPDATE tracks SET duration = ? WHERE id = ?").run(duration, id);
        },

        updateTrackWaveform(id: number, waveform: string): void {
            db.prepare("UPDATE tracks SET waveform = ? WHERE id = ?").run(waveform, id);
        },

        deleteTrack(id: number): void {
            db.prepare("DELETE FROM tracks WHERE id = ?").run(id);
        },

        // Playlists

        getPlaylists(publicOnly = false): Playlist[] {
            const sql = publicOnly
                ? "SELECT * FROM playlists WHERE is_public = 1 ORDER BY name"
                : "SELECT * FROM playlists ORDER BY name";
            return db.prepare(sql).all() as Playlist[];
        },

        getPlaylist(id: number): Playlist | undefined {
            return db.prepare("SELECT * FROM playlists WHERE id = ?").get(id) as Playlist | undefined;
        },

        createPlaylist(name: string, description?: string, isPublic = false): number {
            const result = db
                .prepare("INSERT INTO playlists (name, description, is_public) VALUES (?, ?, ?)")
                .run(name, description || null, isPublic ? 1 : 0);
            return result.lastInsertRowid as number;
        },

        updatePlaylistVisibility(id: number, isPublic: boolean): void {
            db.prepare("UPDATE playlists SET is_public = ? WHERE id = ?").run(isPublic ? 1 : 0, id);
        },

        deletePlaylist(id: number): void {
            db.prepare("DELETE FROM playlists WHERE id = ?").run(id);
        },

        getPlaylistTracks(playlistId: number): Track[] {
            return db
                .prepare(
                    `SELECT t.*, a.title as album_title, ar.name as artist_name 
           FROM tracks t
           JOIN playlist_tracks pt ON t.id = pt.track_id
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar ON t.artist_id = ar.id
           WHERE pt.playlist_id = ?
           ORDER BY pt.position`
                )
                .all(playlistId) as Track[];
        },

        addTrackToPlaylist(playlistId: number, trackId: number): void {
            const maxPos = db
                .prepare("SELECT MAX(position) as max FROM playlist_tracks WHERE playlist_id = ?")
                .get(playlistId) as { max: number | null };
            const position = (maxPos?.max || 0) + 1;
            db.prepare(
                "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)"
            ).run(playlistId, trackId, position);
        },

        removeTrackFromPlaylist(playlistId: number, trackId: number): void {
            db.prepare(
                "DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?"
            ).run(playlistId, trackId);
        },

        // Stats
        getStats() {
            const artists = (db.prepare("SELECT COUNT(*) as count FROM artists").get() as { count: number }).count;
            const albums = (db.prepare("SELECT COUNT(*) as count FROM albums").get() as { count: number }).count;
            const tracks = (db.prepare("SELECT COUNT(*) as count FROM tracks").get() as { count: number }).count;
            const publicAlbums = (db.prepare("SELECT COUNT(*) as count FROM albums WHERE is_public = 1").get() as { count: number }).count;
            return { artists, albums, tracks, publicAlbums };
        },

        // Search
        search(query: string, publicOnly = false) {
            const likeQuery = `%${query}%`;

            const artists = db
                .prepare("SELECT * FROM artists WHERE name LIKE ?")
                .all(likeQuery) as Artist[];

            const albumsSql = publicOnly
                ? `SELECT a.*, ar.name as artist_name FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.is_public = 1 AND (a.title LIKE ? OR ar.name LIKE ?)`
                : `SELECT a.*, ar.name as artist_name FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.title LIKE ? OR ar.name LIKE ?`;
            const albums = db.prepare(albumsSql).all(likeQuery, likeQuery) as Album[];

            const tracksSql = publicOnly
                ? `SELECT t.*, a.title as album_title, ar.name as artist_name 
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar ON t.artist_id = ar.id
           WHERE a.is_public = 1 AND (t.title LIKE ? OR ar.name LIKE ?)`
                : `SELECT t.*, a.title as album_title, ar.name as artist_name 
           FROM tracks t
           LEFT JOIN albums a ON t.album_id = a.id
           LEFT JOIN artists ar ON t.artist_id = ar.id
           WHERE t.title LIKE ? OR ar.name LIKE ?`;
            const tracks = db.prepare(tracksSql).all(likeQuery, likeQuery) as Track[];

            return { artists, albums, tracks };
        },

        // Settings
        getSetting(key: string): string | undefined {
            const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
            return row?.value;
        },

        setSetting(key: string, value: string): void {
            db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
        },

        getAllSettings(): { [key: string]: string } {
            const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
            const settings: { [key: string]: string } = {};
            for (const row of rows) {
                settings[row.key] = row.value;
            }
            return settings;
        },

        // Play History
        recordPlay(trackId: number): void {
            db.prepare("INSERT INTO play_history (track_id) VALUES (?)").run(trackId);
        },

        getRecentPlays(limit = 50): PlayHistoryEntry[] {
            return db.prepare(`
                SELECT 
                    ph.id,
                    ph.track_id,
                    t.title as track_title,
                    ar.name as artist_name,
                    al.title as album_title,
                    ph.played_at
                FROM play_history ph
                LEFT JOIN tracks t ON ph.track_id = t.id
                LEFT JOIN artists ar ON t.artist_id = ar.id
                LEFT JOIN albums al ON t.album_id = al.id
                ORDER BY ph.played_at DESC
                LIMIT ?
            `).all(limit) as PlayHistoryEntry[];
        },

        getTopTracks(limit = 20, days = 30): TrackWithPlayCount[] {
            const dateLimit = new Date();
            dateLimit.setDate(dateLimit.getDate() - days);
            const dateStr = dateLimit.toISOString();

            return db.prepare(`
                SELECT 
                    t.*,
                    al.title as album_title,
                    ar.name as artist_name,
                    COUNT(ph.id) as play_count
                FROM tracks t
                LEFT JOIN play_history ph ON ph.track_id = t.id AND ph.played_at >= ?
                LEFT JOIN albums al ON t.album_id = al.id
                LEFT JOIN artists ar ON t.artist_id = ar.id
                GROUP BY t.id
                HAVING play_count > 0
                ORDER BY play_count DESC
                LIMIT ?
            `).all(dateStr, limit) as TrackWithPlayCount[];
        },

        getTopArtists(limit = 10, days = 30): ArtistWithPlayCount[] {
            const dateLimit = new Date();
            dateLimit.setDate(dateLimit.getDate() - days);
            const dateStr = dateLimit.toISOString();

            return db.prepare(`
                SELECT 
                    ar.*,
                    COUNT(ph.id) as play_count
                FROM artists ar
                LEFT JOIN tracks t ON t.artist_id = ar.id
                LEFT JOIN play_history ph ON ph.track_id = t.id AND ph.played_at >= ?
                GROUP BY ar.id
                HAVING play_count > 0
                ORDER BY play_count DESC
                LIMIT ?
            `).all(dateStr, limit) as ArtistWithPlayCount[];
        },

        getListeningStats(): ListeningStats {
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

            const totalPlays = (db.prepare("SELECT COUNT(*) as count FROM play_history").get() as { count: number }).count;
            const uniqueTracks = (db.prepare("SELECT COUNT(DISTINCT track_id) as count FROM play_history").get() as { count: number }).count;
            const playsToday = (db.prepare("SELECT COUNT(*) as count FROM play_history WHERE played_at >= ?").get(todayStart) as { count: number }).count;
            const playsThisWeek = (db.prepare("SELECT COUNT(*) as count FROM play_history WHERE played_at >= ?").get(weekStart) as { count: number }).count;
            const playsThisMonth = (db.prepare("SELECT COUNT(*) as count FROM play_history WHERE played_at >= ?").get(monthStart) as { count: number }).count;

            // Estimate listening time from track durations
            const listeningTime = (db.prepare(`
                SELECT COALESCE(SUM(t.duration), 0) as total_seconds
                FROM play_history ph
                LEFT JOIN tracks t ON ph.track_id = t.id
            `).get() as { total_seconds: number }).total_seconds;

            return {
                totalPlays,
                totalListeningTime: Math.round(listeningTime),
                uniqueTracks,
                playsToday,
                playsThisWeek,
                playsThisMonth,
            };
        },

        // Unlock Codes
        createUnlockCode(code: string, releaseId?: number): void {
            db.prepare("INSERT INTO unlock_codes (code, release_id) VALUES (?, ?)").run(code, releaseId || null);
        },

        validateUnlockCode(code: string): { valid: boolean; releaseId?: number; isUsed: boolean } {
            const row = db.prepare("SELECT * FROM unlock_codes WHERE code = ?").get(code) as any;
            if (!row) return { valid: false, isUsed: false };
            return { valid: true, releaseId: row.release_id, isUsed: !!row.is_used };
        },

        redeemUnlockCode(code: string): void {
            db.prepare("UPDATE unlock_codes SET is_used = 1, redeemed_at = CURRENT_TIMESTAMP WHERE code = ?").run(code);
        },

        listUnlockCodes(releaseId?: number): any[] {
            if (releaseId) {
                return db.prepare("SELECT * FROM unlock_codes WHERE release_id = ? ORDER BY created_at DESC").all(releaseId);
            }
            return db.prepare("SELECT * FROM unlock_codes ORDER BY created_at DESC").all();
        },
    };
}
