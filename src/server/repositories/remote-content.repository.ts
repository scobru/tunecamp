import type { Database as DatabaseType } from "better-sqlite3";
import { BaseRepository } from "./base.repository.js";
import type { RemoteContent } from "../core/database.types.js";

export class RemoteContentRepository extends BaseRepository {
    constructor(db: DatabaseType) {
        super(db);
    }

    upsertRemoteContent(content: Omit<RemoteContent, "id" | "received_at">): void {
        const b = (val: any) => {
            if (val === null || val === undefined) return null;
            if (typeof val === 'string' || typeof val === 'number' || typeof val === 'bigint' || Buffer.isBuffer(val)) return val;
            return String(val);
        };

        this.db.prepare(`
            INSERT INTO remote_content (ap_id, actor_uri, type, title, content, url, cover_url, stream_url, artist_name, album_name, duration, published_at, received_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(ap_id) DO UPDATE SET
                title=excluded.title,
                content=excluded.content,
                url=excluded.url,
                cover_url=excluded.cover_url,
                stream_url=excluded.stream_url,
                artist_name=excluded.artist_name,
                album_name=excluded.album_name,
                duration=excluded.duration,
                published_at=excluded.published_at,
                received_at=CURRENT_TIMESTAMP
        `).run(
            content.ap_id, content.actor_uri, content.type,
            b(content.title), b(content.content), b(content.url), b(content.cover_url), b(content.stream_url),
            b(content.artist_name), b(content.album_name), b(content.duration), b(content.published_at)
        );
    }

    getRemoteContent(apId: string): RemoteContent | undefined {
        return this.db.prepare("SELECT * FROM remote_content WHERE ap_id = ?").get(apId) as RemoteContent | undefined;
    }

    getRemoteTracks(): RemoteContent[] {
        const rows = this.db.prepare(`
            SELECT rc.*, ra.type AS actor_type
            FROM remote_content rc
            JOIN remote_actors ra ON rc.actor_uri = ra.uri
            WHERE rc.type = 'release' AND ra.is_followed = 1
            ORDER BY rc.published_at DESC
        `).all() as RemoteContent[];
        return rows;
    }

    getRemotePosts(): RemoteContent[] {
        const rows = this.db.prepare(`
            SELECT rc.*, ra.type AS actor_type
            FROM remote_content rc
            JOIN remote_actors ra ON rc.actor_uri = ra.uri
            WHERE rc.type = 'post' AND ra.is_followed = 1
            ORDER BY rc.published_at DESC
        `).all() as RemoteContent[];
        return rows;
    }

    getRemoteTrack(apIdOrSlug: string): RemoteContent | undefined {
        return this.db.prepare("SELECT * FROM remote_content WHERE ap_id = ? OR url LIKE ?").get(apIdOrSlug, `%${apIdOrSlug}`) as RemoteContent | undefined;
    }

    saveRemotePost(post: any): void {
        this.db.prepare(`
            INSERT INTO remote_content (ap_id, actor_uri, type, title, content, url, cover_url, stream_url, artist_name, album_name, duration, published_at, received_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(ap_id) DO UPDATE SET
                title=excluded.title,
                content=excluded.content,
                url=excluded.url,
                published_at=excluded.published_at,
                received_at=CURRENT_TIMESTAMP
        `).run(
            post.ap_id,
            post.actor_uri,
            'post',
            post.title || null,
            post.content || null,
            post.url || null,
            post.cover_url || null,
            post.stream_url || null,
            post.artist_name || null,
            post.album_name || null,
            post.duration || null,
            post.published_at || new Date().toISOString()
        );
    }

    deleteRemotePost(apId: string): void {
        this.db.prepare("DELETE FROM remote_content WHERE ap_id = ?").run(apId);
    }

    deleteRemoteContent(apId: string): void {
        this.db.prepare("DELETE FROM remote_content WHERE ap_id = ?").run(apId);
    }
}
