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

        const orderedItems = releases.map(release => {
            const albumUrl = `${baseUrl}/album/${release.slug}`;
            const published = release.published_at || release.created_at;

            return {
                type: "Create",
                id: `${baseUrl}/activity/release/${release.slug}`,
                actor: userUrl,
                published: published,
                to: ["https://www.w3.org/ns/activitystreams#Public"],
                object: {
                    type: "Note",
                    id: `${baseUrl}/note/release/${release.slug}`,
                    attributedTo: userUrl,
                    content: `<p>New release available: <a href="${albumUrl}">${release.title}</a></p>`,
                    url: albumUrl,
                    published: published,
                    to: ["https://www.w3.org/ns/activitystreams#Public"]
                }
            };
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
