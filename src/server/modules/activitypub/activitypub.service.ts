import crypto from "crypto";
import { promisify } from "util";
import fetch from "node-fetch";
import { drainResponse, fetchJsonSafe } from "../../common/network.js";
import { isSafeUrl } from "../../../utils/networkUtils.js";
import type { Federation } from "@fedify/fedify";
import { Follow, Announce } from "@fedify/fedify";
import type { DatabaseService, Artist, Album, Track, Post } from "../../core/database.js";
import type { ServerConfig } from "../../core/config.js";
import type { FederationProvider } from "./federation.provider.js";

import { ActivityPubRenderer } from "./activitypub.renderer.js";
import { ActivityPubTransport } from "./activitypub.transport.js";
import { DeliveryQueue } from "./activitypub.delivery-queue.js";

export class ActivityPubService {
    private renderer: ActivityPubRenderer;
    private transport: ActivityPubTransport;
    private deliveryQueue?: DeliveryQueue;

    constructor(
        private db: FederationProvider,
        private config: ServerConfig,
        private federation: Federation<void>
    ) {
        const baseUrl = this.getBaseUrl();
        this.renderer = new ActivityPubRenderer(baseUrl);
        this.transport = new ActivityPubTransport(
            this.federation,
            baseUrl,
            () => ({
                privateKey: this.db.getSetting("site_private_key") || null,
                publicKey: this.db.getSetting("site_public_key") || null
            })
        );

        // Durable retry queue for outbound delivery (#4). Backed by the same
        // SQLite DB; instantiated only if the raw handle is reachable.
        const rawDb = (this.db as any).db;
        if (rawDb) {
            this.deliveryQueue = new DeliveryQueue(
                rawDb,
                (slug, inbox, json) => this.retryDeliver(slug, inbox, json),
                baseUrl
            );
        }
    }

    /** Start the background federation-delivery retry worker. */
    public startDeliveryQueue(): void {
        this.deliveryQueue?.start();
    }

    /** Re-attempt a queued delivery by re-signing and POSTing the stored JSON-LD. */
    private async retryDeliver(actorSlug: string, inboxUri: string, activityJson: any): Promise<boolean> {
        let actor: any = { slug: actorSlug };
        if (actorSlug && actorSlug !== "site") {
            const a = this.db.getArtistBySlug(actorSlug);
            if (a) actor = a;
        }
        try {
            const res = await this.transport.fetchWithSignature(inboxUri, "post", activityJson, actor);
            const ok = res.ok;
            await drainResponse(res).catch(() => {});
            return ok;
        } catch {
            return false;
        }
    }

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

        // ONLY generate AP keys if the artist is linked to a user!
        const isLinked = this.db.isArtistLinkedToUser(artistId);
        if (!isLinked) {
            console.log(`ℹ️ Skipping key generation for artist "${artist.name}" (no associated user account)`);
            return;
        }

        if (!artist.public_key || !artist.private_key) {
            console.log(`🔑 Generating ActivityPub keys for artist: ${artist.name}`);
            const { publicKey, privateKey } = await this.generateKeyPair();
            this.db.updateArtistKeys(artistId, publicKey, privateKey);
        }
    }

    /**
     * Phase 4: Ensure a regular user account has AP keys. Called lazily on login.
     */
    public async ensureUserKeys(userId: number): Promise<void> {
        const user = this.db.getUser(userId);
        if (!user) return;
        if (user.ap_public_key) return; // already has keys
        console.log(`🔑 [AP] Generating ActivityPub keys for user: ${user.username}`);
        const { publicKey, privateKey } = await this.generateKeyPair();
        this.db.updateUserApKeys(userId, publicKey, privateKey);
    }

    public async generateKeysForAllArtists(): Promise<void> {
        const artists = this.db.getArtists();

        // Generate keys for all artists concurrently
        await Promise.all(artists.map(artist => this.ensureArtistKeys(artist.id)));

        // Generate keys for the Site Actor if they don't exist
        if (!this.db.getSetting("site_public_key")) {
            console.log(`📡 Generating keys for Site Actor...`);
            const { publicKey, privateKey } = await this.generateKeyPair();
            this.db.setSetting("site_public_key", publicKey);
            this.db.setSetting("site_private_key", privateKey);
        }
    }

    /**
     * Follow a remote ActivityPub Actor (Site or Person)
     */
    public async followRemoteActor(actorUri: string, followerHandle: string = "site") {
        try {
            console.log(`📡 Attempting to follow remote actor: ${actorUri} as ${followerHandle}`);
            const publicUrl = this.db.getSetting("publicUrl") || this.config.publicUrl;
            if (!publicUrl) {
                console.warn("⚠️ No public URL configured, cannot follow remote actors");
                return;
            }

            const baseUrl = this.getBaseUrl();

            // Normalize URI
            let resolvedActorUri = actorUri.trim();
            if (!resolvedActorUri.startsWith("http")) {
                resolvedActorUri = `https://${resolvedActorUri}`;
            }

            // Remove trailing slashes for consistency
            if (resolvedActorUri.endsWith("/")) {
                resolvedActorUri = resolvedActorUri.slice(0, -1);
            }

            // Funkwhale profile URL normalization: https://domain/@user -> try to resolve to actor URI
            if (resolvedActorUri.includes("/@")) {
                console.log(`👤 Detected profile URL, attempting to resolve actor: ${resolvedActorUri}`);
                try {
                    const url = new URL(resolvedActorUri);
                    const domain = url.hostname;
                    const username = url.pathname.split("/@")[1];
                    const actorId = await this.getActorIdFromWebFinger(domain, username);
                    if (actorId) {
                        resolvedActorUri = actorId;
                        console.log(`✨ Resolved via WebFinger to: ${resolvedActorUri}`);
                    }
                } catch (e) {
                    console.warn(`⚠️ Failed to resolve profile URL via WebFinger: ${resolvedActorUri}`);
                }
            }

            // Check for self-follow
            if (resolvedActorUri === baseUrl || resolvedActorUri === `${baseUrl}/` || resolvedActorUri === `${baseUrl}/users/site` || resolvedActorUri === `${baseUrl}/api/ap/users/site`) {
                console.warn(`🛑 Self-following is disabled: ${resolvedActorUri}`);
                return;
            }

            // Robust Resolution Phase
            console.log(`🔍 Resolving actor: ${resolvedActorUri}`);
            let finalActorUri = resolvedActorUri;
            
            // If the URL is just a domain root, try to discover the site actor
            try {
                const url = new URL(resolvedActorUri);
                if (url.pathname === "/" || url.pathname === "") {
                    const discoveredUri = await this.discoverSiteActor(url.origin);
                    if (discoveredUri) {
                        finalActorUri = discoveredUri;
                        console.log(`✨ Discovered site actor: ${finalActorUri}`);
                    }
                }
            } catch (urlErr) {
                console.warn(`⚠️ Invalid actor URL during resolution: ${resolvedActorUri}`);
            }

            const followerId = new URL(`/users/${followerHandle}`, baseUrl);

            // Resolve inbox from final actor URI
            console.log(`🔍 Resolving inbox for actor: ${finalActorUri}`);
            const inboxUri = await this.getInboxFromActor(finalActorUri);
            if (!inboxUri) {
                console.error(`❌ Could not resolve inbox for actor: ${finalActorUri}`);
                // Proceed to fetch remote outbox directly (for instances like Funkwhale libraries that don't have an inbox)
                this.fetchRemoteOutbox(finalActorUri).catch(e => console.error(`⚠️ Failed to pre-fetch outbox for ${finalActorUri}:`, e));
                return;
            }

            const follow = new Follow({
                actor: followerId,
                object: new URL(finalActorUri),
            });

            // Send Follow activity using the shared helper
            if (followerHandle === "site") {
                await this.sendActivity({ id: -1, slug: "site" } as any, inboxUri, follow);
            } else {
                const artist = this.db.getArtistBySlug(followerHandle);
                if (artist) {
                    await this.sendActivity(artist, inboxUri, follow);
                }
            }
            console.log(`📤 Sent Follow request to: ${inboxUri}`);

            // Immediately fetch remote outbox to populate the feed with existing content
            // We await it now to prevent parallel memory spikes during mass discovery
            try {
                await this.fetchRemoteOutbox(finalActorUri);
            } catch (e) {
                console.error(`⚠️ Failed to pre-fetch outbox for ${finalActorUri}:`, e);
            }

            // Record in DB as followed
            try {
                const res = await this.fetchWithSignature(finalActorUri);
                if (res.ok) {
                    const actorData = await res.json() as any;
                    this.db.upsertRemoteActor({
                        uri: finalActorUri,
                        type: typeof actorData.type === 'string' ? actorData.type : (Array.isArray(actorData.type) ? actorData.type[0] : 'Person'),
                        username: this.getString(actorData.preferredUsername),
                        name: this.getString(actorData.name),
                        summary: this.getString(actorData.summary),
                        icon_url: this.getString(actorData.icon),
                        inbox_url: this.getString(actorData.inbox),
                        outbox_url: this.getString(actorData.outbox),
                        is_followed: true
                    } as any);
                } else {
                    this.db.upsertRemoteActor({
                        uri: finalActorUri,
                        type: 'Person',
                        is_followed: true
                    } as any);
                }
            } catch (dbErr) {
                console.warn(`⚠️ Could not update following status in DB for ${finalActorUri}`, dbErr);
            }

            // Record per-artist following (artist_id, actor_uri) so follow-back state is tracked independently per local artist
            const followerArtistId = followerHandle === "site" ? -1 : this.db.getArtistBySlug(followerHandle)?.id;
            if (followerArtistId !== undefined && followerArtistId !== null) {
                this.db.addFollowing(followerArtistId, finalActorUri, inboxUri);
            }

        } catch (e) {
            console.error(`❌ Failed to follow actor ${actorUri}:`, e);
            throw e;
        }
    }

    /**
     * Unfollow a remote ActivityPub Actor
     */
    public async unfollowRemoteActor(actorUri: string, followerHandle: string = "site") {
        try {
            console.log(`📡 Attempting to unfollow remote actor: ${actorUri} as ${followerHandle}`);
            const baseUrl = this.getBaseUrl();
            const followerId = new URL(`/users/${followerHandle}`, baseUrl);

            // Resolve which local artist is unfollowing so we can clear the per-artist following record
            const followerArtistId = followerHandle === "site" ? -1 : this.db.getArtistBySlug(followerHandle)?.id;
            const clearFollowing = () => {
                if (followerArtistId !== undefined && followerArtistId !== null) {
                    this.db.removeFollowing(followerArtistId, actorUri);
                }
            };

            // Resolve inbox
            const inboxUri = await this.getInboxFromActor(actorUri);
            if (!inboxUri) {
                console.warn(`⚠️ Could not resolve inbox for actor: ${actorUri}, updating local DB only`);
                this.db.unfollowActor(actorUri);
                clearFollowing();
                return;
            }

            // In ActivityPub, Unfollow is an Undo of the Follow activity
            const undo = {
                "@context": "https://www.w3.org/ns/activitystreams",
                type: "Undo",
                actor: followerId.toString(),
                object: {
                    type: "Follow",
                    actor: followerId.toString(),
                    object: actorUri
                }
            };

            if (followerHandle === "site") {
                await this.sendActivity({ id: -1, slug: "site" } as any, inboxUri, undo);
            } else {
                const artist = this.db.getArtistBySlug(followerHandle);
                if (artist) {
                    await this.sendActivity(artist, inboxUri, undo);
                }
            }

            this.db.unfollowActor(actorUri);
            clearFollowing();
            console.log(`📤 Sent Unfollow request to: ${inboxUri}`);
        } catch (e) {
            console.error(`❌ Failed to unfollow actor ${actorUri}:`, e);
            throw e;
        }
    }

    /**
     * Fetches and parses a remote actor's outbox to populate the local feed.
     */
    /**
     * Resolves the best cover-art URL for a remote AP music object.
     * Funkwhale leaves `image: null` on the Audio object and references the Album
     * by URI, so when there's no direct image we fetch the album and read its
     * cover. Returns null when nothing usable is found.
     */
    public async resolveRemoteCover(obj: any): Promise<string | null> {
        if (!obj || typeof obj !== 'object') return null;
        const imgFrom = (o: any): string | null => {
            if (!o) return null;
            return this.getString(
                o.image?.url || o.image ||
                o.cover?.url || o.cover?.href || o.cover ||
                o.icon?.url || o.icon
            );
        };
        let cover = imgFrom(obj);
        if (!cover) {
            const attachments = Array.isArray(obj.attachment) ? obj.attachment : (obj.attachment ? [obj.attachment] : []);
            const imgAtt = attachments.find((a: any) => {
                const t = typeof a?.type === 'string' ? a.type.toLowerCase() : '';
                return t === 'image' || a?.mediaType?.startsWith?.('image/');
            });
            cover = this.getString(imgAtt?.url || imgAtt?.href);
        }
        if (!cover && obj.album) {
            let album: any = obj.album;
            if (typeof album === 'string') {
                try {
                    const r = await this.fetchWithSignature(album);
                    album = r.ok ? await r.json() : null;
                } catch { album = null; }
            }
            if (album) cover = imgFrom(album);
        }
        return cover || null;
    }

    public async fetchRemoteOutbox(actorUri: string): Promise<void> {
        console.log(`📥 Fetching remote outbox for: ${actorUri}`);
        
        // Helper: ActivityPub types can be a string OR an array of strings
        const hasType = (typeField: any, ...targets: string[]): boolean => {
            if (!typeField) return false;
            // Handle both string and array of strings
            const types = Array.isArray(typeField) ? typeField : [typeField];
            // Normalize to string values for comparison if they are objects
            const typeStrings = types.map(t => typeof t === 'string' ? t.toLowerCase() : (t.type || t.toString()).toLowerCase());
            return targets.some(t => typeStrings.includes(t.toLowerCase()));
        };

        // Funkwhale (and similar) leave `image: null` on the Audio/Track object and
        // reference the Album by URI — the cover art lives on that Album object.
        // Resolve it lazily and cache per album URI so a release's tracks don't each
        // trigger a separate fetch.
        const albumCache = new Map<string, any>();
        const resolveAlbumObject = async (albumRef: any): Promise<any | null> => {
            if (!albumRef) return null;
            if (typeof albumRef === 'object') return albumRef; // already embedded
            if (typeof albumRef !== 'string') return null;
            if (albumCache.has(albumRef)) return albumCache.get(albumRef);
            let album: any = null;
            try {
                const r = await this.fetchWithSignature(albumRef);
                if (r.ok) album = await r.json();
            } catch (e) {
                console.warn(`⚠️ Failed to fetch album ${albumRef} for cover:`, e);
            }
            albumCache.set(albumRef, album);
            return album;
        };

        try {
            // 1. Get Actor profile to find outbox URL and metadata
            // Use signed fetch to support instances with Authorized Fetch enabled (like Funkwhale)
            const res = await this.fetchWithSignature(actorUri);
            if (!res.ok) {
                console.error(`❌ Failed to fetch actor profile ${actorUri}: ${res.status}`);
                return;
            }
            const actor = await res.json() as any;
            
            // Collect outboxes/libraries to scan
            const outboxesToScan: Set<string> = new Set();
            if (hasType(actor.type, "Library", "Collection", "OrderedCollection")) {
                outboxesToScan.add(actorUri);
            }
            if (actor.outbox) outboxesToScan.add(typeof actor.outbox === 'string' ? actor.outbox : actor.outbox.id);
            
            // Funkwhale specific: Library and libraries collections
            if (actor.library) outboxesToScan.add(typeof actor.library === 'string' ? actor.library : actor.library.id);
            if (actor.libraries) {
                const libs = Array.isArray(actor.libraries) ? actor.libraries : [actor.libraries];
                libs.forEach((l: any) => outboxesToScan.add(typeof l === 'string' ? l : l.id));
            }

            // Also check for 'featured' and other common collections
            if (actor.featured) outboxesToScan.add(typeof actor.featured === 'string' ? actor.featured : actor.featured.id);

            console.log(`🔍 Scanning ${outboxesToScan.size} collections for actor ${actorUri}`);

            for (const outboxUrl of outboxesToScan) {
                if (!outboxUrl) continue;
                console.log(`  📂 Fetching collection: ${outboxUrl}`);

                // 2. Fetch pages of outbox/collection
                try {
                    let currentUrl: string | null = outboxUrl;
                    let pageCount = 0;
                    const maxPages = 2; // Reduced further to prevent OOM
                    const maxItemsToResolve = 50; // Cap total items to resolve per outbox to limit memory usage
                    let resolvedItemsCount = 0;
                    const visitedUrls = new Set<string>();

                    while (currentUrl && pageCount < maxPages && !visitedUrls.has(currentUrl) && resolvedItemsCount < maxItemsToResolve) {
                        visitedUrls.add(currentUrl);
                        const pageRes = await this.fetchWithSignature(currentUrl);
                        if (!pageRes.ok) {
                            console.warn(`⚠️ Failed to fetch page: ${currentUrl} (${pageRes.status})`);
                            break;
                        }

                        let outbox = await pageRes.json() as any;

                        // If we fetched the main collection and it has a 'first' page, navigate to it
                        if (pageCount === 0 && outbox.first) {
                             currentUrl = typeof outbox.first === 'string' ? outbox.first : outbox.first.id;
                             pageCount++;
                             continue;
                        }

                        const items = outbox.orderedItems || outbox.items || [];
                        console.log(`📑 Found ${items.length} items in page ${pageCount + 1}`);

                        // Periodically clear memory if processing many pages
                        if (pageCount > 0 || resolvedItemsCount % 10 === 0) {
                            if ((global as any).gc) {
                                (global as any).gc();
                            }
                            const memory = process.memoryUsage();
                            console.log(`[AP] Outbox Progress: ${pageCount} pages, ${resolvedItemsCount} items. Heap: ${Math.round(memory.heapUsed / 1024 / 1024)}MB / ${Math.round(memory.heapTotal / 1024 / 1024)}MB`);
                        }

                    for (const activity of items) {
                        if (resolvedItemsCount >= maxItemsToResolve) {
                            console.log(`🛑 Reached max items limit (${maxItemsToResolve}) for outbox ${outboxUrl}`);
                            break;
                        }
                        try {
                            if (!activity || typeof activity !== 'object') continue;

                            // Handle both direct objects and activities (Create, Announce, Listen)
                            let obj = activity;
                            if (hasType(activity.type, "Create", "Announce", "Listen")) {
                                obj = activity.object;
                            }

                            if (!obj) continue;

                            // Resolve object if it's just a URI
                            let resolvedObj = obj;
                            if (typeof obj === 'string') {
                                const objRes = await this.fetchWithSignature(obj);
                                if (objRes.ok) resolvedObj = await objRes.json();
                                else continue;
                            }

                            // Check if this is a known content type
                            if (hasType(resolvedObj.type, "Note", "Audio", "Track", "Album", "MusicRecording", "MusicAlbum", "Article")) {
                                let type = 'post';
                                // Music markers: Audio, Track, MusicRecording, MusicAlbum, or objects with audio attachments
                                const isMusic = hasType(resolvedObj.type, "Audio", "Track", "Album", "MusicRecording", "MusicAlbum") ||
                                              (resolvedObj.attachment && Array.isArray(resolvedObj.attachment) && resolvedObj.attachment.some((a: any) => hasType(a.type, "Audio") || a.mediaType?.startsWith("audio/")));

                                if (isMusic) {
                                    type = 'release';
                                }

                                // Mapping logic
                                const attachments = Array.isArray(resolvedObj.attachment) ? resolvedObj.attachment : (resolvedObj.attachment ? [resolvedObj.attachment] : []);
                                const audioAttachment = attachments.find((a: any) => hasType(a.type, "Audio") || a.mediaType?.startsWith("audio/"));
                                
                                let streamUrlCandidate = audioAttachment?.url || audioAttachment?.href || audioAttachment || resolvedObj.url;
                                let finalStreamUrl = this.getString(streamUrlCandidate);
                                if (Array.isArray(streamUrlCandidate)) {
                                    const audioLink = streamUrlCandidate.find((u: any) => u?.mediaType?.startsWith("audio/"));
                                    if (audioLink) {
                                        finalStreamUrl = this.getString(audioLink.href || audioLink.url);
                                    }
                                } else if (streamUrlCandidate && typeof streamUrlCandidate === 'object' && streamUrlCandidate.mediaType?.startsWith("audio/")) {
                                    finalStreamUrl = this.getString(streamUrlCandidate.href || streamUrlCandidate.url);
                                }

                                    // Cover + album name: prefer fields on the object itself, then
                                    // fall back to the referenced Album object (Funkwhale puts the
                                    // cover there and leaves image:null on the track).
                                    let coverUrl = this.getString(
                                        resolvedObj.image?.url || resolvedObj.image ||
                                        resolvedObj.icon?.url || resolvedObj.icon ||
                                        (attachments.find((a: any) => hasType(a.type, "Image") || a.mediaType?.startsWith("image/"))?.url) ||
                                        resolvedObj.track?.album?.image?.url
                                    );
                                    let albumName = this.getString(resolvedObj.album?.name || resolvedObj.track?.album?.name);
                                    if ((!coverUrl || !albumName) && resolvedObj.album) {
                                        const albumObj = await resolveAlbumObject(resolvedObj.album);
                                        if (albumObj) {
                                            if (!coverUrl) {
                                                coverUrl = this.getString(
                                                    albumObj.image?.url || albumObj.image ||
                                                    albumObj.cover?.url || albumObj.cover?.href || albumObj.cover ||
                                                    albumObj.icon?.url || albumObj.icon
                                                );
                                            }
                                            if (!albumName) albumName = this.getString(albumObj.name || albumObj.title);
                                        }
                                    }

                                    const remoteContent = {
                                        ap_id: this.getString(resolvedObj.id),
                                        actor_uri: this.getString(actorUri),
                                        type: type,
                                        title: this.getString(resolvedObj.name || resolvedObj.title || resolvedObj.content?.replace(/<[^>]*>?/gm, '').substring(0, 50) || "Untitled"),
                                        content: this.getString(resolvedObj.content || resolvedObj.summary || ""),
                                        url: this.getString(resolvedObj.url || (Array.isArray(resolvedObj.url) ? resolvedObj.url[0]?.href : resolvedObj.url?.href)),
                                        cover_url: coverUrl,
                                        stream_url: finalStreamUrl,
                                        artist_name: this.getString(resolvedObj.attributedTo?.name || actor.name || actor.preferredUsername || resolvedObj.track?.artists?.[0]?.name || "Remote Artist"),
                                        album_name: albumName || this.getString(resolvedObj.name || resolvedObj.title || null),
                                        duration: this.getString(resolvedObj.duration || audioAttachment?.duration || null),
                                        published_at: this.getString(resolvedObj.published || activity.published || new Date().toISOString())
                                    };

                                    if (remoteContent.ap_id) {
                                        this.db.upsertRemoteContent(remoteContent as any);
                                        resolvedItemsCount++;
                                        console.log(`  ✅ Stored remote ${type}: ${remoteContent.title}`);
                                    }
                            }
                        } catch (itemErr) {
                            console.warn("⚠️ Failed to parse collection item:", itemErr);
                        }
                    }

                    // Navigate to next page
                    currentUrl = outbox.next ? (typeof outbox.next === 'string' ? outbox.next : outbox.next.id) : null;
                    pageCount++;
                }
                } catch (outboxErr) {
                    console.warn(`⚠️ Error fetching outbox/collection ${outboxUrl}:`, outboxErr);
                }
            }
            console.log(`✅ Finished population attempt from ${actorUri}`);
        } catch (e) {
            console.error(`❌ Error fetching remote outbox for ${actorUri}:`, e);
        }
    }

    /**
     * Subscribe the instance (Site Actor) to an ActivityPub Relay
     */
    public async subscribeToRelay(relayUrl: string) {
        return this.followRemoteActor(relayUrl, "site");
    }

    /**
     * Announce an activity to the configured relay
     */
    public async announceToRelay(object: any) {
        const relayUrl = this.db.getSetting("relayUrl") || this.config.relayUrl;
        if (!relayUrl) return;

        try {
            const publicUrl = this.db.getSetting("publicUrl") || this.config.publicUrl;
            if (!publicUrl) {
                console.warn("⚠️ No public URL configured, cannot announce to relay");
                return;
            }
            const baseUrl = new URL(publicUrl);
            const siteActorId = new URL(`/users/site`, baseUrl);

            const announce = new Announce({
                actor: siteActorId,
                object: object,
            });

            if (relayUrl) {
                await this.sendActivity({ id: -1, slug: "site" } as any, relayUrl, announce);
                console.log(`📡 Announced activity to relay: ${relayUrl}`);
            }
        } catch (e) {
            console.error(`❌ Failed to announce to relay:`, e);
        }
    }

    private async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
        const generateKeyPairAsync = promisify(crypto.generateKeyPair);
        const { publicKey, privateKey } = await (generateKeyPairAsync as any)("rsa", {
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
        return { publicKey, privateKey };
    }

    // JSON-LD Generators
    public generateWebFinger(resource: string): any {
        const username = resource.startsWith("acct:") 
            ? resource.replace("acct:", "").split("@")[0] 
            : resource;
            
        const artist = this.db.getArtistBySlug(username);
        if (!artist && username !== "site") return null;

        return this.renderer.renderWebFinger(resource, artist || { slug: "site", name: "Site" } as any);
    }

    public generateActor(artist: Artist | { slug: string, name: string, bio?: string, photo_path?: string }): any {
        const artistWithKeys = { ...artist } as any;
        if (artist.slug === "site" && !artistWithKeys.public_key) {
            artistWithKeys.public_key = this.db.getSetting("site_public_key");
        }
        return this.renderer.renderActor(artistWithKeys);
    }

    /**
     * Phase 4: Generate a Person actor JSON-LD for a regular user account.
     */
    public generateUserActor(user: { id: number; username: string; ap_public_key?: string | null }): any {
        const baseUrl = this.getBaseUrl();
        const userUrl = `${baseUrl}/users/${user.username}`;
        return {
            "@context": [
                "https://www.w3.org/ns/activitystreams",
                "https://w3id.org/security/v1"
            ],
            id: userUrl,
            type: "Person",
            preferredUsername: user.username,
            name: user.username,
            summary: "",
            inbox: `${userUrl}/inbox`,
            outbox: `${userUrl}/outbox`,
            followers: `${userUrl}/followers`,
            following: `${userUrl}/following`,
            publicKey: user.ap_public_key ? {
                id: `${userUrl}#main-key`,
                owner: userUrl,
                publicKeyPem: user.ap_public_key,
            } : undefined,
            url: `${baseUrl}/@${user.username}`,
        };
    }

    // ----------------------------------------------------------------
    // Phase 3: AP Social — comment/like broadcasting
    // ----------------------------------------------------------------

    /**
     * Broadcast a comment on a track as a Create(Note) AP activity to the artist's followers.
     * No-op if the track has no artist, the artist has no AP keys, or no followers.
     */
    public async broadcastComment(trackId: number, username: string, text: string): Promise<void> {
        const track = this.db.getTrack(trackId);
        if (!track?.album_id) return;
        const album = this.db.getAlbum(track.album_id);
        if (!album?.artist_id) return;
        const artist = this.db.getArtist(album.artist_id);
        if (!artist?.public_key) return;
        const followers = this.db.getFollowers(artist.id);
        if (!followers.length) return;
        const user = this.db.getUserByUsername(username);
        if (!user?.ap_public_key) return;

        const base = this.getBaseUrl();
        const userUri = `${base}/users/${username}`;
        const trackUri = `${base}/audio/${trackId}`;
        const noteId = `${base}/api/ap/notes/comment-${trackId}-${username}-${Date.now()}`;

        const activity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            type: "Create",
            id: `${noteId}/activity`,
            actor: userUri,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${base}/users/${artist.slug}/followers`],
            object: {
                type: "Note",
                id: noteId,
                attributedTo: userUri,
                inReplyTo: trackUri,
                content: this.escapeHtml(text),
                to: ["https://www.w3.org/ns/activitystreams#Public"],
                cc: [`${base}/users/${artist.slug}/followers`],
                published: new Date().toISOString(),
            },
        };

        const userActor = { slug: username, private_key: user.ap_private_key, public_key: user.ap_public_key };
        const inboxes = [...new Set(followers.map(f => f.inbox_uri).filter(Boolean))];
        await Promise.all(inboxes.map(inbox =>
            this.sendActivity(userActor as any, inbox, activity)
                .catch(e => console.error(`[AP] Comment delivery failed → ${inbox}:`, e))
        ));
        console.log(`[AP] broadcastComment: track ${trackId} by ${username} → ${inboxes.length} inbox(es)`);
    }

    /**
     * Broadcast a Like activity for a track to the artist's followers.
     */
    public async broadcastLike(trackId: number, username: string): Promise<void> {
        const track = this.db.getTrack(trackId);
        if (!track?.album_id) return;
        const album = this.db.getAlbum(track.album_id);
        if (!album?.artist_id) return;
        const artist = this.db.getArtist(album.artist_id);
        if (!artist?.public_key) return;
        const followers = this.db.getFollowers(artist.id);
        if (!followers.length) return;
        const user = this.db.getUserByUsername(username);
        if (!user?.ap_public_key) return;

        const base = this.getBaseUrl();
        const userUri = `${base}/users/${username}`;
        const trackUri = `${base}/audio/${trackId}`;

        const activity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            type: "Like",
            id: `${base}/api/ap/likes/${username}-${trackId}`,
            actor: userUri,
            object: trackUri,
        };

        const userActor = { slug: username, private_key: user.ap_private_key, public_key: user.ap_public_key };
        const inboxes = [...new Set(followers.map(f => f.inbox_uri).filter(Boolean))];
        await Promise.all(inboxes.map(inbox =>
            this.sendActivity(userActor as any, inbox, activity)
                .catch(e => console.error(`[AP] Like delivery failed → ${inbox}:`, e))
        ));
    }

    /**
     * Broadcast an Undo(Like) activity for a track to the artist's followers.
     */
    public async broadcastUnlike(trackId: number, username: string): Promise<void> {
        const track = this.db.getTrack(trackId);
        if (!track?.album_id) return;
        const album = this.db.getAlbum(track.album_id);
        if (!album?.artist_id) return;
        const artist = this.db.getArtist(album.artist_id);
        if (!artist?.public_key) return;
        const followers = this.db.getFollowers(artist.id);
        if (!followers.length) return;
        const user = this.db.getUserByUsername(username);
        if (!user?.ap_public_key) return;

        const base = this.getBaseUrl();
        const userUri = `${base}/users/${username}`;
        const trackUri = `${base}/audio/${trackId}`;

        const activity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            type: "Undo",
            id: `${base}/api/ap/undo/${username}-${trackId}`,
            actor: userUri,
            object: {
                type: "Like",
                id: `${base}/api/ap/likes/${username}-${trackId}`,
                actor: userUri,
                object: trackUri,
            },
        };

        const userActor = { slug: username, private_key: user.ap_private_key, public_key: user.ap_public_key };
        const inboxes = [...new Set(followers.map(f => f.inbox_uri).filter(Boolean))];
        await Promise.all(inboxes.map(inbox =>
            this.sendActivity(userActor as any, inbox, activity)
                .catch(e => console.error(`[AP] Unlike delivery failed → ${inbox}:`, e))
        ));
    }

    /** Escape HTML entities in user-provided text for Note content. */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#x27;");
    }

    // ----------------------------------------------------------------

    public generateNote(album: Album, artist: Artist, tracks: Track[]): any {
        return this.renderer.renderNote(album, artist, tracks);
    }

    public generatePostArticle(post: Post, artist: Artist): any {
        return this.renderer.renderPostArticle(post, artist);
    }

    public async acceptFollow(artist: Artist, activity: any): Promise<void> {
        const actorUri = activity.actor;
        const inboxUri = await this.getInboxFromActor(actorUri);

        if (!inboxUri) {
            console.error(`❌ Could not find inbox for actor: ${actorUri}`);
            return;
        }

        // Store follow request as pending
        this.db.addFollower(artist.id, actorUri, inboxUri, undefined, activity.id);

        // Immediately accept it and notify the actor
        this.db.acceptFollower(artist.id, actorUri);
        console.log(`✅ Accepted follower ${actorUri} for ${artist.name}`);

        const acceptActivity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${this.getBaseUrl()}/${crypto.randomUUID()}`,
            type: "Accept",
            actor: `${this.getBaseUrl()}/users/${artist.slug}`,
            object: activity
        };

        await this.sendActivity(artist, inboxUri, acceptActivity);
    }

    public async handleMoveActivity(oldActorUri: string, newActorUri: string): Promise<void> {
        try {
            // 1. Fetch new actor to verify backlink (alsoKnownAs/aliases)
            const res = await this.fetchWithSignature(newActorUri);
            if (!res.ok) {
                console.warn(`⚠️ Move verification failed: could not fetch new actor ${newActorUri}`);
                return;
            }
            const actorData = await res.json() as any;
            
            // Normalize aliases
            let aliases: string[] = [];
            if (actorData.alsoKnownAs) {
                aliases = Array.isArray(actorData.alsoKnownAs) 
                    ? actorData.alsoKnownAs.map((a: any) => typeof a === 'string' ? a : a.id) 
                    : [actorData.alsoKnownAs];
            } else if (actorData.aliases) {
                aliases = Array.isArray(actorData.aliases) 
                    ? actorData.aliases.map((a: any) => typeof a === 'string' ? a : a.id) 
                    : [actorData.aliases];
            }
            
            // Clean/filter nulls
            aliases = aliases.filter(a => typeof a === 'string').map(a => this.getString(a) || "");

            if (!aliases.includes(oldActorUri)) {
                console.warn(`⚠️ Move verification failed: new actor ${newActorUri} does not list old actor ${oldActorUri} in its alsoKnownAs (${JSON.stringify(aliases)})`);
                return;
            }

            // 2. Validation passed! Update local followers database
            const newInbox = this.getString(actorData.inbox);
            const newSharedInbox = actorData.endpoints?.sharedInbox ? this.getString(actorData.endpoints.sharedInbox) : undefined;
            
            if (!newInbox) {
                console.warn(`⚠️ Move warning: new actor ${newActorUri} doesn't expose an inbox. Cannot update followers inbox.`);
                return;
            }

            this.db.updateFollowerUri(oldActorUri, newActorUri, newInbox, newSharedInbox ?? undefined);
            console.log(`✅ Raw Inbox Move complete! Updated follower record from ${oldActorUri} to ${newActorUri}`);

            // 3. Update cached remote actor
            const existingRemote = this.db.getRemoteActor(oldActorUri);
            if (existingRemote) {
                this.db.upsertRemoteActor({
                    uri: newActorUri,
                    type: typeof actorData.type === 'string' ? actorData.type : 'Person',
                    username: this.getString(actorData.preferredUsername),
                    name: this.getString(actorData.name),
                    summary: this.getString(actorData.summary),
                    icon_url: this.getString(actorData.icon),
                    inbox_url: newInbox,
                    outbox_url: this.getString(actorData.outbox),
                    is_followed: existingRemote.is_followed,
                } as any);
                this.db.unfollowActor(oldActorUri);
            }
        } catch (e) {
            console.error(`❌ Error in handleMoveActivity for ${oldActorUri}:`, e);
        }
    }

    public async receiveFollowRequest(artist: Artist, activity: any): Promise<void> {
        const actorUri = activity.actor;
        const inboxUri = await this.getInboxFromActor(actorUri);

        if (!inboxUri) {
            console.error(`❌ Could not find inbox for actor: ${actorUri}`);
            return;
        }

        // Fetch remote actor details so we can render their profile nicely
        try {
            const res = await this.fetchWithSignature(actorUri);
            if (res.ok) {
                const actorData = await res.json() as any;
                this.db.upsertRemoteActor({
                    uri: actorUri,
                    type: typeof actorData.type === 'string' ? actorData.type : (Array.isArray(actorData.type) ? actorData.type[0] : 'Person'),
                    username: this.getString(actorData.preferredUsername),
                    name: this.getString(actorData.name),
                    summary: this.getString(actorData.summary),
                    icon_url: this.getString(actorData.icon),
                    inbox_url: this.getString(actorData.inbox),
                    outbox_url: this.getString(actorData.outbox),
                } as any);
            }
        } catch (e) {
            console.warn(`⚠️ Failed to pre-fetch remote actor metadata for: ${actorUri}`, e);
        }

        // Store follow request as pending
        this.db.addFollower(artist.id, actorUri, inboxUri, undefined, activity.id);
        console.log(`📥 Follow request from ${actorUri} is pending approval for artist: ${artist.name}`);
    }

    /** Accept a pending follow request and notify the actor */
    public async acceptFollowRequest(artist: Artist, actorUri: string, activityObject: any = null): Promise<void> {
        const inboxUri = await this.getInboxFromActor(actorUri);
        if (!inboxUri) {
            console.error(`❌ Could not find inbox for actor: ${actorUri}`);
            return;
        }

        const follower = this.db.getFollower ? this.db.getFollower(artist.id, actorUri) : undefined;
        const followId = follower?.follow_id;

        this.db.acceptFollower(artist.id, actorUri);
        console.log(`✅ Accepted follower ${actorUri} for ${artist.name}`);

        const targetObjectUrl = (followId && followId.includes('/api/ap/')) 
            ? `${this.getBaseUrl()}/api/ap/users/${artist.slug}`
            : `${this.getBaseUrl()}/users/${artist.slug}`;

        const acceptActivity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${this.getBaseUrl()}/${crypto.randomUUID()}`,
            type: "Accept",
            actor: targetObjectUrl,
            object: activityObject || (followId ? {
                id: followId,
                type: "Follow",
                actor: actorUri,
                object: targetObjectUrl
            } : {
                type: "Follow",
                actor: actorUri,
                object: targetObjectUrl
            })
        };

        await this.sendActivity(artist, inboxUri, acceptActivity);
    }

    /** Reject a pending follow request and notify the actor */
    public async rejectFollowRequest(artist: Artist, actorUri: string): Promise<void> {
        const inboxUri = await this.getInboxFromActor(actorUri);
        if (!inboxUri) {
            console.error(`❌ Could not find inbox for actor: ${actorUri}`);
            return;
        }

        const follower = this.db.getFollower ? this.db.getFollower(artist.id, actorUri) : undefined;
        const followId = follower?.follow_id;

        // Reject deletes or marks the follower request as rejected
        this.db.rejectFollower ? this.db.rejectFollower(artist.id, actorUri) : this.db.removeFollower(artist.id, actorUri);
        console.log(`❌ Rejected follower request ${actorUri} for ${artist.name}`);

        const targetObjectUrl = (followId && followId.includes('/api/ap/')) 
            ? `${this.getBaseUrl()}/api/ap/users/${artist.slug}`
            : `${this.getBaseUrl()}/users/${artist.slug}`;

        const rejectActivity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${this.getBaseUrl()}/${crypto.randomUUID()}`,
            type: "Reject",
            actor: targetObjectUrl,
            object: followId ? {
                id: followId,
                type: "Follow",
                actor: actorUri,
                object: targetObjectUrl
            } : {
                type: "Follow",
                actor: actorUri,
                object: targetObjectUrl
            }
        };

        await this.sendActivity(artist, inboxUri, rejectActivity);
    }

    public async broadcastRelease(album: Album, force: boolean = false): Promise<void> {
        if (!album.artist_id) return;
        const artist = this.db.getArtist(album.artist_id);
        if (!artist) return;

        if (!force) {
            const existingNotes = this.db.getApNotes(artist.id, false);
            const alreadyPublished = existingNotes.find(n => n.note_type === 'release' && n.content_id === album.id);
            if (alreadyPublished) {
                console.log(`ℹ️ Release "${album.title}" already published via ActivityPub. Skipping broadcast.`);
                return;
            }
        }

        console.log(`📢 Broadcasting release "${album.title}" to followers`);

        const baseUrl = this.getBaseUrl();
        const artistActorUrl = `${baseUrl}/users/${artist.slug}`;

        const tracks = this.db.getTracksByReleaseId(album.id);
        const note = this.generateNote(album, artist, tracks);

        const activity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${baseUrl}/activity/${crypto.randomUUID()}`,
            type: "Create",
            actor: artistActorUrl,
            object: note,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${artistActorUrl}/followers`]
        };

        // Get only accepted followers
        const followers = this.db.getFollowers(artist.id);
        const inboxes = followers.map(f => f.inbox_uri);

        if (inboxes.length > 0) {
            console.log(`📢 Sending release activity to ${inboxes.length} inboxes`);
            await Promise.all(inboxes.map(inbox => this.sendActivity(artist, inbox, activity)));
        } else {
            console.log(`ℹ️ No followers for ${artist.name}, skipping direct broadcast.`);
        }

        // Always announce to relay if configured, even without followers
        await this.announceToRelay(activity);

        this.db.createApNote(artist.id, note.id, 'release', album.id, album.slug, album.title);
    }

    public async broadcastPost(post: Post, force: boolean = false): Promise<void> {
        if (post.visibility !== 'public') return;

        const artist = this.db.getArtist(post.artist_id);
        if (!artist) return;

        if (!force) {
            const existingNotes = this.db.getApNotes(artist.id, false);
            const alreadyPublished = existingNotes.find(n => n.note_type === 'post' && n.content_id === post.id);
            if (alreadyPublished) {
                console.log(`ℹ️ Post "${post.slug}" already published via ActivityPub. Skipping broadcast.`);
                return;
            }
        }

        const article = this.generatePostArticle(post, artist);
        this.db.createApNote(artist.id, article.id, 'post', post.id, post.slug, post.content.replace(/<[^>]*>?/gm, '').substring(0, 50) + (post.content.length > 50 ? '...' : ''));

        const followers = this.db.getFollowers(artist.id);
        if (followers.length === 0) return;

        console.log(`📢 Broadcasting post "${post.slug}" to ${followers.length} followers`);

        const baseUrl = this.getBaseUrl();
        const artistActorUrl = `${baseUrl}/users/${artist.slug}`;

        const activity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${baseUrl}/activity/${crypto.randomUUID()}`,
            type: "Create",
            actor: artistActorUrl,
            object: article,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${artistActorUrl}/followers`]
        };

        await Promise.all(followers.map(follower => this.sendActivity(artist, follower.inbox_uri, activity)));
    }

    /** Best-effort: fetch a remote actor's profile and cache it for display (does not change follow state). */
    public async cacheRemoteActor(actorUri: string): Promise<void> {
        if (!actorUri || !actorUri.startsWith("http")) return;
        const existing = this.db.getRemoteActor(actorUri);
        if (existing && existing.name) return; // already cached with a display name
        try {
            const res = await this.fetchWithSignature(actorUri);
            if (!res.ok) return;
            const actorData = await res.json() as any;
            this.db.upsertRemoteActor({
                uri: actorUri,
                type: typeof actorData.type === 'string' ? actorData.type : (Array.isArray(actorData.type) ? actorData.type[0] : 'Person'),
                username: this.getString(actorData.preferredUsername),
                name: this.getString(actorData.name),
                summary: this.getString(actorData.summary),
                icon_url: this.getString(actorData.icon),
                inbox_url: this.getString(actorData.inbox),
                outbox_url: this.getString(actorData.outbox)
            } as any);
        } catch (e) {
            console.warn(`⚠️ Could not cache remote actor ${actorUri}`);
        }
    }

    /**
     * Publish a federated reply (Create(Note) with inReplyTo) to one of the artist's own notes.
     * Stores a local copy so it shows immediately in the thread, then delivers the activity to
     * the artist's followers and to any remote actors already participating in the thread.
     */
    public async postReply(artist: Artist, parentNoteId: string, content: string): Promise<{ replyUri: string }> {
        const parent = this.db.getApNote(parentNoteId);
        if (!parent) throw new Error("Parent note not found");
        if (parent.artist_id !== artist.id) throw new Error("Not authorized for this note");

        const text = (content || "").trim();
        if (!text) throw new Error("Reply content is empty");
        if (text.length > 5000) throw new Error("Reply content too long (max 5000 chars)");

        const baseUrl = this.getBaseUrl();
        const artistActorUrl = `${baseUrl}/users/${artist.slug}`;
        const published = new Date().toISOString();
        const replyUri = `${baseUrl}/api/ap/note/reply/${crypto.randomUUID()}`;

        // Escape HTML to prevent injection in the Fediverse, then wrap as a paragraph
        const safe = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        const contentHtml = `<p>${safe.replace(/\r?\n/g, "<br />")}</p>`;

        // Collect distinct remote actors already in this thread, so we can address/notify them
        const existingReplies = this.db.getApReplies(parentNoteId);
        const threadActors = [...new Set(
            existingReplies
                .map(r => r.actor_uri)
                .filter(a => !!a && a !== artistActorUrl && a.startsWith("http"))
        )];

        const note = {
            type: "Note",
            id: replyUri,
            attributedTo: artistActorUrl,
            inReplyTo: parentNoteId,
            content: contentHtml,
            published,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${artistActorUrl}/followers`, ...threadActors]
        };

        const activity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${baseUrl}/activity/${crypto.randomUUID()}`,
            type: "Create",
            actor: artistActorUrl,
            object: note,
            to: note.to,
            cc: note.cc
        };

        // Store our own reply locally first (idempotent) so the UI thread updates immediately
        this.db.addApReply(parentNoteId, replyUri, artistActorUrl, contentHtml, published);

        // Resolve delivery inboxes: followers + thread participants
        const inboxes = new Set<string>();
        for (const f of this.db.getFollowers(artist.id)) {
            if (f.inbox_uri) inboxes.add(f.inbox_uri);
        }
        await Promise.all(threadActors.map(async actorUri => {
            try {
                const inbox = await this.getInboxFromActor(actorUri);
                if (inbox) inboxes.add(inbox);
            } catch (e) {
                console.warn(`⚠️ Could not resolve inbox for thread actor ${actorUri}`);
            }
        }));

        if (inboxes.size === 0) {
            console.log(`ℹ️ Reply ${replyUri} stored locally; no remote inboxes to deliver to yet.`);
            return { replyUri };
        }

        console.log(`📢 Delivering reply on ${parentNoteId} to ${inboxes.size} inbox(es)`);
        await Promise.all([...inboxes].map(inbox =>
            this.sendActivity(artist, inbox, activity).catch(e => console.error(`⚠️ Reply delivery failed to ${inbox}:`, e))
        ));

        return { replyUri };
    }

    /**
     * Deletes a reply authored by the given artist and broadcasts a Delete(Note)
     * to followers and other actors already participating in the thread.
     * Only the artist who authored the reply may delete it.
     */
    public async deleteReply(artist: Artist, replyUri: string): Promise<void> {
        const reply = this.db.getApReply(replyUri);
        if (!reply) throw new Error("Reply not found");

        const baseUrl = this.getBaseUrl();
        const artistActorUrl = `${baseUrl}/users/${artist.slug}`;
        if (reply.actor_uri !== artistActorUrl) {
            throw new Error("Not authorized to delete this reply");
        }

        // Collect distinct remote actors in this thread so we can notify them too
        const threadActors = [...new Set(
            this.db.getApReplies(reply.note_id)
                .map(r => r.actor_uri)
                .filter(a => !!a && a !== artistActorUrl && a.startsWith("http"))
        )];

        const activity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${baseUrl}/activity/${crypto.randomUUID()}`,
            type: "Delete",
            actor: artistActorUrl,
            object: { id: replyUri, type: "Note", atomUri: replyUri },
            to: ["https://www.w3.org/ns/activitystreams#Public"]
        };

        const inboxes = new Set<string>();
        for (const f of this.db.getFollowers(artist.id)) {
            if (f.inbox_uri) inboxes.add(f.inbox_uri);
        }
        await Promise.all(threadActors.map(async actorUri => {
            try {
                const inbox = await this.getInboxFromActor(actorUri);
                if (inbox) inboxes.add(inbox);
            } catch (e) {
                console.warn(`⚠️ Could not resolve inbox for thread actor ${actorUri}`);
            }
        }));

        if (inboxes.size > 0) {
            console.log(`📢 Broadcasting reply delete ${replyUri} to ${inboxes.size} inbox(es)`);
            await Promise.all([...inboxes].map(inbox =>
                this.sendActivity(artist, inbox, activity).catch(e => console.error(`⚠️ Reply delete delivery failed to ${inbox}:`, e))
            ));
        }

        this.db.deleteApReply(replyUri);
    }

    public async broadcastDelete(album: Album, manualNoteId?: string): Promise<void> {
        if (!album.artist_id) return;
        const artist = this.db.getArtist(album.artist_id);
        if (!artist) return;

        const baseUrl = this.getBaseUrl();
        let noteId = manualNoteId;
        let isAlreadyDeleted = false;

        if (!noteId) {
            const notes = this.db.getApNotes(artist.id, true);
            const note = notes.find(n => n.note_type === 'release' && n.content_id === album.id);
            if (note) {
                noteId = note.note_id;
                isAlreadyDeleted = !!note.deleted_at;
            }
        } else {
            const note = this.db.getApNote(noteId);
            if (note) isAlreadyDeleted = !!note.deleted_at;
        }

        if (!noteId || isAlreadyDeleted) {
            return;
        }

        const followers = this.db.getFollowers(artist.id);
        if (followers.length > 0) {
            console.log(`📢 Broadcasting delete for release "${album.title}" to ${followers.length} followers`);
            const activity = {
                "@context": "https://www.w3.org/ns/activitystreams",
                id: `${this.getBaseUrl()}/activity/${crypto.randomUUID()}`,
                type: "Delete",
                actor: `${baseUrl}/users/${artist.slug}`,
                object: { id: noteId, type: "Note", atomUri: noteId },
                to: ["https://www.w3.org/ns/activitystreams#Public"]
            };
            await Promise.all(followers.map(follower => this.sendActivity(artist, follower.inbox_uri, activity)));
        }

        this.db.markApNoteDeleted(noteId);
    }

    public async broadcastPostDelete(post: Post, manualNoteId?: string): Promise<void> {
        const artist = this.db.getArtist(post.artist_id);
        if (!artist) return;

        const baseUrl = this.getBaseUrl();
        let noteId = manualNoteId;
        let isAlreadyDeleted = false;

        if (!noteId) {
            const notes = this.db.getApNotes(artist.id, true);
            const note = notes.find(n => n.note_type === 'post' && n.content_id === post.id);
            if (note) {
                noteId = note.note_id;
                isAlreadyDeleted = !!note.deleted_at;
            }
        } else {
            const note = this.db.getApNote(noteId);
            if (note) isAlreadyDeleted = !!note.deleted_at;
        }

        if (!noteId || isAlreadyDeleted) {
            return;
        }

        const followers = this.db.getFollowers(artist.id);
        if (followers.length > 0) {
            console.log(`📢 Broadcasting delete for post "${post.slug}" to ${followers.length} followers`);
            const activity = {
                "@context": "https://www.w3.org/ns/activitystreams",
                id: `${baseUrl}/activity/${crypto.randomUUID()}`,
                type: "Delete",
                actor: `${baseUrl}/users/${artist.slug}`,
                object: { id: noteId, type: "Note", atomUri: noteId },
                to: ["https://www.w3.org/ns/activitystreams#Public"]
            };
            await Promise.all(followers.map(follower => this.sendActivity(artist, follower.inbox_uri, activity)));
        }
        this.db.markApNoteDeleted(noteId);
    }

    public async syncAllContent(): Promise<{ artists: number; notes: number }> {
        const artists = this.db.getArtists();
        let artistCount = artists.length;
        let noteCount = 0;

        // Fetch all releases upfront to avoid N+1 queries during the loop
        const releases = this.db.getReleases();

        // Group releases by artist ID
        const releasesByArtist: Record<number, any[]> = {};
        for (const release of releases) {
            if (release.artist_id !== null) {
                if (!releasesByArtist[release.artist_id]) releasesByArtist[release.artist_id] = [];
                releasesByArtist[release.artist_id].push(release);
            }
        }

        for (const artist of artists) {
            const artistReleases = releasesByArtist[artist.id] || [];
            const releasePromises = artistReleases.map(async (release) => {
                noteCount++;
                if (release.visibility === 'public' || release.visibility === 'unlisted') {
                    console.log(`  - Syncing public release: ${release.title}`);
                    await this.broadcastRelease(release as any, true).catch(e => console.error(e));
                } else {
                    console.log(`  - Syncing private release (Delete): ${release.title}`);
                    await this.broadcastDelete(release as any).catch(e => console.error(e));
                }
            });
            await Promise.all(releasePromises);

            const posts = this.db.getPostsByArtist(artist.id);
            const postPromises = posts.map(async (post) => {
                noteCount++;
                if (post.visibility === 'public') {
                    await this.broadcastPost(post, true).catch(e => console.error(e));
                } else {
                    await this.broadcastPostDelete(post).catch(e => console.error(e));
                }
            });
            await Promise.all(postPromises);
        }
        return { artists: artistCount, notes: noteCount };
    }

    public async syncArtistContent(artistId: number): Promise<{ notes: number }> {
        if (isNaN(artistId) || artistId === -1) {
            return { notes: 0 };
        }

        const artist = this.db.getArtist(artistId);
        if (!artist) throw new Error("Artist not found");

        let noteCount = 0;
        console.log(`🔄 Syncing ActivityPub content for artist: ${artist.name} (ID: ${artistId})`);

        // Sync Releases
        const releases = this.db.getReleasesByArtist(artistId);
        if (releases.length > 0) {
            console.log(`  📦 Syncing ${releases.length} releases...`);
            const releasePromises = releases.map(async (release) => {
                noteCount++;
                if (release.visibility === 'public' || release.visibility === 'unlisted') {
                    await this.broadcastRelease(release as any, true).catch(e => console.error(`❌ Sync release "${release.title}" failed:`, e));
                } else {
                    await this.broadcastDelete(release as any).catch(e => console.error(`❌ Sync delete release "${release.title}" failed:`, e));
                }
            });
            await Promise.all(releasePromises);
        }

        // Sync Posts
        const posts = this.db.getPostsByArtist(artistId);
        if (posts.length > 0) {
            console.log(`  📝 Syncing ${posts.length} posts...`);
            const postPromises = posts.map(async (post) => {
                noteCount++;
                if (post.visibility === 'public') {
                    await this.broadcastPost(post, true).catch(e => console.error(`❌ Sync post failed:`, e));
                } else {
                    await this.broadcastPostDelete(post).catch(e => console.error(`❌ Sync delete post failed:`, e));
                }
            });
            await Promise.all(postPromises);
        }

        return { notes: noteCount };
    }

    public async sendActivity(actor: Artist | { slug: string, private_key?: string, public_key?: string }, inboxUri: string, activity: any): Promise<void> {
        const ok = await this.transport.send(actor, inboxUri, activity);
        if (!ok) {
            // Immediate delivery failed — persist for durable background retry
            // instead of silently dropping the activity.
            await this.deliveryQueue?.enqueue((actor as any).slug || "site", inboxUri, activity);
        }
    }

    private async fetchWithSignature(uri: string, method: "get" | "post" = "get", body: any = null, signingArtist?: Artist): Promise<any> {
        return this.transport.fetchWithSignature(uri, method, body, signingArtist);
    }

    private async discoverSiteActor(origin: string): Promise<string | null> {
        try {
            const domain = new URL(origin).hostname;
            const wellKnownAliases = ["site", "instance", domain];
            for (const alias of wellKnownAliases) {
                const actorId = await this.getActorIdFromWebFinger(domain, alias);
                if (actorId) return actorId;
            }
            return await this.getActorIdFromNodeInfo(origin);
        } catch { return null; }
    }

    private async getActorIdFromWebFinger(domain: string, username: string): Promise<string | null> {
        try {
            const resource = `acct:${username}@${domain}`;
            const wfUrl = `https://${domain}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`;
            const res = await fetch(wfUrl, { headers: { "Accept": "application/jrd+json, application/json" } });
            if (!res.ok) {
                await drainResponse(res);
                return null;
            }
            const jrd = await res.json() as any;
            const selfLink = jrd.links?.find((l: any) => l.rel === "self" && (l.type === "application/activity+json" || l.type?.includes("json")));
            return selfLink?.href || null;
        } catch { return null; }
    }

    private async getActorIdFromNodeInfo(origin: string): Promise<string | null> {
        try {
            const wellKnownRes = await fetch(`${origin}/.well-known/nodeinfo`);
            if (!wellKnownRes.ok) {
                await drainResponse(wellKnownRes);
                return null;
            }
            const wellKnown = await wellKnownRes.json() as any;
            const nodeInfoLink = wellKnown.links?.find((l: any) => l.rel?.includes("nodeinfo"));
            if (!nodeInfoLink?.href) return null;
            const niRes = await fetch(nodeInfoLink.href);
            if (!niRes.ok) {
                await drainResponse(niRes);
                return null;
            }
            const ni = await niRes.json() as any;
            return ni.metadata?.actorId || null;
        } catch { return null; }
    }

    private async getInboxFromActor(actorUri: string): Promise<string | null> {
        if (!(await isSafeUrl(actorUri))) return null;
        try {
            const res = await this.fetchWithSignature(actorUri);
            if (!res.ok) {
                await drainResponse(res);
                return null;
            }
            const actor = await res.json() as any;
            return actor.inbox || null;
        } catch { return null; }
    }

    private getString(value: any): string | null {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) {
            if (value.length === 0) return null;
            return this.getString(value[0]);
        }
        if (typeof value === 'object') {
            if (value.href) return String(value.href);
            if (value.url) return this.getString(value.url);
            if (value.name) return this.getString(value.name);
            if (value.content) return this.getString(value.content);
            const keys = Object.keys(value);
            if (keys.length > 0) return String(value[keys[0]]);
        }
        return String(value);
    }

    public async verifySignature(req: any): Promise<boolean> {
        const signatureHeader = req.headers["signature"];
        if (!signatureHeader) {
            console.warn("⚠️ ActivityPub Request missing Signature header");
            return false;
        }

        try {
            const parts: any = {};
            const regex = /([a-zA-Z]+)="([^"]+)"/g;
            let match;
            while ((match = regex.exec(signatureHeader)) !== null) {
                parts[match[1]] = match[2];
            }

            if (!parts.keyId || !parts.signature) {
                console.warn("⚠️ ActivityPub Signature missing keyId or signature data");
                return false;
            }

            const publicKey = await this.getRemotePublicKey(parts.keyId);
            if (!publicKey) {
                console.warn(`⚠️ Could not retrieve public key for ${parts.keyId}`);
                return false;
            }

            const headersList = parts.headers ? parts.headers.split(' ') : ['date'];
            const signingLines: string[] = [];
            
            for (const headerName of headersList) {
                if (headerName === '(request-target)') {
                    signingLines.push(`(request-target): ${req.method.toLowerCase()} ${req.originalUrl || req.url}`);
                } else {
                    const val = req.headers[headerName.toLowerCase()];
                    if (!val) {
                        console.warn(`⚠️ Header ${headerName} missing from request but required by signature`);
                        return false;
                    }
                    signingLines.push(`${headerName.toLowerCase()}: ${val}`);
                }
            }
            const signingString = signingLines.join('\n');

            let algorithm = "sha256";
            if (parts.algorithm?.toLowerCase().includes("sha512")) algorithm = "sha512";
            
            const verifier = crypto.createVerify(algorithm);
            verifier.update(signingString);
            const isValid = verifier.verify(publicKey, parts.signature, 'base64');
            
            if (isValid) {
                console.log(`✅ ActivityPub Signature verified for ${parts.keyId}`);
            } else {
                console.warn(`❌ ActivityPub Signature verification FAILED for ${parts.keyId}`);
            }
            
            return isValid;
        } catch (err) {
            console.error("❌ Error during ActivityPub signature verification:", err);
            return false;
        }
    }

    public async setAlsoKnownAs(artistId: number, alsoKnownAsUris: string[] | null): Promise<void> {
        const artist = this.db.getArtist(artistId);
        if (!artist) throw new Error("Artist not found");

        // Update database
        this.db.updateArtistMigrationStatus(artistId, alsoKnownAsUris, artist.moved_to || null);

        // Fetch updated artist to render
        const updatedArtist = this.db.getArtist(artistId);
        if (!updatedArtist) return;

        // Broadcast Update activity to followers
        const followers = this.db.getFollowers(artistId);
        if (followers.length === 0) return;

        console.log(`📢 Broadcasting actor Update (alsoKnownAs) for ${artist.name} to ${followers.length} followers`);
        const baseUrl = this.getBaseUrl();
        const artistActorUrl = `${baseUrl}/users/${artist.slug}`;
        
        const updateActivity = {
            "@context": [
                "https://www.w3.org/ns/activitystreams",
                "https://w3id.org/security/v1"
            ],
            id: `${baseUrl}/activity/${crypto.randomUUID()}`,
            type: "Update",
            actor: artistActorUrl,
            object: this.renderer.renderActor(updatedArtist),
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${artistActorUrl}/followers`]
        };

        await Promise.all(followers.map(follower => this.sendActivity(artist, follower.inbox_uri, updateActivity)));
    }

    public async initiateMove(artistId: number, targetActorUri: string): Promise<void> {
        const artist = this.db.getArtist(artistId);
        if (!artist) throw new Error("Artist not found");

        const baseUrl = this.getBaseUrl();
        const artistActorUrl = `${baseUrl}/users/${artist.slug}`;

        // 1. Fetch the target actor profile to verify the backlink (alsoKnownAs/aliases)
        const res = await this.fetchWithSignature(targetActorUri);
        if (!res.ok) {
            throw new Error(`Could not fetch target actor profile at ${targetActorUri}`);
        }
        const targetActorData = await res.json() as any;

        let aliases: string[] = [];
        if (targetActorData.alsoKnownAs) {
            aliases = Array.isArray(targetActorData.alsoKnownAs)
                ? targetActorData.alsoKnownAs.map((a: any) => typeof a === 'string' ? a : a.id)
                : [targetActorData.alsoKnownAs];
        } else if (targetActorData.aliases) {
            aliases = Array.isArray(targetActorData.aliases)
                ? targetActorData.aliases.map((a: any) => typeof a === 'string' ? a : a.id)
                : [targetActorData.aliases];
        }
        
        aliases = aliases.filter(a => typeof a === 'string').map(a => this.getString(a) || "");

        if (!aliases.includes(artistActorUrl)) {
            throw new Error(`Verification failed: Target actor ${targetActorUri} does not list this local artist ${artistActorUrl} in its alsoKnownAs list. Found: ${JSON.stringify(aliases)}`);
        }

        // 2. Set moved_to in local database
        this.db.updateArtistMigrationStatus(artistId, artist.also_known_as || null, targetActorUri);

        // 3. Broadcast Move activity to all followers
        const followers = this.db.getFollowers(artistId);
        if (followers.length === 0) {
            console.log(`ℹ️ Artist has no followers to move.`);
            return;
        }

        console.log(`📢 Broadcasting Move activity for ${artist.name} to ${followers.length} followers. New home: ${targetActorUri}`);

        const moveActivity = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `${baseUrl}/activity/${crypto.randomUUID()}`,
            type: "Move",
            actor: artistActorUrl,
            object: artistActorUrl,
            target: targetActorUri,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${artistActorUrl}/followers`]
        };

        await Promise.all(followers.map(follower => this.sendActivity(artist, follower.inbox_uri, moveActivity)));
    }

    public async importRemoteIdentity(artistId: number, remoteActorUri: string): Promise<void> {
        const artist = this.db.getArtist(artistId);
        if (!artist) throw new Error("Artist not found");

        const baseUrl = this.getBaseUrl();
        const artistActorUrl = `${baseUrl}/users/${artist.slug}`;

        // Verify that this local artist lists the remote actor as also_known_as
        const currentAka = artist.also_known_as || [];
        if (!currentAka.includes(remoteActorUri)) {
            throw new Error(`Verification failed: Local artist must list ${remoteActorUri} in its Also Known As list before importing.`);
        }

        // Fetch the remote actor profile
        const res = await this.fetchWithSignature(remoteActorUri);
        if (!res.ok) {
            throw new Error(`Could not fetch remote actor profile at ${remoteActorUri}`);
        }
        const remoteActorData = await res.json() as any;

        // Verify backlink: movedTo or successor pointing to this local artist
        const movedTo = this.getString(remoteActorData.movedTo) || this.getString(remoteActorData.successor);
        if (!movedTo || movedTo !== artistActorUrl) {
            throw new Error(`Verification failed: Remote actor does not have its movedTo/successor pointing to this local artist profile (${artistActorUrl}). Found: ${movedTo}`);
        }

        // Verification successful! Copy profile metadata
        const remoteName = this.getString(remoteActorData.name) || this.getString(remoteActorData.preferredUsername) || artist.name;
        const remoteBio = this.getString(remoteActorData.summary) || artist.bio || "";

        // Update artist profile in DB
        this.db.updateArtist(
            artist.id,
            remoteName,
            remoteBio,
            undefined, // keep current photo
            undefined, // keep current links
            undefined, // keep current postParams
            undefined, // keep current walletAddress
            undefined  // keep current visibility
        );

        console.log(`✅ Successfully imported identity from ${remoteActorUri} to local artist ${artist.name}`);
    }

    private async getRemotePublicKey(keyId: string): Promise<string | null> {
        const actorUri = keyId.split('#')[0];
        const cachedActor = this.db.getRemoteActor(actorUri);
        if (cachedActor?.public_key) return cachedActor.public_key;

        try {
            console.log(`📡 Fetching remote actor to retrieve public key: ${actorUri}`);
            const res = await this.fetchWithSignature(actorUri);
            if (!res.ok) {
                await drainResponse(res);
                return null;
            }
            
            const actor = await res.json();
            const publicKeyPem = actor.publicKey?.publicKeyPem;
            
            if (publicKeyPem) {
                this.db.upsertRemoteActor({
                    uri: actorUri,
                    type: actor.type || 'Person',
                    username: actor.preferredUsername || null,
                    name: actor.name || null,
                    summary: actor.summary || null,
                    icon_url: actor.icon?.url || (typeof actor.icon === 'string' ? actor.icon : null),
                    inbox_url: actor.inbox || null,
                    outbox_url: actor.outbox || null,
                    public_key: publicKeyPem
                });
                return publicKeyPem;
            }
        } catch (e) {
            console.error(`❌ Error fetching remote public key for ${actorUri}:`, e);
        }
        return null;
    }
}

export function createActivityPubService(db: FederationProvider, config: ServerConfig, federation: Federation<void>): ActivityPubService {
    return new ActivityPubService(db, config, federation);
}
