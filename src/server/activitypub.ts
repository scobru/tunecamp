import crypto from "crypto";
import fetch from "node-fetch";
import type { DatabaseService, Artist, Album, Track, Post } from "./database.js";
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
        let url = publicUrl || `http://localhost:${this.config.port}`;
        if (url.endsWith("/")) {
            url = url.slice(0, -1);
        }
        return url;
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
        console.log(`🔍 WebFinger request for: ${resource}`);

        let username;
        if (resource.startsWith("acct:")) {
            const parts = resource.replace("acct:", "").split("@");
            username = parts[0];
        } else {
            // Fallback/Edge case
            username = resource;
        }

        console.log(`👤 Extracted username: ${username}`);
        const artist = this.db.getArtistBySlug(username);

        if (!artist) {
            console.log(`❌ Artist not found for slug: ${username}`);
            return null;
        }

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

        let iconMediaType = "image/jpeg";
        if (artist.photo_path) {
            const ext = artist.photo_path.split('.').pop()?.toLowerCase();
            if (ext === 'png') iconMediaType = "image/png";
            else if (ext === 'webp') iconMediaType = "image/webp";
            else if (ext === 'gif') iconMediaType = "image/gif";
        }

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
            icon: {
                type: "Image",
                mediaType: iconMediaType,
                url: `${baseUrl}/api/artists/${artist.slug}/cover`
            },
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

    public generateNote(album: Album, artist: Artist, tracks: Track[]): any {
        const baseUrl = this.getBaseUrl();
        const userUrl = `${baseUrl}/api/ap/users/${artist.slug}`;
        const albumUrl = `${baseUrl}/#/album/${album.slug}`;
        const published = album.published_at || album.created_at;

        const attachments: any[] = [];

        // 1. Cover Image
        if (album.cover_path) {
            const ext = album.cover_path.split('.').pop()?.toLowerCase();
            let mediaType = "image/jpeg";
            if (ext === 'png') mediaType = "image/png";
            else if (ext === 'webp') mediaType = "image/webp";
            else if (ext === 'gif') mediaType = "image/gif";

            attachments.push({
                type: "Image",
                mediaType: mediaType,
                url: `${baseUrl}/api/albums/${album.slug}/cover`,
                name: "Cover Art"
            });
        }

        // 2. Audio (First Track)
        if (tracks.length > 0) {
            const track = tracks[0];
            const ext = track.file_path.split('.').pop()?.toLowerCase();

            const contentTypes: Record<string, string> = {
                "mp3": "audio/mpeg",
                "flac": "audio/flac",
                "ogg": "audio/ogg",
                "wav": "audio/wav",
                "m4a": "audio/mp4",
                "aac": "audio/aac",
                "opus": "audio/opus",
            };
            const mediaType = contentTypes[ext || ""] || "audio/mpeg";

            attachments.push({
                type: "Audio",
                mediaType: mediaType,
                url: `${baseUrl}/api/tracks/${track.id}/stream`,
                name: track.title,
                duration: track.duration ? new Date(track.duration * 1000).toISOString().substr(11, 8) : undefined // ISO duration or similar if needed, mostly handled by players via metadata
            });
        }

        // Note: We use the canonical API URL for the ID, so it can be resolved by servers
        // We append the published timestamp to ensure uniqueness when republishing (Private -> Public -> Private -> Public)
        const sentTime = published ? new Date(published).getTime() : 0;
        const noteId = `${baseUrl}/api/ap/note/release/${album.slug}-${sentTime}`;

        return {
            type: "Note",
            id: noteId,
            attributedTo: userUrl,
            content: `<p>New release available: <a href="${albumUrl}">${album.title}</a></p>`,
            url: albumUrl,
            published: published,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            attachment: attachments,
            tag: []
        };
    }

    public generatePostNote(post: Post, artist: Artist): any {
        const baseUrl = this.getBaseUrl();
        const userUrl = `${baseUrl}/api/ap/users/${artist.slug}`;
        const postUrl = `${baseUrl}/#/artist/${artist.slug}?post=${post.slug}`;

        return {
            type: "Note",
            id: `${baseUrl}/api/ap/note/post/${post.slug}`,
            attributedTo: userUrl,
            content: `<p>${post.content}</p>`,
            url: postUrl,
            published: post.created_at,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${userUrl}/followers`],
            tag: []
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

        const note = this.generateNote(album, artist, []); // TODO: Pass tracks here if we want attachments in broadcast

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

    public async broadcastPost(post: Post): Promise<void> {
        const artist = this.db.getArtist(post.artist_id);
        if (!artist) return;

        const followers = this.db.getFollowers(artist.id);
        if (followers.length === 0) return;

        console.log(`📢 Broadcasting post "${post.slug}" to ${followers.length} followers`);

        const baseUrl = this.getBaseUrl();
        const artistActorUrl = `${baseUrl}/api/ap/users/${artist.slug}`;

        const note = this.generatePostNote(post, artist);

        const activity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${baseUrl}/activity/${crypto.randomUUID()}`,
            type: "Create",
            actor: artistActorUrl,
            object: note,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${artistActorUrl}/followers`]
        };

        // Send to all followers
        for (const follower of followers) {
            await this.sendActivity(artist, follower.inbox_uri, activity);
        }
    }

    public async broadcastDelete(album: Album): Promise<void> {
        if (!album.artist_id) return;
        const artist = this.db.getArtist(album.artist_id);
        if (!artist) return;

        const followers = this.db.getFollowers(artist.id);
        if (followers.length === 0) return;

        console.log(`📢 Broadcasting delete for release "${album.title}" to ${followers.length} followers`);

        const baseUrl = this.getBaseUrl();
        const artistActorUrl = `${baseUrl}/api/ap/users/${artist.slug}`;

        // Reconstruct the ID that was used for the release
        const published = album.published_at || album.created_at;
        const sentTime = published ? new Date(published).getTime() : 0;
        const noteId = `${baseUrl}/api/ap/note/release/${album.slug}-${sentTime}`;

        const activity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${baseUrl}/activity/${crypto.randomUUID()}`,
            type: "Delete",
            actor: artistActorUrl,
            object: {
                id: noteId,
                type: "Note",
                atomUri: noteId
            },
            to: ["https://www.w3.org/ns/activitystreams#Public"]
        };

        // Send to all followers
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
