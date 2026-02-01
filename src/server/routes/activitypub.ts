import { Router } from "express";
import type { DatabaseService } from "../database.js";
import type { ActivityPubService } from "../activitypub.js";

export function createActivityPubRoutes(apService: ActivityPubService, db: DatabaseService): Router {
    const router = Router();

    // Actor Endpoint
    router.get("/users/:slug", async (req, res) => {
        const { slug } = req.params;
        console.log(`👤 Actor request for: ${slug}`);
        const artist = db.getArtistBySlug(slug);

        if (!artist) {
            console.log(`❌ Actor not found: ${slug}`);
            return res.status(404).send("Not found");
        }

        const actor = apService.generateActor(artist);
        res.setHeader("Content-Type", "application/activity+json");
        res.json(actor);
    });

    // Inbox Endpoint
    router.post("/users/:slug/inbox", async (req, res) => {
        const { slug } = req.params;
        const artist = db.getArtistBySlug(slug);

        if (!artist) {
            return res.status(404).send("Not found");
        }

        const activity = req.body;
        console.log(`📨 Received ActivityPub message for ${slug}:`, activity.type);

        try {
            if (activity.type === "Follow") {
                await apService.acceptFollow(artist, activity);
                return res.status(202).send("Accepted");
            } else if (activity.type === "Undo") {
                const object = activity.object;
                if (object.type === "Follow") {
                    const follower = object.actor;
                    db.removeFollower(artist.id, follower);
                    console.log(`➖ Removed follower ${follower} for ${artist.name}`);
                    return res.status(200).send("OK");
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
        const artist = db.getArtistBySlug(slug);

        if (!artist) return res.status(404).send("Not found");

        const baseUrl = apService.getBaseUrl();
        const userUrl = `${baseUrl}/api/ap/users/${artist.slug}`;

        // Get public releases
        const albums = db.getAlbumsByArtist(artist.id, true);
        const releases = albums.filter(a => a.is_release && a.is_public);

        // Get posts
        const posts = db.getPostsByArtist(artist.id);

        // Combine and sort
        const combined = [
            ...releases.map(r => ({ type: 'release', date: r.published_at || r.created_at, item: r })),
            ...posts.map(p => ({ type: 'post', date: p.created_at, item: p }))
        ].sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());

        const orderedItems = combined.map(entry => {
            if (entry.type === 'release') {
                const release = entry.item as any;
                const tracks = db.getTracks(release.id);
                const note = apService.generateNote(release, artist, tracks);
                return {
                    type: "Create",
                    id: `${baseUrl}/api/ap/activity/release/${release.slug}`,
                    actor: userUrl,
                    published: note.published,
                    to: ["https://www.w3.org/ns/activitystreams#Public"],
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
                    cc: [`${userUrl}/followers`],
                    object: note
                };
            }
        });

        res.setHeader("Content-Type", "application/activity+json");
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${userUrl}/outbox`,
            type: "OrderedCollection",
            totalItems: orderedItems.length,
            orderedItems: orderedItems
        });
    });

    // Followers Endpoint
    router.get("/users/:slug/followers", async (req, res) => {
        const { slug } = req.params;
        const artist = db.getArtistBySlug(slug);

        if (!artist) return res.status(404).send("Not found");

        const baseUrl = apService.getBaseUrl();
        const userUrl = `${baseUrl}/api/ap/users/${artist.slug}`;
        const followers = db.getFollowers(artist.id);

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
        const artist = db.getArtistBySlug(slug);

        if (!artist) return res.status(404).send("Not found");

        const baseUrl = apService.getBaseUrl();
        const userUrl = `${baseUrl}/api/ap/users/${artist.slug}`;

        res.setHeader("Content-Type", "application/activity+json");
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${userUrl}/following`,
            type: "OrderedCollection",
            totalItems: 0,
            orderedItems: []
        });
    });

    // Shared Inbox (Optional placeholder)
    router.post("/inbox", (req, res) => {
        res.status(202).send("Accepted");
    });

    // Resolve individual Activity (Release)
    router.get("/activity/release/:slug", async (req, res) => {
        const { slug } = req.params;
        const album = db.getAlbumBySlug(slug);

        if (!album || !album.is_release || !album.is_public) {
            return res.status(404).send("Not found");
        }

        const artist = db.getArtist(album.artist_id!);
        if (!artist) return res.status(404).send("Artist not found");

        const baseUrl = apService.getBaseUrl();
        const userUrl = `${baseUrl}/api/ap/users/${artist.slug}`;
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
            object: note
        });
    });

    // Resolve individual Object (Release Note)
    router.get("/note/release/:slug", async (req, res) => {
        const { slug } = req.params;
        const album = db.getAlbumBySlug(slug);

        if (!album || !album.is_release || !album.is_public) {
            return res.status(404).send("Not found");
        }

        const artist = db.getArtist(album.artist_id!);
        if (!artist) return res.status(404).send("Artist not found");

        const tracks = db.getTracks(album.id);
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

        if (!post) return res.status(404).send("Not found");

        const artist = db.getArtist(post.artist_id);
        if (!artist) return res.status(404).send("Artist not found");

        const baseUrl = apService.getBaseUrl();
        const userUrl = `${baseUrl}/api/ap/users/${artist.slug}`;
        const note = apService.generatePostNote(post, artist);

        res.setHeader("Content-Type", "application/activity+json");
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            type: "Create",
            id: `${baseUrl}/api/ap/activity/post/${post.slug}`,
            actor: userUrl,
            published: note.published,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${userUrl}/followers`],
            object: note
        });
    });

    // Resolve individual Object (Post Note)
    router.get("/note/post/:slug", async (req, res) => {
        const { slug } = req.params;
        const post = db.getPostBySlug(slug);

        if (!post) return res.status(404).send("Not found");

        const artist = db.getArtist(post.artist_id);
        if (!artist) return res.status(404).send("Artist not found");

        const note = apService.generatePostNote(post, artist);

        res.setHeader("Content-Type", "application/activity+json");
        res.json({
            "@context": "https://www.w3.org/ns/activitystreams",
            ...note
        });
    });

    return router;
}

export function createWebFingerRoute(apService: ActivityPubService): Router {
    const router = Router();

    router.get("/webfinger", (req, res) => {
        const resource = req.query.resource as string;
        if (!resource || !resource.startsWith("acct:")) {
            return res.status(400).send("Bad Request: Missing or invalid resource param");
        }

        const finger = apService.generateWebFinger(resource);
        if (!finger) {
            return res.status(404).send("Not found");
        }

        res.setHeader("Content-Type", "application/jrd+json");
        res.json(finger);
    });

    return router;
}
