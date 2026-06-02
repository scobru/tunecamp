import type { Artist, Album, Track, Post } from "../../core/database.types.js";

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

    public renderActor(artist: Artist | { slug: string, name: string, bio?: string, photo_path?: string, public_key?: string }): any {
        const userUrl = `${this.baseUrl}/users/${artist.slug}`;
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
            icon: artist.photo_path ? {
                type: "Image",
                mediaType: "image/jpeg",
                url: `${this.baseUrl}/api/artists/${artist.slug}/photo`
            } : undefined
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
                    ? `${Math.floor(track.duration / 3600).toString().padStart(2, '0')}:${Math.floor((track.duration % 3600) / 60).toString().padStart(2, '0')}:${Math.floor(track.duration % 60).toString().padStart(2, '0')}`
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

        let contentHtml = `<p>${post.content}</p>`;

        if (!post.title) {
            return {
                "@context": "https://www.w3.org/ns/activitystreams",
                type: "Note",
                id: `${this.baseUrl}/api/ap/note/post/${post.slug}/${sentTime}`,
                attributedTo: userUrl,
                content: contentHtml,
                published: published,
                to: ["https://www.w3.org/ns/activitystreams#Public"],
                cc: [`${apiUrl}/followers`]
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
            cc: [`${apiUrl}/followers`]
        };
    }

    private getMimeType(path: string, defaultType: string): string {
        const ext = path.split('.').pop()?.toLowerCase();
        if (ext === 'png') return "image/png";
        if (ext === 'webp') return "image/webp";
        if (ext === 'gif') return "image/gif";
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
