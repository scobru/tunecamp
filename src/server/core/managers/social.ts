import type { Database as DatabaseType } from "better-sqlite3";
import type { SocialRepository } from "../../repositories/social.repository.js";
import type { RemoteActorRepository } from "../../repositories/remote-actor.repository.js";
import type { RemoteContentRepository } from "../../repositories/remote-content.repository.js";
import type { SocialManager, Follower, Post, ApNote, RemoteActor, RemoteContent, TrackWithPlayCount, ArtistWithPlayCount, PlayHistoryEntry } from "../database.types.js";
import { VisibilityProfile, ViewerContext, getContextFromProfile, UserRole } from "../../common/visibility.js";

export function createSocialManager(
    db: DatabaseType,
    socialRepository: SocialRepository,
    remoteActorRepository: RemoteActorRepository,
    remoteContentRepository: RemoteContentRepository
): SocialManager {
    return {
        // Followers
        getFollowers: (id: number) => socialRepository.getFollowers(id),
        getPendingFollowers: (id: number) => socialRepository.getPendingFollowers(id),
        getFollower: (artistId: number, actorUri: string) => socialRepository.getFollower(artistId, actorUri),
        addFollower(id: number, u: string, i: string, si?: string, fid?: string) {
            if (id === -1) {
                const hasSiteActor = db.prepare("SELECT 1 FROM artists WHERE id = -1").get();
                if (!hasSiteActor) {
                    console.log("📡 [Database] Self-healing: Re-creating virtual artist record for Site Actor...");
                    const pubKey = db.prepare("SELECT value FROM settings WHERE key = 'site_public_key'").get() as { value: string } | undefined;
                    const privKey = db.prepare("SELECT value FROM settings WHERE key = 'site_private_key'").get() as { value: string } | undefined;
                    const siteSlug = (db.prepare("SELECT value FROM settings WHERE key = 'siteHandle'").get() as { value: string } | undefined)?.value || 'site';
                    const siteActorName = (db.prepare("SELECT value FROM settings WHERE key = 'siteName'").get() as { value: string } | undefined)?.value || 'Site';
                    db.prepare("INSERT INTO artists (id, name, slug, visibility, public_key, private_key) VALUES (-1, ?, ?, 'public', ?, ?)")
                      .run(siteActorName, siteSlug, pubKey ? pubKey.value : null, privKey ? privKey.value : null);
                }
            }
            socialRepository.addFollower(id, u, i, si, fid);
        },
        acceptFollower: (artistId: number, actorUri: string) => socialRepository.acceptFollower(artistId, actorUri),
        rejectFollower: (artistId: number, actorUri: string) => socialRepository.rejectFollower(artistId, actorUri),
        removeFollower: (id: number, u: string) => socialRepository.removeFollower(id, u),
        updateFollowerUri: (o: string, n: string, i: string, si?: string) => socialRepository.updateFollowerUri(o, n, i, si),
        unfollowActor: (u: string) => { db.prepare("UPDATE remote_actors SET is_followed = 0 WHERE uri = ?").run(u); },



        // Starred / Social / Ratings
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
        // Local stats counters (replaces Zen stats)
        getTrackPlayCount: (id: number) => socialRepository.getTrackPlayCount(id),
        incrementTrackPlayCount: (id: number) => socialRepository.incrementTrackPlayCount(id),
        getTrackDownloadCount: (id: number) => socialRepository.getTrackDownloadCount(id),
        incrementTrackDownloadCount: (id: number) => socialRepository.incrementTrackDownloadCount(id),
        getTrackLikeCount: (id: number) => socialRepository.getTrackLikeCount(id),
        getReleaseDownloadCount: (slug: string) => socialRepository.getReleaseDownloadCount(slug),
        incrementReleaseDownloadCount: (slug: string) => socialRepository.incrementReleaseDownloadCount(slug),
        recordPlay: (tid: number, p?: string) => socialRepository.recordPlay(tid, p),
        getRecentPlays: (l = 50) => socialRepository.getRecentPlays(l),
        getTopTracks: (l = 20, d = 30, f: any = 'all') => socialRepository.getTopTracks(l, d, f),
        getTopArtists: (l = 10, d = 30, f: any = 'all') => socialRepository.getTopArtists(l, d, f),
        savePlayQueue: (u: string, ids: string[], c: string | null, p: number) => db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(`play_queue_${u}`, JSON.stringify({ trackIds: ids, current: c, positionMs: p })),
        getPlayQueue: (u: string) => { const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(`play_queue_${u}`) as any; return r ? JSON.parse(r.value) : { trackIds: [], current: null, positionMs: 0 }; },

        // Comments
        addComment: (tid: number, u: string, t: string) => socialRepository.addComment(tid, u, t),
        getComments: (tid: number) => socialRepository.getComments(tid),
        deleteComment: (cid: number, u: string, isAdmin: boolean) => socialRepository.deleteComment(cid, u, isAdmin),

        // Bookmarks
        createBookmark: (u: string, id: string, p: number, c?: string) => { db.prepare("INSERT INTO bookmarks (username, track_id, position_ms, comment) VALUES (?, ?, ?, ?)").run(u, id, p, c || null); },
        getBookmarks: (u: string) => db.prepare("SELECT * FROM bookmarks WHERE username = ? ORDER BY updated_at DESC").all(u) as any[],
        getBookmark: (u: string, id: string) => db.prepare("SELECT * FROM bookmarks WHERE username = ? AND track_id = ?").get(u, id) as any,
        deleteBookmark: (u: string, id: string) => { db.prepare("DELETE FROM bookmarks WHERE username = ? AND track_id = ?").run(u, id); },

        // Posts
        getPostsByArtist: (aid: number, pr?: VisibilityProfile | ViewerContext) => {
            const context = getContextFromProfile(pr);
            const po = context.role === UserRole.GUEST;
            return db.prepare(po 
                ? "SELECT * FROM posts WHERE artist_id = ? AND visibility = 'public' AND id NOT IN (SELECT content_id FROM ap_notes WHERE note_type = 'post' AND deleted_at IS NOT NULL) ORDER BY created_at DESC" 
                : "SELECT * FROM posts WHERE artist_id = ? AND id NOT IN (SELECT content_id FROM ap_notes WHERE note_type = 'post' AND deleted_at IS NOT NULL) ORDER BY created_at DESC"
            ).all(aid) as any[];
        },
        getPublicPosts: () => db.prepare(`
            SELECT p.*, a.name AS artist_name, a.slug AS artist_slug, a.photo_path AS artist_photo
            FROM posts p
            LEFT JOIN artists a ON p.artist_id = a.id
            WHERE p.visibility = 'public'
              AND p.id NOT IN (SELECT content_id FROM ap_notes WHERE note_type = 'post' AND deleted_at IS NOT NULL)
            ORDER BY p.created_at DESC
        `).all() as any[],
        getPost: (id: number) => db.prepare("SELECT * FROM posts WHERE id = ?").get(id) as any,
        getPostBySlug: (s: string) => db.prepare("SELECT * FROM posts WHERE slug = ?").get(s) as any,
        createPost(aid: number, c: string, v: any = 'public', t?: string | null, s?: string | null) {
            if (aid === -1) {
                const hasSiteActor = db.prepare("SELECT 1 FROM artists WHERE id = -1").get();
                if (!hasSiteActor) {
                    console.log("📡 [Database] Self-healing: Re-creating virtual artist record for Site Actor...");
                    const pubKey = db.prepare("SELECT value FROM settings WHERE key = 'site_public_key'").get() as { value: string } | undefined;
                    const privKey = db.prepare("SELECT value FROM settings WHERE key = 'site_private_key'").get() as { value: string } | undefined;
                    const siteSlug = (db.prepare("SELECT value FROM settings WHERE key = 'siteHandle'").get() as { value: string } | undefined)?.value || 'site';
                    const siteActorName = (db.prepare("SELECT value FROM settings WHERE key = 'siteName'").get() as { value: string } | undefined)?.value || 'Site';
                    db.prepare("INSERT OR IGNORE INTO artists (id, name, slug, visibility, public_key, private_key) VALUES (-1, ?, ?, 'public', ?, ?)")
                      .run(siteActorName, siteSlug, pubKey ? pubKey.value : null, privKey ? privKey.value : null);
                }
            }
            const baseSlug = t ? t : c;
            const generatedSlug = baseSlug.slice(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Math.random().toString(36).substring(2, 8);
            return Number(db.prepare("INSERT INTO posts (artist_id, content, slug, visibility, published_at, title, summary) VALUES (?, ?, ?, ?, ?, ?, ?)").run(aid, c, generatedSlug, v, (v === 'public' || v === 'unlisted') ? new Date().toISOString() : null, t || null, s || null).lastInsertRowid);
        },
        updatePost(id: number, c: string, v?: any, t?: string | null, s?: string | null) {
            const updates: string[] = ["content = ?"];
            const params: any[] = [c];
            if (v !== undefined) {
                updates.push("visibility = ?");
                params.push(v);
            }
            if (t !== undefined) {
                updates.push("title = ?");
                params.push(t);
            }
            if (s !== undefined) {
                updates.push("summary = ?");
                params.push(s);
            }
            params.push(id);
            db.prepare(`UPDATE posts SET ${updates.join(", ")} WHERE id = ?`).run(...params);
        },
        updatePostVisibility: (id: number, v: any) => { db.prepare("UPDATE posts SET visibility = ? WHERE id = ?").run(v, id); },
        deletePost: (id: number) => { db.prepare("DELETE FROM posts WHERE id = ?").run(id); },

        // Artist Live Events
        getEventsByArtist: (aid: number, upcomingOnly = false) => db.prepare(
            upcomingOnly
                ? "SELECT * FROM artist_events WHERE artist_id = ? AND event_date >= date('now', '-1 day') ORDER BY event_date ASC"
                : "SELECT * FROM artist_events WHERE artist_id = ? ORDER BY event_date ASC"
        ).all(aid) as any[],
        getEvent: (id: number) => db.prepare("SELECT * FROM artist_events WHERE id = ?").get(id) as any,
        createEvent: (aid: number, e: any) => Number(db.prepare(
            "INSERT INTO artist_events (artist_id, title, event_date, venue, city, country, ticket_url, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(aid, e.title, e.event_date, e.venue || null, e.city || null, e.country || null, e.ticket_url || null, e.description || null).lastInsertRowid),
        updateEvent: (id: number, e: any) => {
            db.prepare(
                "UPDATE artist_events SET title = ?, event_date = ?, venue = ?, city = ?, country = ?, ticket_url = ?, description = ? WHERE id = ?"
            ).run(e.title, e.event_date, e.venue || null, e.city || null, e.country || null, e.ticket_url || null, e.description || null, id);
        },
        deleteEvent: (id: number) => { db.prepare("DELETE FROM artist_events WHERE id = ?").run(id); },

        // AP Metadata
        createApNote: (aid: number, nid: string, nt: any, cid: number, cs: string, ct: string) => Number(db.prepare("INSERT OR IGNORE INTO ap_notes (artist_id, note_id, note_type, content_id, content_slug, content_title) VALUES (?, ?, ?, ?, ?, ?)").run(aid, nid, nt, cid, cs, ct).lastInsertRowid),
        getApNotes: (aid: number, id = false) => db.prepare(id ? "SELECT * FROM ap_notes WHERE artist_id = ?" : "SELECT * FROM ap_notes WHERE artist_id = ? AND deleted_at IS NULL").all(aid) as any[],
        getApNote: (nid: string) => db.prepare("SELECT * FROM ap_notes WHERE note_id = ?").get(nid) as any,
        markApNoteDeleted: (nid: string) => { db.prepare("UPDATE ap_notes SET deleted_at = CURRENT_TIMESTAMP WHERE note_id = ?").run(nid); },
        deleteApNote: (nid: string) => { db.prepare("DELETE FROM ap_notes WHERE note_id = ?").run(nid); },
        addApInteraction: (noteId: string, actorUri: string, type: 'like' | 'announce', activityId?: string): boolean => {
            const result = db.prepare("INSERT OR IGNORE INTO ap_interactions (note_id, actor_uri, type, activity_id) VALUES (?, ?, ?, ?)").run(noteId, actorUri, type, activityId ?? null);
            if (result.changes > 0) {
                const col = type === 'like' ? 'likes_count' : 'announces_count';
                db.prepare(`UPDATE ap_notes SET ${col} = MAX(0, ${col} + 1) WHERE note_id = ?`).run(noteId);
                return true;
            }
            return false;
        },
        removeApInteraction: (noteId: string, actorUri: string, type: 'like' | 'announce'): boolean => {
            const result = db.prepare("DELETE FROM ap_interactions WHERE note_id = ? AND actor_uri = ? AND type = ?").run(noteId, actorUri, type);
            if (result.changes > 0) {
                const col = type === 'like' ? 'likes_count' : 'announces_count';
                db.prepare(`UPDATE ap_notes SET ${col} = MAX(0, ${col} - 1) WHERE note_id = ?`).run(noteId);
                return true;
            }
            return false;
        },
        getApInteractions: (noteId: string) => db.prepare("SELECT actor_uri, type, created_at FROM ap_interactions WHERE note_id = ? ORDER BY created_at DESC").all(noteId) as any[],
        addApReply: (noteId: string, replyUri: string, actorUri: string, content: string, publishedAt?: string): boolean => {
            const result = db.prepare("INSERT OR IGNORE INTO ap_replies (note_id, reply_uri, actor_uri, content, published_at) VALUES (?, ?, ?, ?, ?)").run(noteId, replyUri, actorUri, content, publishedAt ?? null);
            if (result.changes > 0) {
                db.prepare("UPDATE ap_notes SET replies_count = MAX(0, replies_count + 1) WHERE note_id = ?").run(noteId);
                return true;
            }
            return false;
        },
        getApReplies: (noteId: string) => db.prepare("SELECT id, note_id, reply_uri, actor_uri, content, published_at, created_at FROM ap_replies WHERE note_id = ? ORDER BY COALESCE(published_at, created_at) ASC").all(noteId) as any[],
        getApReply: (replyUri: string) => db.prepare("SELECT id, note_id, reply_uri, actor_uri, content, published_at, created_at FROM ap_replies WHERE reply_uri = ?").get(replyUri) as any,
        deleteApReply: (replyUri: string): boolean => {
            const row = db.prepare("SELECT note_id FROM ap_replies WHERE reply_uri = ?").get(replyUri) as any;
            const result = db.prepare("DELETE FROM ap_replies WHERE reply_uri = ?").run(replyUri);
            if (result.changes > 0 && row) {
                db.prepare("UPDATE ap_notes SET replies_count = MAX(0, replies_count - 1) WHERE note_id = ?").run(row.note_id);
                return true;
            }
            return false;
        },

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
    };
}
