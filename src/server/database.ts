import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";

export interface Artist {
    id: number;
    name: string;
    bio: string | null;
    photo_path: string | null;
    created_at: string;
}

export interface Album {
    id: number;
    title: string;
    artist_id: number | null;
    artist_name?: string;
    date: string | null;
    cover_path: string | null;
    genre: string | null;
    description: string | null;
    is_public: boolean;
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
    created_at: string;
}

export interface Playlist {
    id: number;
    name: string;
    description: string | null;
    created_at: string;
}

export interface DatabaseService {
    db: DatabaseType;
    // Artists
    getArtists(): Artist[];
    getArtist(id: number): Artist | undefined;
    getArtistByName(name: string): Artist | undefined;
    createArtist(name: string, bio?: string, photoPath?: string): number;
    // Albums
    getAlbums(publicOnly?: boolean): Album[];
    getAlbum(id: number): Album | undefined;
    getAlbumByTitle(title: string, artistId?: number): Album | undefined;
    getAlbumsByArtist(artistId: number, publicOnly?: boolean): Album[];
    createAlbum(album: Omit<Album, "id" | "created_at" | "artist_name">): number;
    updateAlbumVisibility(id: number, isPublic: boolean): void;
    // Tracks
    getTracks(albumId?: number): Track[];
    getTrack(id: number): Track | undefined;
    getTrackByPath(filePath: string): Track | undefined;
    createTrack(track: Omit<Track, "id" | "created_at" | "album_title" | "artist_name">): number;
    updateTrackAlbum(id: number, albumId: number | null): void;
    deleteTrack(id: number): void;
    // Playlists
    getPlaylists(): Playlist[];
    getPlaylist(id: number): Playlist | undefined;
    createPlaylist(name: string, description?: string): number;
    deletePlaylist(id: number): void;
    getPlaylistTracks(playlistId: number): Track[];
    addTrackToPlaylist(playlistId: number, trackId: number): void;
    removeTrackFromPlaylist(playlistId: number, trackId: number): void;
    // Stats
    getStats(): { artists: number; albums: number; tracks: number; publicAlbums: number };
    // Search
    search(query: string, publicOnly?: boolean): { artists: Artist[]; albums: Album[]; tracks: Track[] };
}

export function createDatabase(dbPath: string): DatabaseService {
    const db = new Database(dbPath);

    // Enable WAL mode for better concurrency
    db.pragma("journal_mode = WAL");

    // Create tables
    db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      bio TEXT,
      photo_path TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist_id INTEGER REFERENCES artists(id),
      date TEXT,
      cover_path TEXT,
      genre TEXT,
      description TEXT,
      is_public INTEGER DEFAULT 0,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
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
  `);

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

        createArtist(name: string, bio?: string, photoPath?: string): number {
            const result = db
                .prepare("INSERT INTO artists (name, bio, photo_path) VALUES (?, ?, ?)")
                .run(name, bio || null, photoPath || null);
            return result.lastInsertRowid as number;
        },

        // Albums
        getAlbums(publicOnly = false): Album[] {
            const sql = publicOnly
                ? `SELECT a.*, ar.name as artist_name FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.is_public = 1 ORDER BY a.date DESC`
                : `SELECT a.*, ar.name as artist_name FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           ORDER BY a.date DESC`;
            return db.prepare(sql).all() as Album[];
        },

        getAlbum(id: number): Album | undefined {
            return db
                .prepare(
                    `SELECT a.*, ar.name as artist_name FROM albums a 
           LEFT JOIN artists ar ON a.artist_id = ar.id 
           WHERE a.id = ?`
                )
                .get(id) as Album | undefined;
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

        createAlbum(album: Omit<Album, "id" | "created_at" | "artist_name">): number {
            const result = db
                .prepare(
                    `INSERT INTO albums (title, artist_id, date, cover_path, genre, description, is_public, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
                )
                .run(
                    album.title,
                    album.artist_id,
                    album.date,
                    album.cover_path,
                    album.genre,
                    album.description,
                    album.is_public ? 1 : 0,
                    album.published_at
                );
            return result.lastInsertRowid as number;
        },

        updateAlbumVisibility(id: number, isPublic: boolean): void {
            const publishedAt = isPublic ? new Date().toISOString() : null;
            db.prepare(
                "UPDATE albums SET is_public = ?, published_at = ? WHERE id = ?"
            ).run(isPublic ? 1 : 0, publishedAt, id);
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

        deleteTrack(id: number): void {
            db.prepare("DELETE FROM tracks WHERE id = ?").run(id);
        },

        // Playlists
        getPlaylists(): Playlist[] {
            return db.prepare("SELECT * FROM playlists ORDER BY name").all() as Playlist[];
        },

        getPlaylist(id: number): Playlist | undefined {
            return db.prepare("SELECT * FROM playlists WHERE id = ?").get(id) as Playlist | undefined;
        },

        createPlaylist(name: string, description?: string): number {
            const result = db
                .prepare("INSERT INTO playlists (name, description) VALUES (?, ?)")
                .run(name, description || null);
            return result.lastInsertRowid as number;
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
    };
}
