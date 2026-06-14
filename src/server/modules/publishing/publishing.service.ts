import { stringify } from "yaml";
import path from "path";
import type { DatabaseService, Post, Release, Artist } from "../../core/database.js";
import type { ZenDBService, SiteInfo } from "../network/zendb.service.js";
import type { ActivityPubService } from "../activitypub/activitypub.service.js";
import type { ServerConfig } from "../../core/config.js";
import type { StorageEngine } from "../storage/storage.engine.js";
import { getSiteHandle } from "../../core/site-actor.js";

export class PublishingService {
    constructor(
        private db: DatabaseService,
        private zendb: ZenDBService,
        private ap: ActivityPubService,
        private config: ServerConfig,
        private storage: StorageEngine
    ) {}

    private getSiteInfo(artistName?: string): SiteInfo | null {
        const publicUrl = this.db.getSetting("publicUrl") || this.config.publicUrl;
        if (!publicUrl) return null;

        const siteName = this.db.getSetting("siteName") || this.config.siteName || "TuneCamp Server";
        const siteDescription = this.db.getSetting("siteDescription") || "";
        const coverImage = this.db.getSetting("coverImage") || "";

        const siteArtistName = this.db.getSetting("artistName");
        const effectiveArtistName = artistName || siteArtistName || "Unknown Artist";

        return {
            url: publicUrl,
            title: siteName,
            description: siteDescription,
            artistName: effectiveArtistName,
            coverImage: coverImage
        };
    }

    // --- Releases ---

    /**
     * Broadcasts a release via ActivityPub.
     */
    async publishReleaseToAP(release: Release): Promise<void> {
        if (!this.getSiteInfo()) {
            console.warn("⚠️ Cannot publish to ActivityPub: No public URL configured.");
            return;
        }

        console.log(`📢 Broadcasting release "${release.title}" via ActivityPub...`);
        try {
            await this.ap.broadcastRelease(release as any);

            // Also announce to relay for global discovery
            if (release.artist_id) {
                const artist = this.db.getArtist(release.artist_id);
                if (artist) {
                    const tracks = this.db.getTracksByReleaseId(release.id);
                    const note = this.ap.generateNote({ ...release, is_release: true } as any, artist, tracks);
                    await this.ap.announceToRelay(note);
                }
            }
        } catch (e) {
            console.error("❌ Failed to broadcast release via ActivityPub:", e);
        }

        // Cross-post to Mastodon
        if (release.artist_id) {
            const artist = this.db.getArtist(release.artist_id);
            if (artist) {
                const publicUrl = (this.db.getSetting("publicUrl") || this.config.publicUrl || "").replace(/\/$/, "");
                let statusText = `🎵 New release: "${release.title}" by ${artist.name}\n\n`;
                if (release.description) {
                    const cleanDesc = release.description.replace(/<[^>]*>?/gm, "").trim();
                    statusText += cleanDesc;
                }
                if (publicUrl) {
                    const releaseUrl = `${publicUrl}/releases/${release.slug}`;
                    const suffix = `\n\nListen here: ${releaseUrl}`;
                    const limit = 500 - suffix.length;
                    if (statusText.length > limit) {
                        statusText = statusText.substring(0, limit - 3) + "..." + suffix;
                    } else {
                        statusText += suffix;
                    }
                } else {
                    if (statusText.length > 500) {
                        statusText = statusText.substring(0, 497) + "...";
                    }
                }
                await this.crossPostToMastodon(release.artist_id, statusText);
            }
        }
    }

    /**
     * Broadcasts a deletion of a release via ActivityPub.
     */
    async unpublishReleaseFromAP(release: Release): Promise<void> {
        try {
            // Only broadcast if it was actually marked as published or we are ensuring it's gone
            console.log(`🗑️ Broadcasting deletion of release "${release.title}" via ActivityPub...`);
            await this.ap.broadcastDelete(release as any);
        } catch (e) {
            console.error("❌ Failed to broadcast release deletion via ActivityPub:", e);
        }
    }

    /**
     * Ensures the instance is registered in the Zen community directory.
     * Called during release sync to keep our instance visible.
     */
    private async ensureSiteRegistered(artistName?: string): Promise<void> {
        const siteInfo = this.getSiteInfo(artistName);
        if (siteInfo) {
            await this.zendb.registerSite(siteInfo);
        }
    }

    private async crossPostToMastodon(artistId: number, statusText: string): Promise<void> {
        try {
            const artist = this.db.getArtist(artistId);
            if (!artist) return;

            let postParams = artist.post_params;
            if (typeof postParams === 'string') {
                try {
                    postParams = JSON.parse(postParams);
                } catch {
                    postParams = null;
                }
            }

            if (!postParams || typeof postParams !== 'object') return;

            const { instance, token } = postParams;
            if (!instance || !token) return;

            let instanceUrl = instance.trim();
            if (!instanceUrl.startsWith("http://") && !instanceUrl.startsWith("https://")) {
                instanceUrl = "https://" + instanceUrl;
            }
            instanceUrl = instanceUrl.replace(/\/$/, "");

            const url = `${instanceUrl}/api/v1/statuses`;
            console.log(`📡 Mirroring status to Mastodon at ${url}...`);

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ status: statusText })
            });

            if (!response.ok) {
                const text = await response.text();
                console.error(`❌ Mastodon API error mirroring status: ${response.status} ${response.statusText} - ${text}`);
            } else {
                console.log(`✅ Successfully mirrored status to Mastodon!`);
            }
        } catch (error) {
            console.error(`❌ Error mirroring status to Mastodon:`, error);
        }
    }

    /**
     * Synchronizes a release's published state based on its visibility and federation flags.
     */
    async syncRelease(releaseId: number): Promise<void> {
        try {
            const release = this.db.getRelease(releaseId);
            if (!release) return;

            if (!release.is_release) return;

            // 1. Generate/Update release.yaml for portability and scanner recognition
            await this.generateReleaseYaml(release);

            const isPublic = release.visibility === 'public' || release.visibility === 'unlisted';

            // Ensure our instance is registered in Zen for discovery
            await this.ensureSiteRegistered(release.artist_name);

            // ActivityPub Logic
            try {
                if (isPublic && release.published_to_ap) {
                    await this.publishReleaseToAP(release);
                } else if (release.published_to_ap) {
                    // Only unpublish if it was previously marked as published
                    await this.unpublishReleaseFromAP(release);
                    // Update the flag in DB to reflect it's no longer published
                    (this.db as any).db.prepare("UPDATE albums SET published_to_ap = 0 WHERE id = ?").run(release.id);
                }
            } catch (e) {
                console.error(`❌ ActivityPub sync failed for release ${releaseId}:`, e);
            }

            // Zen Logic removed: tracks are published via ActivityPub only.
            // Zen serves only as instance signaling.
        } catch (error) {
            console.error(`🔥 Critical error in syncRelease for ${releaseId}:`, error);
        }
    }

    /**
     * Generates or updates release.yaml on disk.
     */
    private async generateReleaseYaml(release: Release): Promise<void> {
        try {
            const releaseDir = path.join(this.config.musicDir, "releases", release.slug);
            await this.storage.ensureDir(releaseDir);

            const releaseTracks = this.db.getReleaseTracks(release.id);

            const config: any = {
                title: release.title,
                date: release.date,
                description: release.description,
                artist: release.artist_name,
                type: release.type || 'album',
                year: release.year,
                genre: release.genre ? release.genre.split(", ").map(g => g.trim()) : undefined,
                download: release.download,
                price: release.price,
                price_usdc: release.price_usdc,
                currency: release.currency,
                license: release.license,
                visibility: release.visibility,
                metadata: {
                    tracks: releaseTracks.map(rt => ({
                        title: rt.title,
                        artist: rt.artist_name,
                        track: rt.track_num,
                        duration: rt.duration,
                        file: rt.file_path ? path.basename(rt.file_path) : undefined,
                        price: rt.price
                    }))
                }
            };

            // Add cover if it exists relative to the release dir
            if (release.cover_path) {
                const absoluteCover = path.join(this.config.musicDir, release.cover_path);
                const relativeCover = path.relative(releaseDir, absoluteCover).replace(/\\/g, "/");
                if (!relativeCover.startsWith("..")) {
                    config.cover = relativeCover;
                }
            }

            // Add external links
            if (release.external_links) {
                try {
                    config.links = JSON.parse(release.external_links);
                } catch (e) { console.warn(`[Publishing] Malformed external_links JSON for release ${release.id}`); }
            }

            const yamlContent = stringify(config);
            await this.storage.writeFile(path.join(releaseDir, "release.yaml"), yamlContent);
            console.log(`📄 [Publishing] Generated release.yaml for: ${release.title}`);
        } catch (e) {
            console.error(`❌ Failed to generate release.yaml for release ${release.id}:`, e);
        }
    }

    // --- Posts ---

    async publishPostToAP(post: Post): Promise<void> {
        if (post.visibility !== 'public') return;
        console.log(`📢 Broadcasting post "${post.slug}" via ActivityPub...`);
        try {
            await this.ap.broadcastPost(post);
        } catch (e) {
            console.error("❌ Failed to broadcast post via ActivityPub:", e);
        }

        // Cross-post to Mastodon
        if (post.artist_id) {
            const artist = this.db.getArtist(post.artist_id);
            if (artist) {
                const publicUrl = (this.db.getSetting("publicUrl") || this.config.publicUrl || "").replace(/\/$/, "");
                const cleanContent = post.content.replace(/<[^>]*>?/gm, "").trim();
                let statusText = post.title ? `📝 ${post.title}\n\n${cleanContent}` : cleanContent;
                if (publicUrl) {
                    const postUrl = `${publicUrl}/post/${post.slug}`;
                    const suffix = `\n\nRead more: ${postUrl}`;
                    const limit = 500 - suffix.length;
                    if (statusText.length > limit) {
                        statusText = statusText.substring(0, limit - 3) + "..." + suffix;
                    } else {
                        statusText += suffix;
                    }
                } else {
                    if (statusText.length > 500) {
                        statusText = statusText.substring(0, 497) + "...";
                    }
                }
                await this.crossPostToMastodon(post.artist_id, statusText);
            }
        }
    }

    async unpublishPostFromAP(post: Post): Promise<void> {
        console.log(`🗑️ Broadcasting deletion of post "${post.slug}" via ActivityPub...`);
        try {
            await this.ap.broadcastPostDelete(post);
        } catch (e) {
            console.error("❌ Failed to broadcast post deletion via ActivityPub:", e);
        }
    }

    async syncPost(postId: number): Promise<void> {
        const post = this.db.getPost(postId);
        if (!post) return;

        if (post.visibility === 'public') {
            await this.publishPostToAP(post);
        } else {
            await this.unpublishPostFromAP(post);
        }
    }

    async syncCommunityFollows(): Promise<{ discovered: number, followed: number }> {
        console.log("🌐 Starting decentralized community discovery via Zen...");
        
        const publicUrl = this.db.getSetting("publicUrl") || this.config.publicUrl;
        if (!publicUrl) {
            console.warn("⚠️ Skipping community sync: No public URL configured.");
            return { discovered: 0, followed: 0 };
        }

        try {
            const sites = await this.zendb.getCommunitySites();
            const myUrl = publicUrl.replace(/\/$/, "");
            
            let followedCount = 0;
            const remoteActors = this.db.getRemoteActors();
            const existingUris = new Set(remoteActors.map(a => a.uri.replace(/\/$/, "")));

            for (const site of sites) {
                if (!site.url) continue;
                const siteUrl = site.url.replace(/\/$/, "");
                if (siteUrl === myUrl || siteUrl.includes("localhost") || siteUrl.includes("127.0.0.1")) continue;
                const siteActorUri = `${siteUrl}/users/site`;
                if (!existingUris.has(siteActorUri)) {
                    console.log(`📡 Discovered new instance: ${site.title} (${siteUrl}). Sending follow request...`);
                    try {
                        await this.ap.followRemoteActor(siteActorUri, getSiteHandle(this.db));
                        followedCount++;
                    } catch (e) {
                        console.error(`❌ Failed to follow discovered instance ${siteUrl}:`, e);
                    }
                }
            }
            return { discovered: sites.length, followed: followedCount };
        } catch (error) {
            console.error("❌ Error during community follow sync:", error);
            return { discovered: 0, followed: 0 };
        }
    }
}

export function createPublishingService(
    db: DatabaseService,
    zendb: ZenDBService,
    ap: ActivityPubService,
    config: ServerConfig,
    storage: StorageEngine
): PublishingService {
    return new PublishingService(db, zendb, ap, config, storage);
}
