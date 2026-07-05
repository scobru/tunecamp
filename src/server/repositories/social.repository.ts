import type { Database as DatabaseType } from "better-sqlite3";
import type { Follower, RemoteActor, TrackWithPlayCount, ArtistWithPlayCount, PlayHistoryEntry } from "../core/database.types.js";

export class SocialRepository {
    constructor(protected db: DatabaseType) {}

    // --- Followers ---

    addFollower(artistId: number, actorUri: string, inboxUri: string, sharedInboxUri?: string, followId?: string): void {
        const hasFollowIdCol = this.db.prepare("PRAGMA table_info(followers)").all().some((c: any) => c.name === 'follow_id');
        // Upsert that PRESERVES an already-accepted follower's status. The previous
        // `INSERT OR REPLACE ... 'pending'` reset every re-delivered or duplicate Follow
        // back to 'pending', silently dropping the follower from the (accepted-only)
        // dashboard list until it was re-accepted. We also avoid clobbering a previously
        // resolved inbox with an empty string when a Follow arrives before the remote
        // actor's inbox could be fetched.
        if (hasFollowIdCol) {
            this.db.prepare(`
                INSERT INTO followers (artist_id, actor_uri, inbox_uri, shared_inbox_uri, status, follow_id)
                VALUES (?, ?, ?, ?, 'pending', ?)
                ON CONFLICT(artist_id, actor_uri) DO UPDATE SET
                    inbox_uri = CASE WHEN excluded.inbox_uri != '' THEN excluded.inbox_uri ELSE followers.inbox_uri END,
                    shared_inbox_uri = COALESCE(excluded.shared_inbox_uri, followers.shared_inbox_uri),
                    follow_id = COALESCE(excluded.follow_id, followers.follow_id),
                    status = CASE WHEN followers.status = 'accepted' THEN 'accepted' ELSE 'pending' END
            `).run(artistId, actorUri, inboxUri, sharedInboxUri || null, followId || null);
        } else {
            this.db.prepare(`
                INSERT INTO followers (artist_id, actor_uri, inbox_uri, shared_inbox_uri, status)
                VALUES (?, ?, ?, ?, 'pending')
                ON CONFLICT(artist_id, actor_uri) DO UPDATE SET
                    inbox_uri = CASE WHEN excluded.inbox_uri != '' THEN excluded.inbox_uri ELSE followers.inbox_uri END,
                    shared_inbox_uri = COALESCE(excluded.shared_inbox_uri, followers.shared_inbox_uri),
                    status = CASE WHEN followers.status = 'accepted' THEN 'accepted' ELSE 'pending' END
            `).run(artistId, actorUri, inboxUri, sharedInboxUri || null);
        }
    }

    /** Get pending followers for an artist */
    getPendingFollowers(artistId: number): Follower[] {
        return this.db.prepare("SELECT * FROM followers WHERE artist_id = ? AND status = 'pending'").all(artistId) as Follower[];
    }

    /** Accept a follower request */
    acceptFollower(artistId: number, actorUri: string): void {
        this.db.prepare("UPDATE followers SET status = 'accepted' WHERE artist_id = ? AND actor_uri = ?").run(artistId, actorUri);
    }

    /** Batch accept all pending followers to eliminate N+1 queries */
    acceptPendingFollowers(artistId: number): void {
        this.db.transaction(() => {
            this.db.prepare("UPDATE followers SET status = 'accepted' WHERE artist_id = ? AND status = 'pending'").run(artistId);
        })();
    }

    /** Reject a follower request */
    rejectFollower(artistId: number, actorUri: string): void {
        this.db.prepare("UPDATE followers SET status = 'rejected' WHERE artist_id = ? AND actor_uri = ?").run(artistId, actorUri);
    }

    removeFollower(artistId: number, actorUri: string): void {
        this.db.prepare("DELETE FROM followers WHERE artist_id = ? AND actor_uri = ?").run(artistId, actorUri);
    }

    updateFollowerUri(oldActorUri: string, newActorUri: string, newInboxUri: string, newSharedInboxUri?: string): void {
        this.db.prepare(
            "UPDATE followers SET actor_uri = ?, inbox_uri = ?, shared_inbox_uri = ? WHERE actor_uri = ?"
        ).run(newActorUri, newInboxUri, newSharedInboxUri || null, oldActorUri);
    }

    getFollowers(artistId: number): Follower[] {
        return this.db.prepare("SELECT * FROM followers WHERE artist_id = ? AND status = 'accepted'").all(artistId) as Follower[];
    }

    getFollowerInboxes(artistId: number): string[] {
        const rows = this.db.prepare("SELECT DISTINCT inbox_uri FROM followers WHERE artist_id = ? AND status = 'accepted' AND inbox_uri IS NOT NULL").all(artistId) as { inbox_uri: string }[];
        return rows.map(r => r.inbox_uri);
    }

    getFollower(artistId: number, actorUri: string): Follower | undefined {
        return this.db.prepare("SELECT * FROM followers WHERE artist_id = ? AND actor_uri = ?").get(artistId, actorUri) as Follower | undefined;
    }

    addFollowing(artistId: number, actorUri: string, inboxUri?: string): void {
        this.db.prepare(`
            INSERT OR REPLACE INTO following (artist_id, actor_uri, inbox_uri)
            VALUES (?, ?, ?)
        `).run(artistId, actorUri, inboxUri || null);
    }

    removeFollowing(artistId: number, actorUri: string): void {
        this.db.prepare(`
            DELETE FROM following WHERE artist_id = ? AND actor_uri = ?
        `).run(artistId, actorUri);
    }

    isFollowing(artistId: number, actorUri: string): boolean {
        const row = this.db.prepare(`
            SELECT 1 FROM following WHERE artist_id = ? AND actor_uri = ?
        `).get(artistId, actorUri);
        return !!row;
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

    // --- Comments ---

    addComment(trackId: number, username: string, text: string): { id: number; track_id: number; username: string; text: string; created_at: string } {
        const result = this.db.prepare(
            "INSERT INTO comments (track_id, username, text) VALUES (?, ?, ?)"
        ).run(trackId, username, text);
        return this.db.prepare("SELECT * FROM comments WHERE id = ?").get(result.lastInsertRowid) as any;
    }

    getComments(trackId: number): { id: number; track_id: number; username: string; text: string; created_at: string }[] {
        return this.db.prepare(
            "SELECT * FROM comments WHERE track_id = ? ORDER BY created_at ASC"
        ).all(trackId) as any[];
    }

    deleteComment(commentId: number, username: string, isAdmin: boolean): boolean {
        const comment = this.db.prepare("SELECT username FROM comments WHERE id = ?").get(commentId) as { username: string } | undefined;
        if (!comment) return false;
        if (!isAdmin && comment.username !== username) return false;
        this.db.prepare("DELETE FROM comments WHERE id = ?").run(commentId);
        return true;
    }

    // --- Track / Release Stats (local counters, replaces Zen stats) ---

    getTrackPlayCount(trackId: number): number {
        const row = this.db.prepare(
            "SELECT play_count FROM track_stats WHERE track_id = ?"
        ).get(trackId) as { play_count: number } | undefined;
        return row ? row.play_count : 0;
    }

    incrementTrackPlayCount(trackId: number): number {
        this.db.prepare(
            "INSERT INTO track_stats (track_id, play_count) VALUES (?, 1) ON CONFLICT(track_id) DO UPDATE SET play_count = play_count + 1"
        ).run(trackId);
        return this.getTrackPlayCount(trackId);
    }

    getTrackDownloadCount(trackId: number): number {
        const row = this.db.prepare(
            "SELECT download_count FROM track_stats WHERE track_id = ?"
        ).get(trackId) as { download_count: number } | undefined;
        return row ? row.download_count : 0;
    }

    incrementTrackDownloadCount(trackId: number): number {
        this.db.prepare(
            "INSERT INTO track_stats (track_id, download_count) VALUES (?, 1) ON CONFLICT(track_id) DO UPDATE SET download_count = download_count + 1"
        ).run(trackId);
        return this.getTrackDownloadCount(trackId);
    }

    getTrackLikeCount(trackId: number): number {
        const row = this.db.prepare(
            "SELECT COUNT(*) as count FROM starred_items WHERE item_type = 'track' AND item_id = CAST(? AS TEXT)"
        ).get(trackId) as { count: number };
        return row ? row.count : 0;
    }

    getReleaseDownloadCount(slug: string): number {
        const row = this.db.prepare(
            "SELECT download_count FROM release_stats WHERE slug = ?"
        ).get(slug) as { download_count: number } | undefined;
        return row ? row.download_count : 0;
    }

    incrementReleaseDownloadCount(slug: string): number {
        this.db.prepare(
            "INSERT INTO release_stats (slug, download_count) VALUES (?, 1) ON CONFLICT(slug) DO UPDATE SET download_count = download_count + 1"
        ).run(slug);
        return this.getReleaseDownloadCount(slug);
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
