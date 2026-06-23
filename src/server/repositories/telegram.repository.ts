import type { Database } from "better-sqlite3";

export interface TelegramStats {
    artists: number;
    tracks: number;
    albums: number;
    releases: number;
}

export interface TelegramRecentTrack {
    title: string;
    artist_name: string;
}

export class TelegramRepository {
    constructor(private db: Database) {}

    public getRecentArtists(limit: number = 50): { name: string }[] {
        return this.db.prepare("SELECT name FROM artists ORDER BY name ASC LIMIT ?").all(limit) as { name: string }[];
    }

    public getRecentAlbums(limit: number = 50): { title: string, artist_name: string }[] {
        return this.db.prepare(`
            SELECT a.title, ar.name as artist_name 
            FROM albums a 
            LEFT JOIN artists ar ON a.artist_id = ar.id 
            WHERE a.is_release = 0 
            ORDER BY a.id DESC LIMIT ?
        `).all(limit) as { title: string, artist_name: string }[];
    }

    public getRecentReleases(limit: number = 50): { title: string, artist_name: string }[] {
        return this.db.prepare(`
            SELECT r.title, ar.name as artist_name 
            FROM releases r 
            LEFT JOIN artists ar ON r.artist_id = ar.id 
            ORDER BY r.id DESC LIMIT ?
        `).all(limit) as { title: string, artist_name: string }[];
    }

    public getDatabaseStats(): TelegramStats {
        const artists = this.db.prepare("SELECT COUNT(*) as count FROM artists").get() as { count: number };
        const tracks = this.db.prepare("SELECT COUNT(*) as count FROM tracks").get() as { count: number };
        const albums = this.db.prepare("SELECT COUNT(*) as count FROM albums").get() as { count: number };
        const releases = this.db.prepare("SELECT COUNT(*) as count FROM releases").get() as { count: number };

        return {
            artists: artists?.count || 0,
            tracks: tracks?.count || 0,
            albums: albums?.count || 0,
            releases: releases?.count || 0
        };
    }

    public getRecentTracks(limit: number = 5): TelegramRecentTrack[] {
        return this.db.prepare("SELECT title, artist_name FROM tracks ORDER BY id DESC LIMIT ?").all(limit) as TelegramRecentTrack[];
    }

    public searchReleaseTracks(query: string, limit: number = 10): any[] {
        const likeQuery = `%${query}%`;
        return this.db.prepare(`
            SELECT rt.*, r.title as album_title, ar.name as artist_name, r.cover_path as album_cover
            FROM release_tracks rt
            JOIN releases r ON rt.release_id = r.id
            LEFT JOIN artists ar ON r.artist_id = ar.id
            WHERE rt.title LIKE ? 
               OR ar.name LIKE ? 
               OR rt.artist_name LIKE ?
               OR r.title LIKE ?
            LIMIT ?
        `).all(likeQuery, likeQuery, likeQuery, likeQuery, limit) as any[];
    }
}
