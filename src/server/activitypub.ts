import crypto from "crypto";
import fetch from "node-fetch";
import type { DatabaseService, Artist, Album } from "./database.js";
import type { ServerConfig } from "./config.js";

export class ActivityPubService {
    constructor(
        private db: DatabaseService,
        private config: ServerConfig
    ) { }

    public getDomain(): string {
        const publicUrl = this.db.getSetting("publicUrl") || this.config.publicUrl;
        if (!publicUrl) return "localhost";
        return new URL(publicUrl).hostname;
    }

    public getBaseUrl(): string {
        const publicUrl = this.db.getSetting("publicUrl") || this.config.publicUrl;
        return publicUrl || `http://localhost:${this.config.port}`;
    }

    // Key Management
    public async ensureArtistKeys(artistId: number): Promise<void> {
        const artist = this.db.getArtist(artistId);
        if (!artist) return;

        if (!artist.public_key || !artist.private_key) {
            console.log(`🔑 Generating ActivityPub keys for artist: ${artist.name}`);
            const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
                modulusLength: 4096,
                publicKeyEncoding: {
                    type: "spki",
                    format: "pem"
                },
                privateKeyEncoding: {
                    type: "pkcs8",
                    format: "pem"
                }
            });
            this.db.updateArtistKeys(artistId, publicKey, privateKey);
        }
    }

    public async generateKeysForAllArtists(): Promise<void> {
        const artists = this.db.getArtists();
        for (const artist of artists) {
            await this.ensureArtistKeys(artist.id);
        }
    }

    // JSON-LD Generators
    public generateWebFinger(resource: string): any {
        const [_, username] = resource.replace("acct:", "").split("@");
        const artist = this.db.getArtistBySlug(username);

        if (!artist) return null;

        const baseUrl = this.getBaseUrl();
        const profileUrl = `${baseUrl}/@${artist.slug}`; // Local profile
        const actorUrl = `${baseUrl}/api/ap/users/${artist.slug}`;

        return {
            subject: resource,
            links: [
                {
                    rel: "self",
                    type: "application/activity+json",
                    href: actorUrl
                },
                {
                    rel: "http://webfinger.net/rel/profile-page",
                    type: "text/html",
                    href: profileUrl
                }
            ]
        };
    }

    public generateActor(artist: Artist): any {
        const baseUrl = this.getBaseUrl();
        const userUrl = `${baseUrl}/api/ap/users/${artist.slug}`;

        return {
            "@context": [
                "https://www.w3.org/ns/activitystreams",
                "https://w3id.org/security/v1"
            ],
            id: userUrl,
            type: "Person",
            preferredUsername: artist.slug,
            name: artist.name,
            summary: artist.bio || `Artist on ${this.getDomain()}`,
            url: `${baseUrl}/@${artist.slug}`,
            icon: artist.photo_path ? {
                type: "Image",
                mediaType: "image/jpeg", // Assuming jpeg for now, should detect
                url: `${baseUrl}${artist.photo_path}`
            } : undefined,
            inbox: `${userUrl}/inbox`,
            outbox: `${userUrl}/outbox`,
            followers: `${userUrl}/followers`,
            following: `${userUrl}/following`,
            publicKey: {
                id: `${userUrl}#main-key`,
                owner: userUrl,
                publicKeyPem: artist.public_key
            },
            endpoints: {
                sharedInbox: `${baseUrl}/api/ap/inbox`
            }
        };
    }

    public async acceptFollow(artist: Artist, activity: any): Promise<void> {
        const actorUri = activity.actor;
        const inboxUri = await this.getInboxFromActor(actorUri);

        if (!inboxUri) {
            console.error(`❌ Could not find inbox for actor: ${actorUri}`);
            return;
        }

        // Add follower to DB
        this.db.addFollower(artist.id, actorUri, inboxUri);
        console.log(`➕ Added follower ${actorUri} for ${artist.name}`);

        // Construct Accept activity
        const acceptActivity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${this.getBaseUrl()}/${crypto.randomUUID()}`,
            type: "Accept",
            actor: `${this.getBaseUrl()}/api/ap/users/${artist.slug}`,
            object: activity
        };

        // Send Accept
        await this.sendActivity(artist, inboxUri, acceptActivity);
    }

    public async broadcastRelease(album: Album): Promise<void> {
        if (!album.artist_id) return;
        const artist = this.db.getArtist(album.artist_id);
        if (!artist) return;

        const followers = this.db.getFollowers(artist.id);
        if (followers.length === 0) return;

        console.log(`📢 Broadcasting release "${album.title}" to ${followers.length} followers`);

        const baseUrl = this.getBaseUrl();
        const artistActorUrl = `${baseUrl}/api/ap/users/${artist.slug}`;
        const albumUrl = `${baseUrl}/album/${album.slug}`;

        const note = {
            type: "Note",
            attributedTo: artistActorUrl,
            content: `<p>New release: <a href="${albumUrl}">${album.title}</a></p>`,
            url: albumUrl,
            published: new Date().toISOString(),
            to: ["https://www.w3.org/ns/activitystreams#Public"]
        };

        const activity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${baseUrl}/activity/${crypto.randomUUID()}`,
            type: "Create",
            actor: artistActorUrl,
            object: note,
            to: ["https://www.w3.org/ns/activitystreams#Public"]
        };

        // Send to all followers
        // TODO: Optimize with sharedInbox and queue
        for (const follower of followers) {
            await this.sendActivity(artist, follower.inbox_uri, activity);
        }
    }

    public async sendActivity(artist: Artist, inboxUri: string, activity: any): Promise<void> {
        const body = JSON.stringify(activity);
        const url = new URL(inboxUri);
        const date = new Date().toUTCString();
        const digest = `SHA-256=${crypto.createHash("sha256").update(body).digest("base64")}`;

        const headers: any = {
            "Host": url.host,
            "Date": date,
            "Digest": digest,
            "Content-Type": "application/activity+json",
            "Accept": "application/activity+json"
        };

        const signature = this.signRequest(artist, url, "post", date, digest);
        headers["Signature"] = signature;

        try {
            const res = await fetch(inboxUri, {
                method: "POST",
                headers,
                body
            });
            if (!res.ok) {
                console.error(`❌ Failed to send activity to ${inboxUri}: ${res.status} ${await res.text()}`);
            } else {
                console.log(`✅ Sent activity to ${inboxUri}`);
            }
        } catch (e) {
            console.error(`❌ Error sending activity to ${inboxUri}:`, e);
        }
    }

    private signRequest(artist: Artist, url: URL, method: string, date: string, digest: string): string {
        if (!artist.private_key) throw new Error("Artist has no private key");

        const stringToSign = `(request-target): ${method} ${url.pathname}\nhost: ${url.host}\ndate: ${date}\ndigest: ${digest}`;

        const signer = crypto.createSign("sha256");
        signer.update(stringToSign);
        const signature = signer.sign(artist.private_key, "base64");

        const keyId = `${this.getBaseUrl()}/api/ap/users/${artist.slug}#main-key`;

        return `keyId="${keyId}",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${signature}"`;
    }

    private async getInboxFromActor(actorUri: string): Promise<string | null> {
        try {
            const res = await fetch(actorUri, {
                headers: { "Accept": "application/activity+json" }
            });
            if (!res.ok) return null;
            const actor = await res.json() as any;
            return actor.inbox || null;
        } catch {
            return null;
        }
    }

    // Crypto Helpers
    public verifySignature(req: any): boolean {
        // TODO: Implement thorough HTTP signature verification
        // This is complex and requires parsing the Signature header, fetching the actor's public key, and verifying.
        // For MVP, we might trust mostly, but for security, we MUST implement this.
        return true;
    }
}

export function createActivityPubService(db: DatabaseService, config: ServerConfig): ActivityPubService {
    return new ActivityPubService(db, config);
}
