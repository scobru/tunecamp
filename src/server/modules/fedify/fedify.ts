import crypto from "crypto";
import { createFederation, Person, Endpoints, CryptographicKey, Follow, Accept, Undo, Announce, Service, Note, Like, Image, Create, Audio, Article, Move } from "@fedify/fedify";
import { BetterSqliteKvStore } from "./fedify-kv.js";
import type { DatabaseService } from "../../core/database.js";
import type { ServerConfig } from "../../core/config.js";
import { Temporal } from "@js-temporal/polyfill";
import { VisibilityProfile } from "../../common/visibility.js";
import { getSiteHandle } from "../../core/site-actor.js";

export function createFedify(dbService: DatabaseService, config: ServerConfig) {
    const db = dbService.db;
    const kv = new BetterSqliteKvStore(db);

    const getAuthenticatedLoader = async (ctx: any, localHandle?: string) => {
        try {
            const identifier = localHandle || getSiteHandle(dbService);
            return await ctx.getDocumentLoader({ identifier });
        } catch (e: any) {
            console.warn(`⚠️ Failed to get authenticated document loader for ${localHandle || getSiteHandle(dbService)}:`, e.message);
            return ctx.documentLoader;
        }
    };

    // Persist a remote actor's profile (name/avatar/inbox) so followers render with
    // their real identity in the dashboard instead of showing up as "Unknown".
    const cacheFollowerActor = (actor: any) => {
        const uri = actor?.id?.toString();
        if (!uri) return;
        try {
            dbService.upsertRemoteActor({
                uri,
                type: actor instanceof Person ? 'Person' : 'Service',
                username: actor.preferredUsername?.toString() || null,
                name: actor.name?.toString() || null,
                summary: (actor as any).summary?.toString() || null,
                icon_url: (actor as any).icon?.id?.toString() || (actor as any).icon?.toString() || null,
                inbox_url: actor.inboxId?.toString() || null,
                outbox_url: actor.outboxId?.toString() || null,
            });
        } catch (e: any) {
            console.warn(`⚠️ Failed to cache follower actor ${uri}:`, e?.message);
        }
    };

    const federation = createFederation<void>({
        kv,
    });

    federation.setNodeInfoDispatcher("/nodeinfo/2.1", async (ctx) => {
        const publicUrl = dbService.getSetting("publicUrl") || config.publicUrl;
        const baseUrl = publicUrl ? new URL(publicUrl) : ctx.url;
        const siteHandle = getSiteHandle(dbService);
        return {
            software: {
                name: "tunecamp",
                version: { major: 2, minor: 0, patch: 1 },
                homepage: new URL("/", baseUrl),
            },
            protocols: ["activitypub"],
            usage: {
                users: { total: 0 },
                localPosts: 0,
                localComments: 0,
            },
            metadata: {
                // Expose the site-actor URI so remote TuneCamp instances can
                // resolve our instance actor when bare-domain WebFinger guesses
                // miss (discoverSiteActor fallback via getActorIdFromNodeInfo).
                actorId: new URL(`/users/${siteHandle}`, baseUrl).href,
                nodeName: dbService.getSetting("siteName") || config.siteName || "TuneCamp",
            },
        };
    });

    // Validates actor handles: @slug@domain
    federation.setActorDispatcher("/users/{handle}", async (ctx, handle) => {
        let name: string | null = null;
        let summary: string | null = null;
        let publicKey: string | null = null;
        let icon: URL | undefined;
        let type: 'Person' | 'Service' = 'Person';
        let slug = handle;
        let alsoKnownAs: string[] | null = null;
        let movedTo: string | null = null;

        if (handle === getSiteHandle(dbService)) {
            name = dbService.getSetting("siteName") || config.siteName || "TuneCamp Instance";
            summary = dbService.getSetting("siteDescription") || "Tunecamp Federation Actor";
            publicKey = dbService.getSetting("site_public_key") || null;
            type = 'Service';
        } else {
            const artist = dbService.isArtistLinkedToUserBySlug(handle) ? dbService.getArtistBySlug(handle) : null;
            if (artist) {
                name = artist.name;
                summary = artist.bio || "";
                publicKey = artist.public_key || null;
                slug = artist.slug;
                alsoKnownAs = artist.also_known_as || null;
                movedTo = artist.moved_to || null;
            } else {
                // Phase 4: Fall back to regular user account
                const user = dbService.getUserByUsername(handle);
                if (!user?.ap_public_key) return null;
                name = user.username;
                summary = "";
                publicKey = user.ap_public_key;
                slug = user.username;
            }
        }

        const publicUrl = dbService.getSetting("publicUrl") || config.publicUrl;
        const baseUrl = publicUrl ? new URL(publicUrl) : ctx.url;

        // Check for keys
        let cryptoKey: crypto.webcrypto.CryptoKey | undefined;
        if (publicKey) {
            try {
                const pubKeyObj = crypto.createPublicKey(publicKey);
                cryptoKey = await crypto.webcrypto.subtle.importKey(
                    "spki",
                    pubKeyObj.export({ format: "der", type: "spki" }),
                    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
                    true,
                    ["verify"]
                );
            } catch (e) {
                console.error(`Failed to import public key for ${handle}:`, e);
            }
        }

        const actorOptions = {
            id: new URL(`/users/${slug}`, baseUrl),
            preferredUsername: slug,
            name: name,
            summary: summary,
            inbox: new URL(`/users/${slug}/inbox`, baseUrl),
            outbox: new URL(`/users/${slug}/outbox`, baseUrl),
            followers: new URL(`/users/${slug}/followers`, baseUrl),
            following: new URL(`/users/${slug}/following`, baseUrl),
            icon: new Image({ url: new URL(`/api/artists/${slug}/cover`, baseUrl) }),
            image: new Image({ url: new URL(`/api/artists/${slug}/cover`, baseUrl) }),
            url: new URL(handle === getSiteHandle(dbService) ? "/" : `/@${slug}`, baseUrl),
            endpoints: new Endpoints({
                sharedInbox: new URL("/inbox", baseUrl)
            }),
            publicKey: cryptoKey ? new CryptographicKey({
                id: new URL(`/users/${slug}#main-key`, baseUrl),
                owner: new URL(`/users/${slug}`, baseUrl),
                publicKey: cryptoKey
            }) : undefined,
            aliases: alsoKnownAs && alsoKnownAs.length > 0 ? alsoKnownAs.map(uri => new URL(uri)) : undefined,
            successor: movedTo ? new URL(movedTo) : undefined
        };

        return type === 'Service' ? new Service(actorOptions) : new Person(actorOptions);
    })
        .setKeyPairsDispatcher(async (ctx, handle) => {
            let publicKey: string | null = null;
            let privateKeyStr: string | null = null;

            if (handle === getSiteHandle(dbService)) {
                publicKey = dbService.getSetting("site_public_key") || null;
                privateKeyStr = dbService.getSetting("site_private_key") || null;
            } else {
                const artist = dbService.isArtistLinkedToUserBySlug(handle) ? dbService.getArtistBySlug(handle) : null;
                if (artist) {
                    publicKey = artist.public_key || null;
                    privateKeyStr = artist.private_key || null;
                } else {
                    // Phase 4: regular user account
                    const user = dbService.getUserByUsername(handle);
                    if (!user?.ap_public_key) return [];
                    publicKey = user.ap_public_key;
                    privateKeyStr = user.ap_private_key || null;
                }
            }

            if (!privateKeyStr || !publicKey) return [];

            const privKeyObj = crypto.createPrivateKey(privateKeyStr);
            const pubKeyObj = crypto.createPublicKey(publicKey);

            const privateKey = await crypto.webcrypto.subtle.importKey(
                "pkcs8",
                privKeyObj.export({ format: "der", type: "pkcs8" }),
                { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
                true,
                ["sign"]
            );

            const publicKeyObj = await crypto.webcrypto.subtle.importKey(
                "spki",
                pubKeyObj.export({ format: "der", type: "spki" }),
                { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
                true,
                ["verify"]
            );

            return [{ privateKey, publicKey: publicKeyObj }];
        });

    // Object Dispatcher for Audio - provides structured track metadata
    federation.setObjectDispatcher(Audio, "/audio/{id}", async (ctx, { id }) => {
        const track = dbService.getTrack(Number(id));
        if (!track) return null;
        
        const artist = dbService.getArtist(track.artist_id || 0);
        const publicUrl = dbService.getSetting("publicUrl") || config.publicUrl;
        const baseUrl = publicUrl ? new URL(publicUrl) : ctx.url;

        return new Audio({
            id: ctx.getObjectUri(Audio, { id }),
            name: track.title,
            duration: track.duration ? Temporal.Duration.from({ seconds: Math.floor(track.duration) }) : undefined,
            url: new URL(`/api/tracks/${track.id}/stream`, baseUrl),
            mediaType: "audio/mpeg",
            attribution: artist ? new URL(`/users/${artist.slug}`, baseUrl) : undefined,
            icon: artist ? new Image({
                url: new URL(`/api/artists/${artist.slug}/cover`, baseUrl),
                mediaType: "image/jpeg"
            }) : undefined
        });
    });

    // Outbox Dispatcher - allows other instances to fetch historical content
    federation.setOutboxDispatcher("/users/{handle}/outbox", async (ctx, handle, cursor) => {
        const isSite = handle === getSiteHandle(dbService);
        const artist = isSite ? null : dbService.getArtistBySlug(handle);
        if (!artist && !isSite) return null;

        let activities: any[] = [];
        const publicUrl = dbService.getSetting("publicUrl") || config.publicUrl;
        const baseUrl = publicUrl ? new URL(publicUrl) : ctx.url;

        if (artist) {
            // Get public releases
            const albums = dbService.getAlbumsByArtist(artist.id, VisibilityProfile.PUBLIC_STAGE);
            const releases = albums.filter(a => a.is_release && a.is_public);
            
            // Get public posts
            const posts = dbService.getPostsByArtist(artist.id, VisibilityProfile.PUBLIC_STAGE);

            // Fetch tracks for all releases
            const releaseIds = releases.map(r => r.id);
            const allTracks = dbService.getTracksByAlbumIds(releaseIds);
            const tracksByRelease = new Map<number, any[]>();
            for (const track of allTracks) {
                if (!track.album_id) continue;
                if (!tracksByRelease.has(track.album_id)) tracksByRelease.set(track.album_id, []);
                tracksByRelease.get(track.album_id)!.push(track);
            }

            // Combine and create Fedify activities
            for (const release of releases) {
                const tracks = tracksByRelease.get(release.id) || [];
                const published = release.published_at || release.created_at;
                const albumUrl = new URL(`/releases/${release.slug}`, baseUrl);
                
                // If we have tracks, we can emit an Audio object for the first track
                // as a primary object, or use MusicAlbum (but Audio is better supported for playback)
                if (tracks.length > 0) {
                    const mainTrack = tracks[0];
                    activities.push(new Create({
                        id: new URL(`/ap/activity/release/${release.slug}`, baseUrl),
                        actor: new URL(`/users/${artist.slug}`, baseUrl),
                        published: published ? Temporal.Instant.fromEpochMilliseconds(new Date(published).getTime()) : undefined,
                        to: new URL("https://www.w3.org/ns/activitystreams#Public"),
                        object: new Audio({
                            id: ctx.getObjectUri(Audio, { id: String(mainTrack.id) }),
                            name: `${release.title} - ${mainTrack.title}`,
                            duration: mainTrack.duration ? Temporal.Duration.from({ seconds: Math.floor(mainTrack.duration) }) : undefined,
                            url: new URL(`/api/tracks/${mainTrack.id}/stream`, baseUrl),
                            mediaType: "audio/mpeg",
                            attribution: new URL(`/users/${artist.slug}`, baseUrl),
                            icon: new Image({
                                url: new URL(`/api/artists/${artist.slug}/cover`, baseUrl),
                                mediaType: "image/jpeg"
                            })
                        })
                    }));
                } else {
                    // Fallback to Note if no tracks found
                    activities.push(new Create({
                        id: new URL(`/ap/activity/release/${release.slug}`, baseUrl),
                        actor: new URL(`/users/${artist.slug}`, baseUrl),
                        published: published ? Temporal.Instant.fromEpochMilliseconds(new Date(published).getTime()) : undefined,
                        to: new URL("https://www.w3.org/ns/activitystreams#Public"),
                        object: new Note({
                            id: new URL(`/ap/note/release/${release.slug}`, baseUrl),
                            content: `<p>New release available: <a href="${albumUrl}">${release.title}</a></p>`,
                            url: albumUrl,
                            published: published ? Temporal.Instant.fromEpochMilliseconds(new Date(published).getTime()) : undefined,
                            attribution: new URL(`/users/${artist.slug}`, baseUrl),
                        })
                    }));
                }
            }

            for (const post of posts) {
                const published = post.published_at || post.created_at;
                let contentHtml = `<p>${post.content}</p>`;
                if (post.title) {
                    contentHtml = `<h2>${post.title}</h2>` + 
                        (post.summary ? `<p><em>${post.summary}</em></p><hr>` : "") + 
                        contentHtml;
                }
                activities.push(new Create({
                    id: new URL(`/ap/activity/post/${post.slug}`, baseUrl),
                    actor: new URL(`/users/${artist.slug}`, baseUrl),
                    published: published ? Temporal.Instant.fromEpochMilliseconds(new Date(published).getTime()) : undefined,
                    to: new URL("https://www.w3.org/ns/activitystreams#Public"),
                    object: new Article({
                        id: new URL(`/ap/article/post/${post.slug}`, baseUrl),
                        name: post.title || undefined,
                        summary: post.summary || undefined,
                        content: contentHtml,
                        url: new URL(`/artists/${artist.slug}?post=${post.slug}`, baseUrl),
                        published: published ? Temporal.Instant.fromEpochMilliseconds(new Date(published).getTime()) : undefined,
                        attribution: new URL(`/users/${artist.slug}`, baseUrl),
                    })
                }));
            }
        }

        // Sort by date descending
        activities.sort((a, b) => {
            const aTime = a.published ? a.published.epochMilliseconds : 0;
            const bTime = b.published ? b.published.epochMilliseconds : 0;
            return bTime - aTime;
        });

        return {
            items: activities,
        };
    });

    // Followers dispatcher
    federation.setFollowersDispatcher("/users/{handle}/followers", async (ctx, handle, cursor) => {
        const artist = dbService.getArtistBySlug(handle);
        if (!artist) return null;
        const followers = dbService.getFollowers(artist.id);
        return {
            // Skip followers whose inbox could not be resolved yet — `new URL('')`
            // throws and would break the whole followers collection response.
            items: followers
                .filter(f => f.inbox_uri)
                .map(f => ({
                    id: new URL(f.actor_uri),
                    inboxId: new URL(f.inbox_uri)
                })),
        };
    });

    // Following dispatcher (always empty for artists)
    federation.setFollowingDispatcher("/users/{handle}/following", async (ctx, handle, cursor) => {
        return {
            items: [],
        };
    });

    // Inbox listeners for handling Follow/Unfollow activities
    federation
        .setInboxListeners("/users/{handle}/inbox", "/inbox")
        .on(Follow, async (ctx, follow) => {
            // Get the target (who is being followed)
            if (follow.objectId == null) return;

            const parsed = ctx.parseUri(follow.objectId);
            if (parsed?.type !== "actor") return;

            const handle = parsed.identifier;

            // Handle site follow (relay or other instances)
            if (handle === getSiteHandle(dbService)) {
                const docLoader = await getAuthenticatedLoader(ctx, getSiteHandle(dbService));
                const follower = await follow.getActor({ documentLoader: docLoader }).catch(() => null) || await follow.getActor(ctx).catch(() => null);

                // Derive the follower URI even when the actor document could not be
                // fetched — `Follow.actorId` is always present — so a transient network
                // failure never silently drops the follow (which previously required the
                // remote to re-send the request, and left nothing to recover on restart).
                const followerUri = follower?.id?.toString() || follow.actorId?.toString();
                if (!followerUri) {
                    console.warn("⚠️ Site Follow received without a resolvable actor URI; ignoring.");
                    return;
                }
                const followerInbox = follower?.inboxId?.toString() || "";
                const sharedInbox = follower?.endpoints?.sharedInbox?.toString();

                console.log(`📥 New site follower: ${followerUri}`);

                // Persist immediately and unconditionally so the follow is durable.
                dbService.addFollower(-1, followerUri, followerInbox, sharedInbox);
                dbService.acceptFollower(-1, followerUri);
                if (follower) cacheFollowerActor(follower);

                if (follower) {
                    await ctx.sendActivity(
                        { handle: getSiteHandle(dbService) },
                        follower,
                        new Accept({ actor: follow.objectId, object: follow }),
                    ).catch(e => console.warn(`⚠️ Failed to send site Accept to ${followerUri}:`, e?.message));
                } else {
                    console.warn(`⚠️ Site follower ${followerUri} stored, but Accept not sent (actor unresolved). It will be re-attempted on the next Follow or Sync.`);
                }
                return;
            }

            const artist = dbService.getArtistBySlug(handle);
            if (!artist) return;

            // Get the follower actor
            const docLoader = await getAuthenticatedLoader(ctx, handle);
            const follower = await follow.getActor({ documentLoader: docLoader }).catch(() => null) || await follow.getActor(ctx).catch(() => null);

            const followerUri = follower?.id?.toString() || follow.actorId?.toString();
            if (!followerUri) {
                console.warn(`⚠️ Follow for ${artist.name} received without a resolvable actor URI; ignoring.`);
                return;
            }
            const followerInbox = follower?.inboxId?.toString() || "";
            const sharedInbox = follower?.endpoints?.sharedInbox?.toString();

            // Persist the follower up-front so it survives transient fetch failures and
            // instance restarts, even before we manage to resolve their inbox.
            dbService.addFollower(artist.id, followerUri, followerInbox, sharedInbox);
            if (follower) cacheFollowerActor(follower);
            console.log(`📥 New follower for ${artist.name}: ${followerUri}`);

            // Respect the artist's manual-approval preference: leave the request pending
            // (surfaced under "Pending requests") instead of auto-accepting.
            if ((artist as any).manually_approves_followers) {
                console.log(`⏳ Follow from ${followerUri} left pending — ${artist.name} requires manual approval.`);
                return;
            }

            dbService.acceptFollower(artist.id, followerUri);

            // Send Accept activity back to the follower (only possible once resolved).
            if (follower) {
                await ctx.sendActivity(
                    { handle: handle },
                    follower,
                    new Accept({ actor: follow.objectId, object: follow }),
                ).catch(e => console.warn(`⚠️ Failed to send Accept to ${followerUri}:`, e?.message));
            } else {
                console.warn(`⚠️ Follower ${followerUri} accepted for ${artist.name}, but Accept not sent (actor unresolved).`);
            }
        })
        .on(Accept, async (ctx, accept) => {
            // Handle Accept from a Relay
            const docLoader = await getAuthenticatedLoader(ctx, getSiteHandle(dbService));
            const actor = await accept.getActor({ documentLoader: docLoader }).catch(() => null) || await accept.getActor(ctx).catch(() => null);
            if (!actor) return;

            console.log(`✅ Received Accept from: ${actor.id?.toString()}`);

            // Save as remote actor
            dbService.upsertRemoteActor({
                uri: actor.id?.toString() || "",
                type: actor instanceof Person ? 'Person' : 'Service',
                username: actor.preferredUsername?.toString() || null,
                name: actor.name?.toString() || null,
                summary: actor.summary?.toString() || null,
                icon_url: (actor as any).icon?.id?.toString() || (actor as any).icon?.toString() || null,
                inbox_url: actor.inboxId?.toString() || null,
                outbox_url: actor.outboxId?.toString() || null,
            });
        })
        .on(Announce, async (ctx, announce) => {
            try {
                const objectUri = announce.objectId?.toString();
                if (objectUri) {
                    const note = dbService.getApNote(objectUri);
                    if (note) {
                        const docLoader = await getAuthenticatedLoader(ctx, getSiteHandle(dbService));
                        const actor = await announce.getActor({ documentLoader: docLoader }).catch(() => null) || await announce.getActor(ctx).catch(() => null);
                        const actorUri = actor?.id?.toString();
                        if (actor && actorUri) {
                            dbService.addApInteraction(objectUri, actorUri, 'announce', announce.id?.toString());
                            console.log(`🔁 Boost received from ${actorUri} for note ${objectUri}`);
                            
                            // Upsert remote actor
                            dbService.upsertRemoteActor({
                                uri: actorUri,
                                type: actor instanceof Person ? 'Person' : 'Service',
                                username: actor.preferredUsername?.toString() || null,
                                name: actor.name?.toString() || null,
                                summary: (actor as any).summary?.toString() || null,
                                icon_url: (actor as any).icon?.id?.toString() || (actor as any).icon?.toString() || null,
                                inbox_url: actor.inboxId?.toString() || null,
                                outbox_url: actor.outboxId?.toString() || null,
                            });
                        }
                        return;
                    }
                }
            } catch (e) {
                console.error("❌ Error processing Announce boost:", e);
            }

            // This is where "Discovery" happens via Relay or Federating Instances
            try {
                const docLoader = await getAuthenticatedLoader(ctx, getSiteHandle(dbService));
                const object = await announce.getObject({ documentLoader: docLoader }).catch(() => null) || await announce.getObject(ctx).catch(() => null);
                if (!(object instanceof Note) && !(object instanceof Audio)) return;

                const author = await (object as any).getAttribution({ documentLoader: docLoader }).catch(() => null) || await (object as any).getAttribution(ctx).catch(() => null);
                if (!author) return;

                // Extract metadata (Tunecamp specific mapping)
                let audioUrl: string | null = null;
                let coverUrl: string | null = null;
                let duration: number | null = null;
                let title = "Untitled";
                let content: string | null = null;

                if (object instanceof Note) {
                    const note = object;
                    title = note.content?.toString().replace(/<[^>]*>/g, '') || "Untitled";
                    content = note.content?.toString() || null;

                    // We look at attachments for Audio in Notes
                    for await (const attachment of note.getAttachments()) {
                        const type = (attachment as any).type?.toString().toLowerCase();
                        const mediaType = (attachment as any).mediaType?.toString().toLowerCase();
                        
                        if (type?.includes('audio') || mediaType?.startsWith('audio/')) {
                            audioUrl = attachment.id?.toString() || (attachment as any).url?.toString() || null;
                            duration = (attachment as any).duration || null;
                        } else if (type?.includes('image') || mediaType?.startsWith('image/')) {
                            coverUrl = attachment.id?.toString() || (attachment as any).url?.toString() || null;
                        }
                    }
                } else if (object instanceof Audio) {
                    const audio = object;
                    title = audio.name?.toString() || "Untitled";
                    content = audio.content?.toString() || null;
                    audioUrl = audio.id?.toString() || (audio as any).url?.toString() || null;
                    // Fedify Audio duration is a Temporal.Duration
                    duration = audio.duration ? (audio.duration.total('second')) : null;
                    
                    const icon = await audio.getIcon();
                    if (icon) {
                        coverUrl = icon.id?.toString() || (icon as any).url?.toString() || null;
                    }
                }

                if (!audioUrl) return; // Only care about tracks/releases

                console.log(`📡 Discovered remote content: ${object.id?.toString()} by ${author.name?.toString()}`);

                // Upsert remote actor
                const authorUri = author.id?.toString() || "";
                dbService.upsertRemoteActor({
                    uri: authorUri,
                    type: author instanceof Person ? 'Person' : 'Service',
                    username: author.preferredUsername?.toString() || null,
                    name: author.name?.toString() || null,
                    summary: author.summary?.toString() || null,
                    icon_url: (author as any).icon?.id?.toString() || (author as any).icon?.toString() || null,
                    inbox_url: (author as any).inboxId?.toString() || null,
                    outbox_url: (author as any).outboxId?.toString() || null,
                });

                // Upsert remote content
                dbService.upsertRemoteContent({
                    ap_id: object.id?.toString() || "",
                    actor_uri: authorUri,
                    type: 'release', 
                    title,
                    content,
                    url: (object as any).url?.toString() || null,
                    cover_url: coverUrl,
                    stream_url: audioUrl,
                    artist_name: author.name?.toString() || author.preferredUsername?.toString() || "Unknown Artist",
                    album_name: (object as any).summary?.toString() || null,
                    duration,
                    published_at: object.published?.toString() || null,
                });
            } catch (e) {
                console.error("❌ Error processing Announce:", e);
            }
        })
        .on(Like, async (ctx, like) => {
            const objectUri = like.objectId?.toString();
            if (!objectUri) return;

            const note = dbService.getApNote(objectUri);
            if (!note) {
                console.log(`⚠️ Received Like for unknown object: ${objectUri}`);
                return;
            }

            const artist = note.artist_id ? dbService.getArtist(note.artist_id) : null;
            const docLoader = await getAuthenticatedLoader(ctx, artist?.slug || getSiteHandle(dbService));
            const actor = await like.getActor({ documentLoader: docLoader }).catch(() => null) || await like.getActor(ctx).catch(() => null);
            if (!actor || !actor.id) return;
            const actorUri = actor.id.toString();

            dbService.addLike(actorUri, note.note_type as 'album' | 'track' | 'post', note.content_id);
            dbService.addApInteraction(objectUri, actorUri, 'like', like.id?.toString());
            console.log(`❤️ Like received from ${actorUri} for ${note.note_type} ${note.content_slug}`);

            // Upsert remote actor
            dbService.upsertRemoteActor({
                uri: actorUri,
                type: actor instanceof Person ? 'Person' : 'Service',
                username: actor.preferredUsername?.toString() || null,
                name: actor.name?.toString() || null,
                summary: (actor as any).summary?.toString() || null,
                icon_url: (actor as any).icon?.id?.toString() || (actor as any).icon?.toString() || null,
                inbox_url: actor.inboxId?.toString() || null,
                outbox_url: actor.outboxId?.toString() || null,
            });
        })
        .on(Undo, async (ctx, undo) => {
            const docLoader = await getAuthenticatedLoader(ctx, getSiteHandle(dbService));
            const object = await undo.getObject({ documentLoader: docLoader }).catch(() => null) || await undo.getObject(ctx).catch(() => null);

            if (object instanceof Follow) {
                const follow = object;
                if (follow.objectId == null) return;

                const parsed = ctx.parseUri(follow.objectId);
                if (parsed?.type !== "actor") return;

                const handle = parsed.identifier;
                if (handle === getSiteHandle(dbService)) {
                    const docLoaderFollow = await getAuthenticatedLoader(ctx, getSiteHandle(dbService));
                    const unfollower = await undo.getActor({ documentLoader: docLoaderFollow }).catch(() => null) || await undo.getActor(ctx).catch(() => null);
                    const unfollowerUri = unfollower?.id?.toString();
                    console.log(`📥 Site unfollowed by: ${unfollowerUri}`);
                    if (unfollowerUri) {
                        dbService.removeFollower(-1, unfollowerUri);
                    }
                    return;
                }

                const artist = dbService.getArtistBySlug(handle);
                if (!artist) return;

                const docLoaderFollow = await getAuthenticatedLoader(ctx, handle);
                const unfollower = await undo.getActor({ documentLoader: docLoaderFollow }).catch(() => null) || await undo.getActor(ctx).catch(() => null);
                const unfollowerUri = unfollower?.id?.toString();

                if (!unfollowerUri) return;

                dbService.removeFollower(artist.id, unfollowerUri);
                console.log(`📥 Unfollowed ${artist.name}: ${unfollowerUri}`);
            } else if (object instanceof Like) {
                const like = object;
                const objectUri = like.objectId?.toString();
                if (!objectUri) return;

                const note = dbService.getApNote(objectUri);
                if (!note) return;

                const artist = note.artist_id ? dbService.getArtist(note.artist_id) : null;
                const docLoaderLike = await getAuthenticatedLoader(ctx, artist?.slug || getSiteHandle(dbService));
                const actor = await undo.getActor({ documentLoader: docLoaderLike }).catch(() => null) || await undo.getActor(ctx).catch(() => null);
                const actorUri = actor?.id?.toString();
                if (!actorUri) return;

                dbService.removeLike(actorUri, note.note_type as 'album' | 'track' | 'post', note.content_id);
                dbService.removeApInteraction(objectUri, actorUri, 'like');
                console.log(`💔 Undo Like received from ${actorUri} for ${note.note_type} ${note.content_slug}`);
            } else if (object instanceof Announce) {
                const announce = object;
                const objectUri = announce.objectId?.toString();
                if (!objectUri) return;

                const note = dbService.getApNote(objectUri);
                if (!note) return;

                const docLoaderAnnounce = await getAuthenticatedLoader(ctx, getSiteHandle(dbService));
                const actor = await undo.getActor({ documentLoader: docLoaderAnnounce }).catch(() => null) || await undo.getActor(ctx).catch(() => null);
                const actorUri = actor?.id?.toString();
                if (!actorUri) return;

                dbService.removeApInteraction(objectUri, actorUri, 'announce');
                console.log(`💔 Undo Announce received from ${actorUri} for ${note.note_type} ${note.content_slug}`);
            }
        })
        .on(Move, async (ctx, move) => {
            try {
                const oldActorUri = move.actorId?.toString();
                const newActorUri = move.targetId?.toString();

                if (!oldActorUri || !newActorUri) {
                    console.warn("⚠️ Received Move activity without actor or target ID.");
                    return;
                }

                console.log(`📥 Received Move activity via Fedify: ${oldActorUri} is moving to ${newActorUri}`);

                // 1. Fetch the target actor (new profile) to verify the backlink (alsoKnownAs/aliases)
                const documentLoader = await getAuthenticatedLoader(ctx, getSiteHandle(dbService));
                const newActor = await move.getTarget({ documentLoader }).catch(() => null);

                if (!newActor || !(newActor instanceof Person || newActor instanceof Service)) {
                    console.warn(`⚠️ Move verification failed: target ${newActorUri} is not a valid Actor or could not be loaded.`);
                    return;
                }

                // 2. Read aliases from the new actor
                const aliases: string[] = [];
                for await (const alias of newActor.getAliases({ documentLoader })) {
                    if (alias.id) {
                        aliases.push(alias.id.toString());
                    }
                }

                if (!aliases.includes(oldActorUri)) {
                    console.warn(`⚠️ Move verification failed: new actor ${newActorUri} does not list old actor ${oldActorUri} in its alsoKnownAs (aliases found: ${JSON.stringify(aliases)}).`);
                    return;
                }

                // 3. Validation passed! Update local followers database
                const newInbox = newActor.inboxId?.toString();
                const newSharedInbox = newActor.endpoints?.sharedInbox?.toString();
                if (!newInbox) {
                    console.warn(`⚠️ Move warning: new actor ${newActorUri} doesn't expose an inboxId. Cannot update followers inbox.`);
                    return;
                }

                dbService.updateFollowerUri(oldActorUri, newActorUri, newInbox, newSharedInbox);
                console.log(`✅ Move complete! Updated follower record from ${oldActorUri} to ${newActorUri}`);

                // 4. Update cached remote actor if it exists
                const existingRemote = dbService.getRemoteActor(oldActorUri);
                if (existingRemote) {
                    dbService.upsertRemoteActor({
                        uri: newActorUri,
                        type: newActor instanceof Person ? 'Person' : 'Service',
                        username: newActor.preferredUsername?.toString() || null,
                        name: newActor.name?.toString() || null,
                        summary: (newActor as any).summary?.toString() || null,
                        icon_url: (newActor as any).icon?.id?.toString() || (newActor as any).icon?.toString() || null,
                        inbox_url: newInbox,
                        outbox_url: newActor.outboxId?.toString() || null,
                        is_followed: existingRemote.is_followed,
                    });
                    dbService.unfollowActor(oldActorUri);
                }
            } catch (e) {
                console.error("❌ Error processing Move activity:", e);
            }
        });

    return federation;
}
