import crypto from "crypto";
import { createFederation, Person, Endpoints, CryptographicKey, Follow, Accept, Undo, type Federation } from "@fedify/fedify";
import { BetterSqliteKvStore } from "./fedify-kv.js";
import type { DatabaseService } from "./database.js";
import type { ServerConfig } from "./config.js";

export function createFedify(dbService: DatabaseService, config: ServerConfig): Federation<void> {
    const db = dbService.db;
    const kv = new BetterSqliteKvStore(db);

    const federation = createFederation<void>({
        kv,
    });

    // Validates actor handles: @slug@domain
    federation.setActorDispatcher("/users/{handle}", async (ctx, handle) => {
        const artist = dbService.getArtistBySlug(handle);
        if (!artist) return null;

        const publicUrl = dbService.getSetting("publicUrl") || config.publicUrl;
        // Avoid strict dependency on publicUrl just for object construction if internal, 
        // but robust federation needs it.
        const baseUrl = publicUrl ? new URL(publicUrl) : ctx.url;

        // Construct Person object
        // TODO: Use more comprehensive mapping from Artist -> Person
        return new Person({
            id: new URL(`/users/${artist.slug}`, baseUrl),
            preferredUsername: artist.slug,
            name: artist.name,
            summary: artist.bio || "",
            // inbox: new URL(`/users/${artist.slug}/inbox`, baseUrl), // inbox is property of Actor? Person extends Actor.
            inbox: new URL(`/users/${artist.slug}/inbox`, baseUrl),
            endpoints: new Endpoints({
                sharedInbox: new URL("/inbox", baseUrl)
            }),
            publicKey: new CryptographicKey({
                id: new URL(`/users/${artist.slug}#main-key`, baseUrl),
                owner: new URL(`/users/${artist.slug}`, baseUrl),
                publicKey: artist.public_key || ""
            })
        });
    })
        .setKeyPairsDispatcher(async (ctx, handle) => {
            const artist = dbService.getArtistBySlug(handle);
            if (!artist || !artist.private_key || !artist.public_key) return []; // Return empty array if not found

            const privKeyObj = crypto.createPrivateKey(artist.private_key);
            const pubKeyObj = crypto.createPublicKey(artist.public_key);

            const privateKey = await crypto.webcrypto.subtle.importKey(
                "pkcs8",
                privKeyObj.export({ format: "der", type: "pkcs8" }),
                { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
                true,
                ["sign"]
            );

            const publicKey = await crypto.webcrypto.subtle.importKey(
                "spki",
                pubKeyObj.export({ format: "der", type: "spki" }),
                { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
                true,
                ["verify"]
            );

            return [{ privateKey, publicKey }];
        });

    // Inbox listeners for handling Follow/Unfollow activities
    federation
        .setInboxListeners("/users/{handle}/inbox", "/inbox")
        .on(Follow, async (ctx, follow) => {
            // Get the target artist (who is being followed)
            if (follow.objectId == null) {
                console.log("📥 Follow received but no objectId");
                return;
            }

            const parsed = ctx.parseUri(follow.objectId);
            if (parsed?.type !== "actor") {
                console.log("📥 Follow objectId is not an actor:", follow.objectId.toString());
                return;
            }

            const artist = dbService.getArtistBySlug(parsed.identifier);
            if (!artist) {
                console.log("📥 Follow for unknown artist:", parsed.identifier);
                return;
            }

            // Get the follower actor
            const follower = await follow.getActor(ctx);
            if (follower == null) {
                console.log("📥 Could not resolve follower actor");
                return;
            }

            const followerUri = follower.id?.toString();
            const followerInbox = follower.inboxId?.toString();
            const sharedInbox = follower.endpoints?.sharedInbox?.toString();

            if (!followerUri || !followerInbox) {
                console.log("📥 Follower missing required URIs");
                return;
            }

            // Store the follower in the database
            dbService.addFollower(artist.id, followerUri, followerInbox, sharedInbox);
            console.log(`📥 New follower for ${artist.name}: ${followerUri}`);

            // Send Accept activity back to the follower
            await ctx.sendActivity(
                { identifier: parsed.identifier },
                follower,
                new Accept({
                    actor: follow.objectId,
                    object: follow,
                }),
            );
            console.log(`📤 Sent Accept to ${followerUri}`);
        })
        .on(Undo, async (ctx, undo) => {
            // Check if this is an Undo of a Follow (i.e., unfollow)
            const object = await undo.getObject(ctx);
            if (!(object instanceof Follow)) {
                return; // Not an unfollow, ignore
            }

            const follow = object;
            if (follow.objectId == null) return;

            const parsed = ctx.parseUri(follow.objectId);
            if (parsed?.type !== "actor") return;

            const artist = dbService.getArtistBySlug(parsed.identifier);
            if (!artist) return;

            // Get the actor who is unfollowing
            const unfollower = await undo.getActor(ctx);
            const unfollowerUri = unfollower?.id?.toString();

            if (!unfollowerUri) return;

            // Remove from database
            dbService.removeFollower(artist.id, unfollowerUri);
            console.log(`📥 Unfollowed ${artist.name}: ${unfollowerUri}`);
        });

    return federation;
}

