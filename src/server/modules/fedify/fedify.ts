import crypto from "crypto";
import { createFederation, Person, Endpoints, CryptographicKey, Follow, Accept, Undo, Announce, Service, Note, Like, Image, Create, Audio } from "@fedify/fedify";
import { BetterSqliteKvStore } from "./fedify-kv.js";
import type { DatabaseService } from "../../core/database.js";
import type { ServerConfig } from "../../core/config.js";
import { Temporal } from "@js-temporal/polyfill";
import { VisibilityProfile } from "../../common/visibility.js";

export function createFedify(dbService: DatabaseService, config: ServerConfig) {
    const db = dbService.db;
    const kv = new BetterSqliteKvStore(db);

    const federation = createFederation<void>({
        kv,
    });

    federation.setNodeInfoDispatcher("/nodeinfo/2.1", async (_ctx) => {
        return {
            software: {
                name: "tunecamp",
                version: { major: 2, minor: 0, patch: 1 },
                homepage: new URL("https://tunecamp.app/"),
            },
            protocols: ["activitypub"],
            usage: {
                users: { total: 0 },
                localPosts: 0,
                localComments: 0,
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

        if (handle === "site") {
            name = dbService.getSetting("siteName") || config.siteName || "TuneCamp Instance";
            summary = dbService.getSetting("siteDescription") || "Tunecamp Federation Actor";
            publicKey = dbService.getSetting("site_public_key") || null;
            type = 'Service';
        } else {
            if (!dbService.isArtistLinkedToUserBySlug(handle)) return null;
            const artist = dbService.getArtistBySlug(handle);
            if (!artist) return null;
            name = artist.name;
            summary = artist.bio || "";
            publicKey = artist.public_key || null;
            slug = artist.slug;
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
            icon: new Image({ url: new URL(handle !== "site" ? `/api/artists/${slug}/cover` : `/vite.svg`, baseUrl) }),
            image: new Image({ url: new URL(handle !== "site" ? `/api/artists/${slug}/cover` : `/vite.svg`, baseUrl) }),
            url: new URL(handle === "site" ? "/" : `/@${slug}`, baseUrl),
            endpoints: new Endpoints({
                sharedInbox: new URL("/inbox", baseUrl)
            }),
            publicKey: cryptoKey ? new CryptographicKey({
                id: new URL(`/users/${slug}#main-key`, baseUrl),
                owner: new URL(`/users/${slug}`, baseUrl),
                publicKey: cryptoKey
            }) : undefined
        };

        return type === 'Service' ? new Service(actorOptions) : new Person(actorOptions);
    })
        .setKeyPairsDispatcher(async (ctx, handle) => {
            let publicKey: string | null = null;
            let privateKeyStr: string | null = null;

            if (handle === "site") {
                publicKey = dbService.getSetting("site_public_key") || null;
                privateKeyStr = dbService.getSetting("site_private_key") || null;
            } else {
                if (!dbService.isArtistLinkedToUserBySlug(handle)) return [];
                const artist = dbService.getArtistBySlug(handle);
                if (!artist) return [];
                publicKey = artist.public_key || null;
                privateKeyStr = artist.private_key || null;
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
        const isSite = handle === "site";
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
                activities.push(new Create({
                    id: new URL(`/ap/activity/post/${post.slug}`, baseUrl),
                    actor: new URL(`/users/${artist.slug}`, baseUrl),
                    published: published ? Temporal.Instant.fromEpochMilliseconds(new Date(published).getTime()) : undefined,
                    to: new URL("https://www.w3.org/ns/activitystreams#Public"),
                    object: new Note({
                        id: new URL(`/ap/note/post/${post.slug}`, baseUrl),
                        content: `<p>${post.content}</p>`,
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
            if (handle === "site") {
                const follower = await follow.getActor(ctx);
                if (!follower) return;

                // For site follow, we just accept it and maybe store it as a peer
                console.log(`📥 New site follower: ${follower.id?.toString()}`);

                await ctx.sendActivity(
                    { handle: "site" },
                    follower,
                    new Accept({
                        actor: follow.objectId,
                        object: follow,
                    }),
                );
                return;
            }

            const artist = dbService.getArtistBySlug(handle);
            if (!artist) return;

            // Get the follower actor
            const follower = await follow.getActor(ctx);
            if (follower == null) return;

            const followerUri = follower.id?.toString();
            const followerInbox = follower.inboxId?.toString();
            const sharedInbox = follower.endpoints?.sharedInbox?.toString();

            if (!followerUri || !followerInbox) return;

            // Store the follower in the database
            dbService.addFollower(artist.id, followerUri, followerInbox, sharedInbox);
            console.log(`📥 New follower for ${artist.name}: ${followerUri}`);

            // Send Accept activity back to the follower
            await ctx.sendActivity(
                { handle: handle },
                follower,
                new Accept({
                    actor: follow.objectId,
                    object: follow,
                }),
            );
        })
        .on(Accept, async (ctx, accept) => {
            // Handle Accept from a Relay
            const actor = await accept.getActor(ctx);
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
            // This is where "Discovery" happens via Relay or Federating Instances
            try {
                const object = await announce.getObject(ctx);
                if (!(object instanceof Note) && !(object instanceof Audio)) return;

                const author = await (object as any).getAttribution(ctx);
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

            const actor = await like.getActor(ctx);
            if (!actor || !actor.id) return;
            const actorUri = actor.id.toString();

            dbService.addLike(actorUri, note.note_type as 'album' | 'track' | 'post', note.content_id);
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
            const object = await undo.getObject(ctx);

            if (object instanceof Follow) {
                const follow = object;
                if (follow.objectId == null) return;

                const parsed = ctx.parseUri(follow.objectId);
                if (parsed?.type !== "actor") return;

                const handle = parsed.identifier;
                if (handle === "site") {
                    console.log(`📥 Site unfollowed by: ${(await undo.getActor(ctx))?.id?.toString()}`);
                    return;
                }

                const artist = dbService.getArtistBySlug(handle);
                if (!artist) return;

                const unfollower = await undo.getActor(ctx);
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

                const actor = await undo.getActor(ctx);
                const actorUri = actor?.id?.toString();
                if (!actorUri) return;

                dbService.removeLike(actorUri, note.note_type as 'album' | 'track' | 'post', note.content_id);
                console.log(`💔 Undo Like received from ${actorUri} for ${note.note_type} ${note.content_slug}`);
            }
        });

    return federation;
}
