import { Router, json } from "express";
import type { DatabaseService, Track } from "../../core/database.js";
import { VisibilityProfile } from "../../common/visibility.js";
import type { ActivityPubService } from "../../modules/activitypub/activitypub.service.js";
import { createAuthMiddleware, type AuthenticatedRequest } from "../../middleware/auth.js";

import type { ServiceContainer } from "../../core/container.js";

export function createActivityPubRoutes(container: ServiceContainer): Router {
    const apService: ServiceContainer['apService'] = (container as any).apService || (container as any);
    const db: ServiceContainer['database'] = (container as any).database || (container as any);
    const authMiddleware: ServiceContainer['authMiddleware'] = (container as any).authMiddleware || (container as any);
    const router = Router();
    router.use(json({ type: ["application/json", "application/activity+json", "application/ld+json"] }));

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
                const targetActor = artist || { id: -1, slug: "site", name: "Site" } as any;
                await apService.acceptFollow(targetActor, activity);
                return res.status(202).send("Accepted");
            } else if (hasType(activity.type, "Undo")) {
                const object = activity.object;
                const actorUri = typeof activity.actor === 'string' ? activity.actor : activity.actor?.id;
                if (object && hasType(object.type, "Follow") && artist) {
                    const follower = object.actor;
                    db.removeFollower(artist.id, follower);
                    console.log(`➖ Removed follower ${follower} for ${artist.name}`);
                    return res.status(200).send("OK");
                } else if (object && hasType(object.type, "Like") && actorUri) {
                    const targetId = typeof object.object === 'string' ? object.object : object.object?.id;
                    if (targetId) {
                        db.removeApInteraction(targetId, actorUri, 'like');
                        console.log(`💔 Removed like from ${actorUri} on ${targetId}`);
                    }
                    return res.status(200).send("OK");
                } else if (object && hasType(object.type, "Announce") && actorUri) {
                    const targetId = typeof object.object === 'string' ? object.object : object.object?.id;
                    if (targetId) {
                        db.removeApInteraction(targetId, actorUri, 'announce');
                        console.log(`🔁 Removed announce from ${actorUri} on ${targetId}`);
                    }
                    return res.status(200).send("OK");
                }
            } else if (hasType(activity.type, "Like")) {
                const actorUri = typeof activity.actor === 'string' ? activity.actor : activity.actor?.id;
                const targetId = typeof activity.object === 'string' ? activity.object : activity.object?.id;
                if (actorUri && targetId) {
                    db.addApInteraction(targetId, actorUri, 'like', activity.id);
                    console.log(`❤️ Like from ${actorUri} on ${targetId}`);
                }
                return res.status(200).send("OK");
            } else if (hasType(activity.type, "Announce")) {
                const actorUri = typeof activity.actor === 'string' ? activity.actor : activity.actor?.id;
                const targetId = typeof activity.object === 'string' ? activity.object : activity.object?.id;
                if (actorUri && targetId) {
                    db.addApInteraction(targetId, actorUri, 'announce', activity.id);
                    console.log(`🔁 Announce from ${actorUri} on ${targetId}`);
                }
                return res.status(200).send("OK");
            } else if (hasType(activity.type, "Move")) {
                const oldActorUri = typeof activity.actor === 'string' ? activity.actor : activity.actor?.id;
                const newActorUri = typeof activity.target === 'string' ? activity.target : activity.target?.id;
                if (oldActorUri && newActorUri) {
                    await apService.handleMoveActivity(oldActorUri, newActorUri);
                    return res.status(200).send("OK");
                }
            } else if (hasType(activity.type, "Create")) {
                const obj = activity.object;

                // Reply handling: if this Create(Note) replies to one of OUR notes, store it as a thread reply
                const inReplyTo = obj && (typeof obj.inReplyTo === 'string' ? obj.inReplyTo : obj.inReplyTo?.id);
                if (obj && inReplyTo) {
                    let parentNote = db.getApNote(inReplyTo);
                    let targetNoteId = inReplyTo;
                    if (!parentNote) {
                        // Check if it's a nested reply replying to an existing reply
                        const parentReply = db.getApReply(inReplyTo);
                        if (parentReply) {
                            parentNote = db.getApNote(parentReply.note_id);
                            targetNoteId = parentReply.note_id;
                        }
                    }

                    if (parentNote) {
                        const actorUri = typeof activity.actor === 'string' ? activity.actor : activity.actor?.id;
                        const replyUri = obj.id || activity.id;
                        if (actorUri && replyUri) {
                            // Best-effort fetch of the remote actor profile for display (name/avatar)
                            await apService.cacheRemoteActor(actorUri).catch(() => {});
                            db.addApReply(targetNoteId, replyUri, actorUri, obj.content || obj.summary || "", obj.published || new Date().toISOString());
                            console.log(`💬 Stored reply from ${actorUri} on note ${targetNoteId} (replying to ${inReplyTo})`);
                        }
                        return res.status(200).send("OK");
                    }
                }

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
        const apiUrl = `${baseUrl}/users/${slug}`; // API Base

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
                    const article = apService.generatePostArticle(post, artist);
                    return {
                        type: "Create",
                        id: `${baseUrl}/api/ap/activity/post/${post.slug}`,
                        actor: userUrl,
                        published: article.published,
                        to: ["https://www.w3.org/ns/activitystreams#Public"],
                        cc: [`${apiUrl}/followers`],
                        object: article
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
        const userUrl = `${baseUrl}/users/${slug}`;
        const followers = db.getFollowers(isSite ? -1 : artist!.id);

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
        const userUrl = `${baseUrl}/users/${slug}`;

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
                is_following_back: db.isFollowing(parsedArtistId, f.actor_uri),
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
            const artist = note.artist_id === -1
                ? ({ id: -1, slug: "site", name: "Site" } as any)
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

        const artist = parentNote.artist_id === -1
            ? ({ id: -1, slug: "site", name: "Site" } as any)
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

    // Follow back / unfollow a remote actor as the artist (sends a real Follow / Undo(Follow))
    const resolveFollowerHandle = (parsedArtistId: number): string | null => {
        if (parsedArtistId === -1) return "site";
        const artist = db.getArtist(parsedArtistId);
        return artist?.slug ?? null;
    };

    router.post("/followers/follow-back", authMiddleware.requireUser, async (req: any, res) => {
        const { artistId, actorUri } = req.body;
        const request = req as AuthenticatedRequest;
        const parsedArtistId = Number(artistId);
        if (isNaN(parsedArtistId) || !actorUri) {
            return res.status(400).json({ error: "Invalid artistId or actorUri" });
        }
        if (parsedArtistId === -1 && !request.isRootAdmin) {
            return res.status(403).json({ error: "Access denied" });
        }
        if (!request.isRootAdmin && request.artistId !== parsedArtistId) {
            return res.status(403).json({ error: "Access denied" });
        }
        try {
            const handle = resolveFollowerHandle(parsedArtistId);
            if (!handle) return res.status(404).json({ error: "Artist not found" });
            await apService.followRemoteActor(actorUri, handle);
            res.json({ success: true, following: true });
        } catch (e: any) {
            console.error("Failed to follow back:", e);
            res.status(500).json({ error: e.message || "Failed to follow back" });
        }
    });

    router.post("/followers/unfollow", authMiddleware.requireUser, async (req: any, res) => {
        const { artistId, actorUri } = req.body;
        const request = req as AuthenticatedRequest;
        const parsedArtistId = Number(artistId);
        if (isNaN(parsedArtistId) || !actorUri) {
            return res.status(400).json({ error: "Invalid artistId or actorUri" });
        }
        if (parsedArtistId === -1 && !request.isRootAdmin) {
            return res.status(403).json({ error: "Access denied" });
        }
        if (!request.isRootAdmin && request.artistId !== parsedArtistId) {
            return res.status(403).json({ error: "Access denied" });
        }
        try {
            const handle = resolveFollowerHandle(parsedArtistId);
            if (!handle) return res.status(404).json({ error: "Artist not found" });
            await apService.unfollowRemoteActor(actorUri, handle);
            res.json({ success: true, following: false });
        } catch (e: any) {
            console.error("Failed to unfollow:", e);
            res.status(500).json({ error: e.message || "Failed to unfollow" });
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
