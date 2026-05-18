import { Router } from "express";
import type { DatabaseService, Track } from "../../core/database.js";
import { VisibilityProfile } from "../../common/visibility.js";
import type { ActivityPubService } from "../../modules/activitypub/activitypub.service.js";
import { createAuthMiddleware, type AuthenticatedRequest } from "../../middleware/auth.js";

export function createActivityPubRoutes(apService: ActivityPubService, db: DatabaseService, authMiddleware: ReturnType<typeof createAuthMiddleware>): Router {
    const router = Router();

    // Actor Endpoint
    router.get("/users/:slug", async (req, res) => {
        const { slug } = req.params;
        let actor;
        if (slug === "site") {
            const siteName = db.getSetting("siteName") || "TuneCamp Instance";
            const siteDescription = db.getSetting("siteDescription") || "Tunecamp Federation Actor";
            actor = apService.generateActor({
                slug: "site",
                name: siteName,
                bio: siteDescription
            });
        } else {
            const artist = db.getArtistBySlug(slug);
            if (!artist) {
                console.log(`❌ Actor not found: ${slug}`);
                return res.status(404).send("Not found");
            }
            actor = apService.generateActor(artist);
        }

        res.setHeader("Content-Type", "application/activity+json");
        res.json(actor);
    });

    // Inbox Endpoint
    router.post("/users/:slug/inbox", async (req, res) => {
        const { slug } = req.params;
        const isSite = slug === "site";
        const artist = isSite ? null : db.getArtistBySlug(slug);

        if (!artist && !isSite) {
            return res.status(404).send("Not found");
        }

        const activity = req.body;
        console.log(`📨 Received ActivityPub message for ${slug}:`, activity.type);

        // Signature Verification
        const isValid = await apService.verifySignature(req);
        if (!isValid) {
            console.warn(`🔒 Rejected invalid Signature for inbox @${slug}`);
            return res.status(401).send("Unauthorized: Invalid ActivityPub signature");
        }

        // Helper: ActivityPub types can be a string OR an array of strings
        const hasType = (typeField: any, ...targets: string[]): boolean => {
            if (!typeField) return false;
            if (Array.isArray(typeField)) {
                return targets.some(t => typeField.includes(t));
            }
            return targets.includes(typeField);
        };

        try {
            if (hasType(activity.type, "Follow")) {
                // For the site actor, create a minimal artist-like object
                const actorForAccept = artist || { id: -1, slug: "site", name: "Site" } as any;
                await apService.acceptFollow(actorForAccept, activity);
                return res.status(202).send("Accepted");
            } else if (hasType(activity.type, "Undo")) {
                const object = activity.object;
                if (hasType(object.type, "Follow") && artist) {
                    const follower = object.actor;
                    db.removeFollower(artist.id, follower);
                    console.log(`➖ Removed follower ${follower} for ${artist.name}`);
                    return res.status(200).send("OK");
                }
            } else if (hasType(activity.type, "Create")) {
                const obj = activity.object;
                // Parse Funkwhale/Music/Tunecamp objects (handles array types like ["Note", "MusicAlbum"])
                if (obj && hasType(obj.type, "Note", "Audio", "Track", "Artist", "Album", "MusicRecording", "MusicAlbum", "Article")) {
                    console.log(`🎵 Parsing remote music object: ${JSON.stringify(obj.type)} (${obj.name || obj.title})`);

                    let type = 'post';
                    if (hasType(obj.type, "Audio", "Track", "Album", "MusicRecording", "MusicAlbum") || 
                        (obj.attachment && Array.isArray(obj.attachment) && obj.attachment.some((a: any) => hasType(a.type, "Audio") || a.mediaType?.startsWith("audio/")))) {
                        type = 'release';
                    }

                    const attachments = Array.isArray(obj.attachment) ? obj.attachment : (obj.attachment ? [obj.attachment] : []);
                    const audioAttachment = attachments.find((a: any) => hasType(a.type, "Audio") || a.mediaType?.startsWith("audio/"));

                    // Map to RemoteContent
                    const remoteContent = {
                        ap_id: obj.id,
                        actor_uri: typeof activity.actor === 'string' ? activity.actor : activity.actor.id,
                        type: type,
                        title: obj.name || obj.title || obj.content?.replace(/<[^>]*>?/gm, '').substring(0, 50),
                        content: obj.content || obj.summary || "",
                        url: obj.url || (Array.isArray(obj.url) ? obj.url[0]?.href : obj.url?.href),
                        cover_url: obj.image?.url || obj.icon?.url || (attachments.find((a: any) => hasType(a.type, "Image") || a.mediaType?.startsWith("image/"))?.url),
                        stream_url: hasType(obj.type, "Audio") ? obj.url : audioAttachment?.url || audioAttachment?.href,
                        artist_name: obj.attributedTo?.name || "Remote Artist",
                        album_name: obj.name || obj.title || null,
                        published_at: obj.published || new Date().toISOString()
                    };

                    db.upsertRemoteContent(remoteContent as any);
                    console.log(`✅ Saved remote content (${type}): ${remoteContent.title}`);
                }
            }
        } catch (e) {
            console.error("❌ Error processing inbox activity:", e);
            return res.status(500).send("Internal Error");
        }

        // Default to accepted (but ignored)
        res.status(202).send("Accepted");
    });

    // Outbox Endpoint
    router.get("/users/:slug/outbox", async (req, res) => {
        const { slug } = req.params;
        const isSite = slug === "site";
        const artist = isSite ? null : db.getArtistBySlug(slug);

        if (!artist && !isSite) return res.status(404).send("Not found");

        const baseUrl = apService.getBaseUrl();
        const userUrl = `${baseUrl}/users/${slug}`; // Actor ID
        const apiUrl = `${baseUrl}/api/ap/users/${slug}`; // API Base

        let orderedItems: any[] = [];

        if (isSite) {
            // Site outbox currently empty
            orderedItems = [];
        } else if (artist) {
            // Get public releases
            const albums = db.getAlbumsByArtist(artist.id, VisibilityProfile.PUBLIC_STAGE);
            const releases = albums.filter(a => a.is_release && a.is_public);

            // Get posts (only public)
            const posts = db.getPostsByArtist(artist.id, VisibilityProfile.PUBLIC_STAGE);

            // OPTIMIZATION: Fetch all tracks for these releases in one go
            const releaseIds = releases.map(r => r.id);
            const allTracks = db.getTracksByAlbumIds(releaseIds);
            const tracksByRelease = new Map<number, Track[]>();
            for (const track of allTracks) {
                if (!track.album_id) continue;
                if (!tracksByRelease.has(track.album_id)) {
                    tracksByRelease.set(track.album_id, []);
                }
                tracksByRelease.get(track.album_id)!.push(track);
            }

            // Combine and sort
            const combined = [
                ...releases.map(r => ({ type: 'release', date: r.published_at || r.created_at, item: r })),
                ...posts.map(p => ({ type: 'post', date: p.created_at, item: p }))
            ].sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());

            orderedItems = combined.map(entry => {
                if (entry.type === 'release') {
                    const release = entry.item as any;
                    const tracks = tracksByRelease.get(release.id) || [];
                    const note = apService.generateNote(release, artist, tracks);
                    return {
                        type: "Create",
                        id: `${baseUrl}/api/ap/activity/release/${release.slug}`,
                        actor: userUrl,
                        published: note.published,
                        to: ["https://www.w3.org/ns/activitystreams#Public"],
                        cc: [`${apiUrl}/followers`],
                        object: note
                    };
                } else {
                    const post = entry.item as any;
                    const note = apService.generatePostNote(post, artist);
                    return {
                        type: "Create",
                        id: `${baseUrl}/api/ap/activity/post/${post.slug}`,
                        actor: userUrl,
                        published: note.published,
                        to: ["https://www.w3.org/ns/activitystreams#Public"],
                        cc: [`${apiUrl}/followers`],
                        object: note
                    };
                }
            });
        }

        res.setHeader("Content-Type", "application/activity+json");
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${apiUrl}/outbox`,
            type: "OrderedCollection",
            totalItems: orderedItems.length,
            orderedItems: orderedItems
        });
    });

    // Followers Endpoint
    router.get("/users/:slug/followers", async (req, res) => {
        const { slug } = req.params;
        const isSite = slug === "site";
        const artist = isSite ? null : db.getArtistBySlug(slug);

        if (!artist && !isSite) return res.status(404).send("Not found");

        const baseUrl = apService.getBaseUrl();
        const userUrl = `${baseUrl}/api/ap/users/${slug}`;
        const followers = isSite ? [] : db.getFollowers(artist!.id);

        res.setHeader("Content-Type", "application/activity+json");
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${userUrl}/followers`,
            type: "OrderedCollection",
            totalItems: followers.length,
            orderedItems: followers.map(f => f.actor_uri)
        });
    });

    // Following Endpoint
    router.get("/users/:slug/following", async (req, res) => {
        const { slug } = req.params;
        const isSite = slug === "site";
        const artist = isSite ? null : db.getArtistBySlug(slug);

        if (!artist && !isSite) return res.status(404).send("Not found");

        const baseUrl = apService.getBaseUrl();
        const userUrl = `${baseUrl}/api/ap/users/${slug}`;

        res.setHeader("Content-Type", "application/activity+json");
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${userUrl}/following`,
            type: "OrderedCollection",
            totalItems: 0,
            orderedItems: []
        });
    });

    // Shared Inbox - processes activities sent to the instance level
    router.post("/inbox", async (req, res) => {
        const activity = req.body;
        console.log(`📨 Shared inbox received: ${activity?.type}`);

        // Signature Verification
        const isValid = await apService.verifySignature(req);
        if (!isValid) {
            console.warn(`🔒 Rejected invalid Signature for shared inbox`);
            return res.status(401).send("Unauthorized: Invalid ActivityPub signature");
        }

        // Helper for array-safe type check
        const hasType = (typeField: any, ...targets: string[]): boolean => {
            if (!typeField) return false;
            if (Array.isArray(typeField)) {
                return targets.some(t => typeField.includes(t));
            }
            return targets.includes(typeField);
        };

        try {
            if (hasType(activity?.type, "Create")) {
                const obj = activity.object;
                if (obj && hasType(obj.type, "Note", "Audio", "Track", "Album", "MusicRecording", "MusicAlbum", "Article")) {
                    let type = 'post';
                    if (hasType(obj.type, "Audio", "Track", "Album", "MusicRecording", "MusicAlbum") ||
                        (obj.attachment && Array.isArray(obj.attachment) && obj.attachment.some((a: any) => hasType(a.type, "Audio") || a.mediaType?.startsWith("audio/")))) {
                        type = 'release';
                    }

                    const attachments = Array.isArray(obj.attachment) ? obj.attachment : (obj.attachment ? [obj.attachment] : []);
                    const audioAttachment = attachments.find((a: any) => hasType(a.type, "Audio") || a.mediaType?.startsWith("audio/"));

                    const remoteContent = {
                        ap_id: obj.id,
                        actor_uri: typeof activity.actor === 'string' ? activity.actor : activity.actor?.id,
                        type,
                        title: obj.name || obj.title || obj.content?.replace(/<[^>]*>?/gm, '').substring(0, 50) || "Untitled",
                        content: obj.content || obj.summary || "",
                        url: obj.url || (Array.isArray(obj.url) ? obj.url[0]?.href : obj.url?.href),
                        cover_url: obj.image?.url || obj.icon?.url || (attachments.find((a: any) => hasType(a.type, "Image") || a.mediaType?.startsWith("image/"))?.url),
                        stream_url: hasType(obj.type, "Audio") ? obj.url : audioAttachment?.url || audioAttachment?.href,
                        artist_name: obj.attributedTo?.name || "Remote Artist",
                        album_name: obj.name || obj.title || null,
                        published_at: obj.published || new Date().toISOString()
                    };

                    if (remoteContent.ap_id) {
                        db.upsertRemoteContent(remoteContent as any);
                        console.log(`✅ Shared inbox stored remote ${type}: ${remoteContent.title}`);
                    }
                }
            }
        } catch (e) {
            console.error("❌ Error processing shared inbox:", e);
        }

        res.status(202).send("Accepted");
    });

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
        const apiUrl = `${baseUrl}/api/ap/users/${artist.slug}`;
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
        const apiUrl = `${baseUrl}/api/ap/users/${artist.slug}`;
        const note = apService.generatePostNote(post, artist);

        res.setHeader("Content-Type", "application/activity+json");
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            type: "Create",
            id: `${baseUrl}/api/ap/activity/post/${post.slug}`,
            actor: userUrl,
            published: note.published,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${apiUrl}/followers`],
            object: note
        });
    });

    // Resolve individual Object (Post Note)
    router.get("/note/post/:slug/:timestamp?", async (req, res) => {
        const { slug } = req.params;
        const post = db.getPostBySlug(slug);

        if (!post || post.visibility !== 'public') return res.status(404).send("Not found");

        const artist = db.getArtist(post.artist_id);
        if (!artist) return res.status(404).send("Artist not found");

        const note = apService.generatePostNote(post, artist);

        res.setHeader("Content-Type", "application/activity+json");
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            ...note
        });
    });

    // List published content for artist
    router.get("/published/:artistId", authMiddleware.requireUser, (req: any, res) => {
        const { artistId } = req.params;
        const request = req as AuthenticatedRequest;
        
        // Security: Non-admin users can only see their own artist's data
        if (!request.isAdmin && request.artistId !== Number(artistId)) {
            console.warn(`⛔ Access Denied: User ${request.username} tried to access AP published content for Artist ${artistId}`);
            return res.status(403).json({ error: "Access denied" });
        }
        
        const notes = db.getApNotes(Number(artistId));
        res.json(notes);
    });

    // Get followers for artist with actor details
    router.get("/followers/:artistId", authMiddleware.requireUser, (req: any, res) => {
        const { artistId } = req.params;
        const request = req as AuthenticatedRequest;

        // Security: Non-admin users can only see their own artist's data
        if (!request.isAdmin && request.artistId !== Number(artistId)) {
            console.warn(`⛔ Access Denied: User ${request.username} tried to access AP followers for Artist ${artistId}`);
            return res.status(403).json({ error: "Access denied" });
        }

        const followers = db.getFollowers(Number(artistId));

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

    // Sync all content for a specific artist
    router.post("/sync/artist/:artistId", authMiddleware.requireUser, async (req: any, res) => {
        const { artistId } = req.params;
        const request = req as AuthenticatedRequest;
        
        // Security: Non-admin users can only sync their own data
        if (!request.isAdmin && request.artistId !== Number(artistId)) {
            console.warn(`⛔ Access Denied: User ${request.username} tried to sync AP for Artist ${artistId}`);
            return res.status(403).json({ error: "Access denied" });
        }
        
        try {
            const result = await apService.syncArtistContent(Number(artistId));
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

        // SECURITY FIX: Check if restricted admin owns this note
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
            }
            res.send("Deleted");
        } catch (e) {
            console.error("Failed to delete AP note:", e);
            res.status(500).send("Internal Error");
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

    return router;
}

