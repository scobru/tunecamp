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

        let contentHtml = this.renderMarkdown(post.content);

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

    private renderMarkdown(markdown: string): string {
        if (!markdown) return "";
        // Escape HTML tags to prevent injection in the Fediverse
        let html = markdown
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // Normalize line endings
        html = html.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        // Headings
        html = html.replace(/^### (.*?)$/gm, "<h3>$1</h3>");
        html = html.replace(/^## (.*?)$/gm, "<h2>$1</h2>");
        html = html.replace(/^# (.*?)$/gm, "<h1>$1</h1>");

        // Bold & Italic
        html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
        html = html.replace(/__(.*?)__/g, "<strong>$1</strong>");
        html = html.replace(/_(.*?)_/g, "<em>$1</em>");

        // Links: [text](url)
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

        // Bullet Lists
        html = html.replace(/^\s*[\-\*]\s+(.+)$/gm, "<li>$1</li>");
        // Wrap <li> elements in <ul>
        html = html.replace(/(<li>.*<\/li>)/gs, (match) => {
            return `<ul>${match}</ul>`;
        });
        html = html.replace(/<\/ul>\s*<ul>/g, "");

        // Split by double newlines into block elements
        const blocks = html.split(/\n\n+/);
        const processedBlocks = blocks.map(block => {
            const trimmed = block.trim();
            if (!trimmed) return "";
            if (/^<(h[1-6]|ul|ol|li|hr|blockquote|p|div|a)/i.test(trimmed)) {
                return trimmed;
            }
            return `<p>${trimmed.replace(/\n/g, "<br />")}</p>`;
        });

        return processedBlocks.filter(Boolean).join("\n");
    }
}
