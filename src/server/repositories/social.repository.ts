import type { Database as DatabaseType } from "better-sqlite3";
import { BaseRepository } from "./base.repository.js";
import type { Follower, TrackWithPlayCount, ArtistWithPlayCount, PlayHistoryEntry } from "../core/database.types.js";

export class SocialRepository extends BaseRepository {
    constructor(db: DatabaseType) {
        super(db);
    }

    // --- Followers ---

    addFollower(artistId: number, actorUri: string, inboxUri: string, sharedInboxUri?: string): void {
        this.db.prepare(
            "INSERT OR IGNORE INTO followers (artist_id, actor_uri, inbox_uri, shared_inbox_uri, status) VALUES (?, ?, ?, ?, 'pending')"
        ).run(artistId, actorUri, inboxUri, sharedInboxUri || null);
    }

    /** Get pending followers for an artist */
    getPendingFollowers(artistId: number): Follower[] {
        return this.db.prepare("SELECT * FROM followers WHERE artist_id = ? AND status = 'pending'").all(artistId) as Follower[];
    }

    /** Accept a follower request */
    acceptFollower(artistId: number, actorUri: string): void {
        this.db.prepare("UPDATE followers SET status = 'accepted' WHERE artist_id = ? AND actor_uri = ?").run(artistId, actorUri);
    }

    /** Reject a follower request */
    rejectFollower(artistId: number, actorUri: string): void {
        this.db.prepare("UPDATE followers SET status = 'rejected' WHERE artist_id = ? AND actor_uri = ?").run(artistId, actorUri);
    }

    removeFollower(artistId: number, actorUri: string): void {
        this.db.prepare("DELETE FROM followers WHERE artist_id = ? AND actor_uri = ?").run(artistId, actorUri);
    }

    getFollowers(artistId: number): Follower[] {
        return this.db.prepare("SELECT * FROM followers WHERE artist_id = ? AND status = 'accepted'").all(artistId) as Follower[];
    }

    getFollower(artistId: number, actorUri: string): Follower | undefined {
        return this.db.prepare("SELECT * FROM followers WHERE artist_id = ? AND actor_uri = ?").get(artistId, actorUri) as Follower | undefined;
    }

    // --- Likes ---

    addLike(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): void {
        this.db.prepare(`
            INSERT OR IGNORE INTO likes (remote_actor_fid, object_type, object_id)
            VALUES (?, ?, ?)
        `).run(actorUri, objectType, objectId);
    }

    removeLike(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): void {
        this.db.prepare(`
            DELETE FROM likes WHERE remote_actor_fid = ? AND object_type = ? AND object_id = ?
        `).run(actorUri, objectType, objectId);
    }

    getLikesCount(objectType: 'album' | 'track' | 'post', objectId: number): number {
        const row = this.db.prepare(`
            SELECT COUNT(*) as count FROM likes WHERE object_type = ? AND object_id = ?
        `).get(objectType, objectId) as { count: number };
        return row ? row.count : 0;
    }

    hasLiked(actorUri: string, objectType: 'album' | 'track' | 'post', objectId: number): boolean {
        const row = this.db.prepare(`
            SELECT 1 FROM likes WHERE remote_actor_fid = ? AND object_type = ? AND object_id = ?
        `).get(actorUri, objectType, objectId);
        return !!row;
    }

    // --- Local User Social (Stars/Ratings) ---

    starItem(username: string, type: 'album' | 'track' | 'artist', targetId: string): void {
        this.db.prepare("INSERT OR IGNORE INTO starred_items (username, item_type, item_id) VALUES (?, ?, ?)").run(username, type, targetId);
    }

    unstarItem(username: string, type: 'album' | 'track' | 'artist', targetId: string): void {
        this.db.prepare("DELETE FROM starred_items WHERE username = ? AND item_type = ? AND item_id = ?").run(username, type, targetId);
    }

    isStarred(username: string, type: 'album' | 'track' | 'artist', targetId: string): boolean {
        const row = this.db.prepare("SELECT 1 FROM starred_items WHERE username = ? AND item_type = ? AND item_id = ?").get(username, type, targetId);
        return !!row;
    }

    setItemRating(username: string, type: 'album' | 'track' | 'artist', targetId: string, rating: number): void {
        this.db.prepare("INSERT OR REPLACE INTO item_ratings (username, item_type, item_id, rating) VALUES (?, ?, ?, ?)")
            .run(username, type, targetId, rating);
    }

    getItemRating(username: string, type: 'album' | 'track' | 'artist', targetId: string): number {
        const row = this.db.prepare("SELECT rating FROM item_ratings WHERE username = ? AND item_type = ? AND item_id = ?").get(username, type, targetId) as { rating: number };
        return row ? row.rating : 0;
    }

    getStarredItems(username: string, type?: 'album' | 'track' | 'artist'): { item_type: string; item_id: string; created_at: string }[] {
        if (type) {
            return this.db.prepare("SELECT item_type, item_id, created_at FROM starred_items WHERE username = ? AND item_type = ?")
                .all(username, type) as { item_type: string; item_id: string; created_at: string }[];
        }
        return this.db.prepare("SELECT item_type, item_id, created_at FROM starred_items WHERE username = ?")
            .all(username) as { item_type: string; item_id: string; created_at: string }[];
    }

    getItemRatings(username: string, type: 'album' | 'track' | 'artist'): Map<string, number> {
        const rows = this.db.prepare("SELECT item_id, rating FROM item_ratings WHERE username = ? AND item_type = ?")
            .all(username, type) as { item_id: string; rating: number }[];
        return new Map(rows.map(r => [r.item_id, r.rating]));
    }

    // --- Play History & Stats ---

    recordPlay(trackId: number, playedAt?: string): void {
        this.db.prepare("INSERT INTO play_history (track_id, played_at) VALUES (?, ?)")
            .run(trackId, playedAt || new Date().toISOString());
    }

    getRecentPlays(limit: number = 50): PlayHistoryEntry[] {
        return this.db.prepare(`
            SELECT ph.*, t.title as track_title, a.name as artist_name, alb.title as album_title 
            FROM play_history ph 
            JOIN tracks t ON ph.track_id = t.id 
            LEFT JOIN artists a ON t.artist_id = a.id 
            LEFT JOIN albums alb ON t.album_id = alb.id 
            ORDER BY ph.played_at DESC LIMIT ?
        `).all(limit) as PlayHistoryEntry[];
    }

    getTopTracks(limit: number = 10, days: number = 30, filter: 'all' | 'library' | 'releases' = 'all'): TrackWithPlayCount[] {
        let where = "ph.played_at > datetime('now', '-' || ? || ' days')";
        if (filter === 'library') {
            where += ` AND NOT (
                (t.album_id IS NOT NULL AND alb.is_release = 1) OR 
                EXISTS (SELECT 1 FROM release_tracks rt WHERE rt.track_id = t.id)
            )`;
        } else if (filter === 'releases') {
            where += ` AND (
                (t.album_id IS NOT NULL AND alb.is_release = 1 AND alb.status = 'released') OR 
                EXISTS (SELECT 1 FROM release_tracks rt JOIN releases r ON rt.release_id = r.id WHERE rt.track_id = t.id AND r.status = 'released')
            )`;
        }
        
        return this.db.prepare(`
            SELECT t.*, COUNT(ph.id) as play_count, alb.title as album_title, a.name as artist_name
            FROM play_history ph
            JOIN tracks t ON ph.track_id = t.id
            LEFT JOIN albums alb ON t.album_id = alb.id
            LEFT JOIN artists a ON t.artist_id = a.id
            WHERE ${where}
            GROUP BY ph.track_id
            ORDER BY play_count DESC
            LIMIT ?
        `).all(days, limit) as TrackWithPlayCount[];
    }

    getTopArtists(limit: number = 10, days: number = 30, filter: 'all' | 'library' | 'releases' = 'all'): ArtistWithPlayCount[] {
        let where = "ph.played_at > datetime('now', '-' || ? || ' days')";
        if (filter === 'library') {
            where += ` AND NOT (
                (t.album_id IS NOT NULL AND alb.is_release = 1) OR 
                EXISTS (SELECT 1 FROM release_tracks rt WHERE rt.track_id = t.id)
            )`;
        } else if (filter === 'releases') {
            where += ` AND (
                (t.album_id IS NOT NULL AND alb.is_release = 1 AND alb.status = 'released') OR 
                EXISTS (SELECT 1 FROM release_tracks rt JOIN releases r ON rt.release_id = r.id WHERE rt.track_id = t.id AND r.status = 'released')
            )`;
        }

        return this.db.prepare(`
            SELECT a.*, COUNT(ph.id) as play_count
            FROM play_history ph
            JOIN tracks t ON ph.track_id = t.id
            LEFT JOIN albums alb ON t.album_id = alb.id
            JOIN artists a ON t.artist_id = a.id
            WHERE ${where}
            GROUP BY a.id
            ORDER BY play_count DESC
            LIMIT ?
        `).all(days, limit) as ArtistWithPlayCount[];
    }
}
