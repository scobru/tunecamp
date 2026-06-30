import { Router, json } from "express";
import type { DatabaseService } from "../../core/database.js";
import type { ActivityPubService } from "../../modules/activitypub/activitypub.service.js";
import { type AuthenticatedRequest } from "../../middleware/auth.js";
import { getSiteHandle, SITE_ACTOR_ID } from "../../core/site-actor.js";

import type { ServiceContainer } from "../../core/container.js";

export function createActivityPubRoutes(container: ServiceContainer): Router {
    const apService: ServiceContainer['apService'] = (container as any).apService || (container as any);
    const db: ServiceContainer['database'] = (container as any).database || (container as any);
    const authMiddleware: ServiceContainer['authMiddleware'] = (container as any).authMiddleware || (container as any);
    const router = Router();
    router.use(json({ type: ["application/json", "application/activity+json", "application/ld+json"] }));

    // NOTE: the live Actor / inbox / outbox / followers / following / shared-inbox are
    // served by Fedify at `/users/*` and `/inbox` (see src/server/modules/fedify/fedify.ts).
    // Real federation traffic never reaches this router, which is mounted at `/api/ap` and
    // only resolves individual objects (notes/articles/replies) and serves the dashboard's
    // management/timeline APIs. The duplicate hand-rolled actor/inbox handlers that used to
    // live here were removed to keep a single source of truth.

    // Resolve individual Activity (Release)
    router.get("/activity/release/:slug", async (req, res) => {
        const { slug } = req.params;
        let album: any = db.getAlbumBySlug(slug);

        // Fallback to releases table if not found or not marked as release in albums table
        if (!album || !album.is_release) {
            const release = db.getReleaseBySlug(slug);
            if (release) {
                album = release;
            }
        }

        if (!album || (album.visibility !== 'public' && !album.is_public)) {
            return res.status(404).send("Not found");
        }

        const artist = db.getArtist(album.artist_id!);
        if (!artist) return res.status(404).send("Artist not found");

        const baseUrl = apService.getBaseUrl();
        const userUrl = `${baseUrl}/users/${artist.slug}`;
        const apiUrl = `${baseUrl}/users/${artist.slug}`;
        const tracks = db.getTracks(album.id);
        const note = apService.generateNote(album, artist, tracks);

        res.setHeader("Content-Type", "application/activity+json");
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            type: "Create",
            id: `${baseUrl}/api/ap/activity/release/${album.slug}`,
            actor: userUrl,
            published: note.published,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${apiUrl}/followers`],
            object: note
        });
    });

    // Resolve individual Object (Release Note)
    router.get("/note/release/:slug/:timestamp?", async (req, res) => {
        const { slug } = req.params;
        let album: any = db.getAlbumBySlug(slug);

        // Fallback to releases table
        if (!album || !album.is_release) {
            const release = db.getReleaseBySlug(slug);
            if (release) {
                album = release;
            }
        }

        if (!album || (album.visibility !== 'public' && !album.is_public)) {
            return res.status(404).send("Not found");
        }

        const artist = db.getArtist(album.artist_id!);
        if (!artist) return res.status(404).send("Artist not found");

        const tracks = album.is_release ? db.getTracksByReleaseId(album.id) : db.getTracks(album.id);
        const note = apService.generateNote(album, artist, tracks);

        res.setHeader("Content-Type", "application/activity+json");
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            ...note
        });
    });

    // Resolve individual Activity (Post)
    router.get("/activity/post/:slug", async (req, res) => {
        const { slug } = req.params;
        const post = db.getPostBySlug(slug);

        if (!post || post.visibility !== 'public') return res.status(404).send("Not found");

        const artist = db.getArtist(post.artist_id);
        if (!artist) return res.status(404).send("Artist not found");

        const baseUrl = apService.getBaseUrl();
        const userUrl = `${baseUrl}/users/${artist.slug}`;
        const apiUrl = `${baseUrl}/users/${artist.slug}`;
        const article = apService.generatePostArticle(post, artist);

        res.setHeader("Content-Type", "application/activity+json");
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            type: "Create",
            id: `${baseUrl}/api/ap/activity/post/${post.slug}`,
            actor: userUrl,
            published: article.published,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${apiUrl}/followers`],
            object: article
        });
    });

    // Resolve individual Object (Post Article / Legacy Note)
    router.get(["/article/post/:slug/:timestamp?", "/note/post/:slug/:timestamp?"], async (req, res) => {
        const { slug } = req.params;
        const post = db.getPostBySlug(slug);

        if (!post || post.visibility !== 'public') return res.status(404).send("Not found");

        const artist = db.getArtist(post.artist_id);
        if (!artist) return res.status(404).send("Artist not found");

        const article = apService.generatePostArticle(post, artist);

        res.setHeader("Content-Type", "application/activity+json");
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            ...article
        });
    });

    // Resolve individual Object (outbound Reply Note) so remote servers can dereference it
    router.get("/note/reply/:id", (req, res) => {
        const replyUri = `${apService.getBaseUrl()}/api/ap/note/reply/${req.params.id}`;
        const reply = db.getApReply(replyUri);

        if (!reply) return res.status(404).send("Not found");

        res.setHeader("Content-Type", "application/activity+json");
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            type: "Note",
            id: reply.reply_uri,
            attributedTo: reply.actor_uri,
            inReplyTo: reply.note_id,
            content: reply.content,
            published: reply.published_at || reply.created_at,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${reply.actor_uri}/followers`]
        });
    });

    // List published content for artist
    router.get("/published/:artistId", authMiddleware.requireUser, (req: any, res) => {
        const { artistId } = req.params;
        const request = req as AuthenticatedRequest;
        
        const parsedArtistId = Number(artistId);
        if (isNaN(parsedArtistId)) {
            return res.status(400).json({ error: "Invalid artist ID" });
        }

        if (parsedArtistId === -1 && !request.isRootAdmin) {
            return res.json([]);
        }

        // Non-owners, including admins, cannot access other artists' content
        if (!request.isRootAdmin && request.artistId !== parsedArtistId) {
            console.warn(`⛔ Access Denied: User ${request.username} tried to access AP published content for Artist ${artistId}`);
            return res.status(403).json({ error: "Access denied" });
        }
        
        const notes = db.getApNotes(parsedArtistId);
        res.json(notes);
    });

    // Get followers for artist with actor details
    router.get("/followers/:artistId", authMiddleware.requireUser, (req: any, res) => {
        const { artistId } = req.params;
        const request = req as AuthenticatedRequest;

        const parsedArtistId = Number(artistId);
        if (isNaN(parsedArtistId)) {
            return res.status(400).json({ error: "Invalid artist ID" });
        }

        if (parsedArtistId === -1 && !request.isRootAdmin) {
            return res.json([]);
        }

        // Non-owners cannot view other artists' followers
        if (!request.isRootAdmin && request.artistId !== parsedArtistId) {
            console.warn(`⛔ Access Denied: User ${request.username} tried to access AP followers for Artist ${artistId}`);
            return res.status(403).json({ error: "Access denied" });
        }

        const followers = db.getFollowers(parsedArtistId);

        const enrichedFollowers = followers.map(f => {
            const actor = db.getRemoteActor(f.actor_uri);
            return {
                uri: f.actor_uri,
                created_at: f.created_at,
                actor: actor ? {
                    name: actor.name || actor.username || 'Unknown',
                    username: actor.username || 'unknown',
                    icon_url: actor.icon_url,
                    uri: actor.uri
                } : null
            };
        });
        res.json(enrichedFollowers);
    });

    // Get pending followers for artist
    router.get("/followers/pending/:artistId", authMiddleware.requireUser, (req: any, res) => {
        const { artistId } = req.params;
        const request = req as AuthenticatedRequest;

        const parsedArtistId = Number(artistId);
        if (isNaN(parsedArtistId)) {
            return res.status(400).json({ error: "Invalid artist ID" });
        }

        if (parsedArtistId === -1 && !request.isRootAdmin) {
            return res.json([]);
        }

        if (!request.isRootAdmin && request.artistId !== parsedArtistId) {
            console.warn(`⛔ Access Denied: User ${request.username} tried to access AP pending followers for Artist ${artistId}`);
            return res.status(403).json({ error: "Access denied" });
        }

        const pending = db.getPendingFollowers ? db.getPendingFollowers(parsedArtistId) : [];
        const enrichedFollowers = pending.map(f => {
            const actor = db.getRemoteActor(f.actor_uri);
            return {
                uri: f.actor_uri,
                created_at: f.created_at,
                actor: actor ? {
                    name: actor.name || actor.username || 'Unknown',
                    username: actor.username || 'unknown',
                    icon_url: actor.icon_url,
                    uri: actor.uri
                } : null
            };
        });
        res.json(enrichedFollowers);
    });

    // Accept pending follower request
    router.post("/followers/accept", authMiddleware.requireUser, async (req: any, res) => {
        const { artistId, actorUri } = req.body;
        const request = req as AuthenticatedRequest;

        const parsedArtistId = Number(artistId);
        if (isNaN(parsedArtistId) || (parsedArtistId === -1 && !request.isRootAdmin)) {
            return res.status(400).json({ error: "Invalid artist ID" });
        }

        if (!request.isRootAdmin && request.artistId !== parsedArtistId) {
            console.warn(`⛔ Access Denied: User ${request.username} tried to accept follower for Artist ${artistId}`);
            return res.status(403).json({ error: "Access denied" });
        }

        try {
            const artist = db.getArtist(parsedArtistId);
            if (!artist) return res.status(404).json({ error: "Artist not found" });

            await apService.acceptFollowRequest(artist, actorUri);
            res.json({ success: true, message: "Follower accepted" });
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: e.message || "Failed to accept follower" });
        }
    });

    // Reject pending follower request
    router.post("/followers/reject", authMiddleware.requireUser, async (req: any, res) => {
        const { artistId, actorUri } = req.body;
        const request = req as AuthenticatedRequest;

        const parsedArtistId = Number(artistId);
        if (isNaN(parsedArtistId) || (parsedArtistId === -1 && !request.isRootAdmin)) {
            return res.status(400).json({ error: "Invalid artist ID" });
        }

        if (!request.isRootAdmin && request.artistId !== parsedArtistId) {
            console.warn(`⛔ Access Denied: User ${request.username} tried to reject follower for Artist ${artistId}`);
            return res.status(403).json({ error: "Access denied" });
        }

        try {
            const artist = db.getArtist(parsedArtistId);
            if (!artist) return res.status(404).json({ error: "Artist not found" });

            await apService.rejectFollowRequest(artist, actorUri);
            res.json({ success: true, message: "Follower rejected" });
        } catch (e: any) {
            console.error(e);
            res.status(500).json({ error: e.message || "Failed to reject follower" });
        }
    });

    // Sync all content for a specific artist
    router.post("/sync/artist/:artistId", authMiddleware.requireUser, async (req: any, res) => {
        const { artistId } = req.params;
        const request = req as AuthenticatedRequest;
        
        const parsedArtistId = Number(artistId);
        if (isNaN(parsedArtistId)) {
            return res.status(400).json({ error: "Invalid artist ID" });
        }

        if (parsedArtistId === -1) {
            return res.json({ message: "ActivityPub synchronization complete", notes: 0 });
        }

        // Only the owning artist or root admin can sync
        if (!request.isRootAdmin && request.artistId !== parsedArtistId) {
            console.warn(`⛔ Access Denied: User ${request.username} tried to sync AP for Artist ${artistId}`);
            return res.status(403).json({ error: "Access denied" });
        }
        
        try {
            const result = await apService.syncArtistContent(parsedArtistId);
            res.json({ message: "ActivityPub synchronization complete", ...result });
        } catch (e: any) {
            console.error("Failed to sync AP for artist:", e);
            res.status(500).json({ error: e.message || "Sync failed" });
        }
    });

    // Delete published note
    router.delete("/note", authMiddleware.requireUser, async (req: any, res) => {
        const noteId = req.query.id as string;
        if (!noteId) return res.status(400).send("Missing id");

        const note = db.getApNote(noteId);
        if (!note) return res.status(404).send("Note not found");

        // SECURITY: Check if restricted admin owns this note
        const request = req as AuthenticatedRequest;
        if (!request.isRootAdmin && (request.artistId === undefined || request.artistId === null || Number(note.artist_id) !== Number(request.artistId))) {
            console.warn(`⛔ Access Denied: Artist ${request.artistId} tried to delete note ${noteId} owned by Artist ${note.artist_id}`);
            return res.status(403).send("Access denied");
        }

        try {
            if (note.note_type === 'release') {
                const album = db.getAlbum(note.content_id);
                if (album) {
                    await apService.broadcastDelete(album, note.note_id);
                    // Let markApNoteDeleted handle preventing re-sync instead of changing local visibility
                } else {
                    // Album gone, just mark note as deleted
                    db.markApNoteDeleted(noteId);
                }
            } else if (note.note_type === 'post') {
                const post = db.getPost(note.content_id);
                if (post) {
                    await apService.broadcastPostDelete(post, note.note_id);
                    // Let markApNoteDeleted handle preventing re-sync instead of changing local visibility
                } else {
                    // Post gone, just mark note as deleted
                    db.markApNoteDeleted(noteId);
                }
            } else if (note.note_type === 'board') {
                await apService.broadcastGenericDelete(note.artist_id, note.note_id);
            }
            res.send("Deleted");
        } catch (e) {
            console.error("Failed to delete AP note:", e);
            res.status(500).send("Internal Error");
        }
    });

    // Helper: load a note and verify the requester owns it (or is root admin)
    const loadOwnedNote = (req: any, res: any): any | null => {
        const noteId = (req.query.id ?? req.body?.id) as string;
        if (!noteId) {
            res.status(400).json({ error: "Missing note id" });
            return null;
        }
        const note = db.getApNote(noteId);
        if (!note) {
            res.status(404).json({ error: "Note not found" });
            return null;
        }
        const request = req as AuthenticatedRequest;
        if (!request.isRootAdmin && (request.artistId == null || Number(note.artist_id) !== Number(request.artistId))) {
            console.warn(`⛔ Access Denied: Artist ${request.artistId} tried to access note ${noteId} owned by Artist ${note.artist_id}`);
            res.status(403).json({ error: "Access denied" });
            return null;
        }
        return note;
    };

    const enrichActor = (uri: string) => {
        const actor = db.getRemoteActor(uri);
        return actor ? {
            name: actor.name || actor.username || 'Unknown',
            username: actor.username || 'unknown',
            icon_url: actor.icon_url,
            uri: actor.uri
        } : null;
    };

    // List who liked/announced a note (read-only social proof)
    router.get("/note/interactions", authMiddleware.requireUser, (req: any, res) => {
        const note = loadOwnedNote(req, res);
        if (!note) return;
        const interactions = db.getApInteractions(note.note_id).map(i => ({
            actor_uri: i.actor_uri,
            type: i.type,
            created_at: i.created_at,
            actor: enrichActor(i.actor_uri)
        }));
        res.json(interactions);
    });

    // List replies to a note (thread)
    router.get("/note/replies", authMiddleware.requireUser, (req: any, res) => {
        const note = loadOwnedNote(req, res);
        if (!note) return;
        const replies = db.getApReplies(note.note_id).map(r => ({
            id: r.id,
            reply_uri: r.reply_uri,
            actor_uri: r.actor_uri,
            content: r.content,
            published_at: r.published_at || r.created_at,
            actor: enrichActor(r.actor_uri)
        }));
        res.json(replies);
    });

    // Post a federated reply to one of the artist's own notes
    router.post("/note/reply", authMiddleware.requireUser, async (req: any, res) => {
        const note = loadOwnedNote(req, res);
        if (!note) return;
        const { content } = req.body;
        if (!content || !String(content).trim()) {
            return res.status(400).json({ error: "Reply content is required" });
        }
        try {
            const artist = note.artist_id === SITE_ACTOR_ID
                ? ({ id: SITE_ACTOR_ID, slug: getSiteHandle(db), name: db.getSetting("siteName") || "Instance" } as any)
                : db.getArtist(note.artist_id);
            if (!artist) return res.status(404).json({ error: "Artist not found" });
            const result = await apService.postReply(artist, note.note_id, String(content));
            res.json({ success: true, ...result });
        } catch (e: any) {
            console.error("Failed to post reply:", e);
            res.status(500).json({ error: e.message || "Failed to post reply" });
        }
    });

    // Delete a reply you authored. Only the original author may delete their own reply.
    router.delete("/note/reply", authMiddleware.requireUser, async (req: any, res) => {
        const request = req as AuthenticatedRequest;
        const replyUri = (req.query?.uri ?? req.body?.uri) as string | undefined;
        if (!replyUri) {
            return res.status(400).json({ error: "Missing reply uri" });
        }
        const reply = db.getApReply(String(replyUri));
        if (!reply) return res.status(404).json({ error: "Reply not found" });

        const parentNote = db.getApNote(reply.note_id);
        if (!parentNote) return res.status(404).json({ error: "Parent note not found" });

        const artist = parentNote.artist_id === SITE_ACTOR_ID
            ? ({ id: SITE_ACTOR_ID, slug: getSiteHandle(db), name: db.getSetting("siteName") || "Instance" } as any)
            : db.getArtist(parentNote.artist_id);
        if (!artist) return res.status(404).json({ error: "Artist not found" });

        // SECURITY: the requester must own the artist AND the reply must be authored by that artist.
        const ownsArtist = request.isRootAdmin
            || (request.artistId != null && Number(parentNote.artist_id) === Number(request.artistId));
        const ownActorUrl = `${apService.getBaseUrl()}/users/${artist.slug}`;
        const isOwnReply = reply.actor_uri === ownActorUrl;
        if (!ownsArtist || !isOwnReply) {
            console.warn(`⛔ Access Denied: Artist ${request.artistId} tried to delete reply ${replyUri} authored by ${reply.actor_uri}`);
            return res.status(403).json({ error: "You can only delete your own replies" });
        }

        try {
            await apService.deleteReply(artist, String(replyUri));
            res.json({ success: true });
        } catch (e: any) {
            console.error("Failed to delete reply:", e);
            res.status(500).json({ error: e.message || "Failed to delete reply" });
        }
    });

    // Timeline: my posts only
    router.get("/timeline/:artistId", authMiddleware.requireUser, async (req: any, res) => {
        const { artistId } = req.params;
        const request = req as AuthenticatedRequest;

        const parsedArtistId = Number(artistId);
        if (isNaN(parsedArtistId)) return res.status(400).json({ error: "Invalid artist ID" });
        if (!request.isRootAdmin && request.artistId !== parsedArtistId) {
            return res.status(403).json({ error: "Access denied" });
        }

        const items: any[] = [];
        const myNotes = db.getApNotes(parsedArtistId);
        for (const note of myNotes) {
            if (!note.deleted_at) {
                items.push({
                    source: 'mine',
                    type: note.note_type,
                    title: note.content_title,
                    slug: note.content_slug,
                    published_at: note.published_at,
                    note_id: note.note_id,
                    content_id: note.content_id,
                    likes_count: note.likes_count || 0,
                    announces_count: note.announces_count || 0,
                    replies_count: note.replies_count || 0,
                });
            }
        }

        items.sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime());
        res.json(items);
    });

    // Link preview
    router.get("/link-preview", authMiddleware.requireUser, async (req: any, res) => {
        const url = req.query.url as string;
        if (!url) return res.status(400).json({ error: "Missing url" });
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(url, {
                signal: controller.signal as any,
                headers: { 'User-Agent': 'TuneCamp/1.0 (link preview)' }
            });
            clearTimeout(timeout);
            if (!response.ok) return res.status(400).json({ error: "Failed to fetch URL" });
            const html = await response.text();
            const getTag = (name: string): string | null => {
                const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
                    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i'));
                return m ? m[1] : null;
            };
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            res.json({
                url,
                title: getTag('og:title') || titleMatch?.[1] || null,
                description: getTag('og:description') || getTag('description') || null,
                image: getTag('og:image') || null,
                siteName: getTag('og:site_name') || null,
            });
        } catch (e: any) {
            if (e.name === 'AbortError') return res.status(408).json({ error: "Request timed out" });
            res.status(500).json({ error: "Failed to fetch link preview" });
        }
    });

    // Share release to Mastodon manually
    router.post("/mastodon/share-release/:releaseId", authMiddleware.requireUser, async (req: any, res) => {
        const request = req as AuthenticatedRequest;
        const releaseId = Number(req.params.releaseId);
        if (isNaN(releaseId)) return res.status(400).json({ error: "Invalid release ID" });

        const release = db.getRelease ? db.getRelease(releaseId) : (db as any).getAlbum?.(releaseId);
        if (!release) return res.status(404).json({ error: "Release not found" });
        if (!request.isRootAdmin && request.artistId !== release.artist_id) {
            return res.status(403).json({ error: "Access denied" });
        }

        const artist = db.getArtist(release.artist_id!);
        if (!artist) return res.status(404).json({ error: "Artist not found" });

        let postParams = artist.post_params;
        if (typeof postParams === 'string') {
            try { postParams = JSON.parse(postParams); } catch { postParams = null; }
        }
        if (!postParams?.instance || !postParams?.token) {
            return res.status(400).json({ error: "Mastodon cross-posting not configured for this artist" });
        }

        const publicUrl = (db.getSetting("publicUrl") || "").replace(/\/$/, "");
        let statusText = `🎵 "${release.title}" by ${artist.name}`;
        if (release.description) {
            const cleanDesc = release.description.replace(/<[^>]*>?/gm, "").trim();
            statusText += `\n\n${cleanDesc}`;
        }
        if (publicUrl) {
            const releaseUrl = `${publicUrl}/releases/${release.slug}`;
            const suffix = `\n\nListen: ${releaseUrl}`;
            const limit = 500 - suffix.length;
            statusText = statusText.length > limit ? statusText.substring(0, limit - 3) + "..." + suffix : statusText + suffix;
        }

        let instanceUrl = postParams.instance.trim();
        if (!instanceUrl.startsWith("http")) instanceUrl = "https://" + instanceUrl;
        instanceUrl = instanceUrl.replace(/\/$/, "");

        try {
            const response = await fetch(`${instanceUrl}/api/v1/statuses`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${postParams.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ status: statusText })
            });
            if (!response.ok) {
                const text = await response.text();
                return res.status(400).json({ error: `Mastodon API error: ${response.status} - ${text}` });
            }
            res.json({ success: true, message: "Shared to Mastodon!" });
        } catch (e: any) {
            res.status(500).json({ error: e.message || "Failed to share" });
        }
    });

    router.post("/sync", authMiddleware.requireAdmin, async (req, res) => {
        try {
            const result = await apService.syncAllContent();
            res.json({ message: "ActivityPub synchronization complete", ...result });
        } catch (e) {
            console.error("Failed to sync AP:", e);
            res.status(500).json({ error: "Sync failed" });
        }
    });

    // Alias endpoint
    router.post("/identity/alias", authMiddleware.requireUser, async (req: any, res) => {
        const request = req as AuthenticatedRequest;
        let artistId = req.body.artistId ? Number(req.body.artistId) : null;
        if (!request.isRootAdmin) {
            if (request.artistId === undefined || request.artistId === null) {
                return res.status(403).send("Access denied: No linked artist profile");
            }
            artistId = Number(request.artistId);
        } else {
            if (!artistId) {
                return res.status(400).send("Missing artistId");
            }
        }

        const { alsoKnownAs } = req.body;
        if (alsoKnownAs !== null && !Array.isArray(alsoKnownAs)) {
            return res.status(400).send("alsoKnownAs must be an array or null");
        }

        try {
            await apService.setAlsoKnownAs(artistId, alsoKnownAs);
            res.json({ message: "Alias updated successfully" });
        } catch (e: any) {
            console.error("Failed to update alias:", e);
            res.status(500).send(e.message || "Internal Error");
        }
    });

    // Move endpoint
    router.post("/identity/move", authMiddleware.requireUser, async (req: any, res) => {
        const request = req as AuthenticatedRequest;
        let artistId = req.body.artistId ? Number(req.body.artistId) : null;
        if (!request.isRootAdmin) {
            if (request.artistId === undefined || request.artistId === null) {
                return res.status(403).send("Access denied: No linked artist profile");
            }
            artistId = Number(request.artistId);
        } else {
            if (!artistId) {
                return res.status(400).send("Missing artistId");
            }
        }

        const { targetActorUri } = req.body;
        if (!targetActorUri) {
            return res.status(400).send("Missing targetActorUri");
        }

        try {
            await apService.initiateMove(artistId, targetActorUri);
            res.json({ message: "Identity move initiated successfully" });
        } catch (e: any) {
            console.error("Failed to initiate identity move:", e);
            res.status(500).send(e.message || "Internal Error");
        }
    });

    // Import endpoint
    router.post("/identity/import", authMiddleware.requireUser, async (req: any, res) => {
        const request = req as AuthenticatedRequest;
        let artistId = req.body.artistId ? Number(req.body.artistId) : null;
        if (!request.isRootAdmin) {
            if (request.artistId === undefined || request.artistId === null) {
                return res.status(403).send("Access denied: No linked artist profile");
            }
            artistId = Number(request.artistId);
        } else {
            if (!artistId) {
                return res.status(400).send("Missing artistId");
            }
        }

        const { remoteActorUri } = req.body;
        if (!remoteActorUri) {
            return res.status(400).send("Missing remoteActorUri");
        }

        try {
            await apService.importRemoteIdentity(artistId, remoteActorUri);
            res.json({ message: "Remote identity imported successfully" });
        } catch (e: any) {
            console.error("Failed to import remote identity:", e);
            res.status(500).send(e.message || "Internal Error");
        }
    });

    return router;
}
