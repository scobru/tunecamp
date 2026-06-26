import type { Artist, Album, Track, Post } from "../../core/database.types.js";
import { renderApMarkdown } from "../../common/ap-markdown.js";
import { Temporal } from "@js-temporal/polyfill";

export class ActivityPubRenderer {
    constructor(private baseUrl: string) {}

    public renderWebFinger(resource: string, artist: Artist): any {
        return {
            subject: resource,
            links: [
                {
                    rel: "self",
                    type: "application/activity+json",
                    href: `${this.baseUrl}/users/${artist.slug}`
                }
            ]
        };
    }

    public renderActor(artist: Artist | { slug: string, name: string, bio?: string, photo_path?: string, public_key?: string, also_known_as?: string[] | null, moved_to?: string | null }): any {
        const userUrl = `${this.baseUrl}/users/${artist.slug}`;
        const also_known_as = (artist as any).also_known_as;
        const moved_to = (artist as any).moved_to;
        return {
            "@context": [
                "https://www.w3.org/ns/activitystreams",
                "https://w3id.org/security/v1"
            ],
            id: userUrl,
            type: "Person",
            preferredUsername: artist.slug,
            name: artist.name,
            summary: (artist as any).bio || "",
            inbox: `${this.baseUrl}/users/${artist.slug}/inbox`,
            outbox: `${this.baseUrl}/users/${artist.slug}/outbox`,
            publicKey: artist.public_key ? {
                id: `${userUrl}#main-key`,
                owner: userUrl,
                publicKeyPem: artist.public_key
            } : undefined,
            icon: {
                type: "Image",
                mediaType: "image/jpeg",
                url: `${this.baseUrl}/api/artists/${artist.slug}/cover`
            },
            alsoKnownAs: also_known_as && also_known_as.length > 0 ? also_known_as : undefined,
            movedTo: moved_to || undefined,
            manuallyApprovesFollowers: !!(artist as any).manually_approves_followers,
        };
    }

    public renderNote(album: Album, artist: Artist, tracks: Track[]): any {
        const userUrl = `${this.baseUrl}/users/${artist.slug}`;
        const apiUrl = `${this.baseUrl}/users/${artist.slug}`;
        const albumUrl = `${this.baseUrl}/releases/${album.slug}`;
        const published = album.published_at || album.created_at;

        const attachments: any[] = [];

        if (album.cover_path) {
            attachments.push({
                type: "Image",
                mediaType: this.getMimeType(album.cover_path, "image/jpeg"),
                url: `${this.baseUrl}/api/releases/${album.slug}/cover`,
                name: "Cover Art"
            });
        }

        const trackObjects = tracks.map(track => {
            if (!track.file_path && !track.url) return null;
            return {
                type: "Audio",
                mediaType: this.getAudioMimeType(track.file_path),
                url: track.file_path ? `${this.baseUrl}/api/tracks/${track.id}/stream` : track.url,
                name: track.title,
                duration: (track.duration && Number.isFinite(track.duration)) 
                    ? Temporal.Duration.from({ seconds: Math.floor(track.duration) }).toString()
                    : undefined,
                "https://funkwhale.audio/ns#bitrate": track.bitrate,
                "https://funkwhale.audio/ns#duration": track.duration
            };
        }).filter(t => t !== null);

        if (trackObjects.length > 0) {
            attachments.push(trackObjects[0]);
        }

        const sentTime = published ? new Date(published).getTime() : 0;
        const noteId = `${this.baseUrl}/api/ap/note/release/${album.slug}/${sentTime}`;

        return {
            "@context": [
                "https://www.w3.org/ns/activitystreams",
                {
                    "MusicAlbum": "https://schema.org/MusicAlbum",
                    "MusicRecording": "https://schema.org/MusicRecording"
                }
            ],
            type: "Note",
            id: noteId,
            attributedTo: userUrl,
            content: `<p>New release available: <a href="${albumUrl}">${album.title}</a></p>`,
            url: albumUrl,
            published: published,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${apiUrl}/followers`],
            attachment: attachments
        };
    }

    public renderPostArticle(post: Post, artist: Artist): any {
        const userUrl = `${this.baseUrl}/users/${artist.slug}`;
        const apiUrl = `${this.baseUrl}/users/${artist.slug}`;
        const published = post.published_at || post.created_at;
        const sentTime = published ? new Date(published).getTime() : 0;

        // Parse markdown image syntax to populate the attachments array
        const attachments: any[] = [];
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        let match;
        while ((match = imageRegex.exec(post.content)) !== null) {
            const alt = match[1];
            let url = match[2];
            // If the URL is relative, make it absolute using the instance's public URL
            if (url.startsWith('/')) {
                url = `${this.baseUrl}${url}`;
            }
            attachments.push({
                type: "Document",
                mediaType: this.getMimeType(url, "image/jpeg"),
                url: url,
                name: alt || undefined
            });
        }

        // Images federate as attachments (Mastodon strips inline <img>); drop the image
        // markdown from the body so other software doesn't render the same image twice.
        const body = attachments.length > 0
            ? post.content.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
            : post.content;
        let contentHtml = renderApMarkdown(body);

        if (!post.title) {
            return {
                "@context": "https://www.w3.org/ns/activitystreams",
                type: "Note",
                id: `${this.baseUrl}/api/ap/note/post/${post.slug}/${sentTime}`,
                attributedTo: userUrl,
                content: contentHtml,
                published: published,
                to: ["https://www.w3.org/ns/activitystreams#Public"],
                cc: [`${apiUrl}/followers`],
                attachment: attachments.length > 0 ? attachments : undefined
            };
        }

        contentHtml = `<h2>${post.title}</h2>` + 
            (post.summary ? `<p><em>${post.summary}</em></p><hr>` : "") + 
            contentHtml;

        const postUrl = `${this.baseUrl}/post/${post.slug}`;

        return {
            "@context": "https://www.w3.org/ns/activitystreams",
            type: "Article",
            id: `${this.baseUrl}/api/ap/article/post/${post.slug}/${sentTime}`,
            attributedTo: userUrl,
            name: post.title,
            summary: post.summary || undefined,
            content: contentHtml,
            url: postUrl,
            published: published,
            to: ["https://www.w3.org/ns/activitystreams#Public"],
            cc: [`${apiUrl}/followers`],
            attachment: attachments.length > 0 ? attachments : undefined
        };
    }

    private getMimeType(path: string, defaultType: string): string {
        const ext = path.split('.').pop()?.toLowerCase();
        if (ext === 'png') return "image/png";
        if (ext === 'webp') return "image/webp";
        if (ext === 'gif') return "image/gif";
        if (ext === 'avif') return "image/avif";
        return defaultType;
    }

    private getAudioMimeType(filePath?: string | null): string {
        if (!filePath) return "audio/mpeg";
        const ext = filePath.split('.').pop()?.toLowerCase();
        const contentTypes: Record<string, string> = {
            "mp3": "audio/mpeg",
            "flac": "audio/flac",
            "ogg": "audio/ogg",
            "wav": "audio/wav",
            "m4a": "audio/mp4",
            "aac": "audio/aac",
            "opus": "audio/opus",
        };
        return contentTypes[ext || ""] || "audio/mpeg";
    }

}
